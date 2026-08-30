'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadCoverMarkupHelpers() {
  const source = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/01-cover-custom-map.js'), 'utf8');
  const context = { Date, console, localStorage: { getItem() { return null; }, setItem() {} } };
  vm.runInNewContext(source + '\nthis.__helpers = { safeMarkupAttr, coverMarkupSrc };', context);
  return context.__helpers;
}

test('远程封面进入 HTML 属性前必须保持惰性，不能注入新的属性或事件处理器', () => {
  const { safeMarkupAttr, coverMarkupSrc } = loadCoverMarkupHelpers();
  const payload = 'https://covers.example/a" onerror="globalThis.__coverXss=1.png';
  const escaped = safeMarkupAttr(payload);
  assert.match(escaped, /&quot;/);
  assert.doesNotMatch(escaped, /"\s+onerror=/i);
  assert.equal(coverMarkupSrc(payload), escaped);
});

test('HTML 实际渲染后恶意封面只能成为 src 值，不能生成 onerror 属性', () => {
  const { coverMarkupSrc } = loadCoverMarkupHelpers();
  const payload = 'https://covers.example/a" onerror="globalThis.__coverXss=1.png';
  const html = '<img src="' + coverMarkupSrc(payload) + '" alt="">';
  assert.match(html, /&quot;\s+onerror=/i, '编码后的文本可能包含原始词，但不能包含真实双引号属性分隔符');
  assert.equal(html.includes('" onerror="'), false, '不能生成真实双引号属性分隔符');
});
