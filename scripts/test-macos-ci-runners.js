const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '..', '.github', 'workflows', 'build-mac.yml'),
  'utf8',
);

test('macOS CI 使用仍受支持的原生 arm64 和 Intel x64 运行器', () => {
  assert.match(workflow, /- arch: arm64\s+runner: macos-15\s+/);
  assert.match(workflow, /- arch: x64\s+runner: macos-15-intel\s+/);
  assert.doesNotMatch(workflow, /runner:\s*macos-(?:13|14)\b/);
});

test('构建工作流自身和测试脚本变更也会触发 PR 检查', () => {
  assert.match(workflow, /- ['"]?\.github\/workflows\/build-mac\.yml['"]?/);
  assert.match(workflow, /- ['"]?scripts\/\*\*['"]?/);
});
