# Mineradio AI Handoff

> **全局透视、Wallpaper 与汽水目录选择性融合（2026-08-14，已构建安装并开 PR #116）：** 当前分支为 `codex/perspective-wallpaper-qishui`，继续遵守“稳定版为底、按功能选择性融合”，没有把 PR #113 整条移植线覆盖进来。视觉控制台“背景（所有预设通用）”删除 6 枚快捷色块，保留主调色板和“默认”，原空间改为全局“透视模式”：摄像头视频首帧可用后才成为底图，默认歌词/封面、粒子、P10“音域回响”和 P11“词境穿行”留在前景，`scene.background` 在透视期间保持透明，关闭后恢复此前背景选择。窗口隐藏、最小化、遮挡、进入壁纸模式或启动页会暂停并释放透视 owner，回到前台按保存状态恢复。手势与透视通过共享管理器使用同一条 MediaStream，以 `gesture` / `perspective` owner 计数；透视加入时升级约束，退出后给仍运行的手势降档，只有最后一个 owner 释放才停止轨道，原生 macOS 权限 gate 在 `getUserMedia` 前执行并区分拒绝、缺设备和无首帧。PR #113 的 Wallpaper Engine 能力只恢复经过 ping/source 验证的局域网素材库、图片/视频导入、Scene 预览/导出和可信渲染页 IPC，不恢复封面裁切等已撤界面；列表与媒体分别使用 4MB / 256MB 流式限额，大视频不经过 IPC 复制，未验证来源、错误 MIME 与失败 partial 会被拒绝或清理。汽水只恢复无需登录的公开目录搜索与歌词：结果固定 `playable=false` / `recommend-match`，经严格匹配进入既有自动换源；`directPlayback=false`、`login=false`，绝不读取 Cookie、Token、`safeStorage`、本地汽水客户端数据库或会话，也不恢复受保护音频解密链。专项检查：透视 6/6、共享摄像头 4/4、Wallpaper 9/9、汽水目录与公开策略 11/11；完整 `npm run check` **228/228**。隔离 Electron 使用 Chromium fake camera（未调用真实摄像头）验收：透视开启后 `readyState=4`、`1280×720`、body 为 `perspective-mode` 且 `scene.background===null`；透视+手势 owners 并存时 `captureCount=1`，先关透视后手势流仍 active，最后释放手势才 inactive；P10/P11 均保持 camera active 与透明场景；外观页即时显示“已开启”且六色块 DOM 为 0；Wallpaper 面板进入局域网发现；汽水 status 为 `enabled/catalogOnly/searchReady=true`、`directPlayback/login=false`，真实搜索 5 条均有封面且不可直放。功能提交 `b9cd6ae` 已推送并创建 PR #116；从该干净提交构建的唯一 `/Applications/Mineradio.app` 已完成整体 ad-hoc 签名和安全替换，`app.asar` SHA-256 为 `a88eb92933e2718ac3e2c3c7135f4ab2ef773d1458e2ac7996f217686b3f7761`。严格签名、arm64、主 App/Helper 摄像头与麦克风 entitlement、HTTP 200、实包新脚本和 Wallpaper 私有协议初始化均通过；旧 App 内存解密后由新 App 重加密 `.qq-cookie`，QQ 登录及 `playbackKeyReady` 保留，摄像头仍为 `granted`，未出现 SecurityAgent。安装前 App、完整 userData 与旧加密凭据备份在 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex/before-performance-cover-20260814-003602-perspective-wallpaper-qishui`，Spotlight 精确检索只有 `/Applications/Mineradio.app`。GitHub Actions 三个 job 均因仓库账户付款失败或额度不足而未启动，steps 为空，属于 Billing 阻塞而非代码失败；本机干净构建与 228/228 检查均已通过。Obsidian 指定路径仍不存在，待仓库主人侧同步。

> **词境穿行壁纸、自由镜头与逐字流光（2026-08-13）：** 用户第三轮验收指出 P11 会盖住全局壁纸、全局自由镜头只显示提示却不能穿行，并明确废弃“跟唱明暗”。本轮把 P11 暗底拆到相机空间独立层：图片/视频/专辑封面存在时降到约 16%，纯色/窗口透明不误判；进入保存、退出恢复 `scene.background`，P11→P10 时让音域回响优先接管。全局 R 自由镜头现在按 preset 记录 owner，P11 舞台在本预设显式开启后固定到世界空间，WASD/鼠标可真正绕行，K 回正同程同步，避免二段漂移，也不再继承其他预设的旧 locked/active 姿态；切预设会释放旧 pointer lock，因此进入 P11 第一次按 R 就可用。P11 自己的“360° 词境漫游”仍独立保留。动态页旧开关改为默认开启的“逐字流光”：当前原文底色始终正常、绝不把未唱部分压灰，额外亮层按 QQ QRC / 网易 YRC 逐字时间平滑扫到当前字；普通 LRC 按行估算。像素映射按 P11 实际混合字号、字重、字距和分块间距计算，中文块边界、英文空格/字距、ZWJ emoji、LRC→YRC 同文本升级均有回归，译文仍不扫亮。功能提交 `0d1bfdd`；完整 `npm run check` **205/205**。隔离 Electron/CDP 实测媒体壁纸已挂载且 `scene.background=null`、P11 暗层 0.16、当前逐字进度 0.505、WASD 相机移动约 1.75 而世界舞台漂移约 0.005、K 回正误差约 0.002、跨预设旧镜头状态清空。PR #115 已推送；GitHub arm64/x64 构建均通过，`codex-review` 红叉仍是仓库未配置 OpenAI Responses API 代理/密钥导致 server-info `ENOENT`，审查本身未运行，并非代码失败。唯一 `/Applications/Mineradio.app` 已从干净提交 `c483beb` 重新打包、整体 ad-hoc 签名并安全安装，`app.asar` SHA-256 为 `21b9be86a9904ffd252d8a6314c9dedcc0c4c903f9e42c64fb75b4ca1ca86ab0`；严格签名、arm64、主 App/四个 Helper 的摄像头与麦克风 entitlement、HTTP 200 和安装包内 P11 冒烟均通过。旧 App 在内存中解密并由新 App 重加密 `.qq-cookie`，QQ 登录与播放密钥均保留，文件权限 0600，摄像头仍为 `granted`，未出现 SecurityAgent；安装前 App、userData 与旧加密凭据备份在 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex/before-performance-cover-20260813-140241-p11-wallpaper`，Spotlight 精确检索只有 `/Applications/Mineradio.app`。Obsidian 指定路径在本机不存在，待仓库主人侧同步。

> **词境穿行交互、歌词控制与跨曲动画（2026-08-13）：** P11 在原五层景深剧场上完成第二轮融合。歌词字号、字体、字重、字距和翻译实时生效；翻译“当前/双行/多行”语义与主舞台一致，译文使用独立遮罩，不跟随原文的横向跟唱高亮。P11 固定五层，因此歌词行数按钮/滑杆明确禁用，退出 P11 自动恢复。动态页新增“跟唱明暗”和“360° 词境漫游”：封面 hover 仅在精确命中时约 8% 弹性放大并轻倾，移开回弹；360° 开启后鼠标拖动/滚轮与 Emily 同一 `gestureRotation`/`gestureZoom` 驱动封面+歌词舞台，摄像头开启后双手张合直接缩放、连线旋转，开关重启会回正，转到背面时封面和文字也保持正向可读。编排扩为 12 套；跨曲使用 outgoing→bridge→incoming→await-lyrics→settle 状态机，pending 时冻结旧句位置/进度，自动换源和同曲重试会续接 token，音频或歌词慢到时不空白、不回亮、不硬切，终止播放失败会退出 bridge。隔离 Electron 实测字号 1.00→1.35 时当前卡宽 4.814→6.464、字体/翻译纹理当场更新、行数全部 disabled、双手模拟 145% 得到 pivot scale 1.45、封面命中/移开回弹、跨曲等待与恢复通过；最终 `npm run check` **199/199**，功能提交 `350fda2`，PR #115。唯一 `/Applications/Mineradio.app` 已从该提交的干净工作树完整构建、整体 ad-hoc 签名并安装，`app.asar` SHA-256 为 `37af83b8fdccb5f3c4061aad7e4f17df312dfa1fb3aa5aeec9d226f9a387b5dc`；主 App/Helper 摄像头和麦克风 entitlement、严格签名、HTTP 200、实包新控件/函数、QQ 登录与播放密钥均通过，摄像头权限仍为 `granted`，未出现 SecurityAgent。安装前 App、userData 和旧 repo dist 都备份到 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex/before-performance-cover-20260813-091000`，Spotlight 精确检索只剩 `/Applications/Mineradio.app`。Obsidian 指定路径在本机不存在，待仓库主人侧同步。

> **词境穿行首轮参考视频预设（2026-08-13）：** 新增 P11“词境穿行”，参考 `/Users/allenli/Desktop/抖音2026813-294011.mp4` 精确拆帧实现深空封面与五层景深歌词。歌词不是逐字打字：新句整组在 0.82s 左右从深处以小尺寸、低透明、失焦状态推到焦面；旧句连续越过焦面放大、失焦并降到低透明，与新句短暂重叠。P11 的歌单完全复用音域回响的普通 DOM 歌单页；3D 歌单架的渲染、命中、点击、右键和滚轮均禁用，P10/P11 共享 dock 状态确保互切不闪回，同时保持用户原有的 3D 歌单架固定状态。歌词开关、无封面清理和进度拖动节流均补齐；拖动时约每 90ms 至多上传一张当前歌词纹理。首轮完整检查 **187/187**，功能提交 `d868954`，PR #115；唯一 `/Applications/Mineradio.app` 的首轮 `app.asar` SHA-256 为 `aab448ea1895b03609c76dab09675b4e0711f2a294bd920050d0f0325aae22c0`。后续交互边界以上方第二轮记录为准。

