'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('starts one P11 track transition after hydration and before pending lyrics are installed', () => {
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const hydrateAt = playback.indexOf("markPlayPhase('track-setup')");
  const beginAt = playback.indexOf('beginLyricDepthTrackTransition(song, token,', hydrateAt);
  const lyricPrepAt = playback.indexOf("markPlayPhase('lyric-prep')", hydrateAt);
  const beginWindow = playback.slice(playback.lastIndexOf('\n', beginAt - 900), beginAt + 700);

  assert.ok(hydrateAt >= 0 && beginAt > hydrateAt, 'hook must run after the song is hydrated and the token exists');
  assert.ok(lyricPrepAt > beginAt, 'hook must run before resetLyricsForTrackSwitch clears the current lyrics');
  assert.match(beginWindow, /!qualitySwitch/);
  assert.match(beginWindow, /!opts\.fallbackDepth/);
  assert.match(beginWindow, /!sameLyricDepthTrack/);
  assert.match(beginWindow, /typeof beginLyricDepthTrackTransition === 'function'/);
  assert.match(beginWindow, /previousSong:/);
  assert.match(beginWindow, /albumGaplessHandoff:/);
});

test('uses the last successful playback snapshot instead of mutable currentIdx for the outgoing song', () => {
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const playQueueAt = playback.indexOf('async function playQueueAt(');
  const hydrateAt = playback.indexOf("markPlayPhase('track-setup')", playQueueAt);
  const setupWindow = playback.slice(playQueueAt, hydrateAt + 900);
  const remembers = playback.match(/if \(confirmQueuePlaybackStarted\(idx, token\)\) rememberLyricDepthActualPlayback\(song, token\);|if \(!confirmQueuePlaybackStarted\(idx, token\)\) return false;\s+rememberLyricDepthActualPlayback\(song, token\);/g) || [];

  assert.match(playback, /var lyricDepthLastActualPlayback = \{/);
  assert.match(playback, /function rememberLyricDepthActualPlayback\(song, token\)/);
  assert.match(playback, /song: Object\.assign\(\{\}, song\)/);
  assert.match(playback, /key: lyricDepthPlaybackTrackKey\(song\)/);
  assert.match(setupWindow, /var previousSongForTransition = lyricDepthLastActualPlayback\.song;/);
  assert.match(setupWindow, /var previousLyricDepthKey = lyricDepthLastActualPlayback\.key;/);
  assert.match(playback, /previousToken: lyricDepthLastActualPlayback\.token/);
  assert.doesNotMatch(setupWindow, /previousSongForTransition\s*=\s*currentIdx/);
  assert.equal(remembers.length, 2, 'local and remote playback must update the snapshot only after confirmed playback');
});

test('continues the active P11 transition across an automatic fallback token without replaying outgoing', () => {
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
  const hydrateAt = playback.indexOf("markPlayPhase('track-setup')");
  const continueAt = playback.indexOf('continueLyricDepthTrackTransition(token,', hydrateAt);
  const beginAt = playback.indexOf('beginLyricDepthTrackTransition(song, token,', hydrateAt);
  const lyricPrepAt = playback.indexOf("markPlayPhase('lyric-prep')", hydrateAt);
  const transitionWindow = playback.slice(playback.lastIndexOf('\n', continueAt - 500), beginAt + 240);

  assert.ok(continueAt > hydrateAt, 'fallback continuation must run after the replacement song is hydrated');
  assert.ok(beginAt > continueAt, 'fallback continuation must be a separate branch before a fresh transition');
  assert.ok(lyricPrepAt > continueAt, 'the readiness token must be rebound before pending lyrics are installed');
  assert.match(transitionWindow, /!qualitySwitch && \(opts\.fallbackDepth \|\| sameLyricDepthTrack\)/);
  assert.match(transitionWindow, /typeof continueLyricDepthTrackTransition === 'function'/);
  assert.match(transitionWindow, /else if \(!qualitySwitch && !opts\.fallbackDepth && !sameLyricDepthTrack/);
});

test('marks cover, lyrics and successful audio as independently ready', () => {
  const cover = read('public/js/modules/02-visual/15-ripples-cover-depth.js');
  const lyrics = read('public/js/modules/05-playback/06-track-detail-lyrics-actions.js');
  const controls = read('public/js/modules/05-playback/14-player-controls.js');

  const coverTweenAt = cover.indexOf('startColorMixTween(', cover.indexOf('function applyCoverCanvas('));
  const coverReadyAt = cover.indexOf('markLyricDepthCoverReady(opts.trackToken)', coverTweenAt);
  assert.ok(coverReadyAt > coverTweenAt, 'cover ready must be emitted after the previous-cover snapshot and crossfade start');
  assert.match(cover.slice(coverTweenAt, coverReadyAt + 120), /typeof markLyricDepthCoverReady === 'function'/);

  const applyLyricsAt = lyrics.indexOf('function applyLyricsState(');
  const renderAt = lyrics.indexOf('renderLyrics(renderOptions || {})', applyLyricsAt);
  const lyricsReadyAt = lyrics.indexOf('markLyricDepthLyricsReady(trackSwitchToken)', renderAt);
  assert.ok(lyricsReadyAt > renderAt, 'lyrics ready must be emitted only after the state has rendered');
  assert.match(lyrics.slice(applyLyricsAt, lyricsReadyAt + 160), /prepared\.timingSource !== 'pending'/);
  assert.match(lyrics.slice(applyLyricsAt, lyricsReadyAt + 160), /typeof markLyricDepthLyricsReady === 'function'/);

  const completeAt = controls.indexOf('async function completeAudioPlayStart(');
  const successAt = controls.indexOf('hideLoading()', completeAt);
  const audioReadyAt = controls.indexOf('markLyricDepthAudioReady(trackSwitchToken)', successAt);
  assert.ok(audioReadyAt > successAt, 'audio ready must be emitted on the successful completion path');
  assert.match(controls.slice(successAt, audioReadyAt + 160), /typeof markLyricDepthAudioReady === 'function'/);
});

test('all P11 transition hooks are optional and the regression is part of npm check', () => {
  const packageJson = JSON.parse(read('package.json'));
  const check = packageJson.scripts && packageJson.scripts.check || '';

  assert.match(check, /scripts\/test-lyric-depth-track-transition-hooks\.js/);
  [
    ['public/js/modules/05-playback/13-playback-start-audio.js', 'beginLyricDepthTrackTransition'],
    ['public/js/modules/05-playback/13-playback-start-audio.js', 'continueLyricDepthTrackTransition'],
    ['public/js/modules/02-visual/15-ripples-cover-depth.js', 'markLyricDepthCoverReady'],
    ['public/js/modules/05-playback/06-track-detail-lyrics-actions.js', 'markLyricDepthLyricsReady'],
    ['public/js/modules/05-playback/14-player-controls.js', 'markLyricDepthAudioReady']
  ].forEach(([file, hook]) => {
    assert.match(read(file), new RegExp(`typeof ${hook} === 'function'`));
  });
});

test('terminal local and remote playback failures cancel an active P11 bridge', () => {
  const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');

  assert.match(playback, /function cancelLyricDepthPlaybackTransition\(token\)/);
  assert.match(playback, /if \(!song \|\| !song\.localUrl\) \{[\s\S]*?cancelLyricDepthPlaybackTransition\(token\)[\s\S]*?return false;/);
  assert.match(playback, /if \(!playbackStarted\) \{[\s\S]*?clearFailedPlaybackAudioSource\(token\);[\s\S]*?cancelLyricDepthPlaybackTransition\(token\);/);
  assert.match(playback, /if \(typeof isPlaybackProviderDisabled[\s\S]*?tryAutoPlaybackFallback[\s\S]*?cancelLyricDepthPlaybackTransition\(token\);[\s\S]*?handlePlaybackUnavailable\(song, disabledPayload\)/);
  assert.match(playback, /if \(!data\.url\) \{[\s\S]*?tryAutoPlaybackFallback[\s\S]*?cancelLyricDepthPlaybackTransition\(token\);[\s\S]*?handlePlaybackUnavailable\(song, data\)/);
});
