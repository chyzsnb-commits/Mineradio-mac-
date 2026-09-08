# Cuefield 智能无缝混音与 Dashboard Lite 设计规格

## 背景

Windows 版 Mineradio 的 Cuefield 提供基于节拍、段落和能量的智能无缝混音，首页 Dashboard 聚合继续播放、队列和推荐内容。本规格将其中可在 macOS 渲染进程安全运行的子集同步到 Mac 2.0 播放线，同时保留现有播放链路、歌词状态、音源回退和现有首页。

## 目标

1. 增加一个默认关闭的“智能无缝混音”偏好开关。
2. 开启后，在可获得分析信息的普通歌曲切换中选择合适的已有淡入淡出策略；分析失败或运行时异常立即回退原逻辑。
3. 增加 Dashboard Lite 数据层和入口，展示继续播放、接下来播放和为你推荐；不替换现有首页构图。
4. 只使用现有 macOS/浏览器能力和已存在的播放、队列、天气推荐、最近播放 API。

## 非目标与平台边界

- 不移植 Wallpaper Engine、Windows API、PowerShell、DWM 或自动更新。汽水内部实验能力在用户 2026-07-31 明确要求后另行恢复，仍限 macOS 私有 PR 线。
- 不加入 MP4 Hero、常驻高耗能动画、自动更新或新的网络音源。
- 不改预设 9 的玻璃水珠，不改变预设 11 的云瀑视觉。
- 智能混音关闭时，`playQueueAt` 的现有行为、歌词预取/重置、音源回退、专辑无缝逻辑必须保持不变。

## 设计

### Cuefield Lite

新增独立前端模块 `public/js/modules/05-playback/16-cuefield-automix-core.js`，只负责纯函数和轻量状态：

- `cuefieldAutomixEnabled` 从 `localStorage` 读取，默认 `false`。
- `cuefieldBuildPlan(previousSong, nextSong, analysis)` 根据 BPM、段落标签、能量和剩余时长返回 `direct`、`crossfade` 或 `gapless` 方案及持续时间。
- 分析输入仅接受现有 `currentBeatMap`、`currentDjBeatMap` 或歌曲元数据中的 BPM/能量；没有分析时返回 `direct`。
- 方案有明确上限（最多使用现有 `AUDIO_CROSSFADE_MS`，不延长网络预载时间），不创建第二条音频输出链。

新增 `public/js/modules/05-playback/17-cuefield-timeline-executor.js`，只在切歌边界调用现有函数：

- 复用 `crossfadeActiveNow`、`startAlbumGaplessMix`、`playQueueAt` 和现有预载对象。
- 只允许当前 token、队列索引和音源 URL 同时匹配时执行；任何竞态、`play()` 拒绝或预载失效都调用普通 `playQueueAt`。
- 不改歌词位置、字体、动画或 `resetLyricsForTrackSwitch` 的时序。

新增 `public/js/modules/05-playback/18-cuefield-automix-integration.js`，负责开关 UI、偏好持久化和向播放入口提供只读决策。默认关闭；关闭、播客、本地文件、质量切换、启动恢复、音源回退和内存不足时直接走现有路径。

### Dashboard Lite

新增 `public/js/modules/05-playback/19-home-dashboard-lite.js`：

- 从 `listenStatsState.history` 和 `homeListenSummary()` 构造“继续播放”。
- 从 `playQueue/currentIdx` 构造“接下来播放”，最多显示 5 项，点击沿用 `playQueueAt`。
- 从已加载的 `homeDiscoverState.songs`、天气推荐和已登录音源推荐组构造“为你推荐”；不额外请求接口。
- 以小型可折叠面板挂入现有 `empty-home`，没有数据时隐藏或显示现有空态，不覆盖当前首页卡片。
- 点击卡片只调用现有播放/队列函数，不改变当前首页的登录和导入入口。

## 数据与错误处理

- 所有新状态均为渲染进程内存状态，偏好仅写入单个 localStorage key。
- 规划器必须是无副作用、可在 Node 测试中运行的纯函数。
- 执行器捕获同步异常和 Promise rejection；回退时保留原 `opts` 中的 `resumeAt`、`preserveHomeState`、`suppressPlayFailureNotice`。
- Dashboard 对缺失字段、空队列、未登录和推荐加载失败采用空数组，不阻断主播放。

## 测试契约（先写失败测试）

新增 `scripts/test-cuefield-dashboard-lite.js`，覆盖：

1. 默认开关关闭，写入/读取偏好可恢复。
2. 高能量同节拍歌曲选择交叉淡入；无 BPM 或跨播客/本地歌曲选择 `direct`。
3. token、索引或 URL 不匹配时执行器不混音并回退普通播放。
4. 淡入淡出时不调用歌词重置函数，且保留恢复参数。
5. Dashboard 正确生成继续播放、接下来播放和推荐三组，空数据不会抛错。
6. 现有首页节点仍存在，模块加载顺序正确。

验证命令：

```bash
node --test scripts/test-cuefield-dashboard-lite.js
npm run check
```

## 验收标准

- 不开启开关时现有播放回归测试全部通过。
- 开启后可在两首可分析歌曲间听到已有淡入/无缝效果；分析失败能自动恢复普通切歌。
- Dashboard Lite 只在首页显示，不影响搜索、歌单、桌面歌词、预设 9/11 和 macOS 壁纸模式。
- 不新增 Windows-only require、自动更新入口或外部 Wallpaper Engine 依赖。
