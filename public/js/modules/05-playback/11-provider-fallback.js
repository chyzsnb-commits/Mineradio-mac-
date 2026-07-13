var firstPlayDone = false;

// 单首歌失败总次数计数器（治本：掐断"降级+换源"反复循环导致的卡死）。
// 同一首歌 15 秒内失败超过 3 次，直接跳下一首，不再降级/换源。
var _playbackFailCounter = {};
function _failKey(song, idx) {
  var key = songProviderKey(song) + ':' + (song && (song.id || song.name) || '') + '@' + idx;
  return key;
}
function _recordPlaybackFail(song, idx) {
  var k = _failKey(song, idx);
  var now = Date.now();
  var entry = _playbackFailCounter[k];
  if (entry && now - entry.at < 15000) {
    entry.n += 1;
  } else {
    _playbackFailCounter[k] = { n: 1, at: now };
  }
  return _playbackFailCounter[k].n;
}
function _playbackFailExceeded(song, idx) {
  var k = _failKey(song, idx);
  var entry = _playbackFailCounter[k];
  if (!entry) return false;
  // 15 秒窗口外重置
  if (Date.now() - entry.at > 15000) {
    delete _playbackFailCounter[k];
    return false;
  }
  return entry.n >= 3;  // 同一首歌 15 秒内失败 3 次即超限
}

