const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('Git 和 App 打包都排除 omc 工具缓存', () => {
  const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const buildFiles = packageInfo.build && packageInfo.build.files || [];
  const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');

  assert.match(gitignore, /^\.omc\/$/m, 'Git 必须忽略所有 .omc 目录');
  assert.ok(
    buildFiles.some((pattern) => /^!\*\*\/\.omc\/(?:\*\*\/)?\*$/.test(pattern)),
    'electron-builder 必须排除所有 .omc 目录内容',
  );
});
