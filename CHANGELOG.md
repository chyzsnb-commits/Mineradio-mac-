# Changelog

## 待发布（基于 v1.1.3 基线的优化）

### 内存按钮防“噗”声（Codex）

- 修复内存面板三个按钮（“压缩播放器 / 系统释放 / 提权释放”）在播放时可能触发喇叭“噗”声的问题。
- 主进程清理内存前不再模拟点击播放/暂停，而是让渲染进程短暂淡出并静音，清理完成后恢复原音量和静音状态。
- 新增 `scripts/check-memory-audio-guard.js`，并接入 `npm run check`，防止以后又改回播放/暂停式清理。

### 图标瘦身 + DMG 视觉确认（issue #4、#5）

- `build/icon.icns`：851KB → **568KB**（省 33%），无损重压缩所有 PNG entry，视觉零差异。
- `build/icon.png`：426KB → **272KB**（省 36%），同上。
- 做法说明：用 `iconutil` 拆 icns 成 iconset，对每个 PNG 用 PIL 无损重压缩（`optimize=True, compress_level=9`），手动重新组装 icns（绕过 iconutil 的强制重压缩）。保留了全部 11 个尺寸 entry（含 1024×1024），没有删任何分辨率。
- DMG 视觉包装（背景图 `.background.tiff`、卷图标 `.VolumeIcon.icns`）由 electron-builder 自动生成，已在构建中确认。
- `.omc` 垃圾文件问题已从架构上解决：`build.files` 用白名单模式（只列指定文件），`.omc` 不会被打包；`.gitignore` 也已排除。

### Mac 跳过 Windows 内存清理模块（issue #2）

- `desktop/main.js`：`require('./system-memory')` 改为按平台判断——Mac 上不加载真实模块，用 stub 替代（所有方法返回 `mac-unsupported`）。
- Windows 上照常加载真实模块，功能不受影响。
- 好处：Mac 上不再把 760 行 Windows 死代码（PowerShell + Win32 API）读进主进程；内存相关 IPC 在 Mac 上优雅降级，不报错。

### 补漏：qishui-api.js 未入库

- 修复基线入库时漏拷 `qishui-api.js` 的问题（main.js `require('../qishui-api')` 会报 `Cannot find module`，app 无法启动）。

### 遥测改为 opt-in（issue #1）

- `desktop/telemetry.js` 重写：
  - **正式版**（`mineradio.internalBeta` 非 true）：完全不启动，不发任何网络请求。
  - **测试版**：首启弹窗询问用户是否允许匿名统计。同意后每次启动上报一次（仅随机 id + 版本号），不再每 5 分钟轮询。
  - 用户偏好持久化在 `userData/telemetry-consent`（`accepted`/`declined`）。
  - 移除了原 `setInterval(ping, 5 * 60 * 1000)` 固定间隔定时器。

## v1.1.3（内部测试版基线 — 2026-07-12 入库）

> 本版本是从 `Mineradio-1.1.3-arm64.dmg` 提取并入库的内部测试版。相对于 v1.1.0 正式版，新增了多音源、手势、壁纸、遥测等功能，但也引入了若干待优化项（见 GitHub Issues）。

### 相对 v1.1.0 新增（功能层）

- 新增音源模块：`kugou-api.js`、`qishui-api.js`、`qq-qrc.js`、`spotify-api.js`、`qishui-audio-decryptor/`。
- 新增桌面手势识别：`desktop/native/handpose/`（Swift helper）。
- 新增壁纸播放模式：`desktop/wallpaper-mode.js`、`desktop/native/mac-wallpaper-window.node`。
- 新增匿名用量遥测：`desktop/telemetry.js`（启动 8 秒后 + 每 5 分钟上报，待优化为 opt-in）。
- 新增 Windows 系统内存清理：`desktop/system-memory.js`、`desktop/app-memory.js`（Mac 上为死代码）。
- 前端结构重构：`public/js/`（gesture-worker、index-loader、modules/）、`public/css/`。
- 图标重做：`build/icon.icns`（227KB → 851KB）、`build/icon.png`（28KB → 426KB）。

### 待优化项（已立 issue）

1. `telemetry.js` 改为 opt-in（默认关闭）。
2. Mac 上跳过 `system-memory.js` 加载。
3. 清理 `build/.omc/` 缓存、重做 DMG 视觉包装（对齐 v1.1.0）。
4. 图标瘦身（icns 从 851KB 优化）。
5. 正式版恢复自动更新通道（指向公开发布仓库）。
6. `desktop/main.js` 主进程瘦身评估（3870 行）。

### 构建配置（本次入库补齐）

- DMG 原始包无完整构建配置（仅运行时目录）。已补齐 `package.json` 的 `scripts`/`build`/`devDependencies`。
- Electron 42.4.1，electron-builder ^26，macOS arm64 dmg，最低系统 12.0。

## v1.1.0（正式版参考基线）

- 纯净正式版，体积 126MB，main.js 1958 行，server.js 4795 行。
- 有自动更新（provider=github，指向 XxHuberrr/Mineradio）。
- DMG 有完整视觉包装（背景图、卷图标、布局）。
- 无遥测、无平台死代码。
- 本次工作流的优化方向即"照着 v1.1.0 的克制改 v1.1.3"。
