(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MineradioText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function normalizeWhitespace(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\u00A0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function normalizeWhitespacePreserveInnerSpacing(value) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\u00A0/g, ' ')
      .trim();
  }

  function removeLeakedControlTokens(value) {
    return normalizeWhitespace(value)
      .replace(/\{#\d+\}/g, '')
      .replace(/\{(?:\\[a-z]+\d*|[a-z]+:[^{}]*)\}/gi, '')
      .replace(/<\d+,\d+(?:,\d+)?>/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function removeLeakedControlTokensPreserveInnerSpacing(value) {
    return normalizeWhitespacePreserveInnerSpacing(value)
      .replace(/\{#\d+\}/g, '')
      .replace(/\{(?:\\[a-z]+\d*|[a-z]+:[^{}]*)\}/gi, '')
      .replace(/<\d+,\d+(?:,\d+)?>/g, '')
      .trim();
  }

  function removeDownloadSiteSuffix(value) {
    return value
      .replace(/(?:_|-|\s)*(?:免费)?(?:高速)?下载(?:专区|地址|资源)?(?:[_\-\s].*)?$/i, '')
      .replace(/(?:_|-|\s)*(?:图片|音乐|歌曲)下载(?:[_\-\s].*)?$/i, '')
      .trim();
  }

  function isPlaceholderOnly(value) {
    var compact = value.replace(/\s+/g, '');
    return /^[_＿—–-]{3,}$/.test(compact)
      || /^\{#\d+\}$/.test(compact)
      || /^(?:null|undefined|n\/a)$/i.test(compact);
  }

  function isOpaqueDownloadedAssetName(value) {
    return /^[a-f0-9]{24,}(?:\.(?:jpe?g|png|webp|gif|bmp))?$/i.test(value);
  }

  function cleanDisplayText(value) {
    var text = removeDownloadSiteSuffix(removeLeakedControlTokens(value));
    if (!text || isPlaceholderOnly(text) || isOpaqueDownloadedAssetName(text)) return '';
    return text;
  }

  function cleanMediaFileTitle(fileName) {
    var name = normalizeWhitespace(fileName).split(/[\\/]/).pop();
    try { name = decodeURIComponent(name); } catch (e) {}
    name = name.replace(/[?#].*$/, '');
    name = removeDownloadSiteSuffix(name);
    name = name.replace(/\.(?:mp3|flac|wav|ogg|m4a|aac|opus|jpe?g|png|webp|gif|bmp)$/i, '');
    name = cleanDisplayText(name);
    return name || '本地文件';
  }

  function cleanLyricText(value) {
    var text = removeDownloadSiteSuffix(removeLeakedControlTokensPreserveInnerSpacing(value))
      .replace(/^\s*(?:作词|作曲|编曲|制作人)\s*[:：]\s*$/i, '')
      .trim();
    return isPlaceholderOnly(text) ? '' : text;
  }

  function sanitizeSongDisplayFields(song) {
    if (!song || typeof song !== 'object') return song;
    if (Object.prototype.hasOwnProperty.call(song, 'name')) song.name = cleanDisplayText(song.name);
    if (Object.prototype.hasOwnProperty.call(song, 'title')) song.title = cleanDisplayText(song.title);
    if (Object.prototype.hasOwnProperty.call(song, 'artist')) song.artist = cleanDisplayText(song.artist);
    if (Object.prototype.hasOwnProperty.call(song, 'album')) song.album = cleanDisplayText(song.album);
    return song;
  }

  function sanitizeLibraryDisplayItem(item) {
    if (!item || typeof item !== 'object') return item;
    sanitizeSongDisplayFields(item);
    ['creator', 'djName', 'category', 'description', 'sub'].forEach(function(key) {
      if (Object.prototype.hasOwnProperty.call(item, key)) item[key] = cleanDisplayText(item[key]);
    });
    return item;
  }

  return {
    cleanDisplayText: cleanDisplayText,
    cleanLyricText: cleanLyricText,
    cleanMediaFileTitle: cleanMediaFileTitle,
    sanitizeSongDisplayFields: sanitizeSongDisplayFields,
    sanitizeLibraryDisplayItem: sanitizeLibraryDisplayItem,
  };
});
