# Changelog

## 待发布（基于 v1.1.3 基线的优化）

### 快速切歌与进度跳转竞态修复（Codex）

- 快速连续点击下一首时改为串行处理，并合并到最终目标歌曲；切歌开始立即卸载旧音源，标题和歌手只在新音源赋值后更新，避免界面显示新歌却继续播放旧歌。
- 快速拖动进度条时只执行当前跳转和最后一次目标，不再同时堆积多条 `currentTime`、静音和暂停操作；过期任务也会撤销自己留下的静音。
- 播放入口在音频仍处于 `seeking` 时等待完成；恢复播放请求带有效性校验，新的拖动可以永久取消旧请求，队列会等恢复播放真正结束后再释放状态。
- AI 双轨在主轨跳转时先暂停副轨并保存最终时间；副轨追到最终目标后才继续播放，避免主副轨互相追赶或短暂播放旧位置。
- 新增 12 项播放竞态测试，覆盖慢网络快速切歌、20 次连续拖动、内部暂停、过期播放请求和 AI 副轨同步；完整自动检查增至 122 项。
- Electron 使用独立资料和假媒体参数启动通过；未签名 arm64 App 打包通过，最终 `app.asar` 包含修复代码且不含测试脚本。

### AI 分轨 CoreML 全图加速（Codex）

- Apple Silicon 的 AI 分轨改用 CoreML MLProgram 配置，让 UVR HQ3 的 178/178 个算子进入同一个 CoreML 分区，不再由 CPU 处理剩余算子。
- 4 分 40.58 秒完整歌曲第二次实测从 171.13 秒降到 37.34 秒，约提速 4.58 倍；90 秒调试样本为 10.78 秒。
- 保留可在 macOS arm64 安装的 `audio-separator[cpu]==0.44.3`；不使用会安装失败的 `[gpu]` 依赖，也不传该版本不存在的 `--execution_provider` 参数。
- 仅 Apple Silicon 启用；Intel Mac 和其他平台保持原路径。MLProgram 建立失败时自动回退默认 CoreML，并保留 CPU 兜底。
- 界面显示实际使用的 CoreML 或 CPU，结果同时写入缓存；完整歌曲输出 SDR 为 114.97-123.52dB，连续两次输出逐文件一致。
- 新增 Provider、平台判断、回退、日志分片、缓存和界面测试，完整自动检查增至 110 项；Electron 假媒体启动和未签名 arm64 打包通过。

### K 歌升降 Key + 启动开关对齐（Codex）

- 唱歌模式新增 `-6` 到 `+6 Key` 调节，每次升降 1 个半音；只改变歌曲、伴奏和原唱音高，播放速度与麦克风声音保持不变。
- 实时分离与 AI 双轨在最终混音后共用一个 SoundTouch AudioWorklet；`0 Key` 完全旁路，不增加原调播放的常驻计算。
- 倍速与变调可同时使用，SoundTouch 自动补偿倍速带来的音高变化；退出唱歌模式后恢复原调，再次进入时保留本次运行最后选择的 Key。
- 修复页面整理代码把“启动播放”标题塞进开关网格，导致“启动自动播放 / 秒启动跳过启动页”对角错位的问题；现在两项固定同一行且等宽等高。
- 新增 7 项变调与布局回归测试，完整自动检查增至 92 项；Electron 实测 220Hz 升 3 Key 后约为 263.7Hz，目标 261.6Hz，未签名 arm64 App 打包通过。

### Touch Bar 歌曲状态同步（Codex）

- 老款 Intel MacBook Pro 的 Touch Bar 现在随切歌显示“歌曲名 - 歌手”，长标题自动截断。
- 播放、暂停、结束和切歌时同步更新播放/暂停图标。
- Touch Bar 在主页面加载前初始化，避免错过启动恢复的首个歌曲状态。
- 修复窗口关闭重建后 IPC 监听重复累积；无 Touch Bar 的 Mac 继续安全跳过。
- 新增 3 项回归测试，完整自动检查增至 85 项。

### macOS 双架构 CI 运行器修复（Codex）

- x64 构建从已下线的 `macos-13` 改为 GitHub 当前 Intel 标签 `macos-15-intel`，解决任务永久排队。
- arm64 从已进入弃用期的 `macos-14` 升级为 `macos-15` Apple Silicon 运行器。
- 工作流自身和 `scripts/**` 测试变更现在也会触发 PR 构建；同一 PR 的旧构建自动取消，减少重复排队。
- 新增运行器配置回归测试，完整自动检查增至 82 项。

### 构建缓存排除（Codex）

- electron-builder 新增全局 `!**/.omc/**/*` 排除规则，任何位置重新生成的 `.omc` 工具缓存都不会进入 App。
- 临时放入缓存探针后重新打包，app.asar 中确认无 `.omc` 目录和探针文件；完整自动检查增至 80 项。

