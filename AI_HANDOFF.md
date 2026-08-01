# Mineradio AI Handoff

> 这个文件是给后续接手的 AI agent（Codex / ZCode / 其他）看的。**每次完成任务后更新「工作日志」和「下一步」，让下一位能快速接上。**

- **2026-08-01 首页响应式排版修复（PR #61 后续）**：用户反馈首页在约 `998×1098` 竖版窗口中「很多内容显示不了/卡片重叠」。实机根因有三处：① `≤1120px` dock 改成单列后仍保留 listen/next/discovery/ranking/radio 的旧显式列定位，CSS Grid 生成隐式第二列，第一列被压到约 86px；② `home-grid` 2 列三行挤占右侧洞察 rail 高度；③ `.home-recent-inner` 固定内容允许 `flex-shrink`，`home-next-up` 被压到 27px（内部封面仍 96px）、每日热评被压到 30px（内部多行内容仍约 84px），相邻区块发生溢出。修复：`≤1120px` 快捷区改 3 列、dock 改为两列三行（listen/next 第一行、discovery 跨整行第二行、ranking/radio 第三行）；`≤760px` hero/grid/rail 显式归回单列，五张洞察卡按 DOM 顺序排列，窄宽隐藏简报/下一首；hero kicker/标题/统计/简报/快捷行与 next/review 固定最小高度，只让最近歌曲列表 flex 滚动。新增 `scripts/test-home-layout-responsive.js` 三项并纳入 `npm run check`。真实 Electron（非 headless，CDP CSS viewport）验收 `1440×900`、`998×1098`、`998×700`、`760×850`：hero 直接子项零交叠、dock 五卡零交叠，截图人工复核通过；全量 **226/226**。本批仅改首页布局 CSS、`package.json` 测试脚本和布局测试，不改播放/登录/视觉预设。Obsidian 进度笔记已直接同步。待用户人工在本机窗口拖动/调整大小确认滚动手感。

## 当前权威入口（2026-07-29）

