# Mineradio AI Handoff

> 这个文件是给后续接手的 AI agent（Codex / ZCode / 其他）看的。**每次完成任务后更新「工作日志」和「下一步」，让下一位能快速接上。**

## 当前权威入口（2026-07-13）

- **本仓库**：`chyzsnb-commits/mr`（**私有**，源码 + CI + 所有发布，单仓库架构）。
- ⚠️ `chyzsnb-commits/Mineradio-mac-` 是**独立的开源仓库，不属于本项目，绝对不要碰**。
- **main 最新 commit**：`a2d8145`（PR #26 已合并：唱歌模式、倍速、防爆音、歌架与卡死修复）。
- **当前 Codex 任务链**：PR #27（显卡模式与快速启动）仍待合并；PR #29 基于 #27，分支 `codex/gpu-usage-monitor`，新增 Mac 真实显卡占用监视。#29 设计存档 `4efaba2`，功能存档 `3a9f3eb`，审查修复存档 `d342ac6`、`bdfc2b5`。
- **协作者最新工作**：PR #28，分支 `codex/fix-gesture-latency`，优化双手手势延迟与 GPU 负载；当前仍待合并，本分支未修改其手势文件。
- **基线**：从 `Mineradio-1.1.3-arm64.dmg`（内部测试版）提取的源码。另有 `v1.1.0` 分支存正式版参考基线。
- **构建已验证**：`npm install` + `npm run build:mac` 本地跑通，产出 134MB dmg。Electron 42.4.1 + electron-builder ^26。
- **网络注意**：本环境 `github.com` 连接不稳定（git push 超时），但 `api.github.com`（gh CLI）正常。**用 gh API 推送代码，不要用 git push**。

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
5. **DMG 视觉确认**（#9）：electron-builder 自动生成背景图+卷图标，.omc 已排除

### 发烫优化（用户反馈"1.1.0 不烫、1.1.3 烫"）
6. **失焦降帧恢复**（#12）：1.1.3 把 `isVisibleBackgroundMode()` 写死 `return false`，导致切走仍满帧。已恢复 1.1.0 逻辑——失焦降到 15FPS。
7. **空闲降频**（#12→#17→#19）：前台不播放+无交互+加载完时，整个主循环降到 2FPS。**注意**：加载/换源期间必须保持渲染（`playToggleBusy` 判断），否则 GPU 上下文频繁停-启导致黑屏（PR #19 修复了这个）。
8. **用户可选显卡模式 + 首页后台暂停**（`codex/gpu-mode-fast-splash`）：新增自动/省电/高性能；前台保留首页悬浮动画，失焦、隐藏或最小化时暂停。

### 新功能
- **Mac 内存面板**（#12）：`desktop/system-memory-mac.js`（vm_stat + purge，模仿腾讯柠檬），显示真实内存数据。
- **Touch Bar**（#14）：`desktop/touchbar.js`，老款 Intel MBP 播放控制。独立模块。
- **x64 打包**（#13）：`build:mac:arm64` / `:x64` / `:all`，CI matrix 双架构。
- **倍速 + 唱歌模式 + 歌架交互**（#26）：可调原唱、频谱去人声、麦克风律动及音频图重建防爆音。
- **启动页快速进入**（`codex/gpu-mode-fast-splash`）：动画出现后任意时刻点击、回车或空格都能立即进入。
- **Mac 真实显卡占用监视**（#29）：负载窗口通过 `ioreg` 显示系统 GPU 占用；只在窗口打开时每 2 秒采样，壁纸模式停止采样，失败时显示 `--`。

### Bug 修复
11. **音源切换死循环卡死**（#16→#17）：toast 无节流导致主线程被 reflow 占满。修：toast 800ms 节流 + `_playbackFailCounter`（同首歌 15 秒失败超 3 次跳下一首）+ 换源保留 `_lastPlaybackFailAt`。
12. **WebGL 上下文丢失黑屏**（#18）：加 webglcontextlost 监听 + 自动恢复。
13. **渲染进程崩溃**（#20）：加 `render-process-gone` 监听，崩溃自动 reload。`sendWindowState` 加 webContents.isDestroyed 防护。
14. **purge 免密 + 防爆音**（#21）：优先 `sudo -n purge`（免密），purge 前暂停音频 purge 后恢复（修喇叭"噗"爆音）。
15. **内存按钮短静音防噗声**（#23）：修复"压缩播放器 / 系统释放 / 提权释放"播放中仍可能噗声；清理前淡出并静音，清理后恢复音量，不再用 `togglePlay` 播放/暂停切状态。
16. **显卡重启弹窗黑边**（#27）：修复切换显卡模式后点“稍后重启”导致页面横向偏移、右侧出现大块黑边；焦点进入与恢复均使用 `preventScroll`，避免带动页面滚动。

### 基础设施
17. **协作规则**（#8）：`.github/AGENT_COLLABORATION.md`（Codex+GLM 协作规则、术语解释、rollback、PR 四要素）
18. **移植包**（#15）：`mac-porting/`（7 个 patch + MAC_PORTING_GUIDE.md）

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
- [ ] **真机对比三种显卡模式**：分别重启到自动/省电/高性能，播放同一首歌 10 分钟，对比温度、CPU 和流畅度。
- [ ] **继续发烫优化**：主循环空闲时从高频 RAF 唤醒改成真正休眠；idle guide 在深后台彻底停止。
- [ ] **唱歌模式降载**：原唱 100% 时旁路 Worklet；暂停、无歌曲或深后台时停止麦克风采集。
- [ ] **Mac 内存面板两个开关**：实现安全的系统级定时释放与按需请求管理员，不直接照搬可能增加卡顿和发热的 `/usr/sbin/purge`。
- [ ] **音频代理重复写响应头**：修复 `server.js:6463` 上游中断后触发 `ERR_HTTP_HEADERS_SENT`。
- [ ] **测试内存清理**：播放时分别点"压缩播放器 / 系统释放 / 提权释放"，确认不弹密码、不爆音、不丢播放状态
- [ ] **Touch Bar 实测**：找老款 Intel MBP
- [ ] **x64 CI 验证**：打测试 tag 看 x64 构建
- [ ] **Touch Bar 歌曲名推送**：前端切歌时推歌名到 Touch Bar（增强项）
- [ ] **清理 `public/js/modules/.omc/` 垃圾文件** + 加 build 排除

## 用户需要手动完成的（账号授权类）

- [x] **装 Codex GitHub App**：已授权 `mr` 仓库。
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