> **性能档即时生效与 QQ 官方封面恢复（2026-08-13）：** 用户要求“自动 / 省电 / 均衡 / 高性能”切换无需重启。当前四档已彻底改成运行时预算：点击后立即同步帧率、音频分析频率、视觉预算、玻璃降载状态并唤醒渲染；WebGL 固定使用当前 Mac 的默认 Metal 设备，不再持久化下一次启动的 GPU 偏好，也不再显示性能档重启弹窗。通用快速补丁的软件更新重启 IPC 仍保留，不能和性能档一起删除。QQ《手写的从前》出现 MR 图标不是 QQ API 替换封面，而是此前自动验收误在真实 profile 给 qq:002u8ZOM4C7QF4 写入了 MR 图标自定义封面；本轮只删除这一条覆盖，其他资料不动，并补齐“清除封面后同步删除搜索列表内存字段且立刻重绘”。以后封面/UI 自动验收必须使用隔离 userData，禁止污染真实 profile。TDD 红灯提交为 9d819c7 / a832838，生产修复为 d5787fa / 2354ae5；完整检查 **178/178**。唯一 /Applications/Mineradio.app 已按该 HEAD 完整构建、整体 ad-hoc 签名并安装，app.asar SHA-256 为 7ce5acf34ff9fb26d66198a9df516b51b65406f19ecda45d566070636c375f38，主 App 与 Helper 的摄像头/麦克风 entitlement、严格签名验证均通过。安装时由旧 App 在内存中迁移 .qq-cookie，QQ 登录与播放密钥在重开后仍可用且没有 SecurityAgent；备份位于 /Users/allenli/Desktop/Mineradio-2.0-backups.noindex/before-performance-cover-20260813-014004。实包点击“省电”显示“已立即应用”、PID 不变并恢复用户原“高性能”；重开后重新搜索《手写的从前》，确认官方专辑 MID 001uqejs3d6EID、无自定义覆盖且 300px 封面加载成功。

> **下一发布版恢复匿名活跃统计（2026-08-13，用户明确确认）：** 从下一个对外发布版本开始，匿名统计是发布阻塞项，必须恢复同时在线、DAU、WAU、MAU、YAU、累计安装/下载、版本分布与活跃趋势；旧后端没有 YAU，发布前需要补齐并实测时间窗口。当前已安装的 2.0 继续保持不上报，禁止在版本周期中途远程开启。新版本首次启动必须明确 opt-in、默认“不，谢谢”且可在设置中撤回；只允许随机安装 ID、应用版本和有界前台活跃心跳，不得上传账号、歌曲、播放行为、Cookie、Token 或登录凭据。同时在线与周期活跃必须基于可靠的前台心跳和会话过期计算，不能只在启动时记一次。

> **双手直缩、音频/登录/活跃统计核查（2026-08-12）：** 用户再次明确“双手缩放”必须是双手张开/收拢直接缩放音域内容，不能改滚轮相机，也不要长按左右拖动的惯性。当前实现因此撤回此前错误移植的全局目标/显示相机缓动：鼠标拖动与滚轮恢复稳定版即时镜头，双手距离只写 `contentRoot.scale`（55%–190%），并在输入期间唤醒渲染，避免空闲 2FPS 跳变；红灯测试分别落在 `996a992`、`666b419`，生产修复为 `8241641`，完整检查 177/177。音频核查确认：唱歌模式关闭时人声分离与变调 Worklet 均完全旁路，默认 EQ 为 0 dB；开启实时唱歌模式才会改变 PCM，其中 Worklet 未就绪时的粗糙降级分离可能明显劣化音质，后续若改应采用“原声直通至 Worklet 就绪后再交叉淡入”，不得把粗糙降级链当默认播放链。上一轮重新登录的直接原因是为解除卡死密码框删除了 `Mineradio Safe Storage`；本轮又实证本地 ad-hoc 构建每次改变 cdhash，同样会触发钥匙串授权并使加密登录暂时不可读。因此在取得稳定 Developer ID 前，本地整包更新必须由旧 App 在内存中解密会话、安装新包后用新身份重新加密，禁止把明文写盘或要求用户重复登录；本轮已按此迁移 `.qq-cookie`，QQ 登录与播放密钥均保持可用，未出现 `SecurityAgent`。旧匿名统计后端仍在 `/Users/allenli/Desktop/mineradio-stats`，支持同时在线、DAU、WAU、MAU、累计安装、下载、版本分布和 14 天趋势，从未实现 YAU；2.0 的 `internalBeta:false` / `publicRelease:true` 会在 `desktop/telemetry.js` 入口直接退出，因此当前 2.0 不上报。2026-08-12 实查后端为同时在线 0、DAU 0、WAU 0、MAU 1、累计安装 1、累计下载 1，唯一版本为 1.1.3；这些数不能代表 2.0 用户量。最终应用已整体构建、签名并同步到唯一 `/Applications/Mineradio.app`，`app.asar` SHA-256 为 `bd417749a046d3252ffab0d1d92d2d64b7bc2afee6c1db5573ba0a0443006b3f`，`codesign --verify --deep --strict` 通过，摄像头权限保持 `granted`。安装前 App、userData、旧加密登录文件和迁移前活动 App 均保存在 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex/before-direct-scale-20260812-233528`。实包运行态确认双手设为 150% 时 `contentRoot.scale=1.5` 且相机参数不变；歌词开关开启，并用上次 QQ 曲目《七里香》取得 38 行 YRC 逐字歌词（HTTP 200）。

> **最终 App 已同步（2026-08-12 07:20 PDT）：** PR #114 分支 `codex/stable-voxel-gesture-player-fusion` 已推送到 commit `6c16524`，不是只改源码。`/Applications/Mineradio.app` 已用该 HEAD 重新完整构建并整体 ad-hoc 签名，`codesign --verify --deep --strict` 通过；主 App、Helper、Renderer 与 GPU Helper 均实包核验包含 camera/audio-input entitlement，禁止再替换包内 `app.asar`。最终 `app.asar` SHA-256 为 `02a921921113a36480f475697654c181a3f67120746e72020c884b84dc5a25de`，Spotlight 精确检索只剩该 App。真实 profile 已从失败移植残留的 `particleLyrics:false`、近黑自定义色、0 溢光定点恢复为歌词开启、自动配色 `#a9b8c8`、溢光 `0.28`，运行态读取一致；旧 profile、旧 hybrid App 和加密登录文件均保存在 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex/runtime-before-final-20260812-071141`。旧 `Mineradio Safe Storage` 已删除以解除卡死密码框，因此 QQ/酷狗需要重新登录。摄像头原生授权已经从真实 App 发出，但验收时 Mac 锁屏，系统对话框等待用户解锁后点击“允许”；用户授权后再完成真实双手动作主观验收。`npm run check` 176/176；手势启动失败会把 `cam=off` 写回，避免下次假开启。

> **歌词、手势授权与唯一 App 完整重建（2026-08-12）：** 用户反馈安装版歌词完全不显示、手势提示无摄像头权限却不弹系统框。歌词链与稳定基线逐字一致，真实根因是此前失败移植版写入 `current-fx-autosave.json` 的 `particleLyrics:false`，同时歌词自定义为近黑 `#111318`、发光为 0；本轮增加歌词按钮状态同步与点击即保存，并在安装前只定点恢复这三个本机字段。摄像头根因由 macOS `tccd` 日志确认：此前用签名稳定外壳替换 `app.asar` 后资源封印失效，且打包缺 `com.apple.security.device.camera`，系统直接 `Policy disallows prompt`；本轮增加 camera/audio-input entitlement、`systemPreferences.askForMediaAccess('camera')` IPC 和分类型错误提示，必须通过完整构建后整体签名安装，禁止再替换已签名包内的 `app.asar`。新增两组 9 项回归，完整 `npm run check` 为 176/176。当时把 PR #111 的 `0.055` 目标/显示相机缓动误当成用户所指的双手缩放手感；该判断与实现已被本文顶部“用户要内容直缩、不要镜头惯性”的后续结论取代。

> **唯一安装版与选择性融合已落地（2026-08-12 04:00 PDT）：** 用户在 Spotlight 看到两个同名 Mineradio，根因不是缓存：`/Applications/Mineradio.app` 是稳定版，而 `/Users/allenli/Desktop/Mineradio_Beat/dist/mac-arm64/Mineradio.app` 是此前被拒绝的整版移植构建；03:43 实际运行的也是后者，所以用户看不到本轮融合改动。现已退出并注销该 dist App，将其完整移动到 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex/rejected-running-dist-migrated-20260812-034842.app.backup`，Spotlight 精确检索只剩 `/Applications/Mineradio.app`。当前唯一安装版使用原 Apple Development 稳定外壳并装入选择性融合 `app.asar`，SHA-256 为 `0d394b00cb4eecdb2cf549ca964ea72e625158d05370bd4e09d6d4510efb4522`；从绝对路径启动后进程、Renderer 和 `127.0.0.1:3000` 均来自 `/Applications/Mineradio.app`，HTTP 200、页面 complete。实装验收确认悬浮方块滑块为 100%–200%、播放器 `nowrap`/长标题省略且红心与 `+` 同行、背景三按钮和背景裁切弹窗均不存在。原稳定 App 备份在 `installed-stable-before-selective-fusion-20260812-034842.app.backup`，安装前 userData 备份在 `userdata-before-selective-fusion-20260812-034842.backup`。本机目前没有有效签名身份；为了继续使用原钥匙串资料，安装版保留稳定外壳的原可执行文件身份但资源封印会因替换 `app.asar` 失效，因此该包只用于本机验收，正式分发前必须用有效证书重新签名并公证。

> **稳定版回滚与后续融合边界（2026-08-11 23:21 PDT）：** 用户明确要求“以原稳定 App 为底，按清单选择性融合”，禁止再把 PR #111 或其后续整条代码线直接覆盖安装。`/Applications/Mineradio.app` 已恢复为回滚前原包，`app.asar` SHA-256 为 `8a10e8b75a7a05b93f16a6cafb578808566fd0772511e9c7316075f24262c986`，Apple 原签名、普通启动和 `127.0.0.1:3000` 均验证通过；用户资料未删除。该 App 精确对应源码提交 `e3b77b9aafcf16e07a2b5687329d061ab6fce054`：147 个生产文件全部等价匹配（146 个字节一致，打包后的 `package.json` 仅按 electron-builder 规则移除构建字段）。后续只能从此提交派生，等用户逐项确认后迁移；不得以当前 `codex/mineradio-2.0-unified` head、PR #111 或 `de4790f` 为新基线，因为其间已有 76 个生产文件变化，歌词、歌单架、CSS 与入口均受影响。整版安装暴露的已知回归是歌词不显示、P10 歌单架构图错误；PR #112/#113 已关闭，PR #111 保留但未合并。问题版 App 保存在 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex/rejected-pr111-full-install-20260811-232151.app.backup`，仅供逐项对照，禁止直接恢复。稳定基线分支为 `codex/stable-selective-fusion`，功能开发从该分支继续派生。

