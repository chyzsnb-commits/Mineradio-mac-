(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MineradioLyricTranslation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function normalizeText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function normalizeTextPreserveInnerSpacing(value) {
    return String(value == null ? '' : value).trim();
  }

  function cloneLyricLine(line) {
    var copy = Object.assign({}, line || {});
    if (line && Array.isArray(line.words)) {
      copy.words = line.words.map(function(word) { return Object.assign({}, word); });
    }
    return copy;
  }

  function cloneLyricLines(lines) {
    return (Array.isArray(lines) ? lines : []).map(cloneLyricLine);
  }

  function lineHasPrimaryText(line) {
    return !!normalizeTextPreserveInnerSpacing(line && line.text);
  }

  function lineHasTranslation(line) {
    return !!normalizeTextPreserveInnerSpacing(line && line.subText);
  }

  function collectTranslatableLyricLines(lines) {
    return cloneLyricLines(lines).filter(function(line) {
      return lineHasPrimaryText(line) && !lineHasTranslation(line);
    });
  }

  function findNearestLineIndex(lines, target, used, toleranceSec) {
    var winner = -1;
    var bestDelta = Number.POSITIVE_INFINITY;
    var tolerance = Math.max(0.05, Number(toleranceSec) || 0.35);
    for (var i = 0; i < lines.length; i++) {
      if (used[i]) continue;
      var current = lines[i];
      if (!lineHasPrimaryText(current)) continue;
      var delta = Math.abs((Number(current.t) || 0) - target);
      if (delta > tolerance || delta >= bestDelta) continue;
      winner = i;
      bestDelta = delta;
    }
    return winner;
  }

  function mergeOfficialTranslatedLines(lines, translatedLines, toleranceSec) {
    var merged = cloneLyricLines(lines);
    var used = {};
    (Array.isArray(translatedLines) ? translatedLines : []).forEach(function(row) {
      var subText = normalizeTextPreserveInnerSpacing(row && row.text);
      if (!subText) return;
      var idx = findNearestLineIndex(merged, Number(row && row.t) || 0, used, toleranceSec);
      if (idx < 0) return;
      if (!lineHasTranslation(merged[idx])) merged[idx].subText = subText;
      used[idx] = true;
    });
    return merged;
  }

  function splitTranslatedBatchText(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(normalizeTextPreserveInnerSpacing);
  }

  function applyTranslatedBatchText(lines, translatedText) {
    var merged = cloneLyricLines(lines);
    var rows = splitTranslatedBatchText(translatedText);
    var rowIndex = 0;
    for (var i = 0; i < merged.length; i++) {
      if (!lineHasPrimaryText(merged[i]) || lineHasTranslation(merged[i])) continue;
      var nextText = normalizeTextPreserveInnerSpacing(rows[rowIndex++]);
      if (nextText) merged[i].subText = nextText;
    }
    return merged;
  }

  function mapTranslatedLinesByIndex(lines, translatedRows) {
    var merged = cloneLyricLines(lines);
    (Array.isArray(translatedRows) ? translatedRows : []).forEach(function(row) {
      var index = Number(row && row.index);
      if (!Number.isInteger(index) || index < 0 || index >= merged.length) return;
      if (!lineHasPrimaryText(merged[index]) || lineHasTranslation(merged[index])) return;
      var nextText = normalizeTextPreserveInnerSpacing(row && row.text);
      if (nextText) merged[index].subText = nextText;
    });
    return merged;
  }

  return {
    cloneLyricLine: cloneLyricLine,
    cloneLyricLines: cloneLyricLines,
    collectTranslatableLyricLines: collectTranslatableLyricLines,
    mergeOfficialTranslatedLines: mergeOfficialTranslatedLines,
    applyTranslatedBatchText: applyTranslatedBatchText,
    mapTranslatedLinesByIndex: mapTranslatedLinesByIndex,
    lineHasTranslation: lineHasTranslation,
    normalizeText: normalizeText,
    normalizeTextPreserveInnerSpacing: normalizeTextPreserveInnerSpacing,
  };
});
