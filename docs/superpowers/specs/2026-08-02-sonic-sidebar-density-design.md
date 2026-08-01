# 音域回响侧栏唤醒与全局界面密度设计

## TL;DR

预设 10「音域回响」当前同时隐藏了右侧 3D 歌架、把左侧歌单/队列迁进视觉控制台，并继续调用已经不存在的 `playlist` 控制台页，因此左右两侧都无法按其他预设的方式唤醒。本设计让预设 10、12、13 与其他预设共用独立的左侧队列面板和右侧 3D 歌架，再增加跨所有预设持久化的“标准 / 极简”界面密度开关；极简只改变间距、宽度和视觉占用，不删除播放、队列、歌单或视觉控制台功能。

## 问题与根因

1. `public/js/modules/04-shelf/01-manager-core.js` 用 `voxelCityActive()` 将预设 10 的 3D 歌架设为不可见。
2. `public/js/modules/02-visual/16-voxel-echo.js` 将共享的 `#playlist-panel` 迁进 FX 控制台的 `shelf` 页，导致左侧边缘不再有独立面板。
3. `public/js/modules/07-fx/07-bindings-shelf-immersive.js` 仍把歌架按钮路由到旧的 `playlist` 页；新控制台只有 `shelf` 页，点击后没有有效目标。
4. 预设切换后这些状态同时生效，于是左侧待播放栏和右侧歌架都无法按常规边缘唤醒。

## 方案决策

### 1. 统一侧栏归属

- `#playlist-panel` 始终保留在主页面根层，继续使用现有左侧 edge trigger、`peek`、`show` 和 pin 逻辑。
- 体素预设不再把它迁入 FX 控制台；历史运行时若已经存在旧宿主，切换时安全恢复原父节点。
- 预设 10 不再抑制右侧 3D 歌架；`shelfHardHidden`、`shelfPinnedOpen` 和右侧热区继续由既有通用逻辑控制。
- 删除/覆盖体素专属的右侧 2D 歌单定位规则，避免与通用左侧面板重复定位。

### 2. 兼容旧控制台页名

- `setFxPanelTab('playlist')` 在统一入口处归一化为 `shelf`，兼容旧版本存档、快捷键和旧模块调用。
- 新代码只使用 `shelf`；控制台页面仍不在「动效」页渲染歌单。

### 3. 全局界面密度

- 新增独立于 `fx.preset` 和用户存档的 `uiDensityMode`，取值为 `standard` 或 `minimal`。
- 设置入口放在 FX 控制台「界面」页，使用互斥分段按钮；默认 `standard`，写入 `localStorage` 的 `mineradio-ui-density-v1`。
- `standard` 保留现有桌面布局。
- `minimal` 仅收紧搜索区、FX 控制台、左右歌单面板、底部播放器的内边距、宽度和间距；不使用 `display:none` 删除任何队列、歌单、控制台或唤醒入口。
- 两种模式对所有视觉预设生效，切换时立即同步 DOM class、控件状态和保存值；预设切换不覆盖用户选择。

## 数据流与交互

1. 启动时读取 `mineradio-ui-density-v1`，非法值回退 `standard`。
2. `applyUiDensityMode()` 在 `document.documentElement` 和 `body` 切换 `ui-density-standard` / `ui-density-minimal` class，并刷新分段按钮。
3. 用户点击分段按钮后立即应用、持久化并提示当前模式；不触碰 `fx.preset`、播放队列或视觉参数存档。
4. 预设切换只刷新预设专属动效组和歌架/歌单运行状态，不重置界面密度。
5. 左侧队列由 `setPeek(..., 'pl')` 和 `togglePlaylistPanel()` 控制；右侧歌架由 `shelfHoverCue`、`setShelfPinnedOpen()` 和底栏歌架按钮控制；两条路径互不复用 DOM 宿主。

## 错误处理与兼容

- `localStorage` 不可用时只在内存使用 `standard`，不阻塞播放和预设切换。
- 旧 `playlist` tab 名称一律归一化，不因旧存档导致控制台空白。
- 体素预设退出时若发现旧 `vox-playlist-host`，先恢复 `#playlist-panel` 的原父节点和兄弟位置，再移除宿主。
- 任何侧栏数据为空时保留唤醒入口和空状态文案，不能因为无队列/未登录而把边缘命中区永久禁用。

## 测试与验收

### 自动化

- 新增专项回归：
  - 预设 0、9、10、11、12、13 的左右侧栏均保留通用唤醒路径。
  - 预设 10 不再把 `#playlist-panel` 迁入 FX 控制台，也不再隐藏右侧歌架。
  - `playlist` 旧页名归一化到 `shelf`。
  - `standard/minimal` 的读取、非法值回退、DOM class、持久化和按钮同步。
- `npm run check` 全量通过。

### Electron 实机

- 在预设 0、10、12、13 分别打开/关闭左侧队列和右侧歌架，确认边缘唤醒、pin、滚动和关闭均有效。
- 在标准与极简之间切换，确认 FX 控制台、队列、歌单、底栏仍能通过按钮或边缘唤醒。
- 窗口尺寸覆盖 `1440×900`、`998×1098`、`998×700`、`760×850`；确认无侧栏遮挡歌词、底栏或视觉控制台。

## 范围约束

- 不修改 Three.js 音域渲染、音频分析、登录、汽水、雨境玻璃水珠和 Windows 专属死代码。
- 不改变预设索引、用户存档格式或播放队列数据。
- 本批通过独立 PR 线交付，不更新 main，不强推旧 PR。