> **第一批选择性融合（2026-08-11 23:58 PDT）：** 当前分支 `codex/stable-voxel-gesture-player-fusion` 只融合用户点名的四项，不含 PR #111 的其他模式或页面：① 原版“音域回响”保留，悬浮方块新增 100%–200% 尺寸滑块（100% 完全等于稳定版，200% 接近移植版大方块观感），只缩放现有 80 个实例；② 当时误把目标相机→显示相机缓动当成双手缩放融合，后续已撤销并改为双手直接缩放内容，原 30FPS Worker 和识别算法继续保留；③ 全屏播放器歌曲区禁止换行，长标题省略，红心与“+”始终同一行；④ 删除背景“封面 / 裁切 / 清除”三个入口及背景裁切专用弹窗，图片/视频背景、原有三条背景位置/缩放滑条、歌曲封面裁切仍保留。未引入“音域地形 / 音域回响·WE”等移植模式，未修改歌词、3D 歌单架、电影视觉或黄金玻璃纹理。专项 4/4、完整 `npm run check` 167/167、浏览器 2048/1440 布局与控制台实际交互均通过；最终安装结果与回滚位置见上方“唯一安装版与选择性融合已落地”。

> 这个文件是给后续接手的 AI agent（Codex / ZCode / 其他）看的。**每次完成任务后更新「工作日志」和「下一步」，让下一位能快速接上。**

## 当前权威入口（2026-07-24）

- **本仓库**：`chyzsnb-commits/mr`（**私有**，源码 + CI + 所有发布，单仓库架构）。
- ⚠️ `chyzsnb-commits/Mineradio-mac-` 是**独立的开源仓库，不属于本项目，绝对不要碰**。
- **main 最新 commit**：`a2d8145`（PR #26 已合并：唱歌模式、倍速、防爆音、歌架与卡死修复）。
- **当前 2.0 融合线**：草稿 PR #58，分支 `codex/mineradio-2.0-unified`（基于 `codex/public-release-2.0`，融合 Beat 修复）。2026-07-24 在 #58 上补修：唱歌模式开/关强制重建音频图 + 健康检查识别缺失去人声链；壁纸模式不进深睡眠/失焦 15fps；暂停后字幕褪去再等 3s 才空闲 2fps 降帧。`npm run check` **163/163**。
- **当前 Codex 任务链**：PR #27（显卡模式与快速启动）→ PR #29（Mac 真实显卡占用）→ PR #30（主循环真正休眠）→ PR #31（唱歌模式省电）→ PR #32（Mac 安全内存释放）→ PR #33（伴奏/人声双滑块）→ PR #34（最近播放滚动降载与 GPU 文案）→ PR #36（播放定时器降载）→ PR #37（本地 AI 分轨）→ PR #38（AI 提速与实时精准度）→ PR #39（软件 Logo）→ PR #40（歌词选项切换降卡）→ PR #41（音频上游断线保护）→ PR #42（整队不可播保护）→ PR #43（本机崩溃记录）→ PR #44（构建缓存排除）→ PR #45（双架构 CI 运行器）→ PR #46（Touch Bar 歌曲状态）→ PR #47（K 歌升降 Key 与启动开关对齐）→ PR #48（GPU 系统/播放器占用）→ PR #49（AI 分轨热管理与实时去人声增强）→ PR #50（实时人声轨净化）→ PR #51（CoreML 全图加速）→ PR #52（切歌与进度竞态修复）均为叠加关系。
- **协作者最新工作**：PR #28，分支 `codex/fix-gesture-latency`，优化双手手势延迟与 GPU 负载；当前仍待合并，本分支未修改其手势文件。
- **2.0 公开候选**：从 PR #56 线单独创建 `codex/public-release-2.0`。公开分支删除汽水后端、登录桥、本地 Cookie 读取和音频解密器；原 PR #56 开发线保留汽水实验，后续继续在原线开发。2026-07-24 已修复首批候选中网易/QQ/酷狗官方登录被手动导入策略误拦截的回归，以及连续切换音质导致的 `0:00` 卡死、通知堆叠和巨型歌词残影：官方会话由主进程直接验证并加密保存，音质改为同曲串行换流，不重建歌词。最终 2.0.0 arm64/x64 未签名 DMG 已重新打包、挂载和安装验证，正式公开仍受 Developer ID、公证、隐私联系信息与音乐平台授权阻塞。
- **基线**：从 `Mineradio-1.1.3-arm64.dmg`（内部测试版）提取的源码。另有 `v1.1.0` 分支存正式版参考基线。
- **构建已验证**：`npm install` + `npm run build:mac` 本地跑通，产出 134MB dmg。Electron 42.4.1 + electron-builder ^26。
- **网络注意**：本环境 `github.com` 连接不稳定（git push 超时），但 `api.github.com`（gh CLI）正常。**用 gh API 推送代码，不要用 git push**。

## 最终整合（agents/final-integration，2026-07-14）

- **分支**：`agents/final-integration`（共享任务分支，从 PR #52 `codex/async-playback-race-fixes` 创建）。
- **本轮目标**：把 PR #28（`codex/fix-gesture-latency`，双手手势 GPU Worker 管线）整合进 PR #52 基线。#52 基线未改手势文件，`00-gesture-control.js` 干净合入；仅 `CHANGELOG.md` 冲突已并（手势条目置顶）。PR #35（协作 Skill）不属于播放器，未混入。
- **PR #28 审查结论（发热/卡顿）**：是**净改善**，不是增负担。旧 Swift/Vision 原生路径开启后 GPU 进程 49.8%→97.2%、延迟约 80–170ms；新 Worker 路径 GPU 仅 +5.1pp、端到端约 19.4ms / 26.5 次每秒；摄像头 640×480@60 → 320×240@30，保留双手。协议核对：`gesture-worker.js` 的 init/frame/stop 与 `gesture-control.js` 的发送/回调完全对得上；失败依次回退 Vision/ANE → 主线程 MediaPipe。
- **自动检查**：`npm run check` 本地通过（21 个测试文件、**122 项全过**）。关键功能存在性核对：失焦降帧、空闲真休眠（PR #30 的 500ms / 2FPS）、Mac 内存面板+purge、Touch Bar、崩溃恢复+记录、WebGL 黑屏恢复、purge 防爆音、GPU/CPU 占用显示、AI 分轨、唱歌模式——全部在。
- **未本地验证**：Electron 假媒体启动 + 未签名 arm64 打包（本地未装 electron/electron-builder；仓库主人机器为无风扇 M4，避免重载，**交由本 PR 的 CI arm64/x64 构建验证**）；真实手部跟踪体验需用户正常重开应用确认（#28 备注：该机反复强停摄像头后暂时不返首帧）。
- **旧 PR**：未关闭任何旧 PR，等最终 PR 审查通过后统一处理。
- **Obsidian**：接手环境访问不到仓库主人电脑上的 Obsidian（`/Users/chy/...`），**待仓库主人侧同步**。

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
5. **DMG 视觉确认 + .omc 排除**（#9、PR #44）：electron-builder 自动生成背景图和卷图标；Git 与 App 打包都全局排除 `.omc` 工具缓存。

### 发烫优化（用户反馈"1.1.0 不烫、1.1.3 烫"）
6. **失焦降帧恢复**（#12）：1.1.3 把 `isVisibleBackgroundMode()` 写死 `return false`，导致切走仍满帧。已恢复 1.1.0 逻辑——失焦降到 15FPS。
7. **空闲降频**（#12→#17→#19）：前台不播放+无交互+加载完时，整个主循环降到 2FPS。**注意**：加载/换源期间必须保持渲染（`playToggleBusy` 判断），否则 GPU 上下文频繁停-启导致黑屏（PR #19 修复了这个）。
8. **用户可选显卡模式 + 首页后台暂停**（`codex/gpu-mode-fast-splash`）：新增自动/省电/高性能；前台保留首页悬浮动画，失焦、隐藏或最小化时暂停。
9. **主循环真正休眠 + idle guide 停止空转**（`codex/true-idle-sleep`）：前台空闲改用 500ms 定时器，实测主循环从约 112 次/秒降到约 2 次/秒；交互约 4.9ms 唤醒；禁用且无提示时 idle guide 为 0 次循环，首页悬浮动画保持原样。
10. **唱歌模式按需计算 + 麦克风省电**（`codex/singing-mode-power-save`）：原唱 100% 直连并停止去人声 FFT；暂停、无歌、结束、错误和深后台释放麦克风，恢复自动重开；快速状态切换和跨 AudioContext 竞态已加保护。
11. **Mac 安全定时内存释放**（`codex/mac-memory-safe-auto`）：两个 Mac 开关真正可用；播放中不暂停、不静音、不调用系统 `purge`，只在后台做播放器软清理并延期系统释放；暂停后进入后台再补做；管理员开关关闭时绝不弹密码框。
12. **伴奏/人声双滑块**（`codex/vocal-accompaniment-mixer`）：同一次频谱分析拆出伴奏与人声估计，两者可独立调节；双 100% 原声直通；中置抑制曲线从 `ratio^1.4` 加强为 `ratio^2.2`，不增加第二个 Worklet。
13. **最近播放滚动降载**（`codex/recent-scroll-gpu-label`）：滚动期间暂时把背后 3D 场景限制到不高于 30 FPS，停止约 240ms 后恢复；列表独立合成并停用滚动中的重阴影，保留首页玻璃和无限悬浮动画；负载监视器文案统一为“GPU”。
14. **播放定时器按状态休眠**（`codex/playback-timer-idle`）：进度更新只在当前歌曲播放时运行；无缝连播在歌曲中段每秒检查一次，只在最后 9 秒恢复 70ms 精细检查，暂停后回到低频。
15. **AI 分轨提速 + 实时精准度**（PR #38）：Apple Silicon 充足内存使用 batch 2 并直接写 FLAC，90 秒分轨提速约 36.1%；实时人声轨鼓点泄漏降低约 52.8%，仍只运行一套 FFT。
16. **软件 Logo 替换**（PR #39）：用户提供的 1024×1024 MR 原图同步替换 PNG 与 Mac ICNS，Dock、访达、窗口和壁纸模式使用同一套新图标。
17. **歌词选项切换降卡**（PR #40）：行数和翻译改用合并后的轻量轨道刷新，动画原地更新参数；按钮处理从约 50-83ms 降到约 1-2ms。
18. **AI 分轨热管理 + 实时去人声增强**（PR #49）：电池/温度异常自动 batch 1，插电温度正常的高内存 Apple Silicon 使用 batch 2；AI 最多 6 条 CPU 线程并降低进程优先级；实时伴奏轨人声残留测试从 43.6% 降到约 13%，同时保留约 52% 中置鼓点能量与 68% 冲击峰值。
19. **实时人声轨净化**（PR #50）：增加帧级人声置信度并只重建中置信号；人声轨鼓点残留约 9.88%、立体声乐器残留约 15.82%，同频侧声道乐器不再漏回；低沉男声与女声齿音均有专项保护测试。
20. **AI 分轨 CoreML 全图加速**（PR #51）：Apple Silicon 使用 MLProgram，让 UVR HQ3 的 178/178 个算子进入 CoreML；4 分 40.58 秒歌曲第二次从 171.13 秒降到 37.34 秒，约提速 4.58 倍；失败自动回退默认 CoreML / CPU。