### 本机崩溃记录（Codex）

- 在最新代码重新接入 Electron `crashReporter`，渲染器和 GPU 子进程崩溃时把 `.dmp` 与诊断 JSON 保存到本机 `userData/CrashDumps`。
- 明确关闭服务器上传，不发送歌曲、账号或崩溃文件；诊断记录最多保留最近 50 条。
- 支持扫描 Crashpad 的 `pending/`、`completed/` 等子目录，避免生成了 `.dmp` 却找不到。
- 保留现有渲染进程崩溃后自动恢复，并补充退出原因、退出码和 GPU 功能状态记录。
- 隐藏测试窗口真实崩溃验证生成 1 个 `.dmp`，上传开关为关闭；完整自动检查增至 79 项。

### AI 分轨提速与实时分离精准度（Codex）

- Apple Silicon 且内存不少于 12GB 时，AI 分轨自动使用 `mdx_batch_size=2`；低内存、Intel Mac 和其他平台自动回退为 1，避免内存压力。
- AI 输出改为通过 `soundfile` 直接写 FLAC，继续使用 UVR HQ3 模型，不降低模型质量，也不让 AI 进程常驻。
- 90 秒固定音频实测从 87.42 秒降到 55.82 秒，提速约 36.1%；输出最大差异只有 1 个 16-bit 采样单位，SNR 约 70.5dB。
- 实时模式加入左右声道相干性、瞬态检测和高频保护，让鼓点优先归入伴奏、持续中置声音优先归入人声；鼓点泄漏测试从 0.309 降到 0.146，降低约 52.8%。
- 仍只运行一套 STFT / FFT，音频线程的逐帧处理不创建新数组；新增精准度回归测试，完整自动检查增至 69 项。

### 本地 AI 人声 / 伴奏分轨（Codex）

- 唱歌模式新增对称的“实时 / AI”选择；实时模式保留原频谱滤镜，AI 模式在本机真正拆出人声和伴奏两条音轨。
- 处理期间原曲继续播放并显示进度；完成后在当前进度平滑切换，现有“伴奏 / 人声”滑块直接控制两条 AI 音轨。
- 优先复用本机 Ultimate Vocal Remover 的 `UVR-MDX-NET-Inst_HQ_3.onnx` 模型，通过 `audio-separator 0.44.3` 使用 Apple Silicon CoreML/MPS 加速；歌曲和模型不上传第三方。
- 分轨结果缓存在 Electron `userData/ai-stems`，同一首歌后续可直接切换；切歌、取消和退出会终止 AI 子进程。
- 增加切歌竞态保护，防止旧歌分轨覆盖新歌；修复取消下载留下半截文件、切歌时 `currentSrc` 短暂滞后导致读错音频的问题。
- 新增 `scripts/test-ai-stem-separation.js` 并接入 `npm run check`，完整自动检查增至 66 项。

### 播放进度与无缝连播定时器降载（Codex）

- 播放进度更新不再从页面启动后永久每 200ms 运行，只在当前歌曲真正播放时启动；暂停、结束、清空或报错后完全停止。
- 已经播放的预载音频在无缝交接后会立即接管进度更新，不依赖新的播放事件。
- 无缝连播检查在歌曲中段从每 70ms 降为每 1000ms，只在最后 9 秒且正在播放时恢复 70ms 精细检查。
- 暂停、恢复、跳转进度或歌曲时长变化时立即重新选择检查频率；预载、静音阈值、淡入淡出和切歌算法保持不变。
- 新增 `scripts/test-playback-timer-power.js` 并接入 `npm run check`，完整自动检查增至 50 项。

### 首页最近播放滚动降载与 GPU 文案（Codex）

- 最近播放滚动时，背后的 3D 场景临时限制到不高于 30 FPS，停止约 240ms 后自动恢复原帧率；用户原本选择 24 FPS 时仍保持 24。
- 最近播放列表增加滚动隔离和独立合成层；滚动期间停用卡片悬停位移与重阴影，减少列表和背景同时争用 GPU。
- 首页玻璃质感、30 条最近播放和无限悬浮动画保持不变。
- 负载监视器的“显卡”文字统一改为“GPU”。
- 新增 `scripts/test-recent-scroll-performance.js` 并接入 `npm run check`，完整自动检查增至 44 项。

### 唱歌模式伴奏 / 人声双滑块（Codex）

- 原“原唱”单滑块升级为对称的“伴奏”和“人声”双滑块，可分别调节 0% 到 100%。
- 默认伴奏 100%、人声 0%；伴奏 0%、人声 100% 可突出人声；双 100% 恢复原声直通。
- 复用同一次频谱分析拆分伴奏与人声估计，不创建第二个 Worklet，不让 FFT 开销翻倍。
- 中置人声抑制曲线从 `ratio^1.4` 加强为 `ratio^2.2`，减少带轻微立体声扩散的人声残留；130Hz 以下贝斯和底鼓继续归入伴奏。
- 新增 `scripts/test-vocal-accompaniment-mixer.js`，覆盖双滑块、直通边界、Worklet 参数、加强曲线和回退链。

