# Mineradio AI Handoff

> 这个文件是给后续接手的 AI agent（Codex / ZCode / 其他）看的。**每次完成任务后更新「工作日志」和「下一步」，让下一位能快速接上。**

## 当前权威入口（2026-07-12，转交给 Codex）

- **本仓库**：`chyzsnb-commits/mr`（**私有**，源码 + CI + 所有发布，单仓库架构）。
- ⚠️ `chyzsnb-commits/Mineradio-mac-` 是**独立的开源仓库，不属于本项目，绝对不要碰**。
- **main 最新 commit**：`01629ec2`（fix(memory): purge 免密 + 防爆音）。
- **基线**：从 `Mineradio-1.1.3-arm64.dmg`（内部测试版）提取的源码。另有 `v1.1.0` 分支存正式版参考基线。
- **构建已验证**：`npm install` + `npm run build:mac` 本地跑通，产出 134MB dmg。Electron 42.4.1 + electron-builder ^26。
- **网络注意**：本环境 `github.com` 连接不稳定（git push 超时），但 `api.github.com`（gh CLI）正常。**用 gh API 推送代码，不要用 git push**。

## 用户偏好（重要）

- 默认中文沟通，语气直接、偏实干。**希望主动完成任务，不要只给方案**。
- 视觉方向：黑、玻璃、舞台、音乐可视化。讨厌"默认白框""太素"。
- **私密开发**：源码不能开源。
- **不要自动更新功能**（Mac 版从 Windows 迁移，不需要 electron-updater）。
- Obsidian 笔记库在 `/Users/chy/菜鸡的仓库/菜鸡的仓库`，Mac 开发进度在 `02 知识编译/Mineradio Mac 开发进度.md`。

## 已完成的工作（按时间，21 个 commit / PR）

### 优化类
1. **telemetry opt-in**（97c8ac3f）：正式版不上报，测试版首启询问
2. **Mac 跳过 Windows 内存死代码 + 补漏 qishui-api.js**（32b163c4）
3. **移除自动更新**（7c0254b1）：删 build.publish，build:mac 删 latest-mac.yml
4. **图标瘦身**（#9）：icns 851KB→568KB 无损，视觉不变
5. **DMG 视觉确认**（#9）：electron-builder 自动生成背景图+卷图标，.omc 已排除

### 发烫优化（用户反馈"1.1.0 不烫、1.1.3 烫"）
6. **失焦降帧恢复**（#12）：1.1.3 把 `isVisibleBackgroundMode()` 写死 `return false`，导致切走仍满帧。已恢复 1.1.0 逻辑——失焦降到 15FPS。
7. **空闲降频**（#12→#17→#19）：前台不播放+无交互+加载完时，整个主循环降到 2FPS。**注意**：加载/换源期间必须保持渲染（`playToggleBusy` 判断），否则 GPU 上下文频繁停-启导致黑屏（PR #19 修复了这个）。

### 新功能
8. **Mac 内存面板**（#12）：`desktop/system-memory-mac.js`（vm_stat + purge，模仿腾讯柠檬），显示真实内存数据。
9. **Touch Bar**（#14）：`desktop/touchbar.js`，老款 Intel MBP 播放控制。独立模块。
10. **x64 打包**（#13）：`build:mac:arm64` / `:x64` / `:all`，CI matrix 双架构。

### Bug 修复
11. **音源切换死循环卡死**（#16→#17）：toast 无节流导致主线程被 reflow 占满。修：toast 800ms 节流 + `_playbackFailCounter`（同首歌 15 秒失败超 3 次跳下一首）+ 换源保留 `_lastPlaybackFailAt`。
12. **WebGL 上下文丢失黑屏**（#18）：加 webglcontextlost 监听 + 自动恢复。
13. **渲染进程崩溃**（#20）：加 `render-process-gone` 监听，崩溃自动 reload。`sendWindowState` 加 webContents.isDestroyed 防护。
14. **purge 免密 + 防爆音**（#21）：优先 `sudo -n purge`（免密），purge 前暂停音频 purge 后恢复（修喇叭"噗"爆音）。