### 新功能
- **Mac 内存面板**（#12）：`desktop/system-memory-mac.js`（vm_stat + purge，模仿腾讯柠檬），显示真实内存数据。
- **Touch Bar**（#14、PR #46）：老款 Intel MBP 播放控制；歌曲名、歌手和播放状态现在从渲染进程实时同步。
- **x64 打包**（#13）：`build:mac:arm64` / `:x64` / `:all`，CI matrix 双架构。
- **倍速 + 唱歌模式 + 歌架交互**（#26）：可调原唱、频谱去人声、麦克风律动及音频图重建防爆音。
- **启动页快速进入**（`codex/gpu-mode-fast-splash`）：动画出现后任意时刻点击、回车或空格都能立即进入。
- **Mac 真实显卡占用监视**（#29）：负载窗口通过 `ioreg` 显示系统 GPU 占用；只在窗口打开时每 2 秒采样，壁纸模式停止采样，失败时显示 `--`。
- **播放器 GPU 占用监视**（PR #48）：GPU 行与 CPU 一致显示“系统 xx% · 播放器 xx%”；播放器数字来自非阻塞 WebGL GPU 计时，只在 HUD 打开时采样。
- **本地 AI 人声 / 伴奏分轨**（`codex/ai-stem-separation`）：保留实时滤镜并新增 AI 模式；复用本机 UVR HQ3 模型生成两条真实音轨，缓存后同曲可直接切换，不上传歌曲。
- **K 歌升降 Key**（`codex/karaoke-key-shift-toggle-layout`）：支持 `-6` 到 `+6 Key`，实时分离和 AI 双轨共用最终混音后的一个 SoundTouch 处理器；倍速与麦克风不受影响，`0 Key` 完全旁路。

### Bug 修复
11. **音源切换死循环卡死**（#16→#17）：toast 无节流导致主线程被 reflow 占满。修：toast 800ms 节流 + `_playbackFailCounter`（同首歌 15 秒失败超 3 次跳下一首）+ 换源保留 `_lastPlaybackFailAt`。
12. **WebGL 上下文丢失黑屏**（#18）：加 webglcontextlost 监听 + 自动恢复。
13. **渲染进程崩溃**（#20）：加 `render-process-gone` 监听，崩溃自动 reload。`sendWindowState` 加 webContents.isDestroyed 防护。
14. **purge 免密 + 防爆音**（#21）：优先 `sudo -n purge`（免密），purge 前暂停音频 purge 后恢复（修喇叭"噗"爆音）。
15. **内存按钮短静音防噗声**（#23）：修复"压缩播放器 / 系统释放 / 提权释放"播放中仍可能噗声；清理前淡出并静音，清理后恢复音量，不再用 `togglePlay` 播放/暂停切状态。
16. **显卡重启弹窗黑边**（#27）：修复切换显卡模式后点“稍后重启”导致页面横向偏移、右侧出现大块黑边；焦点进入与恢复均使用 `preventScroll`，避免带动页面滚动。
17. **音频上游断线保护**（PR #41）：上游音频传输中断且响应头已经发出时，只关闭当前损坏连接，不再重复发送 500 响应，避免 `ERR_HTTP_HEADERS_SENT` 让本地服务退出。
18. **整队不可播计数修复**（PR #42）：拿到音频 URL 不再提前清零连续跳过计数；只有当前切歌任务确认本地或网络歌曲真正播放后才清零，避免无效 URL 让整队保护失效。
19. **快速切歌与进度跳转竞态修复**（PR #52）：快速下一首合并到最终歌曲并立即卸载旧源；20 次快速拖动只执行当前和最后目标，过期任务恢复增益；AI 副轨到达最终时间后才继续播放。
20. **2.0 官方登录回归修复**（PR #57）：公开版网易/QQ/酷狗官方窗口不再把 Cookie 发回渲染进程或调用被禁用的手动导入接口；主进程直接验证并通过 `safeStorage` 保存，手动导入仍关闭。
21. **2.0 音质换流卡死与歌词残影修复**（PR #57）：音质选择不再复用完整切歌；同曲换流串行合并到最后一次，旧流保留到新流可用，失败恢复旧流与时间，歌词舞台和听歌会话不重建，通知按单卡替换。

### 基础设施
17. **协作规则**（#8）：`.github/AGENT_COLLABORATION.md`（Codex+GLM 协作规则、术语解释、rollback、PR 四要素）
18. **移植包**（#15）：`mac-porting/`（7 个 patch + MAC_PORTING_GUIDE.md）
19. **本机崩溃记录**（PR #43）：最新代码重新接入 crashReporter；`.dmp` 和最多 50 条诊断只存本机，递归查找 Crashpad 子目录，上传开关关闭。

## 已知问题（待解决）

### 🔴 渲染进程崩溃（exitCode: 5, reason: 'crashed'）—— 最重要
- **现象**：播放某些不可播的歌（如《你不知道的事》网易云+QQ 都失败）触发 QQ 换源搜索后，渲染进程 segfault 崩溃（`exitCode: 5`）。
- **已做的**：崩溃后自动 reload 恢复（PR #20）；最新分支已重新接入本机 crashReporter，真实隐藏测试窗口崩溃成功生成 `.dmp`，不上传服务器。
- **未做的**：还没有在用户真实资料中再次复现原问题，因此尚未拿到对应 GPU 崩溃 dump，也不能确认最终根因。
- **下一步**：用户运行最新分支并复现《你不知道的事》等场景，然后收集 `CrashDumps/` 下的 `.dmp` 和 `crash-diagnostics.json` 分析。

### electron-builder 签名阶段偶发卡住
- 本地构建有时卡在签名阶段（Apple Development 证书 + Keychain 交互）。用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 可跳过。

## 待办清单