- **本仓库**：`chyzsnb-commits/mr`（**私有**，源码 + CI + 所有发布，单仓库架构）。
- ⚠️ `chyzsnb-commits/Mineradio-mac-` 是**独立的开源仓库，不属于本项目，绝对不要碰**。
- **main 最新 commit**：`a2d8145`（PR #26 已合并：唱歌模式、倍速、防爆音、歌架与卡死修复）。
- **当前 2.0 融合线**：PR #58，分支 `codex/mineradio-2.0-unified`（基于 `codex/public-release-2.0`，融合 Beat 修复）。2026-07-24 补修唱歌/壁纸/3s 空闲降帧；2026-07-28 落地**雨境**视觉预设（复用索引 9，THREE 雨丝对象池，主循环 bass/mid/treble 驱动；**水膜共振仍先不要**）；同日修**音域回响幽灵封面**被不透明地形深度挡住（`depthTest: false`，设置「封面图」开关仍在）；雨境加**湿玻璃幽灵封面**（正视海报，雨丝前景）；2026-07-29 已将独立雨窗的 RG Metaball 玻璃水珠后处理迁移进预设 9，并加入可调控件，水滴外背景保持锐利。最新一轮提高液滴场清晰度、扩大雨量/数量范围，并加入雨点击玻璃后的凝结态；随后消除液滴内部规则点阵：合成 shader 仅保留低频平滑微表面，删除背景逐像素颗粒。雨量现不再影响水珠尺寸或额外撞击频率；水珠仍由雨点击中后的冲击点铺展生成。水珠流速控件扩大到 `0.2–16.0`，新默认值为 `5.0`，UI、输入、运行时、恢复路径和物理速度上限同步提高；打雷阈值默认值为 `0.70`，用户保存值不变。本轮将流速因子接入附着等待、破裂/停靠相位、单段连续滑落距离和重新附着门槛，调高后水珠不会只滑一小段便永久挂住。`npm run check` **176/176**。
- **2026-07-31 汽水 PR #56 官方客户端桥迁移 + 首页补齐**：删除服务端汽水二维码创建/轮询和渲染层二维码状态；`desktop/main.js` 现在从 macOS 汽水客户端容器 `~/Library/Containers/com.soda.music/Data/Library/Application Support/SodaMusic/Cookies` 读取已登录会话，主进程通过 `applyOfficialProviderLogin(localServer, 'qishui', result)` 交给服务端校验并使用既有 `safeStorage` 持久化，Cookie 不出主进程。渲染层调用 `openQishuiMusicLogin()` 后只获取脱敏状态，入口不再跳网易。首页保留 Mac 全部既有入口，同时新增复用现有数据的“每日内容”与“接下来播放”。专项和 `npm run check` **205/205** 通过；Electron 以独立 userData 启动无错误。必须由用户在 macOS 汽水音乐客户端先登录，再人工确认读取、本源搜索、歌单和播放；不要提交 Cookie/Token。更新 PR 时仍以远端 PR #58 head 为 parent、GitHub Git API `force:false`，不使用 `git push`。
- **2026-08-01 Windows v2.1.0 功能对齐（第二批，本地曲库持久化 + 首页交互）**：新增主进程 `desktop/local-music-library.js`（Windows v2.1.0 原版适配 macOS；`music-metadata@7.14.0` 解析内嵌封面/歌词，支持 `.lrc` 侧车，`mineradio-local://` 特权协议按 Range 流式播放，索引/封面持久化在 userData 下），`main.js` 完成 `registerLocalMusicScheme` + IPC（list/lyric/authorize/import）+ `installProtocol` 接线，`preload.js` 暴露 `listLocalMusicLibrary/readLocalMusicLyric/importLocalMusicFiles`（webUtils 取真实路径，主进程 `realpath` 校验，3 分钟一次性 capability）。渲染层：拖拽/选择/整文件夹导入自动走持久化索引并进队播放，失败回退原对象 URL 路径；`00-core-stores.js` 增加 `persistentLocalLibraryTracks`；启动时 `restorePersistedLocalLibrary()` 与登录态并行，命中本地断点后恢复真实 localUrl 队列与断点（`restoreLastPlaybackSnapshot` 同步路径保留）；本地播放按需 `readLocalMusicLyric` 读内嵌/侧车歌词走既有歌词管线；封面加载与 `coverProxySrc` 支持 `mineradio-local://`。首页新增“每日热评”卡片（每日一条/可换一条/localStorage 自定义热评）与生成封面回退（无封面卡片生成品牌渐变 SVG），不迁移 Windows MP4 视频 Hero（Mac 功耗）。QQ/酷狗字段：`qqMembershipNeedsSync` 区分播放授权未完成与权益待同步，酷狗归一化兼容 `playbackReady`。`npm run check` **209/209** 通过，Electron 独立 userData 启动冒烟通过。待用户人工验收：拖入真实 mp3/flac（含内嵌封面与 LRC 侧车）验证索引、封面、断点恢复与内嵌歌词；本地曲库浏览/管理面板见第三批。
- **2026-08-01 Windows v2.1.0 功能对齐（第三批，本地曲库浏览/管理面板）**：新增 `public/js/modules/06-lyrics/07-local-library-panel.js` 与 `#local-library-modal` 弹窗——首页快捷区新增“本地曲库”chip、导入面板新增“本地曲库”入口；弹窗支持浏览、搜索（标题/歌手/专辑）、逐首播放、全部播放、从曲库移除（只删索引与封面缓存，不删源文件；正在播放被移除曲目自动切下一首）；主进程新增 `mineradio-local-library-remove` IPC，preload 暴露 `removeLocalMusicLibraryTracks`；导入成功后若面板打开会自动刷新列表。`npm run check` **210/210** 通过，Electron 独立 userData 启动冒烟通过。
- **2026-08-01 Windows v2.1.0 功能对齐（第四批，窗口恢复 + 歌词磁盘缓存）**：主进程补上 `desktop-window-restore` handler（preload 一直有调用、主进程缺 handler，最小化/隐藏窗口此前无法 restore）；新增歌词磁盘缓存 `mineradio-cache-read-lyric` / `write-lyric`（`userData/cache/lyrics`，单条 ≤1MB、总量 ≤96MB、写后淘汰最旧），preload 暴露 `readLyricCache/writeLyricCache`，渲染层 `fetchLyric` 先读缓存、未命中再走网络并回写；不迁移 Windows 的 Chromium 缓存目录搬迁与 `mineradio-cache-set-settings`（会动 sessionData，可能把 macOS 登录态/会话搞掉，违反“不影响 Mac 使用”约束）。专项 6/6、`npm run check` **211/211** 通过，Electron 独立 userData 启动冒烟通过。
- **2026-08-01 Windows v2.1.0 功能对齐（第五批，首页洞察 dock + 平台推荐中心）**：右侧 rail 保留「为你准备」tile 行的同时，新增洞察 dock——今日聆听（时长/曲数/常听歌手/连续天数）、接下来播放（优先队列下一首）、为你挑选（每日推荐/歌单/队列/本地去重选 3 首）、音乐发现与平台推荐入口；平台推荐弹窗五平台标签页只读可信推荐数据，未登录明确留空不补搜索。服务端新增 `/api/kugou/recommendations`（复用 `handleKugouGuessLike`）与 `/api/spotify/recommendations`（移植 `handleSpotifyRecommendations`：`user-top-read`→常听、`user-library-read`→喜欢，均无则 `mode:'unavailable'`）。新模块 `03a-home-dashboard-insight.js` 在既有 `renderHomeDiscover` 后挂钩渲染，不替换 Mac 首页；不迁移 Windows MP4 视频 Hero 与 quick-grid（Mac 功耗/布局约束）。新增 `scripts/test-home-dashboard-dock.js`（5 项）纳入 check；专项 5/5、`npm run check` **216/216**、Electron 本地服务冒烟（首页/模块 200、两推荐接口未登录预期返回）均通过。待人工验收：登录任一平台后在首页查看今日聆听/为你挑选/平台推荐弹窗实际数据；本批按新规另开新 PR 线，不在 PR #58/#59 追加。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记：工坊白屏修复 + FX 控制台 + 界面配色 + 缓存设置只读版）**：① 修复预设 13 白屏——macOS WebGL canvas 透明合成把 iframe 盖住（上游 Windows 无此问题），CSS 在 `body.sonic-workshop-active` 时隐藏 `#canvas-container`；另加 React 未就绪 9 秒超时自动 toast 提示并回退上一预设。② FX 控制台：`07-fx/09-console-workspace.js`（上游 1072 行原样）+ fx-console 完整 CSS 415 行 + `organizeFxPanel` 加优先分支 + `initFxConsoleSearchAndHistory` 接线（07-bindings）——设置面板重排为 6 分类 tab + 搜索框（别名搜索）+ 撤销/最近操作历史（40 条、滑条合并、可回退）；Mac 依赖（setFxPanelTab/applyFxArchiveSnapshot/configureMemoryReductFromFx/colorLabState）均已存在。③ 界面配色：index.html 加「自定义颜色」5 个 color row（ui-accent/visual-tint/home-accent/home-icon/visual-icon）+ visual-tint-row，Mac 死壳函数（reset*/update*Controls）随 UI 注入激活；翻译字号确认 Mac 已有（fx-lyrictranslationscale 等）。④ 缓存设置（Mac 只读版）：`07-fx/08-cache-storage-settings.js` 去掉 Chromium 目录搬迁（chooseCacheDirectory/setCacheSettings/restartApp 全删），主进程新增 `mineradio-cache-get-usage`/`mineradio-cache-clear-lyrics` IPC，preload 暴露 getCacheUsage/clearLyricCache，面板只读歌词缓存占用 + 手动清理。⑤ 登录彩蛋按用户决定跳过（上游解锁前清空全部登录凭据，与 Mac 登录态硬约束冲突）。新增测试第 7 项（FX/缓存/配色断言），`npm run check` **223/223** 通过。待人工验收：fx 面板新 tab/搜索/撤销、界面配色生效、缓存面板占用与清理、工坊预设 13 不再白屏。
- **2026-08-01 壁纸库接入（macOS，跨机读取 Win 电脑 WE 壁纸库，第七批）**：用户需求「Mac 没有 WE 壁纸库，想通过另一台 Win 电脑利用 Win 版 Mineradio + WE 库传输壁纸到 Mac」。实现两条通道：① **目录扫描**——主进程迁移上游 `desktop/wallpaper-engine-library.js`（901 行，纯 Node 跨平台；仅 `windowsSteamRegistryRoots` 为 win32 专属且 `process.platform !== 'win32'` 返回空数组，Mac 安全），支持手动指定目录（SMB 挂载 `/Volumes/...` 或拷贝的 WE 库目录）；② **HTTP 壁纸源**——新增 `tools/wallpaper-share-server.js`（Win 端可选共享脚本，Node 启动，默认 8123 端口，`/api/wallpapers` 列表 + `/api/wallpaper-file` 文件流，只读安全路径校验，CORS 开放），Mac 端 `desktop/wallpaper-library-bridge.js` 封装（scanDirectory/scanHttpSource/list/getMediaFile），main.js 加 4 个 IPC + preload 4 个 API。渲染层 `07-fx/10-wallpaper-library-panel.js`：首页快捷区「壁纸库」入口 + 弹窗（扫描目录/连接源/列表/图片视频预览）。**图片/视频壁纸 Mac 直接播放；Scene 场景壁纸（PKGV .pkg）需 WE 软件实时引擎，Mac 不可播，标注「需 WE 软件」**（上游渲染层依赖 DWM 捕获等 Windows 专属 API，不迁移）。测试 `scripts/test-wallpaper-library.js` 2 项纳入 check；`npm run check` **228/228**；共享脚本用假壁纸库实测（列表返回、图片流 200 image/jpeg、scene 标注）通过。待人工验收：真实 Win 电脑 SMB 挂载或 HTTP 源下浏览/播放图片/视频壁纸；本批另开新 PR 线。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 7：首页洞察 dock 卡片重叠修复）**：用户反馈首页排版「很多都显示不了」（附截图：右列洞察 dock 的「接下来播放/为你挑选/每日热评换一条」相互挤叠）。根因：`.home-insight-dock` 是 2 列 grid（`grid-template-columns: 1.12fr .88fr`）但 5 个直接子卡片（listen/next/discovery/ranking/radio）**无显式 grid-column/grid-row**，CSS Grid 自动布局按 DOM 顺序排多行，窗口较小时行高不足卡片相互重叠；且 `.home-grid`/`.home-rail` 在 `.empty-home-shell`（2 列 grid，3 个子元素）里无显式列定位。修复：dock 子元素显式分配（listen(1,1)/next(2,1)/discovery(1,2)/ranking:not(.radio)(2,2)/radio 整行(1/-1,3)）+ `align-items:start` + `grid-template-rows:auto auto auto`；`.home-grid`/`.home-rail` 补 `grid-column:2`。无头 Chrome 实测 600/700/800px 窗口 dock 5 卡片零重叠（`overlaps=无`）。测试加 5 处断言，`npm run check` **223/223**。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 6：首页布局重叠修复 + listen-stats v2 本地聚合）**：① 首页小窗口重叠——用户反馈「正常不放大全屏时左边每日推荐评论和歌会重叠，放大排列才正常」。根因：`.home-recent-inner`（flex column）固定内容（kicker/title/stats/brief/next-up/daily-review/quick-row）不收缩，窗口高度不足时列表 flex:1 收缩到 0，热评溢出被 `.home-hero` 的 overflow:hidden 裁剪 → 视觉重叠。修复：固定区块加 `flex-shrink:1;min-height:0`、列表 `flex:1 1 auto;min-height:48px`、`min-height:100%`→`min-height:0;height:100%`；媒体查询 ≤760px 隐藏 stats/brief/next-up、压缩 title/热评，≤640px 隐藏时间。无头 Chrome 700px 窗口实测 review_bottom=303 < list_top=313 overlap=false。② listen-stats v2——上游 v2 是「本地每日 rollup + 服务端 /api/listen/report 上报」；Mac 只迁**本地 rollup**（HOME_LISTEN_ROLLUP_V2_KEY 按天聚合 totalListenMs/sessions/daily/completed），finalizeListenSession 写入；服务端上报不迁移（上游标注 experimental-unverified，涉及把收听数据提交平台，Mac 不做）。测试加 4 处断言，`npm run check` **223/223**。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 5：review 三个 bug 修复）**：① `setFxPanelTab` 旧分页 fallback 白屏——原实现固定用新 key 集合 + legacyToNew 单向映射，若 09 模块未加载走旧分页时页面 key（presets/appearance/...）匹配不到 `fxPanelTab='home'` 初始值 → 面板空白。修复：按 `data-console-layout` 动态选择 key 集合（FX 布局 newAllowed，旧分页 legacyAllowed）+ `newToLegacy` 反向映射；同步修 `16-voxel-echo.js` 的 `fxPanelTab==='playlist'` 检查（FX 布局下是 'shelf'）。② 音源切换竞态——`switchCurrentSongSource` await `findControlSourceMatchResult` 期间用户切歌（currentIdx 改变）会把匹配结果写到新歌索引、覆盖用户选择。修复：await 后 `stillSameSong` 歌曲引用比对（currentControlSong()===song 或 playQueue[currentIdx]===song），不符则中止；catch 分支同样保护；同时去掉「未找到可切换音源」+「该平台无正版音源」双提示（只留一个）。③ 工坊降级循环——超时降级 `setPreset(prev,{noSave:true})` 不持久化，fx.preset 变了但存储仍是 13，下次启动回到工坊白等 9 秒再降级。修复：改用正常持久化（去 noSave）+ `state.degraded` 防重复 + removeLayer 重置 degraded 允许重试。测试加三处断言，`npm run check` **223/223**。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 4：FX 控制台搜索栏无响应修复）**：用户反馈「设置的搜索栏用不了」。根因：`initFxConsoleSearchAndHistory`（绑定搜索 input/focus/keydown + 撤销 + 历史事件）上一轮被误加到 `resetFx` 函数尾部——那是「恢复默认」才走的路径，**启动入口 `bindFxPanel` 没有调用**，导致应用启动后搜索框无事件绑定、输入无搜索结果（tab 正常因为 organize 在 bindFxPanel 第 3 行）。修复：按上游在 `bindFxPanel` 尾部（updateFxInputs 后）补 `initFxConsoleSearchAndHistory()`，保留 resetFx 里的调用（幂等保护 `_fxConsoleSearchHistoryBound` 保证只绑定一次，resetFx 再调直接 return 无副作用）。验证：无头 Chrome 最小页面实测 organize+init+搜索链路（registry=3、输入「粒子」弹层显示、命中逻辑正常）；测试断言 bindFxPanel 块内必须含 init；`npm run check` **223/223**。待人工验收：打开视觉控制台搜索框输入「粒子」应出「粒子尺寸」。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 3：播放标题音源切换补全）**：用户反馈「win 能看到播放的音源并可切换，mac 没有」。根因：Mac 的 `07-search.js` 切换逻辑（`toggleControlSourceSwitcher`/`switchCurrentSongSource`/`songSourceTagHtml`/`renderControlSourceSwitcher` 等）与 CSS（`control-source-chip`/`control-source-switcher`/`control-title-badges` 共 22 处）**早已存在但全是死代码**——缺的是 `15-ripples-cover-depth.js` 的 `updateControlTrackInfo` 挂载点（上游会在播放标题里动态创建 `control-title-badges` 并插入 `songSourceTagHtml(song, {switcher:true})` 音源 chip + `songVipTagHtml` VIP 标签）。修复：按上游补齐 `updateControlTrackInfo`（保留 Mac 特有的 `syncTouchBarTrack`）。验证：8 个依赖函数（normalizePlaybackProvider/cloneSong/hydrateCustomCover/safeRenderQueuePanel/currentResumeSeconds/showSourceFallbackNotice/findControlSourceMatchResult/renderControlSourceSwitcher）全部存在；新增测试断言，`npm run check` **223/223**。待人工验收：播放任意歌曲看标题旁 NE/QQ/KG/SP 音源标签，点开切换面板换到另一平台（需登录对应平台）。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 2：FX 控制台 tab 空白修复）**：用户反馈「常用/界面/歌单」tab 空白。根因一：Mac `setFxPanelTab` 只认旧 key（presets/appearance/lyrics/motion/advanced/playlist），FX 控制台用新 key（home/interface/lyrics/motion/shelf/system）→ 匹配不上 → 所有 page 隐藏 → 空白。修复：换成上游版（新 key + `fxPanelTabScroll` 滚动记忆 + aria/tabindex），加 `legacyToNew` 映射（presets→home/appearance→interface/advanced→system/playlist→shelf）兼容 Mac 旧分页。根因二：`FX_CONSOLE_LAYOUT` 引用的 24 个控件 id 在 Mac index.html 不存在（上游 layout 写给 Windows，Mac 控件 id 不同或没有）→ `fxConsoleAppendItem` 找不到元素 → 对应 tab 组空。修复：全部对齐 Mac 实际结构——背景媒体改用 `background-image-input`/`bg-album-toggle-btn`/`bg-media-crop-btn`/`fx-windowbgopacity`/`fx-bgglassopacity`，性能改用 `performance-mode-seg`/`max-fps-seg`，歌单架改用 `shelf-toggle-btn`，桌面歌词改用 Mac 底栏入口 `lyrics-toggle-btn`（Mac 无独立桌面歌词控件区），移除 Mac 没有的项（译文字号/透明度、歌词清晰度 seg、t-lyricVerticalFloat/t-lyricPauseHold、t-backgroundStarRiver、Wallpaper Engine 项）。修复后 layout 全部 168 个控件引用 + 3 个选择器引用（.fx-actions/.lyric-glow-effect-row/.memory-action-row）均可在 index.html 定位，测试加「layout 引用零缺失」断言，`npm run check` **223/223**。注：无头 Chrome 验证 organize 时因无头环境 WebGL 失败中断渲染链看不到 FX page，Electron 真实环境（有 preload）不受影响；`09-console-workspace.js` 用 vm 沙箱验证顶层加载/导出正常。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批，声波监视器 + 音域地形 + 音域回响·WE，本批）**：从上游迁移「声波系列」三件套——① 声波监视器 `03-beat/06-sonic-audio-monitor.js`（736 行原样）：512 频段实时频谱、8 频段划分、kick 自动跟踪（6 窗 auto-track）、触发阈值/力度检测、可选频谱面板 canvas；主循环播放中 `stepSonicAudioMonitor(frequencyData, ...)` 喂数据、暂停 `stepSonicAudioMonitor(null, ...)` 衰减，快照供预设与相机消费（Mac 既有 `readSonicRealtimeCameraSample` 死壳自动激活）。② 预设 12「音域回响·Sonic-Topography」`sonic-topography-preset.js`（上游 INDEX 7→12）：InstancedMesh 地形 + 浮空方块 + 流星拖尾 + 涟漪，8 频段 EQ 映射 shader。③ 预设 13「音域回响·Wallpaper Engine」`sonic-workshop-preset.js`（上游 INDEX 8→13）：iframe 桥接 `vendor/sonic-workshop/mineradio-bridge.html`（React 构建 1.26MB JS，跳过 preview.gif 914KB），音频/媒体/主题属性节流推送。索引避开 Mac 7=黑洞/8=极光/10=体素音域回响/11=云瀑共振；`00-core-stores.js` 定义 `SONIC_PRESET_INDEX=12`、`SONIC_WORKSHOP_PRESET_INDEX=13`、`MAX_VISUAL_PRESET_INDEX=13`。接线：fx-defaults 51 个 sonic 默认值、持久化 51 字段、presetMeta/图标/displayOrder、setPreset onPresetChange+相机基线 12/13、05-fx-panel-performance 面板控件+`updateSonicSeriesControlVisibility`（非对应预设自动隐藏 sonic 控件，`SONIC_ORIGINAL/WORKSHOP_FX_CONTROL_IDS` 对照上游）、主循环 hidePoints/背景暗度 0.82/星河 alpha、index.html「音域地形/音域频谱/音域颜色/音域方块/音域回响·WE」UI 段、CSS sonic 样式。Mac 既有 sonic 死壳（02-accent-background-controls 颜色控件、palette sonicWorkshopColors、14-stage SONIC_PRESET_INDEX 引用）随常量与 UI 注入自动生效，无需重复迁移。新增 `scripts/test-sonic-series-migration.js` 6 项纳入 check；专项 6/6、`npm run check` **222/222** 通过；Electron 本地服务冒烟（index/两预设/监视器/vendor 资源全部 200）。待人工验收：预设 12/13 真实歌曲下地形律动与工坊 iframe 渲染、频谱面板、主题切换与封面取色；本批按新规另开新 PR 线，不追加 PR #58/#59/#60。
- **当前 Codex 任务链**：PR #27（显卡模式与快速启动）→ PR #29（Mac 真实显卡占用）→ PR #30（主循环真正休眠）→ PR #31（唱歌模式省电）→ PR #32（Mac 安全内存释放）→ PR #33（伴奏/人声双滑块）→ PR #34（最近播放滚动降载与 GPU 文案）→ PR #36（播放定时器降载）→ PR #37（本地 AI 分轨）→ PR #38（AI 提速与实时精准度）→ PR #39（软件 Logo）→ PR #40（歌词选项切换降卡）→ PR #41（音频上游断线保护）→ PR #42（整队不可播保护）→ PR #43（本机崩溃记录）→ PR #44（构建缓存排除）→ PR #45（双架构 CI 运行器）→ PR #46（Touch Bar 歌曲状态）→ PR #47（K 歌升降 Key 与启动开关对齐）→ PR #48（GPU 系统/播放器占用）→ PR #49（AI 分轨热管理与实时去人声增强）→ PR #50（实时人声轨净化）→ PR #51（CoreML 全图加速）→ PR #52（切歌与进度竞态修复）均为叠加关系。
- **协作者最新工作**：PR #28，分支 `codex/fix-gesture-latency`，优化双手手势延迟与 GPU 负载；当前仍待合并，本分支未修改其手势文件。
- **2.0 公开候选**：从 PR #56 线单独创建 `codex/public-release-2.0`。公开分支删除汽水后端、登录桥、本地 Cookie 读取和音频解密器；原 PR #56 开发线保留汽水实验，后续继续在原线开发。2026-07-24 已修复首批候选中网易/QQ/酷狗官方登录被手动导入策略误拦截的回归，以及连续切换音质导致的 `0:00` 卡死、通知堆叠和巨型歌词残影：官方会话由主进程直接验证并加密保存，音质改为同曲串行换流，不重建歌词。最终 2.0.0 arm64/x64 未签名 DMG 已重新打包、挂载和安装验证，正式公开仍受 Developer ID、公证、隐私联系信息与音乐平台授权阻塞。
- **基线**：从 `Mineradio-1.1.3-arm64.dmg`（内部测试版）提取的源码。另有 `v1.1.0` 分支存正式版参考基线。
- **构建已验证**：`npm install` + `npm run build:mac` 本地跑通，产出 134MB dmg。Electron 42.4.1 + electron-builder ^26。
- **网络注意**：本环境 `github.com` 连接不稳定（git push 超时），但 `api.github.com`（gh CLI）正常。**用 gh API 推送代码，不要用 git push**。
- **本轮优化**：预设 11「云瀑共振」已按 Rainform 官网比例重做。模块现在使用 2000 条基础雨链、800 条环境雨链、1400 条暴雨雨链和 1900 条 `InstancedMesh` 细丝；25 点音乐曲线先烘焙为 256 点 `rainformCurveLut`，驱动雨幕高度、强度、水平水面、雾带及顶部雨幕包络，强度归零时整层硬抑制。珍珠 shader 加入多频 procedural liquid metal、镜面反射、Fresnel 和高光参数；不创建第二个 Canvas 或动画循环，不修改预设 9 的玻璃水珠逻辑。专项测试 9/9，Three r128 runtime smoke 通过，`npm run check` **185/185**。
- **2026-07-31 汽水内部实验恢复**：用户明确要求在 PR #58 分支恢复 macOS 可用链路。已从历史私有线恢复 `qishui-api.js` 与 `qishui-audio-decryptor/`，`/api/qishui/*` 已接回当前本地服务；`#auth` 音频只在服务端解密，96MB 有界缓存，渲染层不接触解密材料。Cookie 与 access-token 均使用 macOS `safeStorage` 加密保存，QS 搜索和手动授权入口重新显示；无登录、非法 Cookie 和不可播 URL 均有明确失败结果，继续使用既有换源回退。专项 `scripts/test-qishui-mac-integration.js` 4/4、`npm run check` 待本轮最终运行；真实汽水账号/受保护音频必须由用户手测。此能力不应回流到 `main`，也不得以自动更新或 Windows API 实现。
- **2026-07-31 汽水入口误跳网易修复**：根因是渲染层没有读取主进程的 `qishuiEnabled`，并在策略关闭/缺失时把 `qishui` 静默规范化为 `netease` 或全音源。preload 现显式传递该开关；账户、登录和搜索入口不再改选其他音源，汽水不可用时仅提示。专项 5/5、`npm run check` 195/195 通过。用户需完全退出并重新运行 Electron 后，在真实账号下确认 QS 仍保持选中且可搜索播放。
- **2026-07-31 雨境随机打雷**：预设 9 的动态面板新增默认关闭、独立持久化的“随机打雷”开关。开启后在暂停或无音乐节拍时也会在首次 4-10 秒、后续 6-20 秒随机触发；62% 为单闪，38% 为 2-3 次短促连续闪。效果复用主 Three.js 场景中的一条动态分叉 `LineSegments`、既有闪白层、雨丝和湿玻璃封面 `uFlash`，不新增 Canvas、动画循环、定时器或音频。关闭立即清空待触发队列并隐藏闪电折线。专项 7/7、`npm run check` 197/197 通过；Electron 启动 5 秒无错误。待用户在真实歌曲/暂停状态下目测频率和亮度。
- **2026-07-31 雨境打雷三选一与频率**：用户反馈“随机打雷”仍会随节奏，根因是旧实现同时保留音乐雷与随机雷。现改为“关闭打雷 / 跟随音乐 / 随机打雷”互斥模式：关闭即时清空闪白、折线和待触发队列；音乐模式只读原“打雷阈值”；随机模式完全跳过音频/节拍判断，只读 `4–40` 秒的“随机频率”滑条（默认 15 秒，70%–130% 随机扰动）。升级前 `randomThunder: true` 自动迁移到随机模式。专项 8/8、`npm run check` 198/198 通过；Electron 启动 5 秒无错误。待人工依次验收三种模式与随机频率的主观节奏。
- **2026-07-31 汽水彻底防回退 + Windows 搜索历史迁移**：汽水仍误跳网易云的根因另有三处：顶部账户入口优先首个已登录平台、汽水网页登录缺失分支、汽水搜索 URL 未映射到 `/api/qishui/search`。现分别固定为当前汽水优先、汽水公共搜索/本地授权入口和汽水本地 API，三处都不调用网易云；`scripts/test-qishui-mac-integration.js` 6/6 通过。另从 Windows 2.0.3 迁移跨音源搜索历史，所有音乐源标签可复用同一份历史，播客热门页逻辑不改；新增 `scripts/test-search-history-cross-provider.js` 并纳入总检查。`npm run check` 200/200 通过。待用户完全退出后真实测试汽水登录、搜索和播放；不得提交 Cookie 或 Token。
- **2026-07-31 汽水 PC 扫码登录补全**：根因是 `qishui-api.js` 已有 `createQishuiPcQrLogin()` / `checkQishuiPcQrLogin()`，但 `server.js` 未暴露二维码路由、前端又把桥接能力写死为 `false`，所以“登录”只能切换匹配搜索。现新增仅本地的 `/api/qishui/login/qr/create` 与 `/api/qishui/login/qr/check`：二维码 token 与轮询 Cookie 只短时保留在服务端，成功时 `saveQishuiCookie(result.cookie)` 直接写入 macOS `safeStorage`，HTTP 响应和 preload 都不返回凭据；汽水会话即使在内部实验构建也强制 Keychain 加密。前端展示二维码、每 2 秒轮询，成功只刷新汽水状态/歌单，不调用网易入口。专项 7/7、`npm run check` 201/201 通过；本机真实接口创建二维码 `200`、未扫码轮询 `waiting`，两种响应均无 Cookie/token。待用户使用真实汽水 App 扫码并验证歌单、受保护歌曲、暂停/拖动/切歌；不要提交凭据。此实验仅留在 PR #58，不能回流 `main` 或公开版。
- **2026-07-31 Windows Cuefield 智能混音 Lite 迁移**：只接入已有 macOS Web Audio 交叉淡入，不搬运 Windows 的双音轨执行器、自动下载或 Dashboard 重构。控制栏新增默认关闭、可持久化的“智能混音”开关；开启后仅当当前/下一首普通歌曲均命中已有节拍缓存且 BPM、能量接近时，把用户设定的交叉淡入缩至 85%。无缓存、分析不可信、播客、本地歌曲、随机播放与内存紧张全部保留原路径，歌词、AI 分轨、音源回退和内存保护未改。新增 `scripts/test-cuefield-automix-lite.js`，`npm run check` 206/206 通过；待用户用两首已分析歌曲确认实际交接听感。

