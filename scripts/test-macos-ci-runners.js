const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '..', '.github', 'workflows', 'build-mac.yml'),
  'utf8',
);
const releaseDiffWorkflow = fs.readFileSync(
  path.resolve(__dirname, '..', '.github', 'workflows', 'diff-on-release.yml'),
  'utf8',
);

test('macOS CI 使用仍受支持的原生 arm64 和 Intel x64 运行器', () => {
  assert.match(workflow, /- arch: arm64\s+runner: macos-15\s+/);
  assert.match(workflow, /- arch: x64\s+runner: macos-15-intel\s+/);
  assert.doesNotMatch(workflow, /runner:\s*macos-(?:13|14)\b/);
});

test('构建工作流自身和测试脚本变更也会触发 PR 检查', () => {
  assert.match(workflow, /- ['"]?\.github\/workflows\/build-mac\.yml['"]?/);
  assert.match(workflow, /- ['"]?\.github\/workflows\/diff-on-release\.yml['"]?/);
  assert.match(workflow, /- ['"]?build\/\*\*['"]?/);
  assert.match(workflow, /- ['"]?scripts\/\*\*['"]?/);
  assert.match(workflow, /- ['"]?package-lock\.json['"]?/);
});

test('macOS 构建与 Release 差异工作流统一使用兼容 Electron fuses 的 Node 24', () => {
  assert.match(workflow, /node-version:\s*['"]24['"]/);
  assert.match(releaseDiffWorkflow, /node-version:\s*['"]24['"]/);
  assert.doesNotMatch(releaseDiffWorkflow, /node-version:\s*['"](?:18|20|22)['"]/);
});