- [x] **全局透视模式与共享摄像头**：摄像头作为所有预设通用底图，默认歌词/封面、粒子、P10/P11 保持前景；手势与透视使用单流 owner 管理，隐藏/最小化/遮挡时暂停，假摄像头隔离验收通过。
- [x] **选择性恢复 Wallpaper Engine 局域网库**：只接入验证后的发现、素材导入和 Scene 预览/导出，不整版覆盖 PR #113，不恢复已删除的背景裁切界面。
- [x] **安全恢复汽水目录**：只提供无需登录的公开目录与歌词，并经严格匹配自动换源；直接播放、登录、会话读取和解密链路保持禁用。
- [x] **交付本轮透视/Wallpaper/汽水目录融合**：提交 `b9cd6ae` 已推送并创建 PR #116；228/228、本机干净 arm64 构建、严格签名、登录/权限迁移和唯一 App 实装均已完成。GitHub Actions 目前仅被仓库 Billing 阻止启动。
- [ ] **下一发布版恢复匿名活跃统计（发布阻塞）**：补齐同时在线、DAU、WAU、MAU、YAU、累计安装/下载、版本分布与趋势；实现明确 opt-in、默认拒绝、可撤回的前台有界心跳，完成后端时间窗口与隐私字段验收。当前 2.0 不得中途开启。
- [x] **重新接入崩溃记录**：本机 crashReporter 已在最新代码启用，真实测试生成 `.dmp`，上传关闭。
- [ ] **渲染进程崩溃根因**：在用户真实资料复现后分析 `.dmp` 和 `crash-diagnostics.json`（上面详述）。
- [ ] **真机对比三种显卡模式**：分别重启到自动/省电/高性能，播放同一首歌 10 分钟，对比温度、CPU 和流畅度。
- [x] **继续发烫优化**：主循环空闲时从高频 RAF 唤醒改成真正休眠；idle guide 在禁用无内容和深后台时彻底停止。
- [x] **唱歌模式降载**：原唱 100% 时旁路 Worklet；暂停、无歌曲、结束、错误或深后台时停止麦克风采集，恢复播放/前台后自动重开。
- [x] **唱歌模式双向混音**：伴奏和人声音量独立调节，支持去人声或去伴奏；双 100% 时原声直通。
- [x] **Mac 内存面板两个开关**：播放中只做播放器软清理并延期系统释放；暂停且进入后台后再补做；管理员开关关闭时不弹密码框。
- [x] **最近播放滚动卡顿**：滚动期间让 3D 背景临时降到不高于 30 FPS，停止后恢复，玻璃与首页无限悬浮动画不变。
- [x] **第二批卡顿优化**：播放进度定时器按播放状态启停；无缝连播只在最后 9 秒高频检查。
- [x] **本地 AI 人声 / 伴奏分轨**：首次在本机计算，缓存后直接读取；切歌、取消和播放同步已验证。
- [x] **AI 分轨提速与实时精准度**：90 秒分轨提速约 36.1%；实时人声轨鼓点泄漏降低约 52.8%，69 项检查通过。
- [x] **AI 分轨热管理与实时伴奏轨增强**：电池/发热自动 batch 1，线程上限 6 并降低优先级；伴奏轨加强消人声且补回鼓点第一下瞬态。
- [x] **实时去伴奏保留人声增强**：鼓点与侧声道乐器进一步压低，人声支路改为中置输出；完全居中的相似乐器仍需 AI 分轨。
- [x] **AI 分轨 CoreML 全图加速**：178/178 个算子进入 CoreML；完整歌曲第二次 37.34 秒，约提速 4.58 倍；Intel/非 Mac 保持原路径并有回退保护。
- [x] **快速切歌异步竞态**：连续点下一首会串行合并到最终目标；旧音源立即卸载，UI 只在新音源赋值后更新。
- [x] **连续拖进度条异步竞态**：20 次快速拖动只执行当前和最后目标；过期静音、播放请求与 AI 副轨同步均有保护。
- [x] **替换软件 Logo**：原图无裁剪替换 PNG，并生成 16-1024 像素的 Mac ICNS；未签名 arm64 App 打包验证通过。
- [x] **歌词选项切换卡顿**：按钮先完成绘制，行数/翻译只生成附近 11-18 行，动画切换不再重建歌词网格；快速连点只处理最后一次。
- [ ] **AI 分轨真实歌曲听感**：用 3-5 首人声、鼓点和混响风格不同的歌对比人声 / 伴奏残留。
- [x] **音频代理重复写响应头**：上游中断且响应头已发出时关闭当前连接；自动复现确认本地服务不会退出。
- [x] **整队不可播计数清零时机**：从“拿到 URL”后移到当前歌曲确认播放成功，旧切歌任务和播放失败不会清零。
- [ ] **测试内存清理**：播放时分别点"压缩播放器 / 系统释放 / 提权释放"，确认不弹密码、不爆音、不丢播放状态
- [ ] **Touch Bar 实测**：找老款 Intel MBP
- [x] **x64 CI 验证**：PR #45 使用 macos-15-intel，GitHub 在线 x64 构建 59 秒通过；arm64 41 秒通过。
- [x] **Touch Bar 歌曲名推送**：切歌同步歌名/歌手，播放状态同步图标；窗口重建不重复监听。
- [x] **K 歌升降 Key + 启动开关对齐**：实时 / AI 模式兼容升降 Key；修复标题被塞进网格导致两个启动开关对角错位。
- [x] **GPU 系统/播放器占用**：负载监视器 GPU 行补齐播放器占用；异步查询不阻塞画面，不支持时显示 `--`。
- [x] **清理并永久排除 `.omc`**：仓库无残留；Git 与 electron-builder 全局排除，临时探针打包验证未进入 app.asar。
- [x] **建立 2.0 删除汽水的公开分支**：正式身份、凭据保护、本地 API 同源限制、隐私与许可证文件、arm64/x64 候选 DMG 均完成。
- [x] **修复 2.0 官方登录回归**：网易/QQ/酷狗官方登录会话由主进程直接保存；不再经过 403 的手动导入接口，也不把原始 Cookie 返回渲染进程。
- [ ] **2.0 Developer ID 签名与 Apple 公证**：本机当前没有有效签名身份，未签名候选不能作为最终公开包。
- [ ] **2.0 音乐平台授权确认**：网易云、QQ、酷狗等接口/内容播放链路缺少仓库内授权证明；不能仅靠免责声明认定合规。
- [ ] **2.0 隐私主体信息**：补充运营者、联系方式、数据删除入口和永久隐私政策网址。
- [ ] **2.0 Intel 真机验收**：在真实 Intel Mac 上验证启动、搜索、播放、歌词、手势、麦克风与 AI 分轨。

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
- PR：#34，分支：`codex/recent-scroll-gpu-label`；基于 PR #33；GitHub 设计 commit（代码存档点）`620d079`，功能 commit `0723b9e`，审查测试 commit `08a3713`。
- 根因：最近播放滚动时，列表合成、卡片悬停阴影和背后的 3D 场景同时争用 GPU，触控板滚动容易掉帧。
- 改动：列表滚动活动期间把 3D 场景限制到不高于 30 FPS；用户原本选择 24 FPS 时仍保持 24；停止约 240ms 后恢复原设置。列表增加滚动隔离和独立合成层，滚动时停用卡片位移与重阴影。
- 视觉边界：首页玻璃效果、30 条最近播放、无限悬浮动画均保留；负载监视器的“显卡”文字改为“GPU”。
- 验证：`npm run check` 共 44 项通过，相关前端语法与 `git diff --check` 通过；Electron 临时资料实测 30 条列表可滚动，前台帧率从 45 → 30 → 45 自动恢复，HUD 显示 GPU，运行日志无报错。独立审查无严重或重要问题，并补充真实 `fx.maxFps=24` 调度路径测试。
- 未验证：真实用户历史封面全部加载时的长时间触控板手感仍需用户在正式资料下确认。

**2026-07-13：Codex 让播放进度与无缝连播定时器按状态休眠。**
- PR：#36，分支：`codex/playback-timer-idle`；基于 PR #34；设计 commit（代码存档点）`9c92056`，功能 commit `7e18ee9`，审查修复 commit `05fc076`，测试补充 commit `9a17a81`。
- 播放进度：原来页面启动后永久每 200ms 运行；现在仅当前音频真正播放时运行，暂停、结束、清空或报错后完全停止。已经播放的预载音频在无缝交接后会立即接管，不依赖新的 `play` 事件。
- 无缝连播：原来整首歌每 70ms 检查；现在歌曲中段每 1000ms 检查一次，最后 9 秒且正在播放时才恢复 70ms。暂停、恢复、跳转和歌曲时长变化会立即重新安排频率。
- 边界：没有修改静音阈值、预载时机、淡入淡出和切歌算法。
- 验证：`npm run check` 共 50 项通过，`git diff --check` 通过；Electron 临时资料实测预载音频接管后进度正常更新，暂停后定时器为 0，尾段调度顺序为 `1000 → 70 → 1000`。独立审查发现的无缝交接和尾段恢复问题均已修复，复审通过。
- 未验证：真实歌曲连续播放时的长期温度变化，以及同一专辑两首歌间的真实无缝切歌听感。

**2026-07-13：Codex 增加本地 AI 人声 / 伴奏分轨。**
- PR：#37；分支：`codex/ai-stem-separation`，基于 PR #36；设计 commit（代码存档点）`a6f31ca`，核心 commit `2ebf1cc` / `2babc4c` / `987b17e`，审查修复 commit `1b3e3a5` / `f4b8b7c`。
- 根因：原实时滤镜只能按左右声道位置判断，无法区分同样位于中间的人声和鼓点；继续调参无法解决“人声轨仍有鼓点”。
- 改动：唱歌面板增加等宽“实时 / AI”；AI 模式调用本地 `audio-separator 0.44.3` 和 UVR HQ3 模型，分轨期间原曲继续播放，完成后在当前时间切换到两条 FLAC 音轨。两条滑块直接控制伴奏和人声音量。
- 缓存与隐私：结果保存到 Electron `userData/ai-stems`，同曲不重复计算；歌曲和模型不上传任何第三方。切歌、取消和退出会终止 AI 子进程。
- 审查修复：防止加载中切歌后旧分轨覆盖新歌；取消下载会清理半截文件；切歌时优先读取新 `src`，避免滞后 `currentSrc` 指向旧分轨。
- 验证：`npm run check` 66 项全部通过；本机 UVR HQ3 模型真实生成两条 FLAC，CoreML/MPS 加速生效。Electron 独立设置实测首次分轨、缓存命中（925ms 完成切换）、两轨播放 / 暂停 / 跳转 / 滑块增益和取消均通过；测试只用假媒体参数，未调用真实摄像头或麦克风。
- 未验证：不同真实歌曲的最终听感；其他没有安装 UVR 或 `uv` 的 Mac 会安全提示组件不可用，本轮不把大型 AI 依赖打进 dmg。

**2026-07-13：Codex 加速本地 AI 分轨并降低实时鼓点残留。**
- PR：#38；分支：`codex/stem-speed-accuracy`，基于 PR #37；设计 commit（代码存档点）`ff3ebb5`，功能 commit `45f5a25`，基准文档 commit `b2f0020`。
- AI 提速：Apple Silicon 且内存不少于 12GB 时使用 `mdx_batch_size=2`，低内存、Intel 和非 Mac 自动回退 1；增加 `--use_soundfile` 直接写 FLAC，模型仍为 UVR HQ3，AI 进程仍按任务退出。
- 真实基准：90 秒固定 WAV 从 87.42 秒降到 55.82 秒，提速约 36.1%；batch 2 输出与基线逐样本一致，直接写 FLAC 的最大差异只有 1 个 16-bit 采样单位，SNR 约 70.5dB。
- 实时精准度：加入声道相干性、音量平衡、瞬态检测、高频保护和快降慢升掩码；人声轨鼓点泄漏从 0.309 降到 0.146，降低约 52.8%，持续人声保留 100%，处理没有变慢。
- 验证：`npm run check` 69 项全部通过；Electron 假媒体实测 AudioWorklet、播放/暂停麦克风生命周期、双滑块和 AI/实时切换正常；未签名 arm64 目录包通过，`app.asar` 含新代码且不含模型、测试和缓存。
- 测试说明：测试期间听到的持续“嗡嗡声”来自固定测试 WAV 中约 220Hz / 880Hz 的基准音，不是软件、麦克风或分离算法故障；测试音已停止。
- 未验证：仍需用 3-5 首真实歌曲确认最终听感；有签名构建在本机钥匙串阶段返回 `errSecInternalComponent`，未签名构建正常。

**2026-07-14：Codex 替换 Mineradio 软件 Logo。**
- PR：#39；分支：`codex/app-logo`；基于 PR #38；设计 commit（代码存档点）`35e263a`，图标 commit `0fb2a10`。
- 改动：用户提供的 1024×1024 MR 原图原样替换 `build/icon.png`，并由同一原图生成完整 `build/icon.icns`；不裁剪、不加圆角，不修改 Windows 图标和播放器逻辑。
- 验证：PNG 与源图 SHA-256 完全一致；ICNS 反向展开后 16-1024 像素共 10 个标准尺寸齐全；`npm run check` 69 项全部通过；未签名 arm64 App 打包通过，App 包内 ICNS 与构建资源完全一致。
- 未验证：未制作签名 DMG，也未安装覆盖当前正式软件；macOS 如果短暂显示旧图标，安装新包或刷新 Dock 缓存后会更新。