**2026-07-29：云瀑共振改为 Rainform 授权派生的分层音乐雨景。**

- 分支：`codex/mineradio-2.0-unified`，继续使用预设索引 11，不修改雨境预设 9 的玻璃水珠逻辑。
- 视觉：替换原先单一的点云为基础/环境/暴雨三层雨链、珍珠雨滴、暴雨瀑布、撞击水花和涟漪；雨滴 shader 加入球面法线、镜面高光、菲涅尔和反射波。
- 音乐：新增 25 点雨量曲线，将 bass/mid/treble/beatPulse 沿横向分布；保留强度、旋律起伏、拍点爆发三个控件和独立持久化。
- 归属：采用用户声明已取得的 Rainform 二创授权；源码保留 Required Notice、`afterimage-lab/Rainform` 来源标识、PolyForm Noncommercial 许可说明。没有接入 Rainform 天气 API 或独立运行时。
- 验证：专项测试 5/5；`npm run check` 181/181；`node --check` 和 `git diff --check` 通过。待用户用真实歌曲确认视觉层次和音乐同步。

**2026-07-29：云瀑共振按官网视觉比例重做。**

- 生产模块：`public/js/modules/02-visual/20-rainfall-resonance.js` 不再用旧的 430 条上限，恢复官网分层数量：基础 2000、环境 800、暴雨 1400、细丝 1900。
- 视觉：珍珠材质采用多频液态金属 band、镜面/Fresnel 高光；细丝使用共享 `InstancedBufferGeometry` + `InstancedMesh`；新增底部水线和雾带，移除该预设自己的背景板，继续透出 Mineradio 场景背景。
- 数据：25 点音乐曲线通过 `rainformCurveLut` 烘焙到 256 点采样，`rainformRainfallResponse` 和 `rainformDataDrivenCeiling` 控制横向雨势峰值、可见高度和低雨量收缩；`RAINFORM_ZERO_RAIN_SUPPRESSION` 负责强度归零时关闭所有雨层。
- 验证：`node --check public/js/modules/02-visual/20-rainfall-resonance.js`；专项测试 7/7；Three r128 runtime smoke 通过；`npm run check` 183/183；Electron 已启动，本地页面 `http://localhost:3000/` 可返回。

**2026-07-29：云瀑共振补齐水平水面、顶部雨峰与旋律联动。**

- 水面：`createRainformWaterSurface()` 的网格旋转为水平面，`uRainLut` 和 `uMelodyPhase` 让横向雨量曲线驱动水面起伏、反射和雾带，不再显示为画面底部的竖直发光面板。
- 雨峰：新增 256 段 `topRain` 雨幕包络，以 `rainformDataDrivenCeiling()` 与旋律相位实时形成顶部高低峰；歌曲的中频旋律会同时推动顶部雨势、水波及雾带。
- 资源：曲线 LUT 在每帧更新后上传到共享纹理，切出预设时连同顶部雨幕、水面/雾带的几何与材质一并释放。
- 验证：新增两项回归契约；专项测试 9/9、Three r128 runtime smoke、`node --check` 与 `npm run check` **185/185** 通过。
- 待人工验收：启动 Electron，选择预设 11 并播放旋律起伏明显的歌曲，确认水面是水平透视面、顶部峰线横向移动且三项控制滑块即时生效。

## 最终整合（agents/final-integration，2026-07-14）

- **分支**：`agents/final-integration`（共享任务分支，从 PR #52 `codex/async-playback-race-fixes` 创建）。
- **本轮目标**：把 PR #28（`codex/fix-gesture-latency`，双手手势 GPU Worker 管线）整合进 PR #52 基线。#52 基线未改手势文件，`00-gesture-control.js` 干净合入；仅 `CHANGELOG.md` 冲突已并（手势条目置顶）。PR #35（协作 Skill）不属于播放器，未混入。
- **PR #28 审查结论（发热/卡顿）**：是**净改善**，不是增负担。旧 Swift/Vision 原生路径开启后 GPU 进程 49.8%→97.2%、延迟约 80–170ms；新 Worker 路径 GPU 仅 +5.1pp、端到端约 19.4ms / 26.5 次每秒；摄像头 640×480@60 → 320×240@30，保留双手。协议核对：`gesture-worker.js` 的 init/frame/stop 与 `gesture-control.js` 的发送/回调完全对得上；失败依次回退 Vision/ANE → 主线程 MediaPipe。
- **自动检查**：`npm run check` 本地通过（21 个测试文件、**122 项全过**）。关键功能存在性核对：失焦降帧、空闲真休眠（PR #30 的 500ms / 2FPS）、Mac 内存面板+purge、Touch Bar、崩溃恢复+记录、WebGL 黑屏恢复、purge 防爆音、GPU/CPU 占用显示、AI 分轨、唱歌模式——全部在。
- **未本地验证**：Electron 假媒体启动 + 未签名 arm64 打包（本地未装 electron/electron-builder；仓库主人机器为无风扇 M4，避免重载，**交由本 PR 的 CI arm64/x64 构建验证**）；真实手部跟踪体验需用户正常重开应用确认（#28 备注：该机反复强停摄像头后暂时不返首帧）。
- **旧 PR**：未关闭任何旧 PR，等最终 PR 审查通过后统一处理。
- **Obsidian**：接手环境访问不到仓库主人电脑上的 Obsidian（`/Users/chy/...`），**待仓库主人侧同步**。

## 用户偏好（重要）

- 默认中文沟通，语气直接、偏实干。**希望主动完成任务，不要只给方案**。
- 视觉方向：黑、玻璃、舞台、音乐可视化。讨厌"默认白框""太素"。
- **私密开发**：源码不能开源。
- **不要自动更新功能**（Mac 版从 Windows 迁移，不需要 electron-updater）。
- Obsidian 笔记库在 `/Users/chy/菜鸡的仓库/菜鸡的仓库`，Mac 开发进度在 `02 知识编译/Mineradio Mac 开发进度.md`。

## 已完成的工作（按时间）

### 优化类
1. **telemetry opt-in**（97c8ac3f）：正式版不上报，测试版首启询问
2. **Mac 跳过 Windows 内存死代码 + 补漏 qishui-api.js**（32b163c4）
3. **移除自动更新**（7c0254b1）：删 build.publish，build:mac 删 latest-mac.yml
4. **图标瘦身**（#9）：icns 851KB→568KB 无损，视觉不变
5. **DMG 视觉确认 + .omc 排除**（#9、PR #44）：electron-builder 自动生成背景图和卷图标；Git 与 App 打包都全局排除 `.omc` 工具缓存。

### 发烫优化（用户反馈"1.1.0 不烫、1.1.3 烫"）
6. **失焦降帧恢复**（#12）：1.1.3 把 `isVisibleBackgroundMode()` 写死 `return false`，导致切走仍满帧。已恢复 1.1.0 逻辑——失焦降到 15FPS。
7. **空闲降频**（#12→#17→#19）：前台不播放+无交互+加载完时，整个主循环降到 2FPS。**注意**：加载/换源期间必须保持渲染（`playToggleBusy` 判断），否则 GPU 上下文频繁停-启导致黑屏（PR #19 修复了这个）。
8. **用户可选显卡模式 + 首页后台暂停**（`codex/gpu-mode-fast-splash`）：新增自动/省电/高性能；前台保留首页悬浮动画，失焦、隐藏或最小化时暂停。
9. **主循环真正休眠 + idle guide 停止空转**（`codex/true-idle-sleep`）：前台空闲改用 500ms 定时器，实测主循环从约 112 次/秒降到约 2 次/秒；交互约 4.9ms 唤醒；禁用且无提示时 idle guide 为 0 次循环，首页悬浮动画保持原样。
10. **唱歌模式按需计算 + 麦克风省电**（`codex/singing-mode-power-save`）：原唱 100% 直连并停止去人声 FFT；暂停、无歌、结束、错误和深后台释放麦克风，恢复自动重开；快速状态切换和跨 AudioContext 竞态已加保护。
11. **Mac 安全定时内存释放**（`codex/mac-memory-safe-auto`）：两个 Mac 开关真正可用；播放中不暂停、不静音、不调用系统 `purge`，只在后台做播放器软清理并延期系统释放；暂停后进入后台再补做；管理员开关关闭时绝不弹密码框。
12. **伴奏/人声双滑块**（`codex/vocal-accompaniment-mixer`）：同一次频谱分析拆出伴奏与人声估计，两者可独立调节；双 100% 原声直通；中置抑制曲线从 `ratio^1.4` 加强为 `ratio^2.2`，不增加第二个 Worklet。
13. **最近播放滚动降载**（`codex/recent-scroll-gpu-label`）：滚动期间暂时把背后 3D 场景限制到不高于 30 FPS，停止约 240ms 后恢复；列表独立合成并停用滚动中的重阴影，保留首页玻璃和无限悬浮动画；负载监视器文案统一为“GPU”。
14. **播放定时器按状态休眠**（`codex/playback-timer-idle`）：进度更新只在当前歌曲播放时运行；无缝连播在歌曲中段每秒检查一次，只在最后 9 秒恢复 70ms 精细检查，暂停后回到低频。
15. **AI 分轨提速 + 实时精准度**（PR #38）：Apple Silicon 充足内存使用 batch 2 并直接写 FLAC，90 秒分轨提速约 36.1%；实时人声轨鼓点泄漏降低约 52.8%，仍只运行一套 FFT。
16. **软件 Logo 替换**（PR #39）：用户提供的 1024×1024 MR 原图同步替换 PNG 与 Mac ICNS，Dock、访达、窗口和壁纸模式使用同一套新图标。
17. **歌词选项切换降卡**（PR #40）：行数和翻译改用合并后的轻量轨道刷新，动画原地更新参数；按钮处理从约 50-83ms 降到约 1-2ms。
18. **AI 分轨热管理 + 实时去人声增强**（PR #49）：电池/温度异常自动 batch 1，插电温度正常的高内存 Apple Silicon 使用 batch 2；AI 最多 6 条 CPU 线程并降低进程优先级；实时伴奏轨人声残留测试从 43.6% 降到约 13%，同时保留约 52% 中置鼓点能量与 68% 冲击峰值。
19. **实时人声轨净化**（PR #50）：增加帧级人声置信度并只重建中置信号；人声轨鼓点残留约 9.88%、立体声乐器残留约 15.82%，同频侧声道乐器不再漏回；低沉男声与女声齿音均有专项保护测试。
20. **AI 分轨 CoreML 全图加速**（PR #51）：Apple Silicon 使用 MLProgram，让 UVR HQ3 的 178/178 个算子进入 CoreML；4 分 40.58 秒歌曲第二次从 171.13 秒降到 37.34 秒，约提速 4.58 倍；失败自动回退默认 CoreML / CPU。

