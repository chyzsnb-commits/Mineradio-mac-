'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const search = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'modules', '05-playback', '07-search.js'), 'utf8');

test('music-provider tabs share and render the existing search history', () => {
  const historyRenderer = /function renderSearchHistory\(\)\s*\{([\s\S]*?)\n\}/.exec(search);
  assert.ok(historyRenderer, 'renderSearchHistory() must exist');
  assert.match(historyRenderer[1], /isMusicSearchMode\(searchMode\)/);
  assert.doesNotMatch(historyRenderer[1], /searchMode !== 'song'/);
  assert.match(search, /else renderSearchHistory\(\);/);
});