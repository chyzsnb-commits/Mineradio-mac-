# Changelog

## 待发布（基于 v1.1.3 基线的优化）

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