### 新功能
- **Mac 内存面板**（#12）：`desktop/system-memory-mac.js`（vm_stat + purge，模仿腾讯柠檬），显示真实内存数据。
- **Touch Bar**（#14、PR #46）：老款 Intel MBP 播放控制；歌曲名、歌手和播放状态现在从渲染进程实时同步。
- **x64 打包**（#13）：`build:mac:arm64` / `:x64` / `:all`，CI matrix 双架构。
- **倍速 + 唱歌模式 + 歌架交互**（#26）：可调原唱、频谱去人声、麦克风律动及音频图重建防爆音。
- **启动页快速进入**（`codex/gpu-mode-fast-splash`）：动画出现后任意时刻点击、回车或空格都能立即进入。
- **Mac 真实显卡占用监视**（#29）：负载窗口通过 `ioreg` 显示系统 GPU 占用；只在窗口打开时每 2 秒采样，壁纸模式停止采样，失败时显示 `--`。
- **播放器 GPU 占用监视**（PR #48）：GPU 行与 CPU 一致显示“系统 xx% · 播放器 xx%”；播放器数字来自非阻塞 WebGL GPU 计时，只在 HUD 打开时采样。
- **本地 AI 人声 / 伴奏分轨**（`codex/ai-stem-separation`）：保留实时滤镜并新增 AI 模式；复用本机 UVR HQ3 模型生成两条真实音轨，缓存后同曲可直接切换，不上传歌曲。
- **K 歌升降 Key**（`codex/karaoke-key-shift-toggle-layout`）：支持 `-6` 到 `+6 Key`，实时分离和 AI 双轨共用最终混音后的一个 SoundTouch 处理器；倍速与麦克风不受影响，`0 Key` 完全旁路。

### Bug 修复
11. **音源切换死循环卡死**（#16→#17）：toast 无节流导致主线程被 reflow 占满。修：toast 800ms 节流 + `_playbackFailCounter`（同首歌 15 秒失败超 3 次跳下一首）+ 换源保留 `_lastPlaybackFailAt`。
12. **WebGL 上下文丢失黑屏**（#18）：加 webglcontextlost 监听 + 自动恢复。
13. **渲染进程崩溃**（#20）：加 `render-process-gone` 监听，崩溃自动 reload。`sendWindowState` 加 webContents.isDestroyed 防护。
14. **purge 免密 + 防爆音**（#21）：优先 `sudo -n purge`（免密），purge 前暂停音频 purge 后恢复（修喇叭"噗"爆音）。
15. **内存按钮短静音防噗声**（#23）：修复"压缩播放器 / 系统释放 / 提权释放"播放中仍可能噗声；清理前淡出并静音，清理后恢复音量，不再用 `togglePlay` 播放/暂停切状态。
16. **显卡重启弹窗黑边**（#27）：修复切换显卡模式后点“稍后重启”导致页面横向偏移、右侧出现大块黑边；焦点进入与恢复均使用 `preventScroll`，避免带动页面滚动。
17. **音频上游断线保护**（PR #41）：上游音频传输中断且响应头已经发出时，只关闭当前损坏连接，不再重复发送 500 响应，避免 `ERR_HTTP_HEADERS_SENT` 让本地服务退出。
18. **整队不可播计数修复**（PR #42）：拿到音频 URL 不再提前清零连续跳过计数；只有当前切歌任务确认本地或网络歌曲真正播放后才清零，避免无效 URL 让整队保护失效。
19. **快速切歌与进度跳转竞态修复**（PR #52）：快速下一首合并到最终歌曲并立即卸载旧源；20 次快速拖动只执行当前和最后目标，过期任务恢复增益；AI 副轨到达最终时间后才继续播放。
20. **2.0 官方登录回归修复**（PR #57）：公开版网易/QQ/酷狗官方窗口不再把 Cookie 发回渲染进程或调用被禁用的手动导入接口；主进程直接验证并通过 `safeStorage` 保存，手动导入仍关闭。
21. **2.0 音质换流卡死与歌词残影修复**（PR #57）：音质选择不再复用完整切歌；同曲换流串行合并到最后一次，旧流保留到新流可用，失败恢复旧流与时间，歌词舞台和听歌会话不重建，通知按单卡替换。
22. **音域回响幽灵封面被挡**（PR #58 线）：体素地形改不透明写深度后，远景柱体 depth-test 掉 `(110,24,-110)` 封面平面；封面材质关 `depthTest`、`renderOrder=6`。设置「封面图」开关与 `mineradio-vox-toggles-v1` 持久化本来就在，未删功能。

### 基础设施
17. **协作规则**（#8）：`.github/AGENT_COLLABORATION.md`（Codex+GLM 协作规则、术语解释、rollback、PR 四要素）
18. **移植包**（#15）：`mac-porting/`（7 个 patch + MAC_PORTING_GUIDE.md）
19. **本机崩溃记录**（PR #43）：最新代码重新接入 crashReporter；`.dmp` 和最多 50 条诊断只存本机，递归查找 Crashpad 子目录，上传开关关闭。

## 已知问题（待解决）

**2026-07-29：独立雨窗玻璃水珠迁移到雨境预设 9。**

- 新增 `public/js/modules/02-visual/19-rain-glass.js`：复用主 renderer 的四阶段后处理（锐利场景、双向模糊、Metaball 场、折射合成），不创建第二个 Canvas 或 `requestAnimationFrame`。
- 水滴现为六态物理模型（pinned/impacting/growing/breaking/slipping/settling）：新雨滴先以半透明小撞击珠铺展成附着珠，再进入面积守恒融合、蜿蜒滑落、残留微珠、接触角扰动、折射、菲涅尔、接触阴影和局部高光。
- 液滴场从 0.82 倍提升为原生分辨率（最大 2048×1280）并改用 `highp` 片元精度，降低大尺寸水珠的马赛克。动态面板的雨量范围为 `0.05–4`，水珠数量为 `0.15–2.5`，流速 `0.2–8.0`，尺寸 `0.6–1.8`；雨量不再隐式改变水珠尺寸或额外撞击频率，新水珠统一由雨点击中后的冲击点铺展生成，数量仍受用户上限约束并会替换最小旧微珠。
- 流速不仅作用于滑落加速度和终端速度，也作用于附着态等待、破裂和停靠过渡。调高“水珠流速”后，屏幕上已有的附着水珠会更早离开附着态并更快完成滑落周期。
- 关闭、切出预设、WebGL 上下文恢复或后处理失败时释放 GPU 资源；失败回退原始雨境雨丝渲染。
- 验证：新增撞击凝结与范围回归测试，雨境相关共 10 项通过；`npm run check` **175/175**；本地服务页面切到雨境，动态控件边界已核对（雨量 `0.05:4`、水珠数量 `0.15:2.5`），Console 0 errors（保留 1 条既有浏览器音频策略 warning）。
- 用户反馈背景发糊；已将合成器水滴外的 `glassBase` 从模糊纹理改为锐利场景，模糊只留在水滴内部折射层。
- 待用户手测：用真实歌曲切到雨境，确认 10 分钟播放下水珠的接触边、高光、折射、GPU 温度和壁纸模式帧率。

### 🔴 渲染进程崩溃（exitCode: 5, reason: 'crashed'）—— 最重要
- **现象**：播放某些不可播的歌（如《你不知道的事》网易云+QQ 都失败）触发 QQ 换源搜索后，渲染进程 segfault 崩溃（`exitCode: 5`）。
- **已做的**：崩溃后自动 reload 恢复（PR #20）；最新分支已重新接入本机 crashReporter，真实隐藏测试窗口崩溃成功生成 `.dmp`，不上传服务器。
- **未做的**：还没有在用户真实资料中再次复现原问题，因此尚未拿到对应 GPU 崩溃 dump，也不能确认最终根因。
- **下一步**：用户运行最新分支并复现《你不知道的事》等场景，然后收集 `CrashDumps/` 下的 `.dmp` 和 `crash-diagnostics.json` 分析。

### electron-builder 签名阶段偶发卡住
- 本地构建有时卡在签名阶段（Apple Development 证书 + Keychain 交互）。用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 可跳过。

## 待办清单

- [x] **重新接入崩溃记录**：本机 crashReporter 已在最新代码启用，真实测试生成 `.dmp`，上传关闭。
- [x] **雨境玻璃水珠迁移与写实增强**：独立 RG Metaball 后处理已接入预设 9；动态控件支持开关、数量/流速/尺寸，雨量扩大并驱动尺寸，新增撞击凝结态；背景保持锐利；已消除合成噪声造成的规则像素点阵；`npm run check` 176/176。
- [x] **云瀑共振音乐雨幕预设**：新增索引 11 与 Rainform 授权派生的分层雨景；包含雨链、珍珠雨滴、暴雨瀑布、撞击水花、涟漪、水平水面、顶部雨幕包络和 25 点音乐雨量曲线，动态面板支持雨幕强度、旋律起伏、拍点爆发并独立持久化；保留 Required Notice、来源和 PolyForm Noncommercial 许可说明；专项测试 9/9，`npm run check` 185/185。
- [x] **Windows Cuefield 智能混音 Lite**：控制栏新增默认关闭的持久化开关；仅在两首已缓存、BPM/能量接近的普通歌曲之间将已有交叉淡入缩短至 85%，无缓存、播客、本地、随机和内存紧张均严格回退。
- [x] **汽水登录迁回 PR #56 macOS 官方客户端桥**：删除不可靠的服务端扫码链；只从本机汽水客户端的已登录会话读取，主进程安全保存，渲染层不接触 Cookie。
- [x] **Windows 首页信息层迁移**：在不替换 Mac 首页的前提下加入“每日内容”和“接下来播放”，前者复用每日推荐、后者复用当前队列。
- [x] **Windows v2.1.0 本地曲库持久化**：主进程索引 + `mineradio-local://` 特权协议 + IPC/preload 接线；渲染层导入/启动断点恢复/内嵌歌词/封面链路全部接入；`npm run check` 209/209。
- [x] **Windows 首页每日热评 + 生成封面回退**：每日热评卡片（可换一条、自定义热评列表）+ 无封面卡片生成品牌渐变 SVG；不迁 MP4 Hero。
- [x] **QQ/酷狗 v2.1.0 字段**：`qqMembershipNeedsSync` 区分播放授权未完成/权益待同步；酷狗兼容 `playbackReady`。
- [x] **本地曲库 UI 面板**：首页与导入面板新增“本地曲库”入口，弹窗支持浏览/搜索/播放/全部播放/移除（只删索引与封面缓存，不删源文件）；主进程新增 `mineradio-local-library-remove` IPC。
- [x] **窗口恢复 + 歌词磁盘缓存**：补 `desktop-window-restore` handler；歌词按曲目缓存到 userData（≤96MB 自动淘汰），`fetchLyric` 先读缓存；不迁 Chromium 缓存搬迁（防丢 macOS 登录态）。
- [ ] **本地曲库人工验收**：拖入含内嵌封面/歌词的 mp3/flac 与 `.lrc` 侧车文件，确认索引、封面、断点恢复、内嵌歌词显示；再删除源文件确认启动后不崩溃并提示重导。
- [ ] **首页每日热评人工验收**：确认未登录/登录态首页都显示热评卡片，“换一条”可切换且重启后当日仍稳定；自定义 `mineradio-daily-review-quotes-v1` 热评生效。
- [ ] **汽水本机验收**：先登录 macOS 汽水音乐客户端，完全退出后在 Mineradio 点击“读取本地汽水”；确认 QS 保持选中、歌单/搜索/播放不跳网易。不得记录或提交 Cookie/Token。
- [ ] **智能混音 Lite 听感验收**：开启后用两首已完成节拍分析的普通歌曲检查交接；再确认播客、本地歌曲、随机播放和内存紧张时保持原交叉淡入行为。
- [ ] **渲染进程崩溃根因**：在用户真实资料复现后分析 `.dmp` 和 `crash-diagnostics.json`（上面详述）。
- [ ] **真机对比三种显卡模式**：分别重启到自动/省电/高性能，播放同一首歌 10 分钟，对比温度、CPU 和流畅度。
- [x] **继续发烫优化**：主循环空闲时从高频 RAF 唤醒改成真正休眠；idle guide 在禁用无内容和深后台时彻底停止。
- [x] **唱歌模式降载**：原唱 100% 时旁路 Worklet；暂停、无歌曲、结束、错误或深后台时停止麦克风采集，恢复播放/前台后自动重开。
- [x] **唱歌模式双向混音**：伴奏和人声音量独立调节，支持去人声或去伴奏；双 100% 时原声直通。
- [x] **Mac 内存面板两个开关**：播放中只做播放器软清理并延期系统释放；暂停且进入后台后再补做；管理员开关关闭时不弹密码框。
- [x] **最近播放滚动卡顿**：滚动期间让 3D 背景临时降到不高于 30 FPS，停止后恢复，玻璃与首页无限悬浮动画不变。
- [x] **第二批卡顿优化**：播放进度定时器按播放状态启停；无缝连播只在最后 9 秒高频检查。
- [x] **本地 AI 人声 / 伴奏分轨**：首次在本机计算，缓存后直接读取；切歌、取消和播放同步已验证。
- [x] **AI 分轨提速与实时精准度**：90 秒分轨提速约 36.1%；实时人声轨鼓点泄漏降低约 52.8%，69 项检查通过。
- [x] **AI 分轨热管理与实时伴奏轨增强**：电池/发热自动 batch 1，线程上限 6 并降低优先级；伴奏轨加强消人声且补回鼓点第一下瞬态。
- [x] **实时去伴奏保留人声增强**：鼓点与侧声道乐器进一步压低，人声支路改为中置输出；完全居中的相似乐器仍需 AI 分轨。
- [x] **AI 分轨 CoreML 全图加速**：178/178 个算子进入 CoreML；完整歌曲第二次 37.34 秒，约提速 4.58 倍；Intel/非 Mac 保持原路径并有回退保护。
- [x] **快速切歌异步竞态**：连续点下一首会串行合并到最终目标；旧音源立即卸载，UI 只在新音源赋值后更新。
- [x] **连续拖进度条异步竞态**：20 次快速拖动只执行当前和最后目标；过期静音、播放请求与 AI 副轨同步均有保护。
- [x] **替换软件 Logo**：原图无裁剪替换 PNG，并生成 16-1024 像素的 Mac ICNS；未签名 arm64 App 打包验证通过。
- [x] **歌词选项切换卡顿**：按钮先完成绘制，行数/翻译只生成附近 11-18 行，动画切换不再重建歌词网格；快速连点只处理最后一次。
- [ ] **AI 分轨真实歌曲听感**：用 3-5 首人声、鼓点和混响风格不同的歌对比人声 / 伴奏残留。
- [x] **音频代理重复写响应头**：上游中断且响应头已发出时关闭当前连接；自动复现确认本地服务不会退出。
- [x] **整队不可播计数清零时机**：从“拿到 URL”后移到当前歌曲确认播放成功，旧切歌任务和播放失败不会清零。
- [ ] **测试内存清理**：播放时分别点"压缩播放器 / 系统释放 / 提权释放"，确认不弹密码、不爆音、不丢播放状态
- [ ] **Touch Bar 实测**：找老款 Intel MBP
- [x] **x64 CI 验证**：PR #45 使用 macos-15-intel，GitHub 在线 x64 构建 59 秒通过；arm64 41 秒通过。
- [x] **Touch Bar 歌曲名推送**：切歌同步歌名/歌手，播放状态同步图标；窗口重建不重复监听。
- [x] **K 歌升降 Key + 启动开关对齐**：实时 / AI 模式兼容升降 Key；修复标题被塞进网格导致两个启动开关对角错位。
- [x] **GPU 系统/播放器占用**：负载监视器 GPU 行补齐播放器占用；异步查询不阻塞画面，不支持时显示 `--`。
- [x] **清理并永久排除 `.omc`**：仓库无残留；Git 与 electron-builder 全局排除，临时探针打包验证未进入 app.asar。
- [x] **建立 2.0 删除汽水的公开分支**：正式身份、凭据保护、本地 API 同源限制、隐私与许可证文件、arm64/x64 候选 DMG 均完成。
- [x] **修复 2.0 官方登录回归**：网易/QQ/酷狗官方登录会话由主进程直接保存；不再经过 403 的手动导入接口，也不把原始 Cookie 返回渲染进程。
- [ ] **2.0 Developer ID 签名与 Apple 公证**：本机当前没有有效签名身份，未签名候选不能作为最终公开包。
- [ ] **2.0 音乐平台授权确认**：网易云、QQ、酷狗等接口/内容播放链路缺少仓库内授权证明；不能仅靠免责声明认定合规。
- [ ] **2.0 隐私主体信息**：补充运营者、联系方式、数据删除入口和永久隐私政策网址。
- [ ] **2.0 Intel 真机验收**：在真实 Intel Mac 上验证启动、搜索、播放、歌词、手势、麦克风与 AI 分轨。

