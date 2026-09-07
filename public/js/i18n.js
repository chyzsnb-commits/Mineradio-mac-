(function () {
  'use strict';

  // 语言层只处理界面文案，不触碰歌曲、歌词和用户输入内容。
  var translations = {
    'Mineradio home': 'Mineradio home',
    '查看使用引导': 'Open guide', '发现新版本': 'New release', '最小化': 'Minimize', '全屏': 'Fullscreen', '关闭': 'Close',
    'Mac 版': 'Mac edition', '点击进入': 'Click to enter', '搜索歌曲、歌手...': 'Search songs, artists...',
    '导入音乐或封面': 'Import music or cover', '取消自定义封面': 'Clear custom cover', '导入面板': 'Import panel',
    '封面图片': 'Cover image', '给当前歌曲换封面': 'Change the current cover', '单曲文件': 'Audio file', '导入并立即播放': 'Import and play now',
    '多曲文件夹': 'Music folder', '批量导入到队列': 'Import to queue', '导入入口': 'Import', '播放控制台': 'Player console',
    '锁屏背景': 'Lock screen background', '移除': 'Remove', '常用音乐入口': 'Quick access', '我的歌单': 'My playlists',
    '打开左侧歌单库': 'Open the playlist library', '每日推荐': 'Daily picks', '登录后同步你的今日歌曲': 'Sign in to sync today\'s songs',
    '私人电台': 'Personal radio', '从你的推荐和歌单里开播': 'Play from your picks and playlists', '继续听': 'Continue listening',
    '最近播放会出现在这里': 'Recent plays appear here', '听歌画像': 'Listening profile', '播放几首后生成偏好': 'Your profile appears after a few plays',
    '常听歌手': 'Favorite artists', '你的偏好会在这里汇总': 'Your preferences appear here', '今日聆听': 'Listening today',
    '查看偏好': 'View profile', '聆听时长': 'Listening time', '今日歌曲': 'Songs today', '等待记录': 'Waiting for data',
    '开始播放后生成': 'Generated after playback starts', '接下来播放': 'Next up', '队列里还没有歌曲': 'Your queue is empty',
    '点击打开音乐库': 'Click to open the library', '为你挑选': 'For you', '换一首，也许正合心意': 'Try another song',
    '音乐发现': 'Discover', '平台热歌与个人偏好': 'Platform hits and your taste', '热歌榜、偏好与发现入口': 'Charts, preferences and discovery',
    '平台推荐': 'Platform picks', '推荐电台 / 歌单': 'Recommended radio / playlists', '每日歌曲与平台 Feed': 'Daily songs and platform feed',
    '正在整理推荐': 'Preparing recommendations', '只读取平台可验证的推荐数据，不用关键词搜索替代。': 'Only verified recommendations are shown; keyword search is not used as a fallback.',
    '刷新当前平台': 'Refresh platform', '完成': 'Done', '推荐平台': 'Recommendation platform', '登录账号': 'Sign in',
    '自动隐藏账号胶囊': 'Auto-hide account pill', '回到 Home': 'Back to Home', '视觉控制台': 'Visual console',
    '自动隐藏视觉控制台': 'Auto-hide visual console', '关闭控制台': 'Close visual console', '固定控制台': 'Pin console',
    '即时生效': 'Applied instantly', '视觉预设': 'Visual presets', '用户存档': 'User saves', '界面主题': 'Interface theme',
    '自定义颜色': 'Custom colors', '界面高亮色': 'Interface accent', '视觉主色': 'Visual tint', '封面取色': 'Cover color',
    'Home 填充色': 'Home fill', '主页图标': 'Home icon', '视觉图标': 'Visual icon', '背景颜色': 'Background color',
    '默认': 'Default', '封面': 'Cover', '歌词': 'Lyrics', '搜索': 'Search', '歌单': 'Playlist', '播放': 'Play',
    '暂停': 'Pause', '上一首': 'Previous', '下一首': 'Next', '音量': 'Volume', '收藏': 'Favorite', '设置': 'Settings',
    '登录': 'Sign in', '退出登录': 'Sign out', '取消': 'Cancel', '保存': 'Save', '删除': 'Delete', '关闭': 'Close',
    '下一步': 'Next', '跳过': 'Skip', '切换语言': 'Switch language', '中文': 'Chinese', '英文': 'English',
    '播放输出路由': 'Playback output routing', '正在读取输出设备': 'Reading output devices', '自动换源': 'Automatic source fallback',
    'Guide': 'Guide', '点击空白处也可以继续': 'Click anywhere outside to continue', '是否导出登录 cookie 到桌面？': 'Export login cookie to Desktop?',
    '暂不导出': 'Not now', '导出到桌面': 'Export to Desktop', '检查软件更新': 'Check for updates', '立即更新': 'Update now'
    , '让今天的声音，从你喜欢的地方开始。': 'Let today\'s sound begin where you like it.',
    '今日乐评 · 随心换一首心情': 'Daily note · Change the mood with one tap', '随心换一首心情': 'Change the mood with one tap',
    '换一条': 'Another one', '展开播放器控制台': 'Open player console', '本地曲库': 'Local library',
    'Windows 壁纸库': 'Windows wallpaper library', '今日聆听和音乐发现': 'Listening today and discovery',
    '今日聆听': 'Listening today', '接下来播放': 'Next up', '打开音乐发现': 'Open discovery',
    '打开平台推荐': 'Open platform picks', '推荐电台 / 歌单': 'Recommended radio / playlists',
    '排行榜': 'Charts', '各音源官方榜单': 'Official provider charts', '平台热歌与个人偏好': 'Platform hits and your taste',
    '搜索壁纸名称': 'Search wallpapers', '选择一张壁纸预览': 'Choose a wallpaper to preview',
    '关闭壁纸详情': 'Close wallpaper details', '壁纸详情': 'Wallpaper details', '壁纸模式': 'Wallpaper mode',
    '打开壁纸文件夹': 'Open wallpaper folder', '在 Finder 中打开 Mineradio 壁纸': 'Open Mineradio wallpapers in Finder',
    '上一预设': 'Previous preset', '下一预设': 'Next preset', '退出壁纸模式': 'Exit wallpaper mode',
    '播放下一首': 'Play next song', '播放或暂停当前歌曲': 'Play or pause the current song',
    '上一首歌曲': 'Previous song', '下一首歌曲': 'Next song', '播放/暂停': 'Play/Pause',
    '当前队列': 'Current queue', '当前歌曲': 'Current song', '歌单 / 队列': 'Playlists / Queue',
    '看和调整当前播放队列': 'View and adjust the current queue', '全部播放': 'Play all', '随机': 'Shuffle',
    '顺序循环': 'Loop all', '单曲循环': 'Loop one', '静音': 'Mute', '播放顺序': 'Playback order',
    '播放倍速': 'Playback speed', '音质': 'Audio quality', '播放输出设备': 'Playback output device',
    '歌词校准': 'Lyric calibration', '歌词源': 'Lyric source', '歌词动画': 'Lyric animation',
    '桌面歌词': 'Desktop lyrics', '桌面歌词刷新帧率': 'Desktop lyric frame rate', '桌面歌词锁定': 'Lock desktop lyrics',
    '歌词提前 0.1 秒': 'Lyrics 0.1s earlier', '歌词延后 0.1 秒': 'Lyrics 0.1s later',
    '歌单架 / 摄像头交互': 'Playlist shelf / camera interaction', '歌单架显示': 'Show playlist shelf',
    '歌单架外观': 'Playlist shelf appearance', '歌单架镜头': 'Playlist shelf camera',
    '歌单架颜色': 'Playlist shelf color', '开启或关闭 3D 歌单架': 'Toggle 3D playlist shelf',
    '开启 / 关闭 3D 歌单架': 'Toggle 3D playlist shelf', '摄像头交互': 'Camera interaction',
    '手势 HUD + 手骨架': 'Gesture HUD + hand skeleton', '将手放进摄像头视野': 'Place your hand in the camera view',
    '跟随音乐': 'Follow music', '跟随歌词': 'Follow lyrics', '跟随鼓点': 'Follow the beat',
    '词境漫游': 'Lyric space roam', '自由镜头': 'Free camera', '动态镜头': 'Dynamic camera',
    '性能模式': 'Performance mode', '负载与性能': 'Load & performance', '负载监视器': 'Load monitor',
    '自动优化': 'Auto optimize', '高性能': 'High performance', '省电': 'Power saving',
    '渲染分辨率': 'Render resolution', '总刷新率上限': 'Frame rate cap', '实时频谱': 'Live spectrum',
    '节奏分析': 'Beat analysis', '节奏分析缓存': 'Beat analysis cache', '系统释放': 'System cleanup',
    '清理安全缓存': 'Clear safe cache', '后台触发压缩': 'Compress in background', '系统内存读取中...': 'Reading system memory...',
    '账号信息': 'Account information', '登录接入': 'Sign-in providers', '扫码登录': 'QR code sign-in',
    '开始登录': 'Start sign-in', '退出当前平台': 'Sign out of this provider', '保存会话': 'Save session',
    '补登 QQ 音乐': 'Reconnect QQ Music', '补登网易云': 'Reconnect NetEase Cloud', '补登酷狗': 'Reconnect Kugou',
    '连接 Spotify': 'Connect Spotify', '官方扫码': 'Official QR code', '官方窗口': 'Official window',
    '拖到 MR 接入口': 'Drag to the MR connector', '读取 Windows IP': 'Read Windows IP', '连接': 'Connect',
    '导入 LRC': 'Import LRC', '裁剪封面': 'Crop cover', '导入单曲': 'Import song', '导入文件夹': 'Import folder',
    '拖放音乐或封面': 'Drop music or a cover', '等音频文件，或点上方“导入”按钮。': 'Drop audio files or click “Import” above.',
    '自定义颜色': 'Custom colors', '界面高亮': 'Interface accent', '背景纯色': 'Solid background',
    '背景透明度': 'Background opacity', '玻璃': 'Glass', '整体透明度': 'Overall opacity',
    '均衡器': 'Equalizer', '智能混音': 'Smart mix', '唱歌模式': 'Karaoke mode', '人声': 'Vocals', '伴奏': 'Backing track',
    '音量 / 静音': 'Volume / mute', '淡入': 'Fade in', '淡出': 'Fade out', '重置': 'Reset', '重置当前歌曲歌词校准': 'Reset lyric calibration',
    '恢复默认': 'Restore defaults', '恢复按封面取色': 'Restore cover color', '使用封面': 'Use cover',
    '读取中...': 'Loading...', '正在读取输出设备': 'Reading output devices', '正在整理推荐': 'Preparing recommendations',
    '暂不分析': 'Skip analysis', '开始分析': 'Start analysis', '停止释放': 'Stop cleanup', '管理员授权': 'Administrator authorization'
  };

  var language = 'zh';
  var translating = false;
  var keys = Object.keys(translations).sort(function (a, b) { return b.length - a.length; });

  function translateValue(value) {
    var text = String(value == null ? '' : value);
    keys.forEach(function (key) {
      if (text.indexOf(key) >= 0) text = text.split(key).join(translations[key]);
    });
    return text;
  }

  function translateNode(root) {
    if (language !== 'en' || !root || translating) return;
    translating = true;
    try {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (!node.nodeValue.trim() || node.parentElement.closest('[data-i18n-ignore],.song-title,.search-result-title,.artist-name,.track-name,.song-name')) continue;
        node.nodeValue = translateValue(node.nodeValue);
      }
      root.querySelectorAll && root.querySelectorAll('input,button,[title],[aria-label],[data-control-tip],[data-tooltip],select,option').forEach(function (el) {
        ['placeholder', 'title', 'aria-label', 'data-control-tip', 'data-tooltip'].forEach(function (name) {
          if (el.hasAttribute(name)) el.setAttribute(name, translateValue(el.getAttribute(name)));
        });
        if (el.tagName === 'OPTION') el.textContent = translateValue(el.textContent);
      });
    } finally { translating = false; }
  }

  function updateToggle() {
    var button = document.getElementById('language-toggle');
    if (!button) return;
    button.textContent = language === 'en' ? '中' : 'EN';
    button.title = language === 'en' ? '切换到中文' : 'Switch to English';
    button.setAttribute('aria-label', button.title);
  }

  function setLanguage(next) {
    language = next === 'en' ? 'en' : 'zh';
    try { localStorage.setItem('mineradio-language', language); } catch (_) {}
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    updateToggle();
    if (language === 'en') translateNode(document.body);
    else location.reload();
    window.dispatchEvent(new CustomEvent('mineradio-language-change', { detail: { language: language } }));
  }

  function toggleLanguage() { setLanguage(language === 'en' ? 'zh' : 'en'); }

  try {
    if (localStorage.getItem('mineradio-language') === 'en') language = 'en';
  } catch (_) {}
  window.mineradioI18n = { getLanguage: function () { return language; }, setLanguage: setLanguage, translate: translateValue };
  window.toggleMineradioLanguage = toggleLanguage;
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.addEventListener('DOMContentLoaded', function () {
    updateToggle();
    if (language === 'en') translateNode(document.body);
    if (!window.MutationObserver) return;
    new MutationObserver(function (records) {
      if (language !== 'en' || translating) return;
      records.forEach(function (record) {
        record.addedNodes.forEach(function (node) { if (node.nodeType === 1) translateNode(node); });
        if (record.type === 'characterData' && record.target && record.target.parentElement) translateNode(record.target.parentElement);
        if (record.type === 'attributes' && record.target) translateNode(record.target);
      });
    }).observe(document.body, { childList: true, subtree: true });
  });
})();
