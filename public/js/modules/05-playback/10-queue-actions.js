function queueSong(song, opts) {
  opts = opts || {};
  if (!song) return -1;
  var cloned = cloneSong(song);
  var insertAt = playQueue.length;
  if (opts.position === 'next') {
    var key = queueItemKey(cloned);
    var existing = -1;
    if (key) {
      for (var i = 0; i < playQueue.length; i++) {
        if (queueItemKey(playQueue[i]) === key) { existing = i; break; }
      }
    }
    if (existing === currentIdx) return currentIdx;
    if (existing >= 0) {
      cloned = playQueue.splice(existing, 1)[0];
      if (currentIdx >= 0 && existing < currentIdx) currentIdx -= 1;
    }
    var hasCurrent = currentIdx >= 0 && currentIdx < playQueue.length;
    insertAt = hasCurrent ? Math.min(playQueue.length, currentIdx + 1) : playQueue.length;
    playQueue.splice(insertAt, 0, cloned);
  } else {
    playQueue.push(cloned);
    insertAt = playQueue.length - 1;
  }
  safeRenderQueuePanel('queue-song');
  safeShelfRebuild('queue-song');
  return insertAt;
}
function queueSongNext(song) {
  return queueSong(song, { position: 'next' });
}
function queueSearchResult(i) {
  var song = playlist[i]; if (!song) return;
  queueSongNext(song);
  showToast('已设为下一首: ' + song.name);
}
function queueDetailSongNext(song) {
  if (!song || song.type === 'podcast-radio') return;
  queueSongNext(song);
  showToast('已设为下一首: ' + (song.name || ''));
}
function queueIndexNext(i) {
  i = Number(i);
  if (!isFinite(i) || i < 0 || i >= playQueue.length) return;
  var song = playQueue[i];
  queueSongNext(song);
  showToast('已设为下一首: ' + (song && song.name ? song.name : ''));
}
function openQueueArtist(i) {
  var song = playQueue && playQueue[i];
  if (song) openArtistDetailForSong(song);
}
function moveQueueIndexToTop(idx) {
  idx = Number(idx);
  if (!isFinite(idx) || idx < 0 || idx >= playQueue.length) return -1;
  if (idx === 0) return 0;
  var item = playQueue.splice(idx, 1)[0];
  playQueue.unshift(item);
  if (currentIdx === idx) currentIdx = 0;
  else if (currentIdx >= 0 && currentIdx < idx) currentIdx += 1;
  return 0;
}
function playSearchResult(i) {
  var song = playlist[i]; if (!song) return;
  homeForcedOpen = false;
  homeSuppressed = false;
  setHomeControlsLocked(false);
  if (!playQueue.length) { playQueue.unshift(cloneSong(song)); currentIdx = 0; }
  else {
    var matchIdx = -1;
    var targetKey = queueItemKey(song);
    for (var j = 0; j < playQueue.length; j++) if (queueItemKey(playQueue[j]) === targetKey) { matchIdx = j; break; }
    if (matchIdx >= 0) currentIdx = moveQueueIndexToTop(matchIdx);
    else { playQueue.unshift(cloneSong(song)); currentIdx = 0; }
  }
  $results.classList.remove('show');
  $input.value = ''; $input.blur();
  playQueueAt(currentIdx);
}