function playbackProviderLabel(song) {
  var provider = songProviderKey(song);
  if (provider === 'qq') return 'QQ 音乐';
  if (provider === 'kugou') return '酷狗音乐';
  if (provider === 'qishui') return '汽水音乐';
  if (provider === 'spotify') return 'Spotify';
  return '网易云';
}
function playbackLoginProvider(song) {
  return normalizePlaybackProvider(songProviderKey(song));
}
function playbackRestrictionRawCategory(song, data) {
  data = data || {};
  var restriction = data.restriction || {};
  return data.reason || data.category || data.errorCategory || restriction.category || restriction.reason || '';
}
function playbackRestrictionLooksVipLocked(song, data) {
  data = data || {};
  var restriction = data.restriction || {};
  if (typeof songRequiresVip === 'function' && songRequiresVip(Object.assign({}, song || {}, data || {}))) return true;
  if (data.trial || data.needVip || data.need_vip || data.vipRequired || data.onlyVipPlayable || data.only_vip_playable) return true;
  var text = [
    data.error,
    data.message,
    data.reason,
    data.category,
    restriction.category,
    restriction.reason,
    restriction.message,
    data.rawMessage,
    restriction.rawMessage
  ].map(function (value) { return String(value || '').toLowerCase(); }).join(' ');
  return /vip_required|paid_required|trial_only|need_vip|only_vip|member|vip|会员|付费|购买|数字专辑|专辑/.test(text);
}
function playbackRestrictionMissingPlaybackKey(data) {
  data = data || {};
  var restriction = data.restriction || {};
  return !!(data.missingPlaybackKey || restriction.missingPlaybackKey);
}
function playbackRestrictionCategory(song, data) {
  var category = playbackRestrictionRawCategory(song, data);
  var provider = playbackLoginProvider(song);
  var status = platformStatus(provider) || {};
  var mergedStatus = Object.assign({}, status, data || {}, data && data.restriction || {});
  var loggedIn = !!(status.loggedIn || data && data.loggedIn);
  var vipLevel = typeof providerVipLevel === 'function' ? providerVipLevel(provider, mergedStatus) : 'none';
  var vipLocked = playbackRestrictionLooksVipLocked(song, data);
  if (vipLocked && !playbackRestrictionMissingPlaybackKey(data)) {
    if (category === 'login_required' && loggedIn && vipLevel === 'none') return 'vip_required';
    if (!category || category === 'url_unavailable' || category === 'copyright_unavailable') {
      if (loggedIn && vipLevel === 'none') return 'vip_required';
    }
  }
  if (!category && data && data.error && /401|403|login_required|auth|cookie|credential|unauthorized|forbidden/i.test(String(data.error))) return loggedIn && vipLocked ? 'vip_required' : 'login_required';
  if (!category && data && data.error && /vip|member|paid|trial|会员|付费|购买/i.test(String(data.error))) return loggedIn ? 'vip_required' : 'login_required';
  return category || 'url_unavailable';
}
function playbackProviderMembershipText(provider, data) {
  var status = platformStatus(provider) || {};
  var mergedStatus = Object.assign({}, status, data || {}, data && data.restriction || {});
  var level = typeof providerVipLevel === 'function' ? providerVipLevel(provider, mergedStatus) : 'none';
  if (level === 'svip') return 'SVIP';
  if (level === 'vip') return provider === 'spotify' ? 'Premium' : 'VIP';
  return '普通账号';
}
function playbackRestrictionNotice(song, data) {
  data = data || {};
  var restriction = data.restriction || {};
  var category = playbackRestrictionCategory(song, data);
  var provider = playbackProviderLabel(song);
  var providerKey = playbackLoginProvider(song);
  var status = platformStatus(providerKey) || {};
  var loggedIn = !!(status.loggedIn || data.loggedIn);
  var membership = playbackProviderMembershipText(providerKey, data);
  var message = data.message || restriction.message || '';
  if (category === 'vip_required' || category === 'paid_required' || category === 'trial_only') {
    var needText = category === 'paid_required' ? '购买、数字专辑或更高权限' : (category === 'trial_only' ? '完整播放权限' : '会员权限');
    var title = loggedIn ? '当前平台没有会员状态' : '当前平台未登录会员';
    var body = message || (provider + ' 已识别为会员/付费曲目，当前状态是 ' + membership + '，缺少' + needText + '。');
    if (loggedIn && body.indexOf('当前状态') < 0) body += ' 当前状态是 ' + membership + '。';
    return { category: category, title: title, body: body + ' 可以登录会员账号、降低音质或切换到其它音源。', action: 'upgrade', toast: title };
  }
  if (category === 'login_required') {
    if (loggedIn && playbackRestrictionMissingPlaybackKey(data)) {
      return {
        category: category,
        title: '平台播放授权未完成',
        body: message || (provider + ' 已登录，但还缺少播放授权，请重新打开官方登录窗口完成授权。'),
        action: 'login',
        toast: '播放授权未完成'
      };
    }
    return {
      category: category,
      title: '当前平台未登录',
      body: (message || (provider + ' 需要登录后才能获取播放地址。')) + ' 正在打开对应登录入口。',
      action: 'login',
      toast: '当前平台未登录'
    };
  }
  if (category === 'provider_limited') {
    return {
      category: category,
      title: '平台仅作为匹配源',
      body: message || (provider + ' 当前只提供搜索/匹配信息，播放会自动寻找其它可播版本。'),
      action: 'switch_source',
      toast: '正在自动换源'
    };
  }
  if (category === 'copyright_unavailable') {
    return {
      category: category,
      title: '当前平台版权不可播',
      body: (message || (provider + ' 当前版权暂不可播。')) + ' 可以换一个平台版本。',
      action: 'switch_source',
      toast: '版权不可播'
    };
  }
  return {
    category: category,
    title: '当前平台没有可用音源',
    body: (message || (provider + ' 没有返回可播放地址。')) + ' 可能是版权、地区、会员或网络限制，可以换源或稍后重试。',
    action: 'switch_source',
    toast: '当前平台没有可用音源'
  };
}
function playbackRestrictionMessage(song, data) {
  var notice = playbackRestrictionNotice(song, data);
  return notice.body || notice.title;
  data = data || {};
  var restriction = data.restriction || {};
  var category = data.reason || restriction.category || '';
  var provider = playbackProviderLabel(song);
  var message = data.message || restriction.message || '';
  if (!message) {
    if (category === 'login_required') message = provider + '需要登录后再尝试播放';
    else if (category === 'vip_required') message = provider + '歌曲需要会员权限';
    else if (category === 'paid_required') message = provider + '歌曲需要购买或更高权限';
    else if (category === 'trial_only') message = provider + '仅返回试听片段';
    else if (category === 'copyright_unavailable') message = provider + '版权暂不可播';
    else if (category === 'provider_limited') message = provider + '当前只作为匹配源，正在寻找其它可播版本';
    else message = provider + '没有返回可播放地址';
  }
  if (category === 'login_required') return message + ' · 正在打开登录';
  if (category === 'provider_limited') return message + ' · 可以自动换源';
  if (category === 'copyright_unavailable' || category === 'url_unavailable') return message + ' · 可以试试另一个平台版本';
  return message;
}
function qqPlaybackRetryQualities(requestedQuality, resolvedLevel) {
  requestedQuality = normalizePlaybackQualityForProvider(requestedQuality || getProviderPlaybackQuality('qq'), 'qq');
  resolvedLevel = String(resolvedLevel || '').toLowerCase();
  var pool = [];
  if (requestedQuality === 'jymaster' || requestedQuality === 'hires' || requestedQuality === 'lossless' || resolvedLevel === 'hires' || resolvedLevel === 'lossless') {
    pool = ['exhigh', 'standard'];
  } else if (requestedQuality === 'exhigh' || resolvedLevel === 'exhigh') {
    pool = ['standard'];
  }
  return pool.filter(function (q) { return q !== requestedQuality; });
}
async function retryQQPlaybackWithCompatibleQuality(song, idx, token, opts, data, requestedQuality) {
  opts = opts || {};
  // 失败总次数防护：同一首歌 15 秒内失败超 3 次就不再降级（交由上层 skip 到下一首）
  if (_playbackFailExceeded(song, idx)) {
    console.warn('[FB-DIAG] QQ降级被失败计数器拦截', song && song.name, 'idx=' + idx);
    return false;
  }
  var _failN = _recordPlaybackFail(song, idx);
  console.warn('[FB-DIAG] QQ音质降级', song && song.name, 'idx=' + idx, '第' + _failN + '次');
  var tried = Array.isArray(opts.qqQualityTried) ? opts.qqQualityTried.slice() : [];
  [requestedQuality, data && data.level].forEach(function (q) {
    q = normalizePlaybackQuality(q || '');
    if (q && tried.indexOf(q) < 0) tried.push(q);
  });
  var candidates = qqPlaybackRetryQualities(requestedQuality, data && data.level).filter(function (q) { return tried.indexOf(q) < 0; });
  if (!candidates.length || token !== trackSwitchToken) return false;
  var nextQuality = candidates[0];
  var resolvedQuality = normalizePlaybackQuality(data && data.level);
  markPlaybackQualityRuntimeCap(song, 'qq', nextQuality, 'qq-url-unavailable');
  if (!opts.startupAutoplay) showSourceFallbackNotice('QQ 音质自动兼容', '当前音质启动失败，正在切到 ' + playbackQualityLabel(nextQuality, 'qq') + '。');
  var retryResumeAt = opts.resumeAt;
  if (retryResumeAt == null && opts.startupAutoplay && pendingPlaybackResumeAt > 0) retryResumeAt = pendingPlaybackResumeAt;
  await playQueueAt(idx, Object.assign({}, opts, {
    qualityOverride: nextQuality,
    qqQualityTried: tried,
    resumeAt: retryResumeAt,
  }));
  return true;
}
var sourceFallbackNoticeTimer = null;
function closeSourceFallbackNotice() {
  var notice = document.getElementById('source-fallback-notice');
  if (sourceFallbackNoticeTimer) { clearTimeout(sourceFallbackNoticeTimer); sourceFallbackNoticeTimer = null; }
  if (notice) notice.classList.remove('show');
  var stack = document.getElementById('source-fallback-stack');
  if (stack) Array.prototype.slice.call(stack.children || []).forEach(removeSourceFallbackCard);
}
function ensureSourceFallbackStack() {
  var stack = document.getElementById('source-fallback-stack');
  if (stack) return stack;
  stack = document.createElement('div');
  stack.id = 'source-fallback-stack';
  stack.setAttribute('aria-live', 'polite');
  document.body.appendChild(stack);
  return stack;
}
function removeSourceFallbackCard(card) {
  if (!card) return;
  card.classList.add('leaving');
  setTimeout(function () {
    if (card.parentNode) card.parentNode.removeChild(card);
  }, 260);
}
// 节流：同样的通知 800ms 内不重复弹（防止失败链路疯狂创建 DOM 卡死）
var _lastFallbackNotice = '';
var _lastFallbackNoticeAt = 0;
function showSourceFallbackNotice(title, body) {
  var noticeKey = String(title) + '|' + String(body);
  var now = Date.now();
  if (noticeKey === _lastFallbackNotice && now - _lastFallbackNoticeAt < 800) return;
  _lastFallbackNotice = noticeKey;
  _lastFallbackNoticeAt = now;
  var stack = ensureSourceFallbackStack();
  if (stack) {
    var card = document.createElement('div');
    card.className = 'source-fallback-card';
    var head = document.createElement('div');
    head.className = 'source-fallback-head';
    var titleElNew = document.createElement('div');
    titleElNew.className = 'source-fallback-title';
    titleElNew.textContent = title || '自动换源';
    var close = document.createElement('button');
    close.className = 'source-fallback-close';
    close.type = 'button';
    close.textContent = '×';
    close.onclick = function () { removeSourceFallbackCard(card); };
    var bodyElNew = document.createElement('div');
    bodyElNew.className = 'source-fallback-body';
    bodyElNew.textContent = body || '';
    head.appendChild(titleElNew);
    head.appendChild(close);
    card.appendChild(head);
    card.appendChild(bodyElNew);
    stack.insertBefore(card, stack.firstChild || null);
    while (stack.children.length > 4) removeSourceFallbackCard(stack.lastElementChild);
    requestAnimationFrame(function () { card.classList.add('show'); });
    setTimeout(function () { removeSourceFallbackCard(card); }, 5600);
    return;
  }
  var notice = document.getElementById('source-fallback-notice');
  var titleEl = document.getElementById('source-fallback-title');
  var bodyEl = document.getElementById('source-fallback-body');
  if (!notice || !titleEl || !bodyEl) return;
  titleEl.textContent = title || '自动换源';
  bodyEl.textContent = body || '';
  notice.classList.add('show');
  if (sourceFallbackNoticeTimer) clearTimeout(sourceFallbackNoticeTimer);
  sourceFallbackNoticeTimer = setTimeout(closeSourceFallbackNotice, 5000);
}
function normalizeMatchText(text) {
  return String(text || '').toLowerCase()
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[\s·・\-—_.,，。:：'"“”‘’/\\|]+/g, '');
}
function artistNameParts(song) {
  var parts = [];
  if (song && Array.isArray(song.artists)) {
    song.artists.forEach(function (a) { if (a && a.name) parts.push(a.name); });
  }
  if (song && song.artist) {
    String(song.artist).split(/\s*\/\s*|\s*,\s*|、|&| feat\.? | ft\.? /i).forEach(function (name) {
      if (name && name.trim()) parts.push(name.trim());
    });
  }
  return parts.map(normalizeMatchText).filter(Boolean);
}
function isSameTitleArtist(source, candidate) {
  if (!source || !candidate) return false;
  if (normalizeMatchText(source.name || source.title) !== normalizeMatchText(candidate.name || candidate.title)) return false;
  var a = artistNameParts(source);
  var b = artistNameParts(candidate);
  if (!a.length || !b.length) return false;
  return a.some(function (name) { return b.indexOf(name) >= 0; });
}
function alternatePlaybackProvider(song) {
  var provider = songProviderKey(song);
  if (provider === 'netease') return 'qq';
  if (provider === 'qq') return 'kugou';
  if (provider === 'spotify') return 'netease';
  return 'netease';
}
async function searchAlternatePlatformSong(song) {
  var target = alternatePlaybackProvider(song);
  var artist = artistNameParts(song)[0] || '';
  var query = [song.name || song.title || '', song.artist || artist].filter(Boolean).join(' ').trim();
  if (!query) return null;
  var url = target === 'qq'
    ? '/api/qq/search?keywords=' + encodeURIComponent(query) + '&limit=8'
    : (target === 'kugou'
      ? '/api/kugou/search?keywords=' + encodeURIComponent(query) + '&limit=8'
      : '/api/search?keywords=' + encodeURIComponent(query) + '&limit=12');
  var data = await apiJson(url);
  var list = data && (data.songs || data.result || []);
  for (var i = 0; i < list.length; i++) {
    if (typeof sourceCandidateRejectReason === 'function' && sourceCandidateRejectReason(song, list[i], target)) continue;
    if (isSameTitleArtist(song, list[i])) return cloneSong(list[i]);
  }
  return null;
}
// 连续自动跳过计数:整队都不可播时,nextUnblockedQueueIndex 的 18s 时间窗会让
// 早先失败的曲目重新“解封”,导致无限跳歌把主线程和内存拖到卡死。用一个单调计数
// 器保证级联最多跑一整圈队列就停;任何一首拿到可播 URL 时(见播放成功路径)清零。
var playbackSkipCascade = 0;
function resetPlaybackSkipCascade() { playbackSkipCascade = 0; }
function markQueueItemPlaybackFailed(idx) {
  if (playQueue[idx]) playQueue[idx]._lastPlaybackFailAt = Date.now();
}
function nextUnblockedQueueIndex(idx) {
  var now = Date.now();
  for (var step = 1; step < playQueue.length; step++) {
    var nextIdx = (idx + step) % playQueue.length;
    var failedAt = Number(playQueue[nextIdx] && playQueue[nextIdx]._lastPlaybackFailAt) || 0;
    if (!failedAt || now - failedAt > 18000) return nextIdx;
  }
  return -1;
}
function isQueueItemRecentlyPlaybackFailed(idx) {
  var failedAt = Number(playQueue[idx] && playQueue[idx]._lastPlaybackFailAt) || 0;
  return !!(failedAt && Date.now() - failedAt <= 18000);
}
function skipFailedQueueItem(idx, token, message, opts) {
  opts = opts || {};
  hideLoading();
  if (token !== trackSwitchToken) return;
  markQueueItemPlaybackFailed(idx);
  if (playQueue.length <= 1) {
    if (!opts.silent) showSourceFallbackNotice('没有可跳过的下一首', message || '当前歌曲不可播放，队列里没有其他歌曲。');
    return;
  }
  var nextIdx = nextUnblockedQueueIndex(idx);
  if (nextIdx < 0) {
    if (!opts.silent) showSourceFallbackNotice('队列暂时没有可播歌曲', '已尝试绕开受限歌曲，当前队列没有新的可播放项。');
    return;
  }
  playbackSkipCascade++;
  if (playbackSkipCascade > playQueue.length) {
    playbackSkipCascade = 0;
    if (!opts.silent) showSourceFallbackNotice('队列里暂时没有可播放的歌曲', '已连续跳过整轮受限/不可播的歌曲，已停止自动跳转，避免卡顿。可手动选择其它歌曲或稍后重试。');
    return;
  }
  if (!opts.silent) showSourceFallbackNotice('已跳过受限歌曲', message || '未找到同名同歌手的另一个平台版本，正在播放下一首。');
  currentIdx = nextIdx;
  playQueueAt(nextIdx, opts.playbackOpts || { fallbackDepth: 0 });
}
async function tryAutoPlaybackFallback(song, data, idx, token, opts) {
  opts = opts || {};
  // 失败总次数防护：同一首歌 15 秒内失败超 3 次就跳下一首，不再换源
  if (_playbackFailExceeded(song, idx)) {
    console.warn('[FB-DIAG] 换源被失败计数器拦截→跳下一首', song && song.name, 'idx=' + idx);
    var skipOpts0 = opts.startupAutoplay ? { silent: true, playbackOpts: { fallbackDepth: 0, startupAutoplay: true } } : null;
    skipFailedQueueItem(idx, token, '当前歌曲多次播放失败，已跳过。', skipOpts0);
    return true;
  }
  var _failN2 = _recordPlaybackFail(song, idx);
  console.warn('[FB-DIAG] 自动换源', song && song.name, 'idx=' + idx, '第' + _failN2 + '次');
  var skipPlaybackOpts = { fallbackDepth: 0, startupAutoplay: true };
  if (opts.resumeAt != null) skipPlaybackOpts.resumeAt = opts.resumeAt;
  var skipOpts = opts.startupAutoplay ? { silent: true, playbackOpts: skipPlaybackOpts } : null;
  if (opts.fallbackDepth > 0) {
    skipFailedQueueItem(idx, token, '自动换源后的版本仍不可播，正在播放下一首。', skipOpts);
    return true;
  }
  if (!song || song.type === 'local' || song.type === 'podcast' || song.source === 'podcast') return false;
  var category = playbackRestrictionCategory(song, data);
  var fromLabel = playbackProviderLabel(song);
  var alternateProvider = alternatePlaybackProvider(song);
  var targetLabel = alternateProvider === 'qq' ? 'QQ 音乐' : (alternateProvider === 'kugou' ? '酷狗音乐' : (alternateProvider === 'spotify' ? 'Spotify' : '网易云'));
  if (!opts.startupAutoplay) showSourceFallbackNotice('正在自动换源', fromLabel + ' 当前不可播，正在查找 ' + targetLabel + ' 的同名同歌手版本。');
  try {
    var alternate = await searchAlternatePlatformSong(song);
    if (token !== trackSwitchToken) return true;
    if (!alternate) {
      if (category === 'login_required') return false;
      skipFailedQueueItem(idx, token, '没有找到同名同歌手的 ' + targetLabel + ' 版本，正在播放下一首。', skipOpts);
      return true;
    }
    alternate.autoFallbackFrom = songProviderKey(song);
    // 保留换源前的失败标记，避免换源后队列项被新对象覆盖导致 18 秒退避失效
    var prevFailAt = playQueue[idx] && playQueue[idx]._lastPlaybackFailAt;
    var altHydrated = hydrateCustomCover(alternate);
    if (prevFailAt) altHydrated._lastPlaybackFailAt = prevFailAt;
    playQueue[idx] = altHydrated;
    safeRenderQueuePanel('source-fallback', { scrollCurrent: miniQueueOpen });
    safeShelfRebuild('source-fallback');
    if (!opts.startupAutoplay) showSourceFallbackNotice('已自动切换音源', (song.name || '当前歌曲') + ' 已从 ' + fromLabel + ' 切到 ' + targetLabel + '。');
    var fallbackPlaybackOpts = { fallbackDepth: 1, startupAutoplay: !!opts.startupAutoplay, preserveHomeState: !!opts.preserveHomeState };
    if (opts.resumeAt != null) fallbackPlaybackOpts.resumeAt = opts.resumeAt;
    await playQueueAt(idx, fallbackPlaybackOpts);
    return true;
  } catch (e) {
    if (token !== trackSwitchToken) return true;
    skipFailedQueueItem(idx, token, '自动换源搜索失败，正在播放下一首。', skipOpts);
    return true;
  }
}
function handlePlaybackUnavailable(song, data) {
  hideLoading();
  forcePlaybackControlsInteractive();
  var provider = playbackLoginProvider(song);
  var notice = playbackRestrictionNotice(song, data);
  var category = notice.category;
  showToast(notice.toast || notice.title || playbackRestrictionMessage(song, data));
  showSourceFallbackNotice(notice.title, notice.body);
  if (category === 'login_required') {
    setTimeout(function () {
      var modal = document.getElementById('login-modal');
      if (!modal || modal.classList.contains('show')) return;
      openProviderLogin(provider);
    }, 520);
  }
}
