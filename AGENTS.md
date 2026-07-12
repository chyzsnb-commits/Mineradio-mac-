# Mineradio Project Rules (macOS / arm64)

> 这是给所有 AI agent（Codex、ZCode、以及未来的接手者）的项目规则文件。**新对话开始处理 Mineradio 前，先读本文件和 `AI_HANDOFF.md`。**

---

## ⭐ 置顶规则（每次必须遵守，不可遗忘）

以下规则由用户（仓库主人）亲自确认，优先级最高：

### 1. 沟通
- **默认中文沟通**，语气直接、偏实干。希望主动完成任务，不要只给方案。
- **用英文技术词时必须顺手解释中文**：commit（存档点）/ branch（分支）/ PR（合并请求）/ issue（任务单）/ repo（仓库）/ main（主分支/正本）/ merge（合并）/ rollback（回滚）/ diff（改动差异）/ CI（自动检查）。

### 2. 网络
- **本机走代理 `127.0.0.1:7897` 上 GitHub**。git push/clone/fetch 走这个代理。如果 git 操作卡住，确认 `git config --global http.proxy` 是否为 `http://127.0.0.1:7897`。
- 如果代理也不通，改用 gh API（api.github.com）操作（创建分支/推送文件/开 PR）。

### 3. 必须同步 Obsidian（重要！）
- **每次完成任务后，必须更新 Obsidian 笔记**，不能只改代码不记笔记。
- Obsidian 仓库路径：`/Users/chy/菜鸡的仓库/菜鸡的仓库`
- Mac 开发进度笔记：`02 知识编译/Mineradio Mac 开发进度.md`
- 更新内容：把成果追加到「已完成的优化」表格 + 更新「待办」清单 + 如有重要发现加一段说明。

### 4. 必须更新 AI_HANDOFF.md
- 每次完成任务后，更新 `AI_HANDOFF.md` 的工作日志和待办清单，让下一个接手的 AI 知道最新状态。

### 5. 分支和 PR 规则
- **不要直接改 main**。所有改动新建分支（`codex/任务名`、`glm/任务名`），开 PR（合并请求），等审查后合并。
- PR 描述四要素：变更（改了什么）/ 验证（怎么确认没问题）/ 未验证（哪些没测到）/ 是否需要用户手动操作。
- commit（存档点）信息用中文，清楚说明改了什么。一任务可以多个小 commit，方便回滚。

### 6. 协作者
- 仓库有真人协作者（不只是 AI）。协作者也走 PR 流程（开 PR → 仓库主人审查 → 合并）。协作者的操作说明见 `COLLABORATOR_QUICKSTART.md`。
- 仓库主人（用户）会审查所有 PR 后才合并。AI 开的 PR 同样等用户点头。

### 7. 功能约束
- **不要自动更新功能**（Mac 版从 Windows 迁移，不需要 electron-updater）。
- 仓库是**私有**的，不能开源。`chyzsnb-commits/Mineradio-mac-` 是独立开源仓库，**绝对不要碰**。

---

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
4. **不要自动更新**：本软件从 Windows 迁移而来，**Mac 版不需要自动更新功能**。`package.json` 不含 `build.publish`；`build:mac` 脚本构建后会删除 `latest-mac.yml`（electron-builder 默认会生成它，但这是 electron-updater 用的，不要）。`mineradio.update.disabled` 保持 `true`（server.js 里有历史更新逻辑会读它，保持禁用即可，不要删该字段以免 server.js 报错）。用户升级 = 手动下载新 dmg 覆盖安装。
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

1. 确认 `package.json` 的 `version`、`mineradio.internalBeta`、`build.appId` 符合本次发布类型（正式 vs 测试）。**不含 `build.publish`**（Mac 版不自动更新）。
2. 更新 `CHANGELOG.md` 顶部。
3. `npm run check`。
4. `npm run build:mac` → 产出 `dist/Mineradio-<ver>-arm64.dmg`（脚本会自动删除 `latest-mac.yml`）。
5. CI（`.github/workflows/build-mac.yml`）在打 tag `v*` 时自动构建，把 dmg 上传到本仓库 Release（供手动下载，无自动更新通道）。
   - **测试版** → pre-release。
   - **正式版** → latest release。
6. 用户升级方式：手动从 Release 下载新 dmg 覆盖安装。

## 单仓库架构（私有）

- **`chyzsnb-commits/mr`（私有，本仓库）**：源码 + CI + 所有版本发布（测试版和正式版都发这里）。所有开发、Codex 协作都在这里。
- **正式版用户自动更新**：因本仓库私有，用户端 electron-updater 拉取 Release 资产需要授权 token。无 token 时用户需手动从 Release 下载 dmg。
- ⚠️ `chyzsnb-commits/Mineradio-mac-` 是**独立的开源仓库，不属于本项目工作流，不要碰**。

## 与 Codex 协作

- 任务通过 **GitHub Issue** 交接（用 `.github/ISSUE_TEMPLATE/` 里的模板）。在 issue 评论 `@codex` 即可让 Codex Cloud 接任务。
- Codex 读本文件（`AGENTS.md`）获取项目规则，读 `AI_HANDOFF.md` 获取当前状态。
- PR 审查：`.github/workflows/codex-review.yml` 配置了 `openai/codex-action` 自动 review。
