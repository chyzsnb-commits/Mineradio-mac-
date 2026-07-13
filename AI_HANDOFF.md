# Mineradio AI Handoff

> 这个文件是给后续接手的 AI agent（Codex / ZCode / 其他）看的。**每次完成任务后更新「工作日志」和「下一步」，让下一位能快速接上。**

## 当前权威入口（2026-07-13）

- **本仓库**：`chyzsnb-commits/mr`（**私有**，源码 + CI + 所有发布，单仓库架构）。
- ⚠️ `chyzsnb-commits/Mineradio-mac-` 是**独立的开源仓库，不属于本项目，绝对不要碰**。
- **main 最新 commit**：`a2d8145`（PR #26 已合并：唱歌模式、倍速、防爆音、歌架与卡死修复）。
- **当前 Codex 任务链**：PR #27（显卡模式与快速启动）→ PR #29（Mac 真实显卡占用）→ PR #30（主循环真正休眠）→ PR #31（唱歌模式省电）→ PR #32（Mac 安全内存释放）→ PR #33（伴奏/人声双滑块）→ PR #34（最近播放滚动降载与 GPU 文案）均为叠加关系；PR #34 分支 `codex/recent-scroll-gpu-label` 基于 #33，设计存档 `4dc1145`、功能存档 `18e53c3`。
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
9. **主循环真正休眠 + idle guide 停止空转**（`codex/true-idle-sleep`）：前台空闲改用 500ms 定时器，实测主循环从约 112 次/秒降到约 2 次/秒；交互约 4.9ms 唤醒；禁用且无提示时 idle guide 为 0 次循环，首页悬浮动画保持原样。
10. **唱歌模式按需计算 + 麦克风省电**（`codex/singing-mode-power-save`）：原唱 100% 直连并停止去人声 FFT；暂停、无歌、结束、错误和深后台释放麦克风，恢复自动重开；快速状态切换和跨 AudioContext 竞态已加保护。
11. **Mac 安全定时内存释放**（`codex/mac-memory-safe-auto`）：两个 Mac 开关真正可用；播放中不暂停、不静音、不调用系统 `purge`，只在后台做播放器软清理并延期系统释放；暂停后进入后台再补做；管理员开关关闭时绝不弹密码框。
12. **伴奏/人声双滑块**（`codex/vocal-accompaniment-mixer`）：同一次频谱分析拆出伴奏与人声估计，两者可独立调节；双 100% 原声直通；中置抑制曲线从 `ratio^1.4` 加强为 `ratio^2.2`，不增加第二个 Worklet。
13. **最近播放滚动降载**（`codex/recent-scroll-gpu-label`）：滚动期间暂时把背后 3D 场景限制到不高于 30 FPS，停止约 240ms 后恢复；列表独立合成并停用滚动中的重阴影，保留首页玻璃和无限悬浮动画；负载监视器文案统一为“GPU”。

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
- [x] **继续发烫优化**：主循环空闲时从高频 RAF 唤醒改成真正休眠；idle guide 在禁用无内容和深后台时彻底停止。
- [x] **唱歌模式降载**：原唱 100% 时旁路 Worklet；暂停、无歌曲、结束、错误或深后台时停止麦克风采集，恢复播放/前台后自动重开。
- [x] **唱歌模式双向混音**：伴奏和人声音量独立调节，支持去人声或去伴奏；双 100% 时原声直通。
- [x] **Mac 内存面板两个开关**：播放中只做播放器软清理并延期系统释放；暂停且进入后台后再补做；管理员开关关闭时不弹密码框。
- [x] **最近播放滚动卡顿**：滚动期间让 3D 背景临时降到不高于 30 FPS，停止后恢复，玻璃与首页无限悬浮动画不变。
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
- PR：#34，分支：`codex/recent-scroll-gpu-label`；基于 PR #33；设计 commit（代码存档点）`4dc1145`，功能 commit `18e53c3`。
- 根因：最近播放滚动时，列表合成、卡片悬停阴影和背后的 3D 场景同时争用 GPU，触控板滚动容易掉帧。
- 改动：列表滚动活动期间把 3D 场景限制到不高于 30 FPS；用户原本选择 24 FPS 时仍保持 24；停止约 240ms 后恢复原设置。列表增加滚动隔离和独立合成层，滚动时停用卡片位移与重阴影。
- 视觉边界：首页玻璃效果、30 条最近播放、无限悬浮动画均保留；负载监视器的“显卡”文字改为“GPU”。
- 验证：`npm run check` 共 44 项通过，相关前端语法与 `git diff --check` 通过；Electron 临时资料实测 30 条列表可滚动，前台帧率从 45 → 30 → 45 自动恢复，HUD 显示 GPU，运行日志无报错。
- 未验证：真实用户历史封面全部加载时的长时间触控板手感仍需用户在正式资料下确认。