**2026-07-14：Codex 优化歌词选项按钮切换卡顿。**
- PR：#40；分支：`codex/lyrics-option-switch-lag`；基于 PR #39；设计 commit（代码存档点）`c958f86`，功能 commit `736b16f`。
- 根因：歌词行数、双语翻译和歌词动画每次点击都会同步销毁当前 3D 歌词并重建 Canvas、模糊光晕、纹理和网格；90 行双语压力测试的完整轨道有 180 行网格，同步构建约 83ms，首次 GPU 提交可出现约 2.15 秒停顿。
- 改动：行数和翻译先让按钮完成绘制，再合并连续点击并只生成当前附近的轻量轨道；动画直接更新当前、过渡和预热歌词的运动与着色器参数，不再重建歌词。
- 实测：按钮处理约 1-2ms；轻量轨道只有 11-18 行，构建约 11-21ms；动画切换 `lyrics.mesh-build` 为 0 且保留同一个网格；快速连点只构建一次并停在最后选项。
- 验证：新增 4 项回归测试，`npm run check` 共 73 项全部通过；未签名 arm64 App 打包通过，app.asar 含新代码且不含测试脚本。
- 未验证：仍需用户在自己的真实歌曲和视觉设置下确认切换手感；未制作签名 DMG。

**2026-07-14：Codex 修复音频上游中断导致本地服务退出。**
- PR：#41；分支：`codex/audio-proxy-disconnect`；基于 PR #40；功能 commit（代码存档点）`1bc8b00`。
- 根因：`/api/audio` 已经把上游的成功响应头发给播放器后，`reader.read()` 遇到上游断线抛错；异常处理再次调用 `writeHead(500)`，触发 `ERR_HTTP_HEADERS_SENT`，未处理的异步异常最终让 Node 本地服务退出。
- 改动：响应已结束或连接已销毁时直接返回；响应头已经发出时只关闭当前损坏连接；只有尚未发出响应头时才发送 500。
- 验证：新增真实本地上游服务器中途断线测试；修复前稳定复现进程退出，修复后进程继续处理新请求；`npm run check` 共 74 项全部通过，`git diff --check` 通过。
- 未验证：真实公网音源断线时，当前歌曲仍会失败并进入播放器原有换源逻辑；本轮只防止本地服务被连带退出。

**2026-07-14：Codex 修复整队不可播保护被无效 URL 提前清零。**
- PR：#42；分支：`codex/playback-skip-reset`；基于 PR #41；功能 commit（代码存档点）`5d275bf`。
- 根因：网络接口只要返回非空 URL，`playQueueAt` 就立刻清零 `playbackSkipCascade`；即使该 URL 随后网络失败、解码失败或无法真正播放，整队连续失败记录也已丢失，可能再次绕回旧歌曲。
- 改动：新增 `confirmQueuePlaybackStarted`，同时校验当前切歌 token、队列下标和音频播放状态；本地歌曲与网络歌曲均在 `playAudio()` 成功且 token 仍有效后调用。删除拿到 URL 时的提前清零。
- 验证：新增 2 项回归测试，覆盖暂停/失败、旧切歌任务、非当前歌曲和真实成功路径；`npm run check` 共 76 项全部通过，相关脚本语法与 `git diff --check` 通过。
- 未验证：仍需用整队不可播的真实歌曲队列观察最终提示和停止跳转行为。

**2026-07-14：Codex 在最新代码重新接入本机崩溃记录。**
- PR：#43；分支：`codex/crash-diagnostics-latest`；基于 PR #42；功能 commit（代码存档点）`9ce0014`；接手已关闭的 PR #22，但按最新代码重新实现。
- 改动：新增独立 `desktop/crash-diagnostics.js`，在创建渲染进程前启动 Electron crashReporter；记录 `render-process-gone` 与异常 `child-process-gone`，保留最近 50 条 JSON；递归扫描 Crashpad 子目录中的 `.dmp`。
- 隐私：`uploadToServer: false`，不配置上传地址；崩溃文件、GPU 状态和诊断 JSON 只写入本机 `userData/CrashDumps`。
- 验证：3 项模块测试覆盖本地保存、子目录扫描、50 条上限和主进程接入；`npm run check` 共 79 项通过；隐藏 Electron 测试窗口调用 `forcefullyCrashRenderer()` 后真实生成 1 个 `.dmp` 和 1 条诊断，上传状态为 false；未签名 arm64 App 打包通过，app.asar 包含诊断模块且不含测试脚本。
- 未验证：原用户歌曲场景尚未再次崩溃，仍需用户运行新分支复现后提供 dump，才能分析 GPU/Chromium 根因。

**2026-07-14：Codex 永久排除 `.omc` 工具缓存。**
- PR：#44；分支：`codex/exclude-omc-cache`；基于 PR #43；功能 commit（代码存档点）`87c1875`。
- 检查：Git 当前没有跟踪任何 `.omc` 文件，本地也没有遗留 `.omc` 目录；旧待办中的垃圾已经清理。
- 改动：electron-builder 的 `build.files` 增加 `!**/.omc/**/*`，与现有 `.gitignore` 形成双重保护；新增配置回归测试并接入 `npm run check`。
- 验证：完整自动检查 80 项通过；在 `public/js/modules/.omc/` 临时放入探针后执行未签名 arm64 打包，app.asar 中无 `.omc` 和探针；验证后已删除临时目录。
- 未验证：无。

**2026-07-14：Codex 修复 macOS x64 CI 永久排队。**
- PR：#45；分支：`codex/fix-x64-ci-runner`；基于 PR #44；功能 commit（代码存档点）`4661f78`。
- 根因：GitHub 官方运行器列表已删除 `macos-13`，旧 x64 job 的 `runner_id` 一直为 0，说明没有机器可匹配；`macos-14` 也从 2026-07-06 进入弃用期。
- 改动：arm64 使用 `macos-15`，x64 使用 `macos-15-intel`；构建工作流和 `scripts/**` 变更纳入 PR 触发路径；同一 PR 使用 concurrency 自动取消旧构建。
- 本地验证：新增 2 项配置回归测试，`npm run check` 共 82 项通过，`git diff --check` 通过。
- 在线验证：GitHub Actions run `29273985362` 中，arm64 在 41 秒内通过，x64 在 59 秒内通过；x64 已获得真实 Intel 运行器，不再永久排队。`codex-review` 仍因仓库原有 server info 文件缺失而失败，与双架构构建无关。
- 未验证：尚未打测试 tag 生成两个正式 DMG；PR 的目录包验证已经通过。

**2026-07-14：Codex 补齐 Touch Bar 歌曲名与播放状态同步。**
- PR：#46；分支：`codex/touchbar-track-sync`；基于 PR #45；功能 commit（代码存档点）`28e61b3`。
- 根因：`desktop/touchbar.js` 已监听 `touchbar-update-track`，但 preload 没有向前端暴露发送方法，前端也从未发送该事件；窗口重建还会重复注册监听。
- 改动：preload 增加安全发送桥；切歌更新歌曲名/歌手，播放事件更新播放状态；Touch Bar 在页面加载前初始化；窗口重建先解除旧监听，关闭后清理。
- 验证：3 项专项测试覆盖标题截断、播放图标、完整发送链路、首个状态和重复监听；`npm run check` 共 85 项通过，相关脚本语法与 `git diff --check` 通过。
- 未验证：仍需在 2016-2019 带 Touch Bar 的 Intel MacBook Pro 上确认真实显示宽度和按钮触感；无对应硬件时为安全 no-op。

**2026-07-14：Codex 增加 K 歌升降 Key 并修复启动开关对角错位。**
- PR：#47；分支：`codex/karaoke-key-shift-toggle-layout`；基于 PR #46；设计 commit（代码存档点）`76641b8`，功能 commit `903c576`。
- 变调：唱歌面板新增对称的减号 / 当前 Key / 加号控制，范围 `-6` 到 `+6`；只改变歌曲、伴奏和原唱音高，不改变速度或麦克风声音。
- 音频链：使用 `@soundtouchjs/audio-worklet` 2.1.0 的自包含处理器；实时分离与 AI 双轨在最终混音后共用一个节点，`0 Key` 和关闭唱歌模式时完全旁路。倍速启用时由 SoundTouch 补偿媒体倍速造成的音高变化。
- 布局根因：页面启动后的 `setFxSectionBefore('t-startupAutoplay', ...)` 把“启动播放”标题插进了两列开关网格，形成 3 个网格元素，两个开关被挤成对角线；现改为对整个 `startup-toggle-grid` 插入标题。
- 验证：`npm run check` 共 92 项通过；Electron 独立资料与假媒体实测处理器成功加载，220Hz 升 3 Key 测得约 263.7Hz（目标 261.6Hz），稳定阶段 underrun 不再增长；两个启动开关实测同一行、等宽等高；未签名 arm64 App 打包通过，app.asar 含处理器和许可证。
- 未验证：仍需用户用真实歌曲听升降 Key 的最终音质和切换瞬间手感；极端 `-6 / +6` 比较容易出现算法音色变化，属于实时变调的正常边界。

**2026-07-14：Codex 让 GPU 行显示系统与播放器占用。**
- PR：#48；分支：`codex/gpu-player-usage`；基于 PR #47；功能 commit（代码存档点）`eb3ccf9`。
- 改动：GPU 行改为“系统 xx% · 播放器 xx%”。系统值仍使用 macOS `ioreg`；播放器值使用 WebGL 非阻塞 GPU 计时查询，测量 Mineradio 主 3D 场景的真实绘制耗时。
- 开销：只在负载监视器打开时每 250ms 采一帧；结果未就绪时留到下次读取，不同步等待 GPU。WebGL 不支持计时或上下文丢失时显示 `--`，恢复后重建采样。
- 验证：`npm run check` 共 93 项通过，`git diff --check` 通过。Electron 独立资料和假媒体实测 GPU 行显示对称文案；空闲底层读数约 0.29%，界面四舍五入显示 0%。GitHub arm64 36 秒、Intel x64 1 分 23 秒构建通过；`codex-review` 仍因仓库原有 server info 文件缺失而失败。
- 未验证：需用户播放真实歌曲并开启高负载视觉，确认数字变化；播放器值只表示主 3D 场景绘制，不包括 macOS 窗口合成和视频解码。