### 基础设施
15. **协作规则**（#8）：`.github/AGENT_COLLABORATION.md`（Codex+GLM 协作规则、术语解释、rollback、PR 四要素）
16. **移植包**（#15）：`mac-porting/`（7 个 patch + MAC_PORTING_GUIDE.md）

## 已知问题（待解决）

### 🔴 渲染进程崩溃（exitCode: 5, reason: 'crashed'）—— 最重要
- **现象**：播放某些不可播的歌（如《你不知道的事》网易云+QQ 都失败）触发 QQ 换源搜索后，渲染进程 segfault 崩溃（`exitCode: 5`）。
- **已做的**：崩溃后自动 reload 恢复（PR #20），恢复后能正常用。
- **未做的**：崩溃根因是 **Chromium GPU 进程 segfault**（不是 JS 代码问题）。要精确定位需配 crashReporter 抓 dump。手势识别（`cam: 'off'` 默认关）已排除。
- **建议**：如果要彻底解决，配 Electron crashReporter 抓 `.dmp`，用 minidump 分析工具看崩溃栈。

### electron-builder 签名阶段偶发卡住
- 本地构建有时卡在签名阶段（Apple Development 证书 + Keychain 交互）。用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 可跳过。

## 待办清单

- [ ] **渲染进程崩溃根因**：配 crashReporter 抓 dump 分析（上面详述）
- [ ] **测试发烫效果**：`./node_modules/.bin/electron .`，切到别的软件看温度（验证失焦降帧 + 空闲降频）
- [ ] **测试内存清理**：播放时点"系统释放"，确认不弹密码不爆音
- [ ] **Touch Bar 实测**：找老款 Intel MBP
- [ ] **x64 CI 验证**：打测试 tag 看 x64 构建
- [ ] **Touch Bar 歌曲名推送**：前端切歌时推歌名到 Touch Bar（增强项）
- [ ] **清理 `public/js/modules/.omc/` 垃圾文件** + 加 build 排除

## 用户需要手动完成的（账号授权类）

- [ ] **装 Codex GitHub App**：https://github.com/settings/installations → OpenAI Codex → Configure → 勾 All repositories 或 mr。**用户正在做这个**。
- [ ] **加 `OPENAI_API_KEY` secret**：mr 仓库 Settings → Secrets → Actions。

## 工作规则（给接手 AI）

- **分支命名**：`codex/任务名`（Codex）、`glm/任务名`（GLM/ZCode）。不直接改 main，走 PR。
- **PR 四要素**：变更 / 验证 / 未验证 / 是否需要用户手动操作。
- **commit 是存档点**：一任务多小 commit，出问题可 revert。
- **用英文术语带中文解释**（commit/branch/PR/issue/repo/main/merge/rollback/diff/CI）。
- **每次完成任务必须同步更新 Obsidian**：笔记库在 `/Users/chy/菜鸡的仓库/菜鸡的仓库/02 知识编译/Mineradio Mac 开发进度.md`。完成新任务后，把成果追加到这个笔记的「已完成的优化」表格和「待办」清单里。这是用户的知识库，代码改了笔记也要跟着更新，不能只改代码不记笔记。
- **每次完成任务也要更新本文件（AI_HANDOFF.md）**的工作日志和待办清单，让下一个接手的 AI 知道最新状态。
- 详细规则见 `.github/AGENT_COLLABORATION.md`。

## 交接说明

**2026-07-12：GLM 将工作转交给 Codex。**
- 用户正在装 Codex GitHub App，装好后 Codex 接手待办。
- 后续用户会把任务转回 GLM（通过同一仓库的 AI_HANDOFF.md 同步）。
- GLM 和 Codex 都通过 GitHub PR 协作，不维护各自独立的本地代码。