## 用户需要手动完成的（账号授权类）

- [x] **装 Codex GitHub App**：已授权 `mr` 仓库。
- [ ] **加 `OPENAI_API_KEY` secret**：mr 仓库 Settings → Secrets → Actions。

## 工作规则（给接手 AI）

- **分支命名**：`codex/任务名`（Codex）、`glm/任务名`（GLM/ZCode）。不直接改 main，走 PR。
- **每次更新单独开新 PR 线**（2026-08-01 用户确认）：每批功能/修复/文档更新都新建分支 + 新 PR，**禁止往已开的 PR 上追加 commit**。PR #58（`codex/mineradio-2.0-unified`）已封线。新线从最近一次远端 head 分叉，更新用 GitHub Git API 以该 head 为 parent 创建 tree/commit 后 PATCH 新 ref（`force:false`），不使用 `git push`；新 PR 的 base 一般为该线当前 head，diff 只含本批文件。
- **PR 四要素**：变更 / 验证 / 未验证 / 是否需要用户手动操作。
- **commit 是存档点**：一任务多小 commit，出问题可 revert。
- **用英文术语带中文解释**（commit/branch/PR/issue/repo/main/merge/rollback/diff/CI）。
- **每次完成改动的最终回复必须给用户“命令行测试”代码块**：命令可直接复制运行，针对本次实际改动，并说明通过时的预期结果；AI 已跑过检查也不能省略。
- **每次完成任务必须同步更新 Obsidian**：笔记库在 `/Users/chy/菜鸡的仓库/菜鸡的仓库/02 知识编译/Mineradio Mac 开发进度.md`。完成新任务后，把成果追加到这个笔记的「已完成的优化」表格和「待办」清单里。这是用户的知识库，代码改了笔记也要跟着更新，不能只改代码不记笔记。
- **每次完成任务也要更新本文件（AI_HANDOFF.md）**的工作日志和待办清单，让下一个接手的 AI 知道最新状态。
- 详细规则见 `.github/AGENT_COLLABORATION.md`。

## 交接说明

**2026-07-12：GLM 将工作转交给 Codex。**
- 用户正在装 Codex GitHub App，装好后 Codex 接手待办。
- 后续用户会把任务转回 GLM（通过同一仓库的 AI_HANDOFF.md 同步）。
- GLM 和 Codex 都通过 GitHub PR 协作，不维护各自独立的本地代码。

**2026-07-12：Codex 处理内存按钮播放中噗声。**
- PR：#23，分支：`codex/memory-buttons-no-pop`。
- 改动：`desktop/main.js` 新增清理期间短静音保护；`mineradio-memory-trim-app` 和 `mineradio-memory-purge-system` 都经过该保护；系统释放不再用 `sendGlobalHotkeyAction('togglePlay')` 暂停/恢复。
- CI 补充：PR #23 首轮 arm64 构建失败原因是 `.github/workflows/build-mac.yml` 的 `actions/setup-node` 开了 `cache: npm`，但仓库没有 `package-lock.json`；已移除该缓存配置，让 `npm ci || npm install` 正常执行。第二轮失败原因是 workflow 直接运行 `electron-builder`，GitHub shell 找不到本地 `node_modules/.bin`；已改为 `./node_modules/.bin/electron-builder`，并把 Node 从 20 调到 24 以匹配 Electron 42 的 Node 要求。
- 验证：`npm run check`、`git diff --check` 通过；新增 `scripts/check-memory-audio-guard.js` 防止回退到播放/暂停式清理。
- 未验证：还需要用户在真实播放时手动点三个按钮，确认喇叭不再“噗”、播放状态不丢。

**2026-07-13：Codex 增加显卡模式并优化启动与首页后台占用。**
- PR：#27；分支：`codex/gpu-mode-fast-splash`；设计 commit（代码存档点）`7977185`，功能 commit `e7eb5f4`，审查修复 commit `8b74045`，黑边修复设计 commit `160c560`，黑边修复 commit `bee5c36`。
- 改动：显卡模式新增自动/省电/高性能，主界面和启动页 WebGL 统一读取；切换后可稍后或立即重启；启动页无需等 5 秒即可跳过；首页悬浮动画前台完整保留，后台省电状态暂停。
- 独立审查修复：启动页显示时普通热键先返回，按空格只跳过启动页、不再同时触发播放/暂停；重启弹窗增加焦点进入、Tab 循环、Esc 关闭和焦点恢复。
- 黑边修复：用户反馈点“稍后重启”后右侧出现大块黑边。原因是弹窗焦点进入和关闭后恢复焦点会带动页面横向滚动，现统一改为 `focus({ preventScroll: true })`。
- 验证：`npm run check`（7 项新检查）、全部 `public/js` / `mjs` 语法检查、`git diff --check` 通过；Electron 隔离设置目录实测启动页点击立即进入；Playwright 实测空格跳过时 `togglePlay` 调用次数为 `0`；三个按钮桌面尺寸均为 `126×34`、小窗口均为 `206×34`，文字无溢出，重启按钮均为 `150×35`；前台动画为 running，后台/隐藏为 paused；Mac 实际窗口点击“高性能 → 稍后重启”后 `scrollX=0`、窗口宽度保持 `1134`、右侧无黑边；`CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac:dir` 打包通过，`app.asar` 已包含 `public/js/gpu-mode.js`。
- 用户验收：2026-07-13 用户复测确认黑边问题已修好。
- 测试规则：后续自动化实机测试只能使用 `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`，不能调用真实摄像头；用户已明确这不是软件修改任务。
- PR #27 CI：arm64 构建成功；x64 仍排队。`codex-review` 失败是工作流未生成 `/home/runner/.codex/<run-id>.json`，与本次代码检查无关。
- 未验证：`powerPreference` 只是 WebGL 偏好，macOS 最终决定实际显卡；三种模式的真实温度和续航差异仍需同机长时间对比。

**2026-07-13：Codex 为负载监视器增加 Mac 真实显卡占用。**
- PR：#29；分支：`codex/gpu-usage-monitor`；基于 PR #27；设计 commit（代码存档点）`4efaba2`，功能 commit `3a9f3eb`，审查修复 commit `d342ac6`、`bdfc2b5`。
- 改动：新增 `desktop/gpu-usage.js`，通过 `/usr/sbin/ioreg` 读取 `Device Utilization %`；负载窗口在 CPU 与内存之间增加“显卡”行，读取失败显示 `--`。
- 开销控制：只在负载监视器打开时每 2 秒采样；关闭监视器或进入壁纸模式时同时停止显卡、CPU 和内存采样，退出壁纸后按原开关恢复。
- 独立审查：首轮发现壁纸模式只停 HUD 绘制、没有停设备采样，`d342ac6` 已修复；复审又发现退出壁纸的多个通知会触发重复即时采样，`bdfc2b5` 改为幂等恢复，并用真实连续调用测试锁定只采样一次。
- 最终复审：未发现剩余问题，`npm run check` 11 项全部通过。
- 验证：`npm run check` 共 11 项通过，`git diff --check` 和相关前端语法检查通过；本机 `ioreg` 约 0.01 秒返回；Electron 使用假摄像头参数实测显卡行从 `--` 更新为真实 `97%`，顺序为 CPU → 显卡 → 自适应 → 内存，测试日志无报错。
- 未验证：Intel Mac 是否提供同名指标；不支持时会安全显示 `--`。

**2026-07-13：Codex 让空闲主循环真正休眠并停止 idle guide 空转。**
- PR：#30；分支：`codex/true-idle-sleep`；基于 PR #29；设计 commit（代码存档点）`7e5b4c2`、`c17a098`，功能 commit `63b6e1d`，审查修复 commit `36ed4d0`。
- 改动：前台聚焦空闲使用 500ms 定时器，窗口可见失焦使用 67ms，深后台保留 250/1000/1500ms；播放、加载、交互、聚焦和音频播放事件会立即唤醒。
- idle guide：记录并统一取消 timeout 与 rAF；背景禁用且没有歌架提示时不再循环；深后台停止；歌架教程与悬停提示仍可唤醒，淡出后自动停止；普通鼠标移动且没有提示时不会反复清空大画布。
- 实机验证：Electron 独立设置目录并使用假摄像头参数测试；前台空闲 3.2 秒主循环运行 6 次，约 2 次/秒；交互唤醒约 4.9ms，700ms 内运行 30 帧后重新进入 500ms 休眠；idle guide 的 timeout、rAF 和运行条件均为空/关闭；首页无限悬浮动画保持运行。
- 独立审查：发现歌架光效淡出途中进入深后台会保留残值，返回后可能短暂重现；`36ed4d0` 在深后台清掉已关闭提示的残值，并增加真实假定时器测试，检查定时帧执行和交互取消等待。
- 自动验证：`npm run check` 共 17 项通过，相关前端语法检查与 `git diff --check` 通过。
- 未验证：真实歌曲连续播放时的长期温度变化仍需用户真机对比；本次未关闭用户要求保留的首页悬浮动画，因此空首页 GPU 开销不会全部消失。

**2026-07-13：Codex 降低唱歌模式去人声与麦克风常驻开销。**
- PR：#31，分支：`codex/singing-mode-power-save`；基于 PR #30；设计 commit（代码存档点）`000a7a8`，功能 commit `43582f6`，审查修复 commit `4b87482`。
- 去人声：原唱 100% 时 `source` 直连 `analyser`，不创建 AudioWorkletNode；低于 100% 才建立现有频谱去人声链。修改前 100% 和 0% 都约 332 次 FFT/秒，修改后 100% 去人声 FFT 为 0。
- 实测性能：同一假测试音交叉测量 99% Worklet 与 100% 旁路各两轮，每轮 8 秒；渲染+音频进程平均 CPU 时间从 1.57 秒降到 1.375 秒，8 秒节省 0.195 秒，约等于单核 2.4%。
- 麦克风：仅在模式开启、歌曲播放且非深后台时运行；暂停、无歌、结束、错误和深后台停止 track、断开 `micSource`/`micVisualNode`，恢复播放或前台后自动重开。
- 独立审查修复：保持在途 `getUserMedia` 单例，修复快速暂停恢复双请求；Worklet 就绪改为按 AudioContext 记录；仅真正权限拒绝才锁重试；100% 开关模式不重建播放链；恢复原提示文案。复审确认 5 项全部修复。
- 自动验证：`npm run check` 共 27 项通过，相关前端语法检查与 `git diff --check` 通过。
- 假硬件实测：100% 开启模式时播放链立即重建 0 次，麦克风成功后仅为接麦重建 1 次；99% 使用 AudioWorkletNode，回 100% 重新旁路；暂停和深后台 track 变为 `ended`，恢复后获得新的 live track。
- 测试安全：Electron 全程使用假媒体参数，不调用真实摄像头或真实麦克风。
- 未验证：真实歌曲、真实麦克风下连续 10 分钟的温度与听感仍需用户真机确认。

**2026-07-13：Codex 让 Mac 内存面板两个开关安全生效。**
- PR：#32，分支：`codex/mac-memory-safe-auto`；基于 PR #31；设计 commit（代码存档点）`01e4dea`，功能 commit `669348e`。
- “系统级定时释放”现在可在 Mac 开启，继续受用户设置的间隔和占用阈值控制，默认仍关闭。
- 播放中达到条件时不暂停、不静音、不调用 `/usr/sbin/purge`；窗口在后台时只执行播放器软清理，并记录待处理系统释放。暂停、结束或错误后进入后台才补做系统释放。
- “需要时请求管理员”关闭时，免密清理失败只提示权限不足，不调用 `osascript`，因此不弹密码框；开启后才允许请求 macOS 管理员授权。
- 自动验证：新增 `scripts/test-mac-memory-safe-auto.js`，覆盖 Mac 开关、权限、播放延期、关闭软清理和播放状态同步；`npm run check` 共 34 项通过，相关前端语法与 `git diff --check` 通过。
- 未验证：真实播放、暂停、隐藏窗口后的系统释放时机和长期内存变化仍需用户真机确认；手动三个内存按钮仍保留原有短静音保护，不属于本次自动清理路径。

**2026-07-13：Codex 增加伴奏/人声双滑块并加强去人声。**
- PR：#33，分支：`codex/vocal-accompaniment-mixer`；基于 PR #32；设计 commit（代码存档点）`ae7af32`，功能 commit `67bf0de`。
- 唱歌模式面板新增对称的“伴奏”和“人声”两条滑块；默认伴奏 100%、人声 0%，可调为去人声、去伴奏突出人声或任意混合。
- 频谱 Worklet 只运行一份，输出系数改为 `伴奏音量 × mask + 人声音量 × (1-mask)`；没有增加第二套 FFT。两条滑块同时 100% 时仍原声直通并完全绕过 Worklet。
- 去人声曲线从 `ratio^1.4` 加强为 `ratio^2.2`，更强抑制带轻微立体声扩散的人声；130Hz 以下仍归入伴奏，保护贝斯和底鼓。
- 无 Worklet 回退链也支持双滑块；滑块在分离范围内调节只发送参数，不重建音频图，跨双 100% 边界才沿用淡出/淡入重建。
- 自动验证：新增 `scripts/test-vocal-accompaniment-mixer.js`；`npm run check` 共 40 项通过，相关前端语法与 `git diff --check` 通过。
- 未验证：不同母带的人声位置、混响和乐器声像不同，真实歌曲下的去人声与人声独听效果仍需用户听感确认；该功能不是 AI 分轨，不能保证完全分离。