**2026-07-14：Codex 增加 AI 分轨热管理并增强实时伴奏轨去人声。**
- PR：#49；分支：`codex/stem-power-realtime-accuracy`；基于 PR #48；设计 commit（代码存档点）`618b998`，功能 commit `66e2afe`。
- AI 热管理：任务开始时读取 `powerMonitor` 的电池和温度；电池、温度非 `nominal`、Intel 或低内存使用 batch 1，只有插电、温度正常且内存不少于 12GB 的 Apple Silicon 使用 batch 2。任务运行中不因拔电突然取消，下一次任务使用新状态。
- 线程与流畅度：AI 子进程通过 `nice -n 10` 降低优先级；为系统保留至少 2 个逻辑核心，最多使用 6 条 CPU 线程。缓存目录生成 Python 启动钩子，实测 PyTorch 线程为 6、ONNX Runtime intra/inter 为 6/1。
- 实时听感：伴奏轨改用独立强力中置掩码，人声轨继续使用相位、瞬态和高频保护；新增五次方瞬态放回，避免军鼓和镲片被一起削空。仍只有一套 FFT，帧内零分配，升降 Key 和双 100% 原声旁路不变。
- 指标：反复中置人声残留从修改前约 43.6% 降到约 13%；中置高频鼓点能量保留约 52%、峰值约 68%；侧声道乐器保留大于 85%。独立审查首轮发现鼓点只剩约 1%，修复后复审无阻塞问题。
- 验证：`npm run check` 共 100 项全部通过；Electron 使用独立资料和假媒体参数正常启动；未签名 arm64 目录包通过，`app.asar` 已确认包含最终线程、电源和瞬态保护代码。GitHub Actions run `29309950486` 中 arm64 26 秒、Intel x64 1 分 47 秒构建通过；`codex-review` 仍因 `/home/runner/.codex/29309950503.json` 缺失失败，与本次代码无关。
- 未验证：真实歌曲的人声位置、混响和母带差异仍需用户试听；插电/电池连续 10 分钟的温度、耗电和完整 AI 时长仍需真机对比；CoreML 可能自行调度部分硬件工作，线程上限不等于绝对锁死全部核心。

**2026-07-14：Codex 净化实时去伴奏后的人声轨。**
- PR：#50；分支：`codex/realtime-vocal-isolation`；基于 PR #49；设计 commit（代码存档点）`be8e29a`，功能 commit `0279e58`。
- 改动：每帧统计 160-6000Hz 稳定中置信号与 1400-6000Hz 人声存在感，结合更严格的空间中心度和瞬态抑制生成下一帧人声置信度；人声支路只重建中置信号，不再把同频侧声道乐器原样放回。伴奏轨、AI 双轨、升降 Key、麦克风和双 100% 原声旁路未修改。
- 指标：主唱保留约 81.24%，鼓点残留约 9.88%，立体声乐器残留约 15.82%，同频侧声道乐器残留为 0%；低沉男声保留约 98.89%，女声齿音保留约 68.01%。
- 性能：仍只有一套 FFT、一次完整频谱扫描且音频帧内零分配；与 PR #49 同场景基准中位数从 545.9ms 到 548.1ms，约增加 0.4%。
- 验证：`npm run check` 共 104 项全部通过；Electron 使用独立资料和假媒体参数正常启动；未签名 arm64 目录包构建并启动通过。独立审查指出低男声、齿音和测试真实性风险后，均补充专项测试；中置输出是为压低侧声道乐器的有意取舍。GitHub Actions run `29312090491` 中 arm64 27 秒、Intel x64 2 分 10 秒构建通过；`codex-review` 仍因 `/home/runner/.codex/29312090497.json` 缺失失败，与本次代码无关。
- 未验证：仍需用户用 3-5 首真实歌曲试听。人声轨会变为中置，左右分开的和声与混响会被压低；完全居中且频谱接近人声的钢琴、吉他或合成器仍可能残留，需要高质量时使用 AI 分轨。

**2026-07-14：Codex 让 AI 分轨使用 CoreML MLProgram 全图加速。**
- PR：#51；分支：`codex/coreml-provider-verification`；基于 PR #50；功能与基准 commit（代码存档点）`3adb03e`。
- 根因：现有 `audio-separator[cpu]` 实际已经带 CoreML，但默认配置只支持 UVR HQ3 的 151/178 个算子并拆成 28 个分区，剩余计算回落 CPU；`[gpu]` 在 macOS arm64 无安装包，0.44.3 也没有 `--execution_provider` 参数。
- 改动：保留 `[cpu]` 包，通过 Python 启动钩子仅在 `darwin/arm64` 注入 MLProgram、ALL、动态形状和 FastPrediction 配置；建立失败自动回退默认 CoreML，并保留 CPU 兜底。实际 Provider 写入进度与缓存，界面显示 CoreML / CPU。
- 性能：M3 Pro 上 280.58 秒完整歌曲，默认 CoreML 171.13 秒；正式代码第一次 45.46 秒、第二次 37.34 秒，第二次约提速 4.58 倍。90 秒 debug 运行 10.78 秒，日志确认 178/178 个算子全部进入一个 CoreML 分区。
- 音质：完整歌曲人声轨 SDR 约 115dB、伴奏轨约 123dB；无 NaN/Inf；MLProgram 连续两次输出文件完全一致。实时分离算法未修改且原精度测试通过。
- 验证：`npm run check` 共 110 项全部通过；Electron 使用隔离资料与假媒体正常启动；未签名 arm64 目录包通过，`app.asar` 含 MLProgram 与 CPU 回退，不含无效 `[gpu]` 或 CLI 参数。
- 已知警告：CoreML 结束时仍输出一次 E5RT 动态维度警告，但任务状态 0、两轨完整且结果稳定，记录为非阻塞警告。
- 未验证：Intel Mac 真机 AI 分轨、连续 10 分钟温度和电池对比、用户真实歌曲听感。

**2026-07-14：Codex 修复快速切歌与连续拖进度条竞态。**
- PR：#52；分支：`codex/async-playback-race-fixes`；基于 PR #51；切歌 commit（代码存档点）`b7ef456`，进度与 AI 双轨 commit `9bfdcef`。
- 快速切歌：每次开始先暂停并卸载旧源，标题/歌手延后到新 `audio.src` 赋值后更新；连续点击串行处理并合并到最终目标，慢网络也不会出现“显示新歌、播放旧歌”。
- 快速拖动：同一时间只允许一个 seek，后续请求只保留最后目标；旧任务即使过期也恢复自己留下的增益，音频仍在 `seeking` 时不会提前调用播放。
- 恢复保护：进度队列会等待恢复播放 Promise 真正结束；新拖动通过有效性回调永久取消旧播放请求，并独立保存“原本正在播放”的意图，不受内部 `pause` 事件影响。
- AI 双轨：主轨跳转或暂停时先停副轨，保存最终目标；副轨完成自己的旧 seek、追到最终时间后才继续播放，不再反复追赶或短暂播旧位置。
- 验证：新增 12 项竞态测试，`npm run check` 共 122 项全部通过；Electron 独立资料与假媒体启动通过；未签名 arm64 目录包通过，`app.asar` 含最终修复且不含测试脚本。
- 未验证：仍需用户用真实歌曲在实时和 AI 模式各快速拖动 20 次，并快速点下一首 5 次，确认真实听感与最终歌曲一致。

**2026-07-23：Codex 建立 2.0 删除汽水的公开候选分支并完成双架构打包。**
- 分支：`codex/public-release-2.0`，从 PR #56 的 `codex/gesture-playback-stability` 建立；原开发分支未删除汽水。
- 公开版：版本改为 `2.0.0`，产品身份改为 `mineradio` / `com.mineradio.desktop`，关闭 internal beta、匿名遥测、登录凭据手动导入与导出。
- 汽水：删除 `qishui-api.js`、`qishui-audio-decryptor/`、Electron 登录 IPC、本地官方客户端 Cookie 数据库读取、Token/Cookie 粘贴及所有 `/api/qishui/*` 后端路由；UI 不再显示汽水入口。原实现因涉及读取第三方客户端会话、模拟客户端与受保护音频解密，不适合作为公开发行能力。
- 安全：本地服务默认只监听 `127.0.0.1`，外部网页 Origin 实测返回 403；网易/QQ/酷狗会话与 Spotify token 在正式版通过 Electron `safeStorage` 加密保存；生产依赖审计为 0 个已知漏洞。
- 隐私/许可：加入 `PRIVACY.md`、`THIRD_PARTY_NOTICES.md`、MediaPipe Apache 2.0 许可证与 `docs/PUBLIC_RELEASE_2.0_AUDIT.md`；补齐摄像头和麦克风用途说明。
- 验证：全量 JavaScript 语法通过；`npm run check` 131/131；arm64 打包版真实启动并监听 `127.0.0.1:3000`；`app.asar` 无汽水 API、登录桥和解密器。产物为 `Mineradio-2.0.0-arm64.dmg`（SHA-256 `6fb6cecea002db5ee0f6d352c6ea6e217ea62d9302bec9fc4d96c648076fbd6a`）与 `Mineradio-2.0.0-x64.dmg`（SHA-256 `ab97d3b50b20f6ced16031f04ad55176534a8f36ed755a03d4ce4d7575380e73`）。
- 未验证/阻塞：本机 `security find-identity` 为 0 个有效身份，两个 DMG 未签名、未公证；Intel 仅校验二进制为 x86_64，未做真机启动；隐私主体信息和第三方音乐平台授权仍需发布者补齐。

