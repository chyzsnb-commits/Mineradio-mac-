'use strict';

// 软件内更新检查回归：
// 1. semver 比较（含 v 前缀、位数不齐、相等）
// 2. version.json 清单解析与非法输入防护（更新检查绝不抛错影响主功能）
// 3. checkForUpdate 全流程（mock fetch：有更新/无更新/HTTP失败/坏 JSON）
// 4. 下载：文件名提取、成功落盘、半截 .part 不冒充完整 dmg、HTTP 失败清理
// 设计约束：无 Developer ID 证书，macOS 无法后台静默替换，故本模块只做
// "检查 + 提示 + 下载 + 打开安装器"，不做 electron-updater 静默替换。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  isNewerVersion,
  parseUpdateManifest,
  checkForUpdate,
  downloadFileNameFor,
  downloadUpdateDmg,
} = require('../desktop/update-checker');

test('semver 比较：新版为真、旧版/相等为假，容忍 v 前缀与位数不齐', () => {
  assert.equal(isNewerVersion('2.0.1', '2.0.0'), true);
  assert.equal(isNewerVersion('v2.1.0', '2.0.9'), true);
  assert.equal(isNewerVersion('2.0', '2.0.0'), false);
  assert.equal(isNewerVersion('1.9.9', '2.0.0'), false);
  assert.equal(isNewerVersion('2.0.0', '2.0.0'), false);
  assert.equal(isNewerVersion('2.10.0', '2.9.0'), true);   // 数字比较不是字符串比较
  assert.equal(isNewerVersion('2.0.1-beta', '2.0.0'), true);
});

test('清单解析：合法输入完整返回，非法输入一律 ok:false 且不抛错', () => {
  const good = parseUpdateManifest(JSON.stringify({
    version: '2.0.1',
    url: 'https://github.com/x/releases/download/v2.0.1/Mineradio-2.0.1-arm64.dmg',
    notes: '修复若干问题',
    pub_date: '2026-08-30T00:00:00Z',
  }));
  assert.equal(good.ok, true);
  assert.equal(good.version, '2.0.1');
  assert.equal(good.notes, '修复若干问题');

  assert.equal(parseUpdateManifest('not json').ok, false);
  assert.equal(parseUpdateManifest('{"version":"abc","url":"https://x/a.dmg"}').ok, false, '非法版本号');
  assert.equal(parseUpdateManifest('{"version":"2.0.1","url":"http://insecure/a.dmg"}').ok, false, '非 https 下载地址拒绝');
  const noUrl = parseUpdateManifest('{"version":"2.0.1"}');
  assert.equal(noUrl.ok, true, 'url 为空是合法占位清单');
  assert.equal(noUrl.url, '', 'url 为空');
  assert.equal(parseUpdateManifest('').ok, false);
});

test('checkForUpdate：有更新 / 无更新 / HTTP 失败 / 坏 JSON 四路径', async () => {
  const manifest = JSON.stringify({ version: '9.9.9', url: 'https://x/Mineradio-9.9.9-arm64.dmg', notes: 'big' });

  const hasUpdate = await checkForUpdate({
    manifestUrl: 'https://example.com/version.json',
    currentVersion: '2.0.0',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => manifest }),
  });
  assert.equal(hasUpdate.ok, true);
  assert.equal(hasUpdate.hasUpdate, true);
  assert.equal(hasUpdate.latestVersion, '9.9.9');

  const noUpdate = await checkForUpdate({
    manifestUrl: 'https://example.com/version.json',
    currentVersion: '9.9.9',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => manifest }),
  });
  assert.equal(noUpdate.hasUpdate, false);

  const httpFail = await checkForUpdate({
    manifestUrl: 'https://example.com/version.json',
    currentVersion: '2.0.0',
    fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }),
  });
  assert.equal(httpFail.ok, false);

  const badJson = await checkForUpdate({
    manifestUrl: 'https://example.com/version.json',
    currentVersion: '2.0.0',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<html>502</html>' }),
  });
  assert.equal(badJson.ok, false, '网关返回 HTML 不能当清单');
});

test('下载文件名：从 URL 提取 dmg 名，无文件名时用版本号兜底', () => {
  assert.equal(
    downloadFileNameFor('https://github.com/x/releases/download/v2.0.1/Mineradio-2.0.1-arm64.dmg'),
    'Mineradio-2.0.1-arm64.dmg'
  );
  assert.equal(downloadFileNameFor('https://x/', '9.9.9'), 'Mineradio-9.9.9.dmg');
});

test('下载：成功流式落盘；HTTP 失败与半截文件均不留伪 dmg', async () => {
  const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mr-update-test-'));

  // 成功：mock fetch 返回可读流（Node Readable）
  const { Readable } = require('node:stream');
  const payload = Buffer.from('fake-dmg-content-for-test');
  const okResult = await downloadUpdateDmg({
    url: 'https://x/Mineradio-2.0.1-arm64.dmg',
    destDir,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (n) => (String(n).toLowerCase() === 'content-length' ? String(payload.length) : null) },
      body: Readable.from([payload.slice(0, 5), payload.slice(5)]),
    }),
  });
  assert.equal(okResult.ok, true);
  assert.equal(fs.readFileSync(okResult.filePath).toString(), payload.toString(), '落盘内容一致');
  assert.ok(!fs.existsSync(okResult.filePath + '.part'), '完成后不残留 .part');

  // HTTP 404：不落盘、无 .part 残留（用不同文件名，避免与成功用例产物混淆）
  const failResult = await downloadUpdateDmg({
    url: 'https://x/Mineradio-2.0.1-failcase-arm64.dmg',
    destDir,
    fetchImpl: async () => ({ ok: false, status: 404, headers: { get: () => null }, body: null }),
  });
  assert.equal(failResult.ok, false);
  assert.ok(!fs.existsSync(path.join(destDir, 'Mineradio-2.0.1-failcase-arm64.dmg')), '失败不生成伪 dmg');

  // 中途中断的流：.part 被清理，完整 dmg 不存在
  const brokenStream = new Readable({ read() {} });
  const brokenResult = await new Promise((resolve) => {
    const p = downloadUpdateDmg({
      url: 'https://x/Mineradio-2.0.2-arm64.dmg',
      destDir,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => '1000' },
        body: brokenStream,
      }),
    });
    brokenStream.push('partial');
    setTimeout(() => { brokenStream.destroy(new Error('mock interrupt')); }, 50);
    p.then(resolve);
  });
  assert.equal(brokenResult.ok, false);
  assert.ok(!fs.existsSync(path.join(destDir, 'Mineradio-2.0.2-arm64.dmg')), '中断不留完整 dmg');
  assert.ok(!fs.existsSync(path.join(destDir, 'Mineradio-2.0.2-arm64.dmg.part')), '中断清理 .part');

  fs.rmSync(destDir, { recursive: true, force: true });
});