**2026-07-13：Codex 优化首页最近播放滚动并统一 GPU 文案。**
- PR：#34，分支：`codex/recent-scroll-gpu-label`；基于 PR #33；GitHub 设计 commit（代码存档点）`620d079`，功能 commit `0723b9e`，审查测试 commit `08a3713`。
- 根因：最近播放滚动时，列表合成、卡片悬停阴影和背后的 3D 场景同时争用 GPU，触控板滚动容易掉帧。
- 改动：列表滚动活动期间把 3D 场景限制到不高于 30 FPS；用户原本选择 24 FPS 时仍保持 24；停止约 240ms 后恢复原设置。列表增加滚动隔离和独立合成层，滚动时停用卡片位移与重阴影。
- 视觉边界：首页玻璃效果、30 条最近播放、无限悬浮动画均保留；负载监视器的“显卡”文字改为“GPU”。
- 验证：`npm run check` 共 44 项通过，相关前端语法与 `git diff --check` 通过；Electron 临时资料实测 30 条列表可滚动，前台帧率从 45 → 30 → 45 自动恢复，HUD 显示 GPU，运行日志无报错。独立审查无严重或重要问题，并补充真实 `fx.maxFps=24` 调度路径测试。
- 未验证：真实用户历史封面全部加载时的长时间触控板手感仍需用户在正式资料下确认。

**2026-07-13：Codex 让播放进度与无缝连播定时器按状态休眠。**
- PR：#36，分支：`codex/playback-timer-idle`；基于 PR #34；设计 commit（代码存档点）`9c92056`，功能 commit `7e18ee9`，审查修复 commit `05fc076`，测试补充 commit `9a17a81`。
- 播放进度：原来页面启动后永久每 200ms 运行；现在仅当前音频真正播放时运行，暂停、结束、清空或报错后完全停止。已经播放的预载音频在无缝交接后会立即接管，不依赖新的 `play` 事件。
- 无缝连播：原来整首歌每 70ms 检查；现在歌曲中段每 1000ms 检查一次，最后 9 秒且正在播放时才恢复 70ms。暂停、恢复、跳转和歌曲时长变化会立即重新安排频率。
- 边界：没有修改静音阈值、预载时机、淡入淡出和切歌算法。
- 验证：`npm run check` 共 50 项通过，`git diff --check` 通过；Electron 临时资料实测预载音频接管后进度正常更新，暂停后定时器为 0，尾段调度顺序为 `1000 → 70 → 1000`。独立审查发现的无缝交接和尾段恢复问题均已修复，复审通过。
- 未验证：真实歌曲连续播放时的长期温度变化，以及同一专辑两首歌间的真实无缝切歌听感。

**2026-07-13：Codex 增加本地 AI 人声 / 伴奏分轨。**
- PR：#37；分支：`codex/ai-stem-separation`，基于 PR #36；设计 commit（代码存档点）`a6f31ca`，核心 commit `2ebf1cc` / `2babc4c` / `987b17e`，审查修复 commit `1b3e3a5` / `f4b8b7c`。
- 根因：原实时滤镜只能按左右声道位置判断，无法区分同样位于中间的人声和鼓点；继续调参无法解决“人声轨仍有鼓点”。
- 改动：唱歌面板增加等宽“实时 / AI”；AI 模式调用本地 `audio-separator 0.44.3` 和 UVR HQ3 模型，分轨期间原曲继续播放，完成后在当前时间切换到两条 FLAC 音轨。两条滑块直接控制伴奏和人声音量。
- 缓存与隐私：结果保存到 Electron `userData/ai-stems`，同曲不重复计算；歌曲和模型不上传任何第三方。切歌、取消和退出会终止 AI 子进程。
- 审查修复：防止加载中切歌后旧分轨覆盖新歌；取消下载会清理半截文件；切歌时优先读取新 `src`，避免滞后 `currentSrc` 指向旧分轨。
- 验证：`npm run check` 66 项全部通过；本机 UVR HQ3 模型真实生成两条 FLAC，CoreML/MPS 加速生效。Electron 独立设置实测首次分轨、缓存命中（925ms 完成切换）、两轨播放 / 暂停 / 跳转 / 滑块增益和取消均通过；测试只用假媒体参数，未调用真实摄像头或麦克风。
- 未验证：不同真实歌曲的最终听感；其他没有安装 UVR 或 `uv` 的 Mac 会安全提示组件不可用，本轮不把大型 AI 依赖打进 dmg。

**2026-07-13：Codex 加速本地 AI 分轨并降低实时鼓点残留。**
- PR：#38；分支：`codex/stem-speed-accuracy`，基于 PR #37；设计 commit（代码存档点）`ff3ebb5`，功能 commit `45f5a25`，基准文档 commit `b2f0020`。
- AI 提速：Apple Silicon 且内存不少于 12GB 时使用 `mdx_batch_size=2`，低内存、Intel 和非 Mac 自动回退 1；增加 `--use_soundfile` 直接写 FLAC，模型仍为 UVR HQ3，AI 进程仍按任务退出。
- 真实基准：90 秒固定 WAV 从 87.42 秒降到 55.82 秒，提速约 36.1%；batch 2 输出与基线逐样本一致，直接写 FLAC 的最大差异只有 1 个 16-bit 采样单位，SNR 约 70.5dB。
- 实时精准度：加入声道相干性、音量平衡、瞬态检测、高频保护和快降慢升掩码；人声轨鼓点泄漏从 0.309 降到 0.146，降低约 52.8%，持续人声保留 100%，处理没有变慢。
- 验证：`npm run check` 69 项全部通过；Electron 假媒体实测 AudioWorklet、播放/暂停麦克风生命周期、双滑块和 AI/实时切换正常；未签名 arm64 目录包通过，`app.asar` 含新代码且不含模型、测试和缓存。
- 测试说明：测试期间听到的持续“嗡嗡声”来自固定测试 WAV 中约 220Hz / 880Hz 的基准音，不是软件、麦克风或分离算法故障；测试音已停止。
- 未验证：仍需用 3-5 首真实歌曲确认最终听感；有签名构建在本机钥匙串阶段返回 `errSecInternalComponent`，未签名构建正常。

**2026-07-14：Codex 替换 Mineradio 软件 Logo。**
- PR：#39；分支：`codex/app-logo`；基于 PR #38；设计 commit（代码存档点）`35e263a`，图标 commit `0fb2a10`。
- 改动：用户提供的 1024×1024 MR 原图原样替换 `build/icon.png`，并由同一原图生成完整 `build/icon.icns`；不裁剪、不加圆角，不修改 Windows 图标和播放器逻辑。
- 验证：PNG 与源图 SHA-256 完全一致；ICNS 反向展开后 16-1024 像素共 10 个标准尺寸齐全；`npm run check` 69 项全部通过；未签名 arm64 App 打包通过，App 包内 ICNS 与构建资源完全一致。
- 未验证：未制作签名 DMG，也未安装覆盖当前正式软件；macOS 如果短暂显示旧图标，安装新包或刷新 Dock 缓存后会更新。

**2026-07-14：Codex 优化歌词选项按钮切换卡顿。**
- PR：#40；分支：`codex/lyrics-option-switch-lag`；基于 PR #39；设计 commit（代码存档点）`c958f86`，功能 commit `736b16f`。
- 根因：歌词行数、双语翻译和歌词动画每次点击都会同步销毁当前 3D 歌词并重建 Canvas、模糊光晕、纹理和网格；90 行双语压力测试的完整轨道有 180 行网格，同步构建约 83ms，首次 GPU 提交可出现约 2.15 秒停顿。
- 改动：行数和翻译先让按钮完成绘制，再合并连续点击并只生成当前附近的轻量轨道；动画直接更新当前、过渡和预热歌词的运动与着色器参数，不再重建歌词。
- 实测：按钮处理约 1-2ms；轻量轨道只有 11-18 行，构建约 11-21ms；动画切换 `lyrics.mesh-build` 为 0 且保留同一个网格；快速连点只构建一次并停在最后选项。
- 验证：新增 4 项回归测试，`npm run check` 共 73 项全部通过；未签名 arm64 App 打包通过，app.asar 含新代码且不含测试脚本。
- 未验证：仍需用户在自己的真实歌曲和视觉设置下确认切换手感；未制作签名 DMG。

**2026-07-14：Codex 修复音频上游中断导致本地服务退出。**
- PR：#41；分支：`codex/audio-proxy-disconnect`；基于 PR #40；功能 commit（代码存档点）`1bc8b00`。
- 根因：`/api/audio` 已经把上游的成功响应头发给播放器后，`reader.read()` 遇到上游断线抛错；异常处理再次调用 `writeHead(500)`，触发 `ERR_HTTP_HEADERS_SENT`，未处理的异步异常最终让 Node 本地服务退出。
- 改动：响应已结束或连接已销毁时直接返回；响应头已经发出时只关闭当前损坏连接；只有尚未发出响应头时才发送 500。
- 验证：新增真实本地上游服务器中途断线测试；修复前稳定复现进程退出，修复后进程继续处理新请求；`npm run check` 共 74 项全部通过，`git diff --check` 通过。
- 未验证：真实公网音源断线时，当前歌曲仍会失败并进入播放器原有换源逻辑；本轮只防止本地服务被连带退出。

**2026-07-14：Codex 修复整队不可播保护被无效 URL 提前清零。**
- PR：#42；分支：`codex/playback-skip-reset`；基于 PR #41；功能 commit（代码存档点）`5d275bf`。
- 根因：网络接口只要返回非空 URL，`playQueueAt` 就立刻清零 `playbackSkipCascade`；即使该 URL 随后网络失败、解码失败或无法真正播放，整队连续失败记录也已丢失，可能再次绕回旧歌曲。
- 改动：新增 `confirmQueuePlaybackStarted`，同时校验当前切歌 token、队列下标和音频播放状态；本地歌曲与网络歌曲均在 `playAudio()` 成功且 token 仍有效后调用。删除拿到 URL 时的提前清零。
- 验证：新增 2 项回归测试，覆盖暂停/失败、旧切歌任务、非当前歌曲和真实成功路径；`npm run check` 共 76 项全部通过，相关脚本语法与 `git diff --check` 通过。
- 未验证：仍需用整队不可播的真实歌曲队列观察最终提示和停止跳转行为。

**2026-07-14：Codex 在最新代码重新接入本机崩溃记录。**
- PR：#43；分支：`codex/crash-diagnostics-latest`；基于 PR #42；功能 commit（代码存档点）`9ce0014`；接手已关闭的 PR #22，但按最新代码重新实现。
- 改动：新增独立 `desktop/crash-diagnostics.js`，在创建渲染进程前启动 Electron crashReporter；记录 `render-process-gone` 与异常 `child-process-gone`，保留最近 50 条 JSON；递归扫描 Crashpad 子目录中的 `.dmp`。
- 隐私：`uploadToServer: false`，不配置上传地址；崩溃文件、GPU 状态和诊断 JSON 只写入本机 `userData/CrashDumps`。
- 验证：3 项模块测试覆盖本地保存、子目录扫描、50 条上限和主进程接入；`npm run check` 共 79 项通过；隐藏 Electron 测试窗口调用 `forcefullyCrashRenderer()` 后真实生成 1 个 `.dmp` 和 1 条诊断，上传状态为 false；未签名 arm64 App 打包通过，app.asar 包含诊断模块且不含测试脚本。
- 未验证：原用户歌曲场景尚未再次崩溃，仍需用户运行新分支复现后提供 dump，才能分析 GPU/Chromium 根因。

**2026-07-14：Codex 永久排除 `.omc` 工具缓存。**
- PR：#44；分支：`codex/exclude-omc-cache`；基于 PR #43；功能 commit（代码存档点）`87c1875`。
- 检查：Git 当前没有跟踪任何 `.omc` 文件，本地也没有遗留 `.omc` 目录；旧待办中的垃圾已经清理。
- 改动：electron-builder 的 `build.files` 增加 `!**/.omc/**/*`，与现有 `.gitignore` 形成双重保护；新增配置回归测试并接入 `npm run check`。
- 验证：完整自动检查 80 项通过；在 `public/js/modules/.omc/` 临时放入探针后执行未签名 arm64 打包，app.asar 中无 `.omc` 和探针；验证后已删除临时目录。
- 未验证：无。

**2026-07-14：Codex 修复 macOS x64 CI 永久排队。**
- PR：#45；分支：`codex/fix-x64-ci-runner`；基于 PR #44；功能 commit（代码存档点）`4661f78`。
- 根因：GitHub 官方运行器列表已删除 `macos-13`，旧 x64 job 的 `runner_id` 一直为 0，说明没有机器可匹配；`macos-14` 也从 2026-07-06 进入弃用期。
- 改动：arm64 使用 `macos-15`，x64 使用 `macos-15-intel`；构建工作流和 `scripts/**` 变更纳入 PR 触发路径；同一 PR 使用 concurrency 自动取消旧构建。
- 本地验证：新增 2 项配置回归测试，`npm run check` 共 82 项通过，`git diff --check` 通过。
- 在线验证：GitHub Actions run `29273985362` 中，arm64 在 41 秒内通过，x64 在 59 秒内通过；x64 已获得真实 Intel 运行器，不再永久排队。`codex-review` 仍因仓库原有 server info 文件缺失而失败，与双架构构建无关。
- 未验证：尚未打测试 tag 生成两个正式 DMG；PR 的目录包验证已经通过。

**2026-07-14：Codex 补齐 Touch Bar 歌曲名与播放状态同步。**
- PR：#46；分支：`codex/touchbar-track-sync`；基于 PR #45；功能 commit（代码存档点）`28e61b3`。
- 根因：`desktop/touchbar.js` 已监听 `touchbar-update-track`，但 preload 没有向前端暴露发送方法，前端也从未发送该事件；窗口重建还会重复注册监听。
- 改动：preload 增加安全发送桥；切歌更新歌曲名/歌手，播放事件更新播放状态；Touch Bar 在页面加载前初始化；窗口重建先解除旧监听，关闭后清理。
- 验证：3 项专项测试覆盖标题截断、播放图标、完整发送链路、首个状态和重复监听；`npm run check` 共 85 项通过，相关脚本语法与 `git diff --check` 通过。
- 未验证：仍需在 2016-2019 带 Touch Bar 的 Intel MacBook Pro 上确认真实显示宽度和按钮触感；无对应硬件时为安全 no-op。