**2026-07-24：Codex 修复 PR #58 唱歌模式不可用与桌面/壁纸掉帧。**
- 分支：`codex/mineradio-2.0-unified`（草稿 PR #58）。
- 唱歌：`setSingingMode` 开/关强制 `rebuildAudioGraphNow()`；`audioGraphHealthy` 识别“需要去人声但 `vocalCutChain` 缺失”；`#singing-control` 抬高 z-index，避免被音量 hover 桥接层挡住。
- 桌面/壁纸：`isDeepBackgroundMode` / `isVisibleBackgroundMode` 在壁纸模式下返回 false，防止 4×4 缓冲与 15fps 后台；暂停后等舞台歌词褪去再计 `IDLE_AFTER_LYRIC_FADE_MS = 3000` 才空闲 2fps 降帧。
- 测试：新增 `test-wallpaper-idle-throttle.js`、`test-singing-mode-graph-rebuild.js`；更新省电测试中“100% 不重建”的过时预期。`npm run check` **163/163**。
- 未重打包 DMG；源码修复推到 PR #58 后由用户决定是否再打安装包。

**2026-07-24：Codex 修复 2.0 官方登录回归并完成本机 2.0 交付。**
- PR：#57；分支：`codex/public-release-2.0`。
- 根因：网易、QQ、酷狗官方窗口成功取得会话后，渲染进程仍把 Cookie POST 到公开版已按策略禁用的手动导入接口，稳定返回 403；因此首批 2.0 arm64/x64 候选均表现为扫码成功后无法登录。
- 修复：新增仅供主进程调用的官方登录桥，直接把官方窗口会话交给本地服务校验并经 `safeStorage` 加密保存；渲染进程只收到去敏后的账号状态，不再接触原始 Cookie。公开版手动导入、导出仍关闭，汽水仍删除。
- 界面：公开版隐藏 Cookie 登录模式、手动导入面板和按钮，平台胶囊只标“官方扫码 / 官方窗口 / 官方 OAuth”。
- 并行协作合并：保留远端 `e838282` 的旧明文登录态加密迁移和禁用音源队列保护；安全复核纠正了“无端口 Origin 按服务端口放行”的跨源风险，并要求迁移或落盘失败时拒绝继续使用明文凭据。
- 控制条/歌单架：15 个底部控制按钮恢复 260ms 即时功能说明；3D 歌单架滚动阈值由 `190` 调到中间档 `140`，没有改变上下方向映射。
- 验证：官方登录桥、公开策略、控制提示与歌架方向专项测试及 `npm run check` 共 140 项全部通过；从 `/Applications/Mineradio.app` 实际启动后逐一触发 15/15 个提示成功，运行态向下 `+1`、向上 `-1`，可见界面没有汽水或 `QS`；`git diff --check` 通过。
- 产物：最终 `Mineradio-2.0.0-arm64.dmg` SHA-256 `4585bb944fb8a303e5c43b8e7277832480f880e2c57eb4420d97977f4ef21199`；`Mineradio-2.0.0-x64.dmg` SHA-256 `52de9ccfc45193e3149c0fa43c88c7bbcf24283999c3bdf9c5705c373fef6525`。两份均实际挂载，应用二进制分别为 arm64 / x86_64；两包 `app.asar` 均为 `75658b20f8b9ccfd1ee193a399375e150dc4920aaf0a1063c7fce981176839e2`。
- 本机安装：`/Applications/Mineradio.app` 已替换为 arm64 2.0.0，并与构建版及 DMG 内源码哈希一致。桌面两个旧构建 App 和旧 1.1.3 已移入 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex` 并改为 `.app.backup`，系统只剩一份有效 `Mineradio.app`。最终两份 DMG 位于桌面根目录，文件名没有“公开版”后缀。
- 官网教程：拖入“应用程序”、`xattr -cr /Applications/Mineradio.app` 和“隐私与安全性 → 仍要打开”仍适用；“Intel 与 Apple 芯片同一安装包”不适用于 2.0，官网上线时要改为两个架构入口。
- 未验证：真实网易、QQ、酷狗账号仍需各完成一次人工扫码/登录验收；本轮不读取、不记录任何用户账号凭据。
- Obsidian：当前环境仍没有 `/Users/chy/菜鸡的仓库/菜鸡的仓库/02 知识编译/Mineradio Mac 开发进度.md`，无法同步，待仓库主人侧补记。

**2026-07-24：Codex 移除账号界面不可靠的会员等级标签。**
- 原因：QQ、酷狗等平台的会员字段可能缺失或延迟，真实 SVIP 账号会被界面错误标成“普通”。
- 改动：登录音源卡、右上角账号胶囊、账号详情和登录状态文案均不再显示“普通 / VIP / SVIP / Premium / Free”；QQ 的“同步会员”入口统一为正常的“刷新状态”。
- 边界：`providerVipLevel`、`hasProviderVip`、`hasProviderSvip` 等后台能力判断仍保留，音质和受限歌曲播放逻辑未删除。
- 验证：新增 `scripts/test-account-tier-display.js`；`npm run check` 共 142 项通过。Electron 隔离状态分别模拟普通、VIP、SVIP，三种状态均无等级徽标或等级文字，卡片四列布局正常。

**2026-07-24：Codex 修复音质切换卡死、歌词残影和控制按钮拥挤。**
- 根因：音质选择复用 `playQueueAt` 完整切歌，每次点击都提前清空当前音频并并发重建播放状态；QQ 自动降级又递归进入同一路径，造成令牌互相取消、`0:00`、多张通知和歌词舞台重复生成。
- 修复：新增同曲原地换流队列，当前与最后一次选择串行执行；新地址可用前保留旧流，新流失败恢复旧地址与原时间。换流不再调用 `playQueueAt`，不重建歌词、歌架、封面、喜欢状态或听歌会话；音质通知使用 `quality-switch` 单卡替换。
- 布局：底栏音质胶囊最小宽度 `64px`，桌面全屏容器宽 `66px`，与红心按钮固定留白。
- 验证：新增 `scripts/test-quality-switch-stability.js`，`npm run check` 146/146；Electron 隔离运行快速选择 `Hi-Res → 320k → 128k` 时只请求当前与最终两次，旧流保持到最终流可用，时间保留在 `57s`，歌词重建 0 次、歌词节点数不变、通知 1 张、状态锁释放，音质与红心实际间距为 `13–20px`。
- 产物：最终 `Mineradio-2.0.0-arm64.dmg` SHA-256 `af0c5dd2ee849e3fb6670bbbb67d413b046ba9e79cb4d8b0674fdead9109bd3b`；`Mineradio-2.0.0-x64.dmg` SHA-256 `448dad83ddb47fcab65a86bcf618d1a77acb307d8c7f4ae44ec6ab6283371588`；两包和 `/Applications/Mineradio.app` 的 `app.asar` 均为 `7fc71506f0dfc60bd76ed0702d200230380540a0f1e8ee7b3b4d0a450884c953`。DMG 均已挂载，包含 `Mineradio.app` 与 `/Applications` 快捷方式；安装版 Electron 运行验收无 Runtime error。

**2026-07-24：Codex 融合 Mineradio_Beat 稳定性改动并修复 QQ“我喜欢”空列表。**
- 工作分支：`codex/mineradio-2.0-unified`，以 `codex/public-release-2.0` 的音质切换修复顶端 `4a4d076` 为基线；不覆盖 `/Users/allenli/Desktop/Mineradio_Beat` 的本地未提交改动。
- Beat 融合：保留 QQ 播放密钥续期、CDN 404/403 判废、受限歌曲跳过无效音质重试、自动换源/整队风暴上限、代理断开释放、等功率交叉淡入、内存保护、音频欠载防护、体素自定义背景透明适配。
- 手势：双手推拉的距离与连线从掌心改为两只手的捏合中点，滤波响应适度提高；相机仍为 320×240、30FPS Worker 管线，上下滑动方向没有修改。
- QQ“我喜欢”根因：`fcg_musiclist_getmyfav.fcg` 的 `map` / `mapmid` 是“歌曲标识作为对象键”的集合，旧代码把对象转成 `[object Object]`，并错误按位置配对数字 ID 与 MID。现直接读取对象键，只用 MID 拉详情。
- 真实登录状态只读验证：QQ 登录及播放密钥正常，歌单卡片显示 22 首，详情接口返回 22/22 首且每首都有名称和 MID；测试过程不打印 Cookie。
- 发布边界：汽水继续禁用且后端实现不进入包；“水膜共振”按用户要求从本次发布完全撤下，发布后再打磨；本地 Cookie/Token/Provider 文件加入 `.gitignore`。
- 播放竞态追加修复：`HTMLMediaElement.currentSrc` 在刚写入新 `src` 后仍可能返回上一首，旧实现因此会把有效的新请求判为过期并清空。播放请求、重试和进度恢复的身份比较统一改为优先读取 `media.src`；真实 QQ 登录状态下在“那天下雨了”和“我知道”之间交替快速切换 12 次，12/12 次进入播放。
- 发布界面：负载监视器删除“手势 / 推理 xx ms @ xx/s”开发诊断行；没有改变用户确认过的歌单结构与上下滑动方向。
- 成功播放视觉回归：成功路径原先调用 `switchPlaybackVisualToEmily()` 强制跳到保存的播放预设，而拿不到音频地址的失败路径没有执行，因此同一界面会因播放成功/失败呈现两套样式。现在只退出首页预览并保留当前视觉，不再在播放成功时擅自切换预设。
- 最终验证：`npm run check` 158/158；安装版 QQ 登录有效，“我喜欢”22/22 首；“我知道 / 当你”交替快速切换 12/12 次启动，测试预设保持在选择值 `0` 而未跳到强制值 `2`；负载栏无手势推理行，汽水和水膜均不可见。壁纸模式窗口实测从普通 `1470×923 @ (0,33)` 扩展到完整显示器 `1470×956 @ (0,0)`，退出后恢复普通窗口。
- 最终产物：`Mineradio-2.0.0-arm64.dmg` SHA-256 `1c5bbf88b0f99b9bbf15993b11fab10c7ff4b37c1ac3823557559459ad151117`；`Mineradio-2.0.0-x64.dmg` SHA-256 `3f9a02deec3f2746968599cf6cbbd05ab6afcf957c591457151ae5c79c354488`；两包和 `/Applications/Mineradio.app` 的 `app.asar` 均为 `7192f2c0af235f510c1c3b7fade88dce6df80058687e1ffb44f44de7c29b7477`。两份 DMG 均实际挂载并含 `Mineradio.app` 与 `/Applications` 快捷方式，二进制分别为 arm64 / x86_64。
