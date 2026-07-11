# Mineradio Project Rules (macOS / arm64)

> 这是给所有 AI agent（Codex、ZCode、以及未来的接手者）的项目规则文件。**新对话开始处理 Mineradio 前，先读本文件和 `AI_HANDOFF.md`。**

## Project Identity

Mineradio 是一个 **macOS arm64** 的 Electron 桌面音乐播放器。核心体验：搜索、播放、歌单、歌词舞台、粒子视觉、3D 歌单架、桌面歌词、壁纸模式。

- 平台：**macOS（Apple Silicon, arm64）**。当前构建产物是 `.dmg`。
- 框架：Electron **42.4.1** + electron-builder **^26**。
- **不是 Windows 项目**。仓库里有少量 Windows 历史代码（`desktop/system-memory.js` 的 PowerShell 部分、`build/after-pack.js` 的 rcedit），它们在 Mac 上是死代码，**不要删除但要理解它们不生效**。

## Repository Layout

```text
├─ desktop/                    Electron 主进程、preload、系统集成
│  ├─ main.js                  主进程入口（~3870 行，含窗口/IPC/快捷键/壁纸/内存）
│  ├─ preload.js               渲染进程预加载
│  ├─ overlay-preload.js       桌面歌词覆盖层 preload
│  ├─ wallpaper-control-preload.js
│  ├─ telemetry.js             ⚠️ 匿名用量上报（测试版独有，待优化为 opt-in）
│  ├─ system-memory.js         ⚠️ Windows 内存清理（Mac 上死代码，待跳过加载）
│  ├─ app-memory.js            应用内存管理
│  ├─ wallpaper-mode.js        壁纸播放模式
│  └─ native/                  Mac 原生模块（handpose Swift、mac-wallpaper-window.node）
├─ public/                     前端（渲染进程）
│  ├─ index.html               主 UI
│  ├─ desktop-lyrics.html      桌面歌词
│  ├─ wallpaper.html / wallpaper-control.html / wallpaper-splash.html
│  ├─ js/                      前端模块（gesture-worker、index-loader、modules/、preload-mode）
│  ├─ css/index.css
│  ├─ assets/                  模型/资源（如 skull-decimation-points.bin）
│  └─ vendor/                  本地第三方依赖
├─ build/                      electron-builder 构建资源
│  ├─ icon.icns / icon.ico / icon.png
│  ├─ after-pack.js            打包后钩子（Windows 用，Mac 上 no-op）
│  └─ installer*.nsh           NSIS 安装器脚本（Windows 用）
├─ server.js                   本地 API 服务（~6485 行，音源代理/搜索/首页数据）
├─ dj-analyzer.js              节奏/音频分析
├─ kugou-api.js                酷狗音源
├─ qishui-api.js               汽水音源
├─ qq-qrc.js                   QQ 音乐 QRC 歌词
├─ spotify-api.js              Spotify 音源
├─ qishui-audio-decryptor/     汽水音频解密
├─ package.json                版本、构建配置（electron-builder config 在 build 字段）
└─ CHANGELOG.md / AI_HANDOFF.md / docs/
```

## Commands

```bash
npm install                  # 安装依赖（含 devDependencies: electron, electron-builder）
npm start                    # 本地运行（electron .）
npm run check                # 语法检查 server.js + desktop/main.js
npm run build:mac:dir        # 仅解包到 dist/（快速验证打包，不造 dmg）
npm run build:mac            # 产出 dist/Mineradio-<ver>-arm64.dmg
```

**改动后必做的验证（没有自动测试套件）：**

```bash
node --check server.js
node --check desktop/main.js
npm run check
```

然后用 `npm start` 实际运行，检查关键交互（搜索、播放、歌词、粒子）。

## Coding Conventions

- **语言**：纯 JavaScript（CommonJS，`require/module.exports`），**不用 TypeScript**。
- **前端**：原生 HTML/CSS/JS，`public/index.html` 是主入口，体量很大，改前先用 `rg` 定位。
- **沟通**：CHANGELOG、注释、面向用户的文案优先用中文。
- **提交信息**：中文为主，清楚描述改了什么、为什么。

## 关键约束（做任何改动前必读）

这些是从 1.1.0 vs 1.1.3 对比分析得出的、待落地的优化方向。**不要在正式版里保留测试版特性**：

1. **`telemetry.js`**：1.1.3 里每 5 分钟强制上报。正式版必须改为 **opt-in**（首启询问，默认关闭），测试版可保留。
2. **`system-memory.js`**：Windows 专用。Mac 上应 **完全跳过 require**，不要让它的状态机常驻主进程。
3. **`internalBeta` 标记**（package.json `mineradio.internalBeta`）：**只在测试版构建时为 true**。正式版必须 false，且 `appId` 用 `com.mineradio.desktop` 而非 `com.mineradio.beat.internal`。
4. **自动更新**：`mineradio.update.provider` 在正式版应为 `github`（指向公开发布仓库 `chyzsnb-commits/Mineradio-mac-`），测试版才是 `none`/`disabled`。
5. **不要提交** `build/.omc/`（工具缓存）、`node_modules/`、`dist/`。已在 `.gitignore`。

## Review Guidelines

Codex / reviewer 审 PR 时检查：

- 改动是否影响 Mac 运行（Windows 代码改动在 Mac 上是否仍安全跳过）。
- 是否误删了 `package.json` 里的 `mineradio` 自定义字段（运行时逻辑依赖它）。
- 新增的 `require` 是否引入了 Mac 上不必要的模块加载。
- 是否有新的网络请求/定时器（评估对启动和常驻开销的影响）。
- CHANGELOG.md 是否更新（中文，写在顶部）。
- `node --check` 是否通过。

## Release Workflow

1. 确认 `package.json` 的 `version`、`mineradio.internalBeta`、`build.appId`、`build.publish` 符合本次发布类型（正式 vs 测试）。
2. 更新 `CHANGELOG.md` 顶部。
3. `npm run check`。
4. `npm run build:mac` → 产出 `dist/Mineradio-<ver>-arm64.dmg`。
5. CI（`.github/workflows/build-mac.yml`）在打 tag `v*` 时自动构建并发布到 Release。
   - **测试版** → 本仓库（`chyzsnb-commits/mr`，私有）的 pre-release。
   - **正式版** → 同步到 `chyzsnb-commits/Mineradio-mac-`（公开）的 latest release，供用户自动更新。

## 双仓库架构（A 方案）

- **`chyzsnb-commits/mr`（私有，本仓库）**：源码 + CI + 测试版发布。所有开发、Codex 协作都在这里。
- **`chyzsnb-commits/Mineradio-mac-`（公开）**：只放正式版 Release 资产（dmg + latest-mac.yml），不放源码。用户端从这里拉自动更新。

这样实现"源码私密开发 + 正式版能联网自动更新"。

## 与 Codex 协作

- 任务通过 **GitHub Issue** 交接（用 `.github/ISSUE_TEMPLATE/` 里的模板）。在 issue 评论 `@codex` 即可让 Codex Cloud 接任务。
- Codex 读本文件（`AGENTS.md`）获取项目规则，读 `AI_HANDOFF.md` 获取当前状态。
- PR 审查：`.github/workflows/codex-review.yml` 配置了 `openai/codex-action` 自动 review。
