# Mineradio AI Handoff

> 这个文件是给后续接手的 AI agent（Codex / ZCode / 其他）看的。**每次完成任务后更新「工作日志」和「下一步」，让下一位能快速接上。**

## 当前权威入口（2026-07-12）

- **本仓库**：`chyzsnb-commits/mr`（**私有**，源码 + CI + 测试版 + 正式版发布，全在这里）。
- ⚠️ `chyzsnb-commits/Mineradio-mac-` 是**独立的开源仓库，不属于本项目，不要碰**。
- **当前基线**：从 `Mineradio-1.1.3-arm64.dmg` 提取的源码。1.1.3 是**内部测试版**（`package.json` 标记 `internalBeta: true`）。
- **构建配置**：1.1.3 的 DMG 里只有运行时目录（无 `scripts`/`build`/`devDependencies`），已由 ZCode 反推补齐到 `package.json` 的 `build` 字段。Electron 42.4.1 + electron-builder ^26，mac arm64 dmg。
- **源码已通过** `node --check`（server.js + desktop/main.js + 所有顶层 JS）。
- **未验证**：尚未实际 `npm install` + `npm run build:mac` 跑通完整构建（依赖 CI 首次触发）。

## 1.1.0 vs 1.1.3 对比结论（优化依据）

完整分析见仓库 issue / docs。要点：

1. **1.1.3 = 1.1.0 + 4 个音源（酷狗/汽水/QQ/Spotify）+ 手势识别 + 壁纸模式 + 遥测 + Windows 内存清理**。是功能堆叠的测试版，非性能优化版。
2. **1.1.0 在性能/交互上更优**：体积小 27%、无后台遥测、无平台死代码、有自动更新、DMG 有完整视觉包装。
3. 优化方向：照着 1.1.0 的克制做 1.1.3 的减法（详见 mr 仓库的 6 个 issue）。

## 用户偏好

- 默认中文沟通，语气直接、偏实干。**希望主动完成任务，不要只给方案**。能本地验证就本地验证。
- 视觉方向：黑、玻璃、舞台、音乐可视化。讨厌"默认白框""太素""没设计感"。
- **私密开发**：源码不能开源。正式版可公开发布（dmg 资产），但源码私有。
- 后续会陆续提供更多"已优化的版本"让 ZCode 合并进基线。

## 工作日志

### 2026-07-12（ZCode 初始化）

- 分析了 1.1.0 和 1.1.3 两个 DMG 包体（体积/结构/源码/签名/优化点）。
- 从 1.1.3 DMG 提取源码到 `chyzsnb-commits/mr`，清理了 `build/.omc/` 垃圾缓存。
- 补齐 package.json 构建配置（scripts/build/devDependencies/electron-builder config）。
- 写了 AGENTS.md（Mac 专用）、本文件、issue 模板。
- 待办：6 个优化 issue、CI workflow、dmg-diff 脚本、Codex 集成。

## 未完成事项 / 下一步

### 用户需要手动完成（ZCode 无法代办，涉及账号授权）

- [ ] **装 Codex GitHub App**：去 [Codex 设置](https://chatgpt.com/codex)（或 ChatGPT → Settings → Codex）连 GitHub 账号，授权 "OpenAI Codex" GitHub App 访问 `mr` 仓库。装好后就能在 issue/PR 评论 `@codex` 让 Codex 接任务。
- [ ] **加 `OPENAI_API_KEY` secret**：mr 仓库 → Settings → Secrets and variables → Actions → New repository secret，名称 `OPENAI_API_KEY`，值是你的 OpenAI API key。配好后 `codex-review.yml` 才能在 PR 时自动审查。
- [ ] **（可选）加 `RELEASE_SYNC_TOKEN` secret**：~~已废弃~~。正式版只发本仓库，不再跨仓库同步，此 secret 不再需要。
- [ ] **（可选）Apple 签名证书**：当前 CI 用 adhoc（用户需右键打开）。有 Developer ID 证书后，加 secrets `CSC_LINK`（base64 p12）、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`，CI 自动切换到正式签名+公证。

### 待验证

- [ ] **首次 CI 构建**：打一个测试 tag（如 `v1.1.3-beta.1`）推送，触发 build-mac.yml，验证 electron-builder 配置（反推的）能否成功产出 dmg。如有配置细节问题，看 Actions 日志调 `package.json` 的 `build` 字段。
- [ ] **codex-review.yml 首次触发**：开一个测试 PR，确认 Codex 能审查（依赖上面的 OPENAI_API_KEY）。

### 网络说明

⚠️ 本环境 `github.com` 连接不稳定（git push 超时），但 `api.github.com`（gh CLI 走的通道）正常。**后续推送代码用 gh API（Git Database API 或 contents API），不要用 `git push`**。示例见本次 commit `e4b9062a` 的推送方式。

### 后续版本合并

- 后续用户提供更多"已优化的版本"时，按同样流程：挂载 DMG → 提取 `Resources/app/` → 与当前基线 diff → 合并改动 → 通过 gh API 推送。
- 用 `scripts/dmg-diff.sh <old.dmg> <new.dmg>` 快速产出版本对比报告。