**2026-07-14：Codex 增加 K 歌升降 Key 并修复启动开关对角错位。**
- PR：#47；分支：`codex/karaoke-key-shift-toggle-layout`；基于 PR #46；设计 commit（代码存档点）`76641b8`，功能 commit `903c576`。
- 变调：唱歌面板新增对称的减号 / 当前 Key / 加号控制，范围 `-6` 到 `+6`；只改变歌曲、伴奏和原唱音高，不改变速度或麦克风声音。
- 音频链：使用 `@soundtouchjs/audio-worklet` 2.1.0 的自包含处理器；实时分离与 AI 双轨在最终混音后共用一个节点，`0 Key` 和关闭唱歌模式时完全旁路。倍速启用时由 SoundTouch 补偿媒体倍速造成的音高变化。
- 布局根因：页面启动后的 `setFxSectionBefore('t-startupAutoplay', ...)` 把“启动播放”标题插进了两列开关网格，形成 3 个网格元素，两个开关被挤成对角线；现改为对整个 `startup-toggle-grid` 插入标题。
- 验证：`npm run check` 共 92 项通过；Electron 独立资料与假媒体实测处理器成功加载，220Hz 升 3 Key 测得约 263.7Hz（目标 261.6Hz），稳定阶段 underrun 不再增长；两个启动开关实测同一行、等宽等高；未签名 arm64 App 打包通过，app.asar 含处理器和许可证。
- 未验证：仍需用户用真实歌曲听升降 Key 的最终音质和切换瞬间手感；极端 `-6 / +6` 比较容易出现算法音色变化，属于实时变调的正常边界。

**2026-07-14：Codex 让 GPU 行显示系统与播放器占用。**
- PR：#48；分支：`codex/gpu-player-usage`；基于 PR #47；功能 commit（代码存档点）`eb3ccf9`。
- 改动：GPU 行改为“系统 xx% · 播放器 xx%”。系统值仍使用 macOS `ioreg`；播放器值使用 WebGL 非阻塞 GPU 计时查询，测量 Mineradio 主 3D 场景的真实绘制耗时。
- 开销：只在负载监视器打开时每 250ms 采一帧；结果未就绪时留到下次读取，不同步等待 GPU。WebGL 不支持计时或上下文丢失时显示 `--`，恢复后重建采样。
- 验证：`npm run check` 共 93 项通过，`git diff --check` 通过。Electron 独立资料和假媒体实测 GPU 行显示对称文案；空闲底层读数约 0.29%，界面四舍五入显示 0%。GitHub arm64 36 秒、Intel x64 1 分 23 秒构建通过；`codex-review` 仍因仓库原有 server info 文件缺失而失败。
- 未验证：需用户播放真实歌曲并开启高负载视觉，确认数字变化；播放器值只表示主 3D 场景绘制，不包括 macOS 窗口合成和视频解码。

**2026-07-14：Codex 增加 AI 分轨热管理并增强实时伴奏轨去人声。**
- PR：#49；分支：`codex/stem-power-realtime-accuracy`；基于 PR #48；设计 commit（代码存档点）`618b998`，功能 commit `66e2afe`。
- AI 热管理：任务开始时读取 `powerMonitor` 的电池和温度；电池、温度非 `nominal`、Intel 或低内存使用 batch 1，只有插电、温度正常且内存不少于 12GB 的 Apple Silicon 使用 batch 2。任务运行中不因拔电突然取消，下一次任务使用新状态。
- 线程与流畅度：AI 子进程通过 `nice -n 10` 降低优先级；为系统保留至少 2 个逻辑核心，最多使用 6 条 CPU 线程。缓存目录生成 Python 启动钩子，实测 PyTorch 线程为 6、ONNX Runtime intra/inter 为 6/1。
- 实时听感：伴奏轨改用独立强力中置掩码，人声轨继续使用相位、瞬态和高频保护；新增五次方瞬态放回，避免军鼓和镲片被一起削空。仍只有一套 FFT，帧内零分配，升降 Key 和双 100% 原声旁路不变。
- 指标：反复中置人声残留从修改前约 43.6% 降到约 13%；中置高频鼓点能量保留约 52%、峰值约 68%；侧声道乐器保留大于 85%。独立审查首轮发现鼓点只剩约 1%，修复后复审无阻塞问题。
- 验证：`npm run check` 共 100 项全部通过；Electron 使用独立资料和假媒体参数正常启动；未签名 arm64 目录包通过，`app.asar` 已确认包含最终线程、电源和瞬态保护代码。GitHub Actions run `29309950486` 中 arm64 26 秒、Intel x64 1 分 47 秒构建通过；`codex-review` 仍因 `/home/runner/.codex/29309950503.json` 缺失失败，与本次代码无关。
- 未验证：真实歌曲的人声位置、混响和母带差异仍需用户试听；插电/电池连续 10 分钟的温度、耗电和完整 AI 时长仍需真机对比；CoreML 可能自行调度部分硬件工作，线程上限不等于绝对锁死全部核心。

**2026-07-14：Codex 净化实时去伴奏后的人声轨。**
- PR：#50；分支：`codex/realtime-vocal-isolation`；基于 PR #49；设计 commit（代码存档点）`be8e29a`，功能 commit `0279e58`。
- 改动：每帧统计 160-6000Hz 稳定中置信号与 1400-6000Hz 人声存在感，结合更严格的空间中心度和瞬态抑制生成下一帧人声置信度；人声支路只重建中置信号，不再把同频侧声道乐器原样放回。伴奏轨、AI 双轨、升降 Key、麦克风和双 100% 原声旁路未修改。
- 指标：主唱保留约 81.24%，鼓点残留约 9.88%，立体声乐器残留约 15.82%，同频侧声道乐器残留为 0%；低沉男声保留约 98.89%，女声齿音保留约 68.01%。
- 性能：仍只有一套 FFT、一次完整频谱扫描且音频帧内零分配；与 PR #49 同场景基准中位数从 545.9ms 到 548.1ms，约增加 0.4%。
- 验证：`npm run check` 共 104 项全部通过；Electron 使用独立资料和假媒体参数正常启动；未签名 arm64 目录包构建并启动通过。独立审查指出低男声、齿音和测试真实性风险后，均补充专项测试；中置输出是为压低侧声道乐器的有意取舍。GitHub Actions run `29312090491` 中 arm64 27 秒、Intel x64 2 分 10 秒构建通过；`codex-review` 仍因 `/home/runner/.codex/29312090497.json` 缺失失败，与本次代码无关。
- 未验证：仍需用户用 3-5 首真实歌曲试听。人声轨会变为中置，左右分开的和声与混响会被压低；完全居中且频谱接近人声的钢琴、吉他或合成器仍可能残留，需要高质量时使用 AI 分轨。

**2026-07-14：Codex 让 AI 分轨使用 CoreML MLProgram 全图加速。**
- PR：#51；分支：`codex/coreml-provider-verification`；基于 PR #50；功能与基准 commit（代码存档点）`3adb03e`。
- 根因：现有 `audio-separator[cpu]` 实际已经带 CoreML，但默认配置只支持 UVR HQ3 的 151/178 个算子并拆成 28 个分区，剩余计算回落 CPU；`[gpu]` 在 macOS arm64 无安装包，0.44.3 也没有 `--execution_provider` 参数。
- 改动：保留 `[cpu]` 包，通过 Python 启动钩子仅在 `darwin/arm64` 注入 MLProgram、ALL、动态形状和 FastPrediction 配置；建立失败自动回退默认 CoreML，并保留 CPU 兜底。实际 Provider 写入进度与缓存，界面显示 CoreML / CPU。
- 性能：M3 Pro 上 280.58 秒完整歌曲，默认 CoreML 171.13 秒；正式代码第一次 45.46 秒、第二次 37.34 秒，第二次约提速 4.58 倍。90 秒 debug 运行 10.78 秒，日志确认 178/178 个算子全部进入一个 CoreML 分区。
- 音质：完整歌曲人声轨 SDR 约 115dB、伴奏轨约 123dB；无 NaN/Inf；MLProgram 连续两次输出文件完全一致。实时分离算法未修改且原精度测试通过。
- 验证：`npm run check` 共 110 项全部通过；Electron 使用隔离资料与假媒体正常启动；未签名 arm64 目录包通过，`app.asar` 含 MLProgram 与 CPU 回退，不含无效 `[gpu]` 或 CLI 参数。
- 已知警告：CoreML 结束时仍输出一次 E5RT 动态维度警告，但任务状态 0、两轨完整且结果稳定，记录为非阻塞警告。
- 未验证：Intel Mac 真机 AI 分轨、连续 10 分钟温度和电池对比、用户真实歌曲听感。

**2026-07-14：Codex 修复快速切歌与连续拖进度条竞态。**
- PR：#52；分支：`codex/async-playback-race-fixes`；基于 PR #51；切歌 commit（代码存档点）`b7ef456`，进度与 AI 双轨 commit `9bfdcef`。
- 快速切歌：每次开始先暂停并卸载旧源，标题/歌手延后到新 `audio.src` 赋值后更新；连续点击串行处理并合并到最终目标，慢网络也不会出现“显示新歌、播放旧歌”。
- 快速拖动：同一时间只允许一个 seek，后续请求只保留最后目标；旧任务即使过期也恢复自己留下的增益，音频仍在 `seeking` 时不会提前调用播放。
- 恢复保护：进度队列会等待恢复播放 Promise 真正结束；新拖动通过有效性回调永久取消旧播放请求，并独立保存“原本正在播放”的意图，不受内部 `pause` 事件影响。
- AI 双轨：主轨跳转或暂停时先停副轨，保存最终目标；副轨完成自己的旧 seek、追到最终时间后才继续播放，不再反复追赶或短暂播旧位置。
- 验证：新增 12 项竞态测试，`npm run check` 共 122 项全部通过；Electron 独立资料与假媒体启动通过；未签名 arm64 目录包通过，`app.asar` 含最终修复且不含测试脚本。
- 未验证：仍需用户用真实歌曲在实时和 AI 模式各快速拖动 20 次，并快速点下一首 5 次，确认真实听感与最终歌曲一致。

**2026-07-23：Codex 建立 2.0 删除汽水的公开候选分支并完成双架构打包。**
- 分支：`codex/public-release-2.0`，从 PR #56 的 `codex/gesture-playback-stability` 建立；原开发分支未删除汽水。
- 公开版：版本改为 `2.0.0`，产品身份改为 `mineradio` / `com.mineradio.desktop`，关闭 internal beta、匿名遥测、登录凭据手动导入与导出。
- 汽水：删除 `qishui-api.js`、`qishui-audio-decryptor/`、Electron 登录 IPC、本地官方客户端 Cookie 数据库读取、Token/Cookie 粘贴及所有 `/api/qishui/*` 后端路由；UI 不再显示汽水入口。原实现因涉及读取第三方客户端会话、模拟客户端与受保护音频解密，不适合作为公开发行能力。
- 安全：本地服务默认只监听 `127.0.0.1`，外部网页 Origin 实测返回 403；网易/QQ/酷狗会话与 Spotify token 在正式版通过 Electron `safeStorage` 加密保存；生产依赖审计为 0 个已知漏洞。
- 隐私/许可：加入 `PRIVACY.md`、`THIRD_PARTY_NOTICES.md`、MediaPipe Apache 2.0 许可证与 `docs/PUBLIC_RELEASE_2.0_AUDIT.md`；补齐摄像头和麦克风用途说明。
- 验证：全量 JavaScript 语法通过；`npm run check` 131/131；arm64 打包版真实启动并监听 `127.0.0.1:3000`；`app.asar` 无汽水 API、登录桥和解密器。产物为 `Mineradio-2.0.0-arm64.dmg`（SHA-256 `6fb6cecea002db5ee0f6d352c6ea6e217ea62d9302bec9fc4d96c648076fbd6a`）与 `Mineradio-2.0.0-x64.dmg`（SHA-256 `ab97d3b50b20f6ced16031f04ad55176534a8f36ed755a03d4ce4d7575380e73`）。
- 未验证/阻塞：本机 `security find-identity` 为 0 个有效身份，两个 DMG 未签名、未公证；Intel 仅校验二进制为 x86_64，未做真机启动；隐私主体信息和第三方音乐平台授权仍需发布者补齐。

**2026-07-24：Codex 修复 PR #58 唱歌模式不可用与桌面/壁纸掉帧。**
- 分支：`codex/mineradio-2.0-unified`（草稿 PR #58）。
- 唱歌：`setSingingMode` 开/关强制 `rebuildAudioGraphNow()`；`audioGraphHealthy` 识别“需要去人声但 `vocalCutChain` 缺失”；`#singing-control` 抬高 z-index，避免被音量 hover 桥接层挡住。
- 桌面/壁纸：`isDeepBackgroundMode` / `isVisibleBackgroundMode` 在壁纸模式下返回 false，防止 4×4 缓冲与 15fps 后台；暂停后等舞台歌词褪去再计 `IDLE_AFTER_LYRIC_FADE_MS = 3000` 才空闲 2fps 降帧。
- 测试：新增 `test-wallpaper-idle-throttle.js`、`test-singing-mode-graph-rebuild.js`；更新省电测试中“100% 不重建”的过时预期。`npm run check` **163/163**。
- 随后已含 tip 的 arm64/x64 DMG 打到 bobby 桌面（Development 签名，未公证）。

**2026-07-28：落地雨境（节奏雨丝）视觉预设；水膜仍搁置。**
- 分支：`codex/mineradio-2.0-unified`。
- 映射：把 weather-mood 的气象可视化思路改成音频驱动——低频/鼓点控雨量与雨丝粗细，中频控风向，高频+强拍偶发雷闪；**不是水膜，也不另起 Canvas**。
- 接入：复用已下架索引 9；新模块 `public/js/modules/02-visual/18-rain-mood.js`（THREE.Points 对象池 ≤900）；`index-loader` 加载；主循环 `hidePoints` + `updateRainMood(dt)`；预设网格/图标/相机基线；主粒子 shader 9 号分支置空；星河叠层关闭。
- 硬约束：用户确认**水膜共振先不要**。
- 验证：`scripts/test-rain-mood-visual.js` + 更新 beat-unified；`npm run check` **165/165**；`git diff --check` 通过。
- 未验证：真实歌曲听感与壁纸模式下的雨境观感需用户手测。

**2026-07-28：修复音域回响幽灵封面被不透明地形挡住。**
- 现象：用户反馈「专辑唱片图片不能打开了」；代码里功能并未删除——`fx.voxGhostCover` 默认 true，设置 → 动态 → 音域回响 →「封面图」可开关，独立持久化 `mineradio-vox-toggles-v1`。
- 根因：`b8c557e` 把体素地形改成不透明写深度后，远景柱体把 `(110,24,-110)` 的封面平面整块 depth-test 掉；封面材质此前只关了 `depthWrite`，没关 `depthTest`。
- 修复：`16-voxel-echo.js` 幽灵封面 `ShaderMaterial` 加 `depthTest: false`，`renderOrder` 提到 6（在流星/粒子之上画氛围层）。
- 验证：`test-beat-unified-regressions.js` 新增幽灵封面断言；`npm run check` **166/166**。

