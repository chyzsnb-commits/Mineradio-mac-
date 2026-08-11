function loggedProviderCount() {
  return ['netease', 'qq', 'kugou', 'qishui', 'spotify'].filter(function (key) { return hasPlatformLogin(key); }).length;
}
function updateUserModalUi() {
  if (!hasPlatformLogin(activeAccountProvider)) activeAccountProvider = firstLoggedProvider();
  var st = platformStatus(activeAccountProvider);
  var meta = platformMeta(activeAccountProvider);
  var chip = document.getElementById('account-provider-chip');
  var avatar = document.getElementById('user-modal-avatar');
  var name = document.getElementById('user-modal-name');
  var vipEl = document.getElementById('user-modal-vip');
  var hint = document.getElementById('account-hint');
  var logoutBtn = document.getElementById('account-logout-btn');
  var addNetease = document.getElementById('account-add-netease');
  var addQQ = document.getElementById('account-add-qq');
  var addKugou = document.getElementById('account-add-kugou');
  var addQishui = document.getElementById('account-add-qishui');
  var addSpotify = document.getElementById('account-add-spotify');
  if (chip) {
    chip.className = 'account-provider-chip ' + activeAccountProvider;
    chip.innerHTML = '<span class="account-source-dot ' + meta.dot + '"></span><span>' + meta.label + '</span>';
  }
  if (avatar) avatar.src = providerAvatarSrc(activeAccountProvider, st);
  if (name) name.textContent = (st && st.nickname) || meta.label;
  if (vipEl) {
    if (activeAccountProvider === 'qishui') {
      var qishuiMode = st && st.webSession ? '网页登录已保存' : (st && st.tokenConfigured ? 'OpenAPI 授权已保存' : '授权已保存');
      var qishuiSync = st && st.webSession ? '可同步我的喜欢和歌单' : '匹配源';
      vipEl.textContent = qishuiMode + '  /  ' + qishuiSync;
      vipEl.style.color = 'rgba(69,214,143,0.78)';
    } else if (activeAccountProvider === 'spotify') {
      vipEl.textContent = 'ID: ' + ((st && st.userId) || '-') + '  /  账号已连接';
      vipEl.style.color = 'rgba(30,215,96,0.70)';
    } else {
      vipEl.textContent = 'UID: ' + ((st && st.userId) || '-') + '  /  账号已连接';
      vipEl.style.color = 'rgba(255,255,255,0.58)';
    }
  }
  ['netease', 'qq', 'kugou', 'qishui', 'spotify', 'both'].forEach(function (key) {
    var btn = document.getElementById('user-provider-' + key);
    if (btn) btn.classList.toggle('active', key === 'both' ? dualAccountMode : (!dualAccountMode && activeAccountProvider === key));
  });
  if (addNetease) addNetease.style.display = hasPlatformLogin('netease') ? 'none' : '';
  if (addQQ) addQQ.textContent = hasPlatformLogin('qq') ? '查看 QQ 音乐' : '补登 QQ 音乐';
  if (addKugou) addKugou.textContent = hasPlatformLogin('kugou') ? '查看酷狗音乐' : '补登酷狗音乐';
  if (addQishui) addQishui.textContent = hasPlatformLogin('qishui') ? '查看汽水授权' : '授权汽水音乐';
  if (addSpotify) addSpotify.textContent = hasPlatformLogin('spotify') ? '查看 Spotify' : '连接 Spotify';
  if (logoutBtn) logoutBtn.textContent =
    activeAccountProvider === 'qq' ? '退出 QQ 音乐' :
    (activeAccountProvider === 'kugou' ? '退出酷狗音乐' :
    (activeAccountProvider === 'qishui' ? '退出汽水音乐' :
    (activeAccountProvider === 'spotify' ? '退出 Spotify' : '退出网易云')));
  if (hint) hint.textContent = dualAccountMode
    ? '右上角已切换为多平台并排展示。'
    : '可切换右上角展示的平台；“我两个都要”会并排显示当前已登录的平台。';
}
function showUserModal() {
  if (!hasAnyPlatformLogin()) return showLoginModal();
  updateUserModalUi();
  openGsapModal(document.getElementById('user-modal'));
  if (qqLoginStatus && qqLoginStatus.loggedIn && typeof refreshQQVipStatusNow === 'function') {
    refreshQQVipStatusNow('account-modal')
      .then(updateUserModalUi)
      .catch(function (e) { console.warn('QQ VIP modal refresh failed:', e); });
  }
}
function closeUserModal() { closeGsapModal(document.getElementById('user-modal')); }
function setActiveAccountProvider(provider) {
  provider = provider === 'qq' ? 'qq' : (provider === 'kugou' ? 'kugou' : (provider === 'qishui' ? 'qishui' : (provider === 'spotify' ? 'spotify' : 'netease')));
  if (!hasPlatformLogin(provider)) {
    openProviderLogin(provider);
    return;
  }
  activeAccountProvider = provider;
  dualAccountMode = false;
  renderUserBtn();
  updateUserModalUi();
}
function enableDualAccountView() {
  if (loggedProviderCount() < 2) {
    openProviderLogin(firstLoggedProvider() === 'netease' ? 'qq' : 'netease');
    return;
  }
  dualAccountMode = true;
  renderUserBtn();
  updateUserModalUi();
  showToast('已启用多平台账号展示');
}
function requestDualLoginMode() {
  enableDualAccountView();
}
function openProviderLogin(provider) {
  provider = provider === 'qq' ? 'qq' : (provider === 'kugou' ? 'kugou' : (provider === 'qishui' ? 'qishui' : (provider === 'spotify' ? 'spotify' : 'netease')));
  closeUserModal();
  loginProvider = provider;
  showLoginModal({ provider: provider });
}
async function logoutActiveAccount() {
  return logoutPlatformAccount(activeAccountProvider);
}
async function logoutPlatformAccount(provider, opts) {
  opts = opts || {};
  provider = provider === 'qq' ? 'qq' : (provider === 'kugou' ? 'kugou' : (provider === 'qishui' ? 'qishui' : (provider === 'spotify' ? 'spotify' : 'netease')));
  activeAccountProvider = provider;
  if (provider === 'spotify') {
    try { await apiJson('/api/spotify/logout'); } catch (e) { }
    try {
      if (window.desktopWindow && typeof window.desktopWindow.clearSpotifyMusicLogin === 'function') {
        await window.desktopWindow.clearSpotifyMusicLogin();
      }
    } catch (e) { }
    spotifyLoginStatus = { provider: 'spotify', loggedIn: false, configured: false, oauthConfigured: false, oauthMissing: [], preview: false, nickname: 'Spotify', userId: '', avatar: '', product: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, playbackKeyReady: false, playbackMode: 'recommend-match', tokenConfigured: false, tokenFileExists: false, credentialsFileExists: false, localConfigMissing: false };
    spotifyPlaylists = [];
    userPlaylists = userPlaylists.filter(function (pl) { return pl.provider !== 'spotify'; });
    dualAccountMode = false;
    activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    safeShelfRebuild('spotify-logout');
    if (hasAnyPlatformLogin()) updateUserModalUi();
    else closeUserModal();
    if (opts.keepLoginModalOpen && typeof updateLoginProviderUi === 'function') updateLoginProviderUi();
    showToast('已退出 Spotify');
    return;
  }
  if (provider === 'kugou') {
    try { await apiJson('/api/kugou/logout'); } catch (e) { }
    try {
      if (window.desktopWindow && typeof window.desktopWindow.clearKugouMusicLogin === 'function') {
        await window.desktopWindow.clearKugouMusicLogin();
      }
    } catch (e) { }
    kugouLoginStatus = { provider: 'kugou', loggedIn: false, preview: false, nickname: '酷狗音乐', userId: '', avatar: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false, playbackKeyReady: false };
    kugouPlaylists = [];
    userPlaylists = userPlaylists.filter(function (pl) { return pl.provider !== 'kugou'; });
    dualAccountMode = false;
    activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    if (hasAnyPlatformLogin()) updateUserModalUi();
    else closeUserModal();
    if (opts.keepLoginModalOpen && typeof updateLoginProviderUi === 'function') updateLoginProviderUi();
    showToast('已退出酷狗音乐');
    return;
  }
  if (provider === 'qq') {
    try { await apiJson('/api/qq/logout'); } catch (e) { }
    try {
      if (window.desktopWindow && typeof window.desktopWindow.clearQQMusicLogin === 'function') {
        await window.desktopWindow.clearQQMusicLogin();
      }
    } catch (e) { }
    if (typeof clearQQPlaybackVipEvidence === 'function') clearQQPlaybackVipEvidence();
    qqLoginStatus = { provider: 'qq', loggedIn: false, preview: false, nickname: 'QQ 音乐', userId: '', avatar: '', vipType: 0, vipLevel: 'none', isVip: false, isSvip: false };
    qqPlaylists = [];
    userPlaylists = userPlaylists.filter(function (pl) { return pl.provider !== 'qq'; });
    dualAccountMode = false;
    activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    if (hasAnyPlatformLogin()) updateUserModalUi();
    else closeUserModal();
    if (opts.keepLoginModalOpen && typeof updateLoginProviderUi === 'function') updateLoginProviderUi();
    showToast('已退出 QQ 音乐');
    return;
  }
  if (provider === 'qishui') {
    try {
      var qishuiLogoutResult = await apiJson('/api/qishui/logout');
      if (!qishuiLogoutResult || qishuiLogoutResult.ok !== true) throw new Error('QISHUI_LOGOUT_REJECTED');
    } catch (e) {
      showToast('退出汽水音乐失败，已保留当前登录态');
      return false;
    }
    try {
      if (window.desktopWindow && typeof window.desktopWindow.clearQishuiMusicLogin === 'function') {
        var qishuiSessionResult = await window.desktopWindow.clearQishuiMusicLogin();
        if (qishuiSessionResult && qishuiSessionResult.ok === false) throw new Error('QISHUI_DESKTOP_SESSION_CLEAR_FAILED');
      }
    } catch (e) {
      showToast('汽水本地会话清理失败，请重试');
      return false;
    }
    qishuiLoginStatus = { provider: 'qishui', loggedIn: false, configured: false, webSession: false, tokenConfigured: false, nickname: '汽水音乐', userId: '', avatar: '', playbackKeyReady: false, playbackMode: 'recommend-match' };
    qishuiPlaylists = [];
    userPlaylists = userPlaylists.filter(function (pl) { return pl.provider !== 'qishui'; });
    dualAccountMode = false;
    activeAccountProvider = firstLoggedProvider();
    renderUserBtn();
    safeShelfRebuild('qishui-logout');
    if (hasAnyPlatformLogin()) updateUserModalUi();
    else closeUserModal();
    if (opts.keepLoginModalOpen && typeof updateLoginProviderUi === 'function') updateLoginProviderUi();
    showToast('已退出汽水音乐');
    return true;
  }
  doLogout(opts);
}
async function doLogout(opts) {
  opts = opts || {};
  await apiJson('/api/logout');
  try {
    if (window.desktopWindow && typeof window.desktopWindow.clearNeteaseMusicLogin === 'function') {
      await window.desktopWindow.clearNeteaseMusicLogin();
    }
  } catch (e) { }
  loginStatus = { loggedIn: false };
  if (!hasPlatformLogin('netease') || loggedProviderCount() < 2) dualAccountMode = false;
  activeAccountProvider = firstLoggedProvider();
  userPlaylists = qqPlaylists.concat(kugouPlaylists || [], qishuiPlaylists || [], spotifyPlaylists || []);
  myPodcastCollections = [];
  myPodcastItems = {};
  likedSongMap = {};
  closeCollectModal();
  updateLikeButtons();
  safeRenderQueuePanel('logout', { scrollCurrent: miniQueueOpen });
  renderUserBtn();
  safeShelfRebuild('logout');
  if (!opts.keepLoginModalOpen) closeUserModal();
  if (opts.keepLoginModalOpen && typeof updateLoginProviderUi === 'function') updateLoginProviderUi();
  showToast('已退出登录');
}