### Mac 安全定时内存释放（Codex）

- “系统级定时释放”和“需要时请求管理员”在 macOS 上真正生效，默认仍保持关闭。
- 播放中达到阈值时不暂停、不静音、不执行系统级 `purge`；后台只做播放器软清理，并把系统释放延期到暂停、结束或错误后。
- 延期任务只在窗口隐藏、最小化或不可见时补做，避免前台操作卡顿。
- 管理员开关关闭时，免密执行失败只提示权限不足，不弹密码框；开启后才允许请求 macOS 管理员授权。
- 新增 `scripts/test-mac-memory-safe-auto.js` 并接入 `npm run check`，覆盖开关、权限、播放延期和播放状态同步。

### 唱歌模式按需计算与麦克风省电（Codex）

- 唱歌模式原唱调到 100% 时，播放音频直接绕过去人声 Worklet，不再执行无意义的频谱计算；低于 100% 时自动恢复现有频谱去人声算法。
- 滑块只有跨越 100% 边界时才重建播放音频图；100% 下开关唱歌模式不再重复断连播放链，继续使用原有淡入淡出防爆音保护。
- 麦克风只在唱歌模式开启、歌曲正在播放且窗口不在深后台时采集；暂停、无歌曲、播放结束、错误或深后台会停止全部 track 并断开节点，恢复播放或前台后自动重开。
- 麦克风权限请求增加单例与竞态保护；快速暂停恢复不会同时发起多个请求，权限拒绝不会反复申请，临时设备错误也不会永久锁死。
- Worklet 就绪状态按 AudioContext 分开记录，避免旧音频环境逆序完成后覆盖新环境。
- 新增 `scripts/test-singing-mode-power-save.js` 并接入 `npm run check`，覆盖旁路、滑块跨界、停麦恢复、权限、并发和跨 AudioContext 竞态。

### 主循环真正休眠与 idle guide 停止空转（Codex）

- 前台聚焦且不播放、不加载、无交互时，主循环改用 500ms 定时器真正休眠，不再让高频 `requestAnimationFrame` 空唤醒；实测从约 112 次/秒降到约 2 次/秒。
- 窗口可见但失焦时保持约 15 FPS；深后台继续沿用原有 250/1000/1500ms 调度，播放、加载和交互仍立即恢复流畅渲染。
- `idle guide` 背景禁用且没有歌架提示时完全停止，深后台取消定时器和动画帧；歌架提示出现时仍可正常唤醒并在淡出后停止。
- 修复歌架光效淡出途中切到深后台，返回前台后旧光效可能短暂重现的问题。
- 首页无限悬浮动画保持原样，没有因本次休眠优化被关闭。
- 新增 `scripts/test-true-idle-sleep.js` 并接入 `npm run check`，覆盖调度状态、交互唤醒、提示生命周期和普通鼠标移动不空唤醒。

### Mac 真实显卡占用监视（Codex）

- 负载监视器在 CPU 行下方新增“显卡”行，通过 macOS `ioreg` 显示真实系统 GPU 占用，不拿 GPU 辅助进程的 CPU 数字冒充。
- 仅在负载监视器打开时每 2 秒采样；关闭监视器或进入壁纸模式后停止显卡、CPU 和内存采样，退出壁纸后按原开关恢复。
- 读取失败、系统不支持或非 macOS 时显示 `--`，不需要管理员权限。
- 新增 `scripts/test-gpu-usage-monitor.js`，覆盖解析、多显卡、失败降级、并发复用、界面顺序和壁纸模式采样生命周期。

### 显卡模式 + 启动页快速进入（Codex）

- 高级参数新增三等分“自动 / 省电 / 高性能”显卡模式，主界面和启动页共用同一 WebGL 功耗偏好；切换后可选择稍后重启或立即重启。
- 修复切换显卡模式后点“稍后重启”会让主界面横向偏移、右侧出现大块黑边的问题；弹窗打开和关闭恢复焦点时不再带动页面滚动。
- 启动页出现后即可点击、按回车或空格快速进入，不再强制等待 5 秒；原有“秒启动跳过启动页”设置继续保留。
- 首页无限悬浮动画在前台完整保留，只在应用失焦、隐藏或最小化进入现有后台省电状态时暂停，回到前台自动继续。
- 新增 `scripts/test-gpu-mode-fast-splash.js` 并接入 `npm run check`，覆盖模式映射、设置保存、两处 WebGL 接入、启动页跳过和后台动画暂停。

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