**2026-07-28：雨境加湿玻璃幽灵封面。**
- 不复用体素 140 大斜面：雨境机位 radius≈7.2，做成居中海报 `5.6×5.6 @ (0, 0.55, -7.2)`。
- 效果：冷调 + 竖向雨痕 UV 扭曲 + 软边/底部溶进黑场；鼓点轻呼吸、随风微偏；约 55% 雨丝落在封面前。
- 管线：复用主 `coverTex` / `uHasCover`；无封面隐藏；切走关平面。层级：暗底 < 封面 < 雨丝 < 闪白。
- 验证：`test-rain-mood-visual.js` 增封面断言；`npm run check` **171/171**。

**2026-07-28：雨境雨量与打雷阈值可调。**
- UI：动态 tab 雨境区顶部加「雨量」「打雷阈值」滑条；`fx.rainAmount` 默认 1.0（0.1–2.5）、`fx.rainThunder` 默认 0.55（0.15–0.95）。
- 驱动：spawn 乘雨量倍率；flash 的 treb/beat/energy 门与随机通过率由 `rainThunder` 控制（低=更易闪）。
- 持久化：写入 `mineradio-rain-toggles-v1` 的 amount/thunder；启动 `loadRainToggles` 恢复。
- 验证：`test-rain-mood-visual.js` 增断言；`npm run check` **171/171**。

**2026-07-28：移除未完成的玻璃水珠原型。**
- 原因：玻璃水珠/屏幕水滴桌面效果观感不合格、当前不可用；用户仍在另线修复，产品线先不带。
- 删除：`public/rain-window.html`（metaball 水珠实验页）、`.claude/launch.json`（仅服务该预览）、雨境注释与交接文档中的水珠条目。
- 保留：雨丝、湿玻璃幽灵封面、雨量/打雷阈值、封面图开关。

**2026-07-28：雨境封面图开关（动态 tab）。**
- UI：`#rain-fx-section` → 动态 tab；仅 `body.rain-on` 显示；`t-rainGhostCover` 与音域回响「封面图」同构。
- 状态：`fx.rainGhostCover` 默认 true；独立持久化 `mineradio-rain-toggles-v1`；启动 `loadRainToggles()`；`toggleFx` 写盘并 toast。
- 显隐：`updateRainMoodCover` 要求有封面且开关未关；切走清 `rain-on`。
- 验证：`test-rain-mood-visual.js` 增开关断言；`npm run check` **171/171**。

**2026-07-28：唱歌模式默认不开麦。**
- 根因：开唱歌模式会走 `syncSingingMicPowerState` → `getUserMedia`，只为可视化跟嗓，不是混音必需。
- 修复：新增 `singingMicEnabled` 默认 false；`singingMicShouldRun` 双门；`setSingingMode(true)` 默认不申请麦、toast 去掉“正在开麦”。
- 验证：更新 power-save / graph-rebuild 测试；`npm run check` **171/171**。

**2026-07-24：Codex 修复 2.0 官方登录回归并完成本机 2.0 交付。**
- PR：#57；分支：`codex/public-release-2.0`。
- 根因：网易、QQ、酷狗官方窗口成功取得会话后，渲染进程仍把 Cookie POST 到公开版已按策略禁用的手动导入接口，稳定返回 403；因此首批 2.0 arm64/x64 候选均表现为扫码成功后无法登录。
- 修复：新增仅供主进程调用的官方登录桥，直接把官方窗口会话交给本地服务校验并经 `safeStorage` 加密保存；渲染进程只收到去敏后的账号状态，不再接触原始 Cookie。公开版手动导入、导出仍关闭，汽水仍删除。
- 界面：公开版隐藏 Cookie 登录模式、手动导入面板和按钮，平台胶囊只标“官方扫码 / 官方窗口 / 官方 OAuth”。
- 并行协作合并：保留远端 `e838282` 的旧明文登录态加密迁移和禁用音源队列保护；安全复核纠正了“无端口 Origin 按服务端口放行”的跨源风险，并要求迁移或落盘失败时拒绝继续使用明文凭据。
- 控制条/歌单架：15 个底部控制按钮恢复 260ms 即时功能说明；3D 歌单架滚动阈值由 `190` 调到中间档 `140`，没有改变上下方向映射。
- 验证：官方登录桥、公开策略、控制提示与歌架方向专项测试及 `npm run check` 共 140 项全部通过；从 `/Applications/Mineradio.app` 实际启动后逐一触发 15/15 个提示成功，运行态向下 `+1`、向上 `-1`，可见界面没有汽水或 `QS`；`git diff --check` 通过。
- 产物：最终 `Mineradio-2.0.0-arm64.dmg` SHA-256 `4585bb944fb8a303e5c43b8e7277832480f880e2c57eb4420d97977f4ef21199`；`Mineradio-2.0.0-x64.dmg` SHA-256 `52de9ccfc45193e3149c0fa43c88c7bbcf24283999c3bdf9c5705c373fef6525`。两份均实际挂载，应用二进制分别为 arm64 / x86_64；两包 `app.asar` 均为 `75658b20f8b9ccfd1ee193a399375e150dc4920aaf0a1063c7fce981176839e2`。
- 本机安装：`/Applications/Mineradio.app` 已替换为 arm64 2.0.0，并与构建版及 DMG 内源码哈希一致。桌面两个旧构建 App 和旧 1.1.3 已移入 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex` 并改为 `.app.backup`，系统只剩一份有效 `Mineradio.app`。最终两份 DMG 位于桌面根目录，文件名没有“公开版”后缀。
- 官网教程：拖入“应用程序”、`xattr -cr /Applications/Mineradio.app` 和“隐私与安全性 → 仍要打开”仍适用；“Intel 与 Apple 芯片同一安装包”不适用于 2.0，官网上线时要改为两个架构入口。
- 未验证：真实网易、QQ、酷狗账号仍需各完成一次人工扫码/登录验收；本轮不读取、不记录任何用户账号凭据。
- Obsidian：当前环境仍没有 `/Users/chy/菜鸡的仓库/菜鸡的仓库/02 知识编译/Mineradio Mac 开发进度.md`，无法同步，待仓库主人侧补记。

**2026-07-24：Codex 移除账号界面不可靠的会员等级标签。**
- 原因：QQ、酷狗等平台的会员字段可能缺失或延迟，真实 SVIP 账号会被界面错误标成“普通”。
- 改动：登录音源卡、右上角账号胶囊、账号详情和登录状态文案均不再显示“普通 / VIP / SVIP / Premium / Free”；QQ 的“同步会员”入口统一为正常的“刷新状态”。
- 边界：`providerVipLevel`、`hasProviderVip`、`hasProviderSvip` 等后台能力判断仍保留，音质和受限歌曲播放逻辑未删除。
- 验证：新增 `scripts/test-account-tier-display.js`；`npm run check` 共 142 项通过。Electron 隔离状态分别模拟普通、VIP、SVIP，三种状态均无等级徽标或等级文字，卡片四列布局正常。

**2026-07-29：云瀑共振官网结构对齐与开场尺寸校准。**
- 移除独立 `topRain` 顶部包络线。顶部高低峰现在只由基础雨链、暴雨雨链和细丝的实际高度共同构成，避免出现脱离雨幕的“波形线”。
- 25 点横向雨势直接采样真实 `frequencyData` 的 25 段频谱，并做轻度时间平滑；旋律换音会改变峰谷横向位置，不再用固定正弦波伪造旋律。
- 新增 `768×384` 双 RenderTarget 高度场。雨链落水会把冲击写入高度场，水面读取高度和梯度生成可衰减的涟漪、暗色浅水反射、Fresnel 与局部镜面高光；资源在切换预设时释放，目标创建失败时仍可回退旧水面。
- 开场基础珍珠缩放到 `0.62`，瀑布珠缩放到 `0.56`，保留原有音频能量驱动的增长，让静态/低能量时雨景更细密而非大颗粒。
- 验证：专项 `scripts/test-rainfall-resonance.js` 13/13、`node --check public/js/modules/02-visual/20-rainfall-resonance.js`、`npm run check` 189/189 通过。未验证：需在 Electron 中选择预设 11 并播放旋律和鼓点明显的歌曲，人工确认水面透视、峰谷跟随与控件即时响应。[来源: `public/js/modules/02-visual/20-rainfall-resonance.js`、`scripts/test-rainfall-resonance.js`，2026-07-29]

**2026-07-24：Codex 修复音质切换卡死、歌词残影和控制按钮拥挤。**
- 根因：音质选择复用 `playQueueAt` 完整切歌，每次点击都提前清空当前音频并并发重建播放状态；QQ 自动降级又递归进入同一路径，造成令牌互相取消、`0:00`、多张通知和歌词舞台重复生成。
- 修复：新增同曲原地换流队列，当前与最后一次选择串行执行；新地址可用前保留旧流，新流失败恢复旧地址与原时间。换流不再调用 `playQueueAt`，不重建歌词、歌架、封面、喜欢状态或听歌会话；音质通知使用 `quality-switch` 单卡替换。
- 布局：底栏音质胶囊最小宽度 `64px`，桌面全屏容器宽 `66px`，与红心按钮固定留白。
- 验证：新增 `scripts/test-quality-switch-stability.js`，`npm run check` 146/146；Electron 隔离运行快速选择 `Hi-Res → 320k → 128k` 时只请求当前与最终两次，旧流保持到最终流可用，时间保留在 `57s`，歌词重建 0 次、歌词节点数不变、通知 1 张、状态锁释放，音质与红心实际间距为 `13–20px`。
- 产物：最终 `Mineradio-2.0.0-arm64.dmg` SHA-256 `af0c5dd2ee849e3fb6670bbbb67d413b046ba9e79cb4d8b0674fdead9109bd3b`；`Mineradio-2.0.0-x64.dmg` SHA-256 `448dad83ddb47fcab65a86bcf618d1a77acb307d8c7f4ae44ec6ab6283371588`；两包和 `/Applications/Mineradio.app` 的 `app.asar` 均为 `7fc71506f0dfc60bd76ed0702d200230380540a0f1e8ee7b3b4d0a450884c953`。DMG 均已挂载，包含 `Mineradio.app` 与 `/Applications` 快捷方式；安装版 Electron 运行验收无 Runtime error。

**2026-07-24：Codex 融合 Mineradio_Beat 稳定性改动并修复 QQ“我喜欢”空列表。**
- 工作分支：`codex/mineradio-2.0-unified`，以 `codex/public-release-2.0` 的音质切换修复顶端 `4a4d076` 为基线；不覆盖 `/Users/allenli/Desktop/Mineradio_Beat` 的本地未提交改动。
- Beat 融合：保留 QQ 播放密钥续期、CDN 404/403 判废、受限歌曲跳过无效音质重试、自动换源/整队风暴上限、代理断开释放、等功率交叉淡入、内存保护、音频欠载防护、体素自定义背景透明适配。
- 手势：双手推拉的距离与连线从掌心改为两只手的捏合中点，滤波响应适度提高；相机仍为 320×240、30FPS Worker 管线，上下滑动方向没有修改。
- QQ“我喜欢”根因：`fcg_musiclist_getmyfav.fcg` 的 `map` / `mapmid` 是“歌曲标识作为对象键”的集合，旧代码把对象转成 `[object Object]`，并错误按位置配对数字 ID 与 MID。现直接读取对象键，只用 MID 拉详情。
- 真实登录状态只读验证：QQ 登录及播放密钥正常，歌单卡片显示 22 首，详情接口返回 22/22 首且每首都有名称和 MID；测试过程不打印 Cookie。
- 发布边界：汽水继续禁用且后端实现不进入包；“水膜共振”已从本次发布完全撤下。**2026-07-28 用户再次确认：水膜共振先不要**——不恢复、不打磨、不排期，除非用户当场点名。本地 Cookie/Token/Provider 文件加入 `.gitignore`。
- 播放竞态追加修复：`HTMLMediaElement.currentSrc` 在刚写入新 `src` 后仍可能返回上一首，旧实现因此会把有效的新请求判为过期并清空。播放请求、重试和进度恢复的身份比较统一改为优先读取 `media.src`；真实 QQ 登录状态下在“那天下雨了”和“我知道”之间交替快速切换 12 次，12/12 次进入播放。
- 发布界面：负载监视器删除“手势 / 推理 xx ms @ xx/s”开发诊断行；没有改变用户确认过的歌单结构与上下滑动方向。
- 成功播放视觉回归：成功路径原先调用 `switchPlaybackVisualToEmily()` 强制跳到保存的播放预设，而拿不到音频地址的失败路径没有执行，因此同一界面会因播放成功/失败呈现两套样式。现在只退出首页预览并保留当前视觉，不再在播放成功时擅自切换预设。
- 最终验证：`npm run check` 158/158；安装版 QQ 登录有效，“我喜欢”22/22 首；“我知道 / 当你”交替快速切换 12/12 次启动，测试预设保持在选择值 `0` 而未跳到强制值 `2`；负载栏无手势推理行，汽水和水膜均不可见。壁纸模式窗口实测从普通 `1470×923 @ (0,33)` 扩展到完整显示器 `1470×956 @ (0,0)`，退出后恢复普通窗口。
- 最终产物：`Mineradio-2.0.0-arm64.dmg` SHA-256 `1c5bbf88b0f99b9bbf15993b11fab10c7ff4b37c1ac3823557559459ad151117`；`Mineradio-2.0.0-x64.dmg` SHA-256 `3f9a02deec3f2746968599cf6cbbd05ab6afcf957c591457151ae5c79c354488`；两包和 `/Applications/Mineradio.app` 的 `app.asar` 均为 `7192f2c0af235f510c1c3b7fade88dce6df80058687e1ffb44f44de7c29b7477`。两份 DMG 均实际挂载并含 `Mineradio.app` 与 `/Applications` 快捷方式，二进制分别为 arm64 / x86_64。

**2026-07-29：云瀑共振湖面与歌词构图修复。**
- 用户截图中的底部白色点阵来自独立水花粒子与线段涟漪层，不是高度场水面。两层现已移除，雨链撞击只写入 `768×384` 高度场，连续湖面根据高度梯度显示暗水、细波、反射、Fresnel 与局部高光。
- 湖面材质改用低频 `lakeSheen`，去除高密度雨幕反射条纹，底部不再呈现白色粒子带。
- 新增 `RAINFORM_DEFAULT_STAGE_SCALE = 1.42`。云瀑默认采用局部构图，不再完整展示整个瀑布；每帧读取 `fx.lyricScale`，云瀑组平滑跟随“歌词大小”缩放，歌词自身位置、字体和动画保持原逻辑。
- 验证：专项 `scripts/test-rainfall-resonance.js` 14/14、`node --check public/js/modules/02-visual/20-rainfall-resonance.js`、`npm run check` 190/190 通过；`npm start` 已启动本地 Electron 服务，无启动错误。未验证：需要用户在真实歌曲中确认湖面亮度与默认局部裁切是否符合观感。[来源: `public/js/modules/02-visual/20-rainfall-resonance.js`、`scripts/test-rainfall-resonance.js`，2026-07-29]
