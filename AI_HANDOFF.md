# Mineradio AI Handoff

> **安装包复核（2026-09-06 晚间）：** 本轮只复核已恢复的 App，没有替换或重签名。严格签名通过，ASAR 整包 SHA-256 仍为 `7dac0a78…c024`，归档头哈希与 `Info.plist` 一致，CDHash 仍为 `96919e2f…d1d7`。电脑操作曾实际显示启动页，随后控制通道多次超时；后续进程检查已无 Mineradio，未发现本轮新增的系统崩溃报告，退出原因未确认。不能把本次复核记为主界面、持续运行或播放验收通过，也不覆盖下文此前已完成的验收记录。三项语法检查通过；完整自动检查在允许本地端口后重跑，仍为 282/287，失败仍是已有的 3 项构建工作流和 2 项汽水策略断言。指定 Obsidian 库及本机 Obsidian 配置仍不存在，复核内容仅追加到待同步文档。

> 状态更新（2026-09-07，追加到 PR #126）：新增 `public/js/i18n.js` 中英文切换层，顶部语言按钮持久化 `mineradio-language`，覆盖主页、搜索、播放器、队列、视觉控制台、登录和壁纸控制的常见界面文案；动态节点通过低开销 `MutationObserver`（仅 childList/subtree）补译，歌曲/歌手/歌词/用户内容节点保留原文。`public/wallpaper-control.html` 同步加入语言按钮。新增 `scripts/test-i18n.js` 并接入 `npm run check`；已通过语法和专项测试。完整应用安装仍需从本提交构建候选包并重新冻结 Safe Storage 迁移链，禁止直接替换已安装包内的 app.asar。

> **应用启动修复的当前状态（2026-09-06）：** `/Applications/Mineradio.app` 已恢复为 **2026-08-15 的完整验收包**，实际启动和本地接口正常，QQ `loggedIn=true`、`playbackKeyReady=true`，更新接口 `configured=false`、`updateAvailable=false`。这是从原始备份恢复的既有包；**本轮新构建没有安装，8 月 15 日之后的界面与功能改动尚未重新实装**。
>
> **根因与恢复：** 损坏包 `Info.plist` 错将整个 `app.asar` 的 SHA-256 `184d88dd…` 写入 Electron 的归档头校验字段；该归档的正确头哈希为 `715dca24…`，所以启动报完整性错误。严格代码签名检查单独通过不能证明该字段正确。目前没有证据确定是哪个工具写错了字段，不能将自动更新认定为已证实根因。恢复采用完整历史包，未更改归档字节、重签名或重新迁移钥匙串。
>
> **恢复包身份：** `app.asar` SHA-256 `7dac0a781edf167689930d0ea050323fc9af38d005a83cba11f73eb40676c024`；归档头 SHA-256 `c5b0f9f5361d23accb1af8a3cbe240ca937b1e82c9888ef92498b8d64d9fcc9a`；CDHash `96919e2fc469fa0ea4568bd794cdb8068633d1d7`。严格签名、归档头与 `Info.plist` 一致、实际进程与本地接口检查通过。Spotlight（聚焦搜索）只索引 `/Applications/Mineradio.app`。损坏包与恢复前用户资料备份位于 `/Users/allenli/Library/Application Support/Mineradio Migration/repairs.noindex/20260906-125145/`；候选构建移至 `/private/tmp/mineradio-final-handoff-repair.noindex/`，不在桌面留下第二份应用。冻结迁移控制器保持原样，禁止直接拿它安装新候选。
>
> **源码与审查（用户已明确指定 PR #125）：** 修复已直接推送到 `bugfix/web-art-four-issues` 分支，现有 [PR #125（合并请求）](https://github.com/chyzsnb-commits/mr/pull/125) 包含 `f4b0339`（同一 2.0.0 安装包不再宣称为 2.0.1）、`60d5932`（恢复 `mineradio.update.disabled=true` 并加入断言）、`9c8648e`（实际窗口验收与版本边界记录）。首次推送范围为 `e19a00a..9c8648e`，未使用强制推送。#125 的目标分支保持 `codex/perspective-wallpaper-qishui`，仍由仓库主人审查；未合并到 main（主分支）。#127 的修复内容已全部进入它的目标开发分支，GitHub 在尝试关闭重复入口时报告 #127 已合并，因此后续统一跟进 #125，不再创建重复合并请求。未修改独立公开仓库。
>
> **验证边界：** 三项必需语法检查和正式身份/禁用更新专项测试通过。完整 `npm run check` 为 **282/287，5 项失败**，与修改前相同：3 项 macOS 构建工作流断言、2 项汽水公开目录策略断言。不能声称完整自动门禁已通过。继续验收时发现旧进程白屏，结束该进程并重新启动完整恢复包后，已通过电脑操作截图看到《稻香》的封面、歌词、粒子舞台及播放控制条。真实音频持续输出、长时间稳定性和摄像头未完成验证。Obsidian 指定库 `/Users/chy/菜鸡的仓库/菜鸡的仓库` 不存在；待同步内容已保存到 `docs/obsidian-sync/2026-09-06-app-repair.md`，该文件不代表已同步 Obsidian。
> 安装验证（2026-09-07，PR #126 国际化候选）：从提交 `36d74ef` 构建并整体 ad-hoc 签名候选包，ASAR `b55bb63d…77ed`、CDHash `deb77952…278`，`--preflight` 通过。正式安装在 Safe Storage `prepare` 前失败：旧 Electron recovery 调用缺少 `MINERADIO_MIGRATION_VERIFY_NONCE`，导致 guard 拒绝并短暂留下候选包。已从 journal 完整备份恢复 `/Applications/Mineradio.app`，保留旧 ASAR `7dac0a78…c024`/CDHash `96919e…d1d7`，严格签名和 `127.0.0.1:3000` HTTP 200 复核通过；未删除钥匙串、未要求密码。安装器已修复 recovery 环境传递 nonce（提交 `4007111`），但本轮不再重试安装，待后续从最新提交重新构建并完整演练。


> 状态更新（2026-09-07，追加到 PR #126）：新增 `public/js/i18n.js` 中英文切换层，顶部语言按钮持久化 `mineradio-language`，覆盖主页、搜索、播放器、队列、视觉控制台、登录和壁纸控制的常见界面文案；动态节点通过低开销 `MutationObserver`（仅 childList/subtree）补译，歌曲/歌手/歌词/用户内容节点保留原文。`public/wallpaper-control.html` 同步加入语言按钮。新增 `scripts/test-i18n.js` 并接入 `npm run check`；已通过语法和专项测试。完整应用安装仍需从本提交构建候选包并重新冻结 Safe Storage 迁移链，禁止直接替换已安装包内的 app.asar。


> 状态更新（2026-09-07，追加到 PR #126）：沿用现有 `usageStatsEnabled=true` 的匿名活跃度统计闸门与首启同意机制；本次只移除前端汽水搜索/音源切换/主页推荐入口，不关闭统计功能。主页玻璃和渲染调度优化已同步到本分支，待用户审查。

> 状态更新（2026-08-30 续 3，对齐 Win 2.1.0 社交与订阅收藏）：对比 XxHuberrr/Mineradio（Win 2.1.0）后补齐 Mac 缺失的后端能力——17 个端点（汽水点赞/评论/歌单收藏/加歌/专辑收藏/最近上报、专辑与歌单订阅检查、Spotify 专辑喜欢、平台能力声明）。合并方向教训：qishui-api/spotify-api 以 **Mac 版为基底**追加 Win 独有函数（反向会覆盖 Mac 的取流诊断契约/多基座，两个汽水契约测试立刻红）；Mac 的扫码 PcQr 段与 Spotify 单曲 like 函数为 Mac 独有，已保留。Win 侧 `/api/cuefield/feedback|transition` 为半成品（调用的函数 Win 源码也不存在），未移植并已注释说明。汽水红心接入现有喜欢按钮（isQishuiWritableSong + 登录引导 + /api/qishui/song/like）。`npm run check` 5/5+39/39+333/333；17 端点冒烟 7/7（未登录返回 LOGIN_REQUIRED/COOKIE_REQUIRED）。前端 UI 边界：评论面板与订阅收藏按钮的完整 UI 为后续迭代，当前 API 已就绪（desktopWindow 桥可直调）。

> 状态更新（2026-08-30 续 2，入库 pr113 未提交工作）：功能验收审计发现三项仅存在于 pr113-cli-runtime 未提交修改（歌词切换动效+速度、多行转场首帧落位 primeLyricRowTransitionStart、封面注入防护 safeMarkupAttr/coverMarkupSrc）。已将 pr113 全部 63 文件未提交改动以 `git apply --3way` 导入本分支（7 处文件与主链交叉自动合并，冲突手工解决：package.json scripts 双边测试全保留、AI_HANDOFF/CHANGELOG 两边日志都留）。审计确认的三项缺失全部补齐（lyricTransition 9 文件、primeLyricRowTransitionStart 2 文件、safeMarkupAttr 1 文件）。额外修复：`downloadExportedFile` 目标目录不存在时自动 `mkdirSync recursive`（此前直接 WRITE_FAILED，Scene 导出超时测试因此在干净环境失败）。`npm run check` 前置 5/5+39/39、主套件 333/333 全绿。仍未验收边界不变（汽水真实播放/跨机/硬件/长期温度）。

> 状态更新（2026-08-30 续，右上角残留 DIY 引导框修复）：用户反馈右上角有残留红框（此前是 DIY 标签位置）。定位：`visual-guide-ring`（视觉引导高亮环，红色光晕样式）——两组引导步骤（普通组 06/DIY、DIY 组 01/DIY）指向已不存在的 `#fullscreen-diy-btn`，且 `guideTargetRect()` 为该死元素写有右上角固定坐标兜底，环永远画在空白处。修复：删两条死步骤（DIY 组 kicker 顺延重排 01-05）、删 fullscreen-diy 特判与右上角兜底（目标缺失回屏幕中央）。preferences-ui-modes 与 CSS 中的死引用有 null 保护/无行为，暂留。真实 Electron 验证 ring opacity=0、`npm run check` 347/347。

> 状态更新（2026-08-30，软件内更新检查）：应用户要求新增 Mac 端软件内更新功能（推翻早前"不要自动更新"规则，已同步改 AGENTS.md 置顶规则第 6 条）。因无 Developer ID 证书（macOS 系统限制后台静默替换），实现为自研轻量方案：`desktop/update-checker.js`（启动 30s 后 + 每 6h 拉公开清单 `https://raw.githubusercontent.com/chyzsnb-commits/Mineradio-mac-/main/version.json`，semver 对比，IPC 通知渲染层右下角提示卡）→ 一键下载 dmg 到 ~/Downloads（流式 + .part 防护 + 源流 error 清理）→ 自动打开安装器。主进程用 Electron `net.fetch`（遵循系统代理，Node fetch 直连不通）；渲染层 `public/js/modules/10-shell/06-update-check.js`（已注册 index-loader）。发布资产公开仓库为 `chyzsnb-commits/Mineradio-mac-`（仓库主人指定发布渠道；此前临时建的 Mineradio-release 已删除）。**发布新版本流程（固定四步，详见下方「发布新版本流程」段）**：① check 全绿后构建 dmg → ② `gh release create vX.Y.Z <dmg> -R chyzsnb-commits/Mineradio-mac-` 上传 → ③ 更新其 main 分支 version.json（version/notes/url）并推送 → ④ curl 验证 raw 直链。回归 `scripts/test-update-checker.js` 5/5 接入 check（主套件 347/347）；真实 Electron 实测清单拉取 `ok:true, hasUpdate:false`、失败静默不误弹。边界：真正的后台静默替换需 Developer ID + 公证（$99/年），当前不做；自动检查仅私有仓库 mr 的 Release 不可用（匿名访问不了），故用公开 release 仓库。

> 状态更新（2026-08-30，壁纸库缩略图媒体类型修复）：基于 PR #119 head `f4da3a0`（detached 工作树 `/Users/bobby/.config/superpowers/worktrees/mr/pr119-wallpaper-thumb`）修复壁纸库缩略图黑屏。根因：`wallpaperLibraryThumb(record)` 只按 `record.type === 'video'` 输出 `<video>`，Windows 端为视频壁纸生成静态图片预览（preview.jpg/gif/png/webp）时图片被塞进 video 标签，真实 Electron 复现 `readyState=0`、`videoWidth=0`。修复：新增 `wallpaperLibraryPreviewUrlIsVideo()` 按 previewUrl 实际媒体类型（mp4/webm/ogg/mov/m4v）判断标签；详情页 `record.fileUrl` 播放与 Scene MJPEG 路径未动。验证：新回归 `scripts/test-wallpaper-library-thumb-media-type.js` 先红后绿并接入 `npm run check`（5/5+6/6+342/342）；`node --check`、`git diff --check` 通过；真实 Electron（CDP 9223）复现失败→修复后 IMG 加载成功（naturalWidth=1024）、真实 Windows 服务（192.168.1.124:8137，动态端口自动发现命中）246 条记录 186 IMG/60 VIDEO、0 错标、真实 mp4 预览 videoWidth=1920、连续抽屉开合/搜索筛选切换后 DOM 4838 无增长。用户实测下载失败已修复：根因是 Electron `net.fetch` 的 `res.body` 为 WHATWG Web ReadableStream（无 `.on/.pipe`），原实现用 Node stream API 导致真实环境必失败（`res.body.on is not a function`）；现以 `Readable.fromWeb` 统一转 Node 流。新增 Web ReadableStream 形状回归（真实 `ReadableStream` 实例 mock）；真实 134MB dmg 下载 `bytes=total=140868654` 且自动打开安装器成功。 独立发现：打开壁纸库面板时渲染进程出现 `Failed to construct 'URL': Invalid URL`（Array.filter 栈），与本次修复无关（diff 无 URL/网络代码），根因未定位，已记入待办。未提交/推送/构建的边界不变：汽水真实播放、跨机 UDP/MJPEG/导出、硬件音频输出、真实设备温度与长期帧率仍待用户验收。
> 状态更新（2026-08-24，当前轮收口）：正确工作树仍为 `/Users/bobby/.config/superpowers/worktrees/mr/pr113-cli-runtime`，分支 `codex/keep-vsync-auto-governor`，当前未提交改动保留在该树，未构建/推送。`npm run precheck` 前置专项 `38/38`、`npm run check` 主套件 `351/351`、`node --check desktop/main.js server.js`、`git diff --check` 均通过。真实运行态 Electron 进程命令包含该工作树，页面 `http://127.0.0.1:3000/` 返回 200，CDP `9223` 可用；歌词转场探针通过，逐帧 `buildLyricMesh=0`。音质套件中的 `quality stream did not start` 是主动模拟失败并验证旧流恢复的预期日志。仍不能由本机静态/模拟证据替代的验收：汽水真实 `canplay/playing` 连续播放、真实 Windows 跨机 UDP/MJPEG/Scene 导出、真实硬件音频输出、用户前台长时间帧率/温度/内存趋势。命令行试用：`cd /Users/bobby/.config/superpowers/worktrees/mr/pr113-cli-runtime && npm start -- --remote-debugging-port=9223`。

> 状态更新（2026-08-19，主页底栏严格隐藏）：用户指定的本地工作树仍为 `/Users/bobby/.config/superpowers/worktrees/mr/pr113-cli-runtime`，当前分支 `codex/keep-vsync-auto-governor`、未推送的 `HEAD` 为 `bad9c4d`；它以 PR #113 记录提交 `b029a37` 为祖先，不能把它当作已上传的 GitHub 包体。主页底栏问题的直接根因是 `updateEmptyHomeVisibility()` 已设置 `home-controls-locked`，但随后异步主页渲染调用通用 `forcePlaybackControlsInteractive()`，无条件移除了这个锁。现主页进入时锁住听歌页底栏，通用恢复函数在锁定时不再覆盖；主页明确的“展开播放器控制台”仍可解锁展示，离开主页回到听歌页会恢复原控制条。回归 `scripts/test-home-playlist-panel-gate.js` 为 `4/4`；完整 `npm run check` 为 `346/346`，`git diff --check` 与相关语法检查通过。真实 Electron CDP `9223` 在异步刷新后记录主页 `opacity=0/pointer-events=none`，明确打开控制台及回到听歌页均恢复交互；无运行时异常。Electron 当前仍由 `npm start -- --remote-debugging-port=9223` 运行，未构建 DMG、未提交、未推送。

> 状态更新（2026-08-19，综合审查首批 P1/P2 修复）：在当前正确工作树 `/Users/bobby/.config/superpowers/worktrees/mr/pr113-cli-runtime`、分支 `codex/keep-vsync-auto-governor` 上修复三项已复现问题。其一，Windows 壁纸无 UDP/ARP 时，原主动扫描按全体主机先 8130，再逐端口推进，900ms 慢失败会让真实 `8128` 永远轮不到；主动回退提前至 `250ms`、并发上限改为 `48`，无邻居时优先端口波次为 `8128`、`8130`，随后仍覆盖受限 `8123–8155`，ARP 邻居仍先验证 8130。新增“无 ARP + 每次 120ms 慢失败”回归，实际记录 `192.168.1.107:8128/api/ping` 并连接成功。其二，远程封面 URL 在搜索/队列/歌单收藏/评论/详情路径中有未编码的 `innerHTML` 属性注入；新增 `safeMarkupAttr()` / `coverMarkupSrc()`，所有本轮确认路径在进入双引号属性前编码。新增 2 项回归；隔离 Electron 实测 `home_http=200`，恶意 URL 最终仅为 `src`/`alt` 属性、无真实 `onerror`，执行计数 `0`。其三，壁纸媒体改为有界流读取，未知长度超过 `256MB` 时主动取消；Scene 导出增加来源/视频类型/大小校验、可取消超时和半截文件清理。新增未知长度超限和永不结束流回归，专项 `34/34` 通过；完整 `npm run check` `344/344`，`git diff --check` 通过。仍未处理的审查项：本地/DYI 大文件同步读取、汽水解密流无界超时、其他未逐路径迁移的动态 HTML URL，以及真正把大媒体直接落盘而非经 IPC 传输的进一步内存优化；不得把本轮三项修复表述为完整审查项全部完成。Obsidian 路径在当前环境不可访问，待仓库主人侧同步。

> 状态更新（2026-08-15，多行分区首帧连续性修复）：用户继续反馈新增多行歌词动效衔接不丝滑。真实 Electron/CDP 先确认 incoming 焦点行在 `primeLyricMeshOpacity()` 后首帧才写入起始 transform；原始采样中上浮 `y=-0.0341`、分层 `x=+0.0415`、推进 `z=+0.0190/scale=+0.0133` 的跳变均可见。第一轮预置修复后，16ms 连续采样又找出当前译文的轨道深度/尺度在第二帧从 `0.8465` 跳到 `0.8964`，横向预置还受普通帧 `0.13` 缓动限制（创建态 `x=0.0416`、下一帧 `0.0777`）。现 `primeLyricRowTransitionStart()` 在不可见状态复用行布局计算器完整落位，且只在这一帧通过 `transitionStart` 令焦点原文/译文横向直接到达起点；常规播放帧、`original` 和单行路径未改。Electron 20 组覆盖 `original/crossfade/rise/slide/focus × single/dual/triple/custom`，新增多行三项首帧轴向最大差均为 `0.0001`（推进为 `0`），逐帧 `buildLyricMesh=0`。专项、`npm run check` 与 `git diff --check` 已通过；未提交、未推送。仍需用户以真实多行歌曲试听三项动效的审美与节奏感。

> 状态更新（2026-08-15，多行动效可辨识度修复）：上一轮仅证明多行 root 不再与轨道滚动叠加，用户实测仍认为四种效果相同。Electron 采样确认 `rise/slide/focus` 的焦点变换仅约 `0.02` 世界单位或 `0.5%` 缩放，远小于约 `0.8–0.9` 的行间距和约 `6.1` 的文字宽，视觉上被共同的透明度交叉掩盖。现仍只调整多行焦点原文与当前译文：上浮淡入达到约 `0.094` 纵向位移，分层掠过约 `0.124` 横向位移，镜头推进约 `3.7%` 缩放并推进 `0.053` 景深；root、上下文、单行和 `original` 均未改。Electron 探针新增可辨识阈值，现 20 组通过，逐帧建图仍为 `0`；未提交、未推送。

> 状态更新（2026-08-15，多行转场层级修复）：用户反馈四种切换效果单行自然、多行衔接生硬。Electron CDP 采证确认根因是多行既由 `trackScrollOffset` 驱动每行轨道滚动，又由新增转场移动/缩放/模糊整个歌词 root，导致上下文与焦点重复位移；译文的可读材质没有 `uTransitionBlur`，不能错误地为了测试给它换 Shader。现 `crossfade/rise/slide/focus` 的多行 root 固定在轨道基准：经典叠化只保留 opacity；其余三项只对焦点原文和当前译文施加克制的局部 transform，blur 只作用于焦点原文，上下文原文/译文每帧归零。单行路径、`original` 的 PR #111 轨道复用、持久化和 DIY 未改。新增 `scripts/test-lyric-multiline-transition-ownership.js`，Electron 探针覆盖单行、双行、三行、自定义多行及多译文共 20 组：15 组多行 outgoing root 连续帧位移最大 `0`、逐帧建图总数 `0`、当前译文始终为焦点层。`npm run check` 前置 `30/30`、主套件 `341/341` 及 `git diff --check` 通过；未提交、未推送。

> 状态更新（2026-08-15，纠正此前错误基线）：用户确认 PR #111 `2c33fff` 的初始歌词切换**不是“经典叠化”**。其默认是 `lyricMotionStyle: 'float'` 下 `showStageLine()` 优先 `setLyricTrackTarget(current, payload)` 的原始轨道复用路径。现默认 `lyricTransitionStyle='original'`，包内初始 DIY 也同步为 `original`；仅明确选择 `crossfade/rise/slide/focus` 时，跨句才阻止当前轨道复用并构造 outgoing/incoming。无 `lyricTransitionExplicit` 的历史自动保存和 DIY 存档回到 `original`，显式选择保持。Electron CDP（`9223`）实测 `original/dual`：`reusedCurrent=true`、`outgoing=false`、边界建图 `0`、逐帧建图 `0`；四种新增效果仍保留双 mesh 可见窗口且逐帧建图 `0`。`npm run check` `341/341`、`git diff --check` 通过。此前文档中“crossfade 是 #111 默认”的记录已被本条取代，后续不得以其作为基线。

> 状态更新（2026-08-14）：歌词切换动效已从实验性的六项收敛为四项最终方案：`经典叠化`（默认、PR #111 `2c33fff` 原公式不变）、`上浮淡入`、`分层掠过`、`镜头推进`。旧存档 `quick` 自动迁移到 `crossfade`，`scale` 自动迁移到 `focus`，并会在下一次设置写入时落盘；自动保存、DIY 存档和导入/导出仍沿用既有字段。新三项仅对既有 mesh/材质的 transform 与轻度 `uTransitionBlur` 做逐帧更新，不栅格化、不写存储、不重建 WebGL 资源。真实 Electron CDP (`9223`) 对单行与双行共 8 组验证：每组都有 `outgoing=1` 与 `incoming=1`、两者 opacity 同时非零；经典叠化 blur 为 `0`，新三项有非零 blur，逐帧期间 `buildLyricMesh=0`。完整 `npm run check` 当前为前置 `26/26`、主套件 `341/341`，`git diff --check` 通过。当前改动未提交、未推送。

> 状态更新（2026-08-14）：歌词默认视觉已按 PR #111 `2c33fff` 再核对并收紧。可见歌词恢复原始 `2048px` 遮罩、封面全画布取色、即时可读性层和逐行光晕；移除了会延后可见层的无调用调度器，但保留“完整轨道仅空闲预热”的性能保护。真实 Electron 运行时稳定跨句：旧句 `0.718 -> 0.636 -> 0.276`，新句 `0.355 -> 0.748 -> 0.934`，交叉期间 `outgoing=1`，默认 `crossfade` 时序为 enter `0.6192s` / exit `0.5472s`。与 PR #111 干净配置同尺寸比较，长英文 mask 参数逐值相同：`hei`、`56px`、`2106×384`、文本 `1885.743px`、`fitScaleX=1`、世界尺寸 `6.1×1.11225`、opacity `0.96`。当前用户资料保存 `lyricFont=kai-song` 会产生 `68px` 的不同收敛字号，不能误认为默认字体被拉伸；不要静默清除用户自定义字体。新增 `scripts/test-lyric-dispose-resource-ownership.js` 并纳入 precheck；完整 `npm run check` 为前置 `24/24`、主套件 `341/341`，`git diff --check` 通过。当前 Electron 从本工作树以 `npm start -- --remote-debugging-port=9223` 运行。

> 状态更新（2026-08-14）：当前正确工作树为 `/Users/bobby/.config/superpowers/worktrees/mr/pr113-cli-runtime`，分支 `codex/keep-vsync-auto-governor`，且 PR #111 head `2c33fff` 是当前 `HEAD` 的祖先；不要改旧目录。歌词跨句硬切的直接根因是多行轨道在下一句仍复用 `stageLyrics.current`，旧句没有加入 `outgoing`。现跨句明确创建 incoming mesh，旧句以约 `0.72` 透明度离场；交叉窗口内不建立下一句纹理。隔离 Electron 的真实 WebGL 路径记录：跨句 `outgoing=1`，旧句 opacity `0.720 -> 0.157`，新句 `0.355 -> 0.533`，约 `0.56s` 后才释放，交叉期间 `buildLyricMesh` 数量不增加。默认切换为 `crossfade / 1.00`，六种样式、速度、自动保存、DIY 保存/应用、重载持久化和减少动态偏好均已验证；控制台设置包含明确的“歌词翻译 / 译文显示”。上下文巨大根因不是用户 `lyricScale` 或 P11 倍率，而是 `entry.scale` 未实际应用到 row mesh；现上下文原文基准约 `0.72`、译文约 `0.74` 或更低、透明度也明显次级，用户总缩放不被重置。主页 Electron 运行时 emulated viewport 测量：1366×838/1247×702/1000×700 最近播放高 `287/302/315px`，右侧今日聆听、下一首、发现首屏无重叠。完整 `npm run check` 前置 `23/23`、主套件 `341/341`，`git diff --check` 通过。性能前台滚轮采样仍未完成：命令会话会让隔离 Electron 变 `hidden/focus=false`，CDP wheel 不投递，故拒绝把其后台 LoAF 当作真实卡顿结论；需要在真实前台、带实际歌词/音频的 Electron 中补测连续切歌与触控板。

> 状态更新（2026-08-14）：性能续办在 `/Users/bobby/.config/superpowers/worktrees/mr/pr113-cli-runtime` 的 `codex/keep-vsync-auto-governor` 完成切歌期剩余验证。隐藏右侧歌架为 `auto / 未固定 / visibility=0` 时，伪造 12 首队列并触发封面变更不会新建卡片（`0`）；固定唤起后渐进生成 `11` 张，说明 `pendingCoverRefresh` 生效。轻量多行歌词的延后层原本在真实 Electron 中永久停在 `1/8` 可读性层、`0/8` 光晕：不是歌词构建慢，而是连续音频下 `requestIdleCallback` 实测只有 `1.4–3.5ms`（甚至更低），旧 `12ms` 门槛永远拒绝任务。单项构建实测约 `0–0.2ms`，现把最低预算改为 `1ms`，仍保留播放满 `12s`、无交互/无滚动、每次一项和曲目 token/销毁取消保护。重载 Electron 后真实多行轨道在 `32.64s` 为 `8/8` 可读性层和 `8/8` 光晕、deferred 均为 `0`；重复切歌 6.5 秒未产生 LoAF、无前端错误。一次重载后曾观测到启动期 LoAF，复现时无脚本归因且后续不复现，不能归因给本轮改动或当作温度结论。`npm run check` 前置 `19/19`、主套件 `340/340`，`git diff --check` 与相关语法检查通过。当前改动仍未提交、未推送；Electron 仍以 CDP `127.0.0.1:9223` 运行。

> 状态更新（2026-08-14）：在 PR #113 `b029a37` 基线的独立分支 `codex/performance-delete-rain-resonance` 执行用户确认的性能方案 A，优先级为“流畅性 > Bug 风险 > 温度”。“云瀑共振”已从模块加载、主循环、预设菜单、FX 控件、CSS、保存项和测试中完全移除；**不得删除预设索引 11 或重排后续预设**，它是旧存档/DIY 导入向雨境 `9` 的迁移位，声波地形/工坊仍为 `12/13`。雨境玻璃不降低场景、滴场、合成的帧率，只把水平/垂直模糊纹理更新限制在 `30Hz`，初始、尺寸变化和 WebGL 恢复强制刷新。P10 专用 512-bin 分析独立门控为 `30Hz`，相机、Three.js 城市和主渲染帧不受限。`renderer-quality.js` 现按 pass 记录 GPU 查询，`rain-glass.js` 记录 `rain-glass.*` CPU 探针，P10 记录 `audio.voxel-analysis`；这些是定位证据，不能把它们或静态回归误称为真实温度通过。专项 `6/6`、完整 `npm run check` 前置 `5/5`、主套件 `340/340` 通过，`git diff --check` 通过；当前 Electron 由该工作树运行，`http://127.0.0.1:3000` 为 `200`。真实设备上的常用曲目、雨境和 P10 的帧时间/温度仍需用户验收。

> 状态更新（2026-08-14）：PR #113 基线新增“主页不唤起左侧歌单 / 队列”守卫。根因是 `goHome()` 只在进入时隐藏一次，随后左边缘、常开歌单和直接 `setPeek/openPlaylistPanelTab/togglePlaylistPanel` 仍能分别重新加回可见状态。现在由 `canOpenPlaylistPanel()` 以 `emptyHomeActive` 统一决定许可；主页转场会清除排队边缘计时及 `peek/show`，常开偏好只在返回听歌页时恢复。没有改 3D 歌单架、队列数据、右键歌架或播放。新增 `scripts/test-home-playlist-panel-gate.js`；`npm run check` 前置 `5/5`、主套件 `350/350` 通过。独立浏览器会话实测主页左边缘 `450ms` 仍为 `opacity=0/pointer-events=none`，退出 Home 后原 `300ms` 边缘逻辑恢复。Electron 正从 `/Users/bobby/.config/superpowers/worktrees/mr/pr113-cli-runtime` 的 `codex/home-hide-queue-panel-pr113` 运行，服务 `http://127.0.0.1:3000` 返回 `200`。

> 安装状态（2026-08-11 23:10 PDT）：协作者 PR #111 `2c33fff` 与后续性能/底栏修复 `c848130` 已实际构建并安装到 `/Applications/Mineradio.app`，不再只是源码或 PR。arm64 目录包经 ad-hoc（本机临时）签名后通过 `codesign --verify --deep --strict`；安装后 `app.asar` SHA-256 为 `9fdd45e9d690ec9854904d9a1d50aebc3c9be8257170967066da2b87fa1fa36d`，对比两次提交涉及的 22 个生产文件为 `22/22` 精确一致。实际安装包用普通 Finder 等价方式启动，主进程路径为 `/Applications/Mineradio.app/Contents/MacOS/Mineradio`，`127.0.0.1:3000` 返回 200；验收调试端口已关闭。用户资料 `/Users/allenli/Library/Application Support/Mineradio` 未删除或迁移。旧安装包完整保存在 `/Users/allenli/Desktop/Mineradio-2.0-backups.noindex/installed-before-pr111-performance-20260811-231012.app.backup`，可整体回滚。因本机没有有效 Developer ID，新包不是可公开分发的签名/公证 DMG，且签名变化可能让 macOS 再次询问麦克风、摄像头或 Keychain 权限。

> 状态更新（2026-08-11）：独立分支 `codex/player-bar-single-row` 已以 PR #111 head `2c33fff` 为父提交，完整接入协作者的原生滚动、右上角单状态卡和登录退出入口，并完成切歌/队列/歌架/输出路由二次性能修复。超长歌名不会再把收藏与加歌按钮挤到下一行；连续上一首/下一首输入 `64ms` 合并到最终目标，过期异步换源、QQ 降质、跨平台降级和失败重试均有请求守卫；远程流预取期间保留旧音频，节拍磁盘缓存延后到播放成功后读取；队列当前标记和 3D 歌架优先增量更新，输出设备切换按 sink 与设备 epoch 去重串行。PR #111 原始基线严格通过前置专项 `5/5`、主套件 `327/327`；新增 21 条回归后完整 `npm run check` 为 `5/5`、`348/348`，`git diff --check` 与相关 JS 语法检查通过。隔离 Electron 从本仓库启动，首页/搜索/歌单/视觉控制台各 40 次滚动均为 0 long task，处理器 p95 约 `0.1/0.2/0.2/0.2ms`；长标题按钮同排、模拟已登录态的“退出 网易云音乐”可见、连续状态更新只留最新一张。**未验证边界：** 当前汽水上游仍没有返回真实可播流，未用用户真实账号点击退出，也未用用户实际大曲库持续切歌/触控板压测；这些必须由用户手动验收。协作者交付中的严格云盘歌词回退、本地 LRC/TXT 导入、同名 LRC/内嵌歌词优先级、P10 一级歌架与右键行为均已确认存在于本分支祖先。Obsidian 约定路径 `/Users/chy/菜鸡的仓库/菜鸡的仓库/02 知识编译/Mineradio Mac 开发进度.md` 及 `/Users` 可见范围内均不存在，本轮无法同步，未擅自创建替代库。

> 状态更新（2026-08-11）：登录接入弹窗的退出入口此前未实际可用。根因一是 CSS `.login-panel-head > div { display:none }` 同时命中新加的动作容器，导致退出和关闭按钮均不可见；根因二是已登录状态调用不存在的 `loginProviderDisplayName()`，抛 `ReferenceError` 后中断 UI 更新。现 CSS 只隐藏旧标题节点，退出按钮使用既有 `platformMeta(loginProvider).label`；登录面板开场也不再在含 `backdrop-filter` 的整块玻璃面板上使用 `blur(12px)`，避免短暂发白。Chrome 本地页以临时内存接入状态验证“退出 网易云音乐”可见、`filter:none`，测试标签已关闭且未触及登录数据。专项 4/4、完整 `npm run check` 321/321、`git diff --check` 均通过。真实 Electron 已登录的汽水退出动作仍需用户点击验收；这不改变汽水当前“可搜索但未证实可播放”的结论。

> 状态更新（2026-08-11）：修复右上角播放状态卡堆叠与页面滚动卡顿。根因一是同一条异步换源链会分别追加“切换中 / 诊断 / 结果”卡片；现在每次状态更新都会同步移除旧卡，只保留当前一张。根因二是歌单、搜索、设置和歌词详情用 `preventDefault()` 接管每个 `wheel` 事件并反复创建 GSAP 滚动 tween；现在统一恢复浏览器原生合成滚动，同时任何页面滚动会在 180ms 内把 3D 渲染预算降为 20 FPS。首页最近播放封面只在可视区附近再加载。专项和完整检查均通过（327/327）；必须重启 Electron 让已打开的旧渲染进程加载此版本。真实曲目下的主观手感仍待用户验收。[来源: `public/js/modules/05-playback/11-provider-fallback.js`、`public/js/modules/06-lyrics/01-playlist-panel-shell.js`、`public/js/modules/05-playback/03-home-discover-weather.js`、`public/js/modules/11-main-loop.js`]

> 上一状态（2026-08-11）：对本机已登录的汽水会话做了脱敏链路验证。`/api/qishui/search` 命中“蝴蝶 / 陶喆”及准确 ID `6705032260845832194`；`/api/qishui/song/url` 返回 `playable:false`、无 URL，因此没有真实汽水播放流，也不能把自动换源当作成功。根因之一是 `track_v2` 的 2xx 非 JSON 响应在 JSON 解析异常时丢弃 HTTP 状态和 Content-Type，导致诊断显示 `statusCode=0`。现仅修复该错误传播：保留状态、响应类型和 `QISHUI_INVALID_JSON`，UI 显示“无法确认可播放流（可能需要重新登录、接口变更或被上游拦截）”，仍保留可选降级并明确原因。专项回归覆盖该分支；不得输出或提交 Cookie、Token、签名 URL。**未验证边界：** 本会话未提供 Computer Use `node_repl`，无法在 Chrome/Canary 取得 `canplay`、`playing` 和连续 10 秒证据，因此当前结论是“可搜索但当前不可播放/原因待上游响应进一步确认”，不是播放通过。

> 状态更新（2026-08-11）：独立 PR [#110](https://github.com/chyzsnb-commits/mr/pull/110) 的分支 `codex/qishui-playlist-playback` 修复了汽水歌单的完整前端可达性。此前服务端已有 QS 歌单、曲目和音频接口，但歌单面板未请求 `/api/qishui/user/playlists`、强制清空 QS 列表，详情/播放队列/首次播放/无缝预取/音质切换又会落到网易云接口。现所有路径统一走 QS 专用接口；新增静态路由回归与本地假上游正向契约，未登录下歌单、曲目和音频端点会明确报不可用。完整 `npm run check` 为 `315/315`，隔离 Electron 已启动并确认主页 `200`、汽水未登录状态正确。**边界：未使用真实账号 Cookie，受保护音频解密和实际 `audio.play()` 仍需用户在登录官方汽水客户端后手测；不得写入或提交 Cookie/Token。**

> 状态更新（2026-08-11）：当前二合一工作树 `codex/wallpaper-port-and-inline-quality` 包含动态端口 UI 回填与播放器内联音质，并补齐 Windows 壁纸库无 UDP 广播时的自动发现回退。主进程监听 UDP `45678` 并返回收到时间、原文、解析失败、广播与 ping 探测结果；未收到广播时，先读取 Mac 活跃私网 IPv4 接口和 ARP 邻居，再在同网段内渐进探测 `8123–8155`，优先 `8130`、全局最多 32 并发、单请求 900ms。只接受私网地址和 `ping.ok === true`；大网段只从本机所在 `/24` 渐进。UI 显示无广播、扫描候选、ping 超时/失败/拒绝及 Windows `0.0.0.0`、UDP/TCP 防火墙诊断。专项 `27/27`、完整 `npm run check` `306/306` 通过；模拟 ARP `192.168.1.107` 的 `8130` 自动回填完整 base URL。实测 Mac ARP 能看到 `.107`，但 `curl http://192.168.1.107:8130/api/ping` 当前连接拒绝，不能声称真实跨机联通已验收。待创建新的独立 PR，禁止追加 #107/#108 或更新 main。

> 状态更新（2026-08-11）：独立工作树 `codex/inline-quality-player-ui` 已将音质选择收进歌曲标题右侧的内联信息行，待创建新 PR。结构为歌曲名 + 音源标签 + VIP 标签 + 当前音质胶囊；无歌曲禁用，换流时显示加载，选中态、曲目最高音质和 SVIP 锁定继续可见。仅移动 UI 与可访问性状态，不改原位换流、旧流恢复、歌词重建规避和进度续播逻辑。专项 5/5、完整检查 300/300；真实会员限制与多平台音质仍待 Electron 人工验收。

> 状态更新（2026-08-11）：独立工作树 `codex/wallpaper-dynamic-port-ui` 已补齐 Windows 壁纸库动态端口的前端显示，待创建新 PR。根因是服务端已返回真实 `baseUrl`，但输入 placeholder、无服务提示仍写死 `8123`，成功状态也只显示主机名。现在发现/缓存成功后输入框、状态和 localStorage 都保留完整实际地址；未发现时只提示 `http://Windows-IP:端口号`（1024-65535）。专项新增模拟 `8130` 广播与缓存优先的端到端断言；真实 Windows 服务联机验收仍待用户执行。

> 状态更新（2026-08-11）：独立工作树 codex/wallpaper-dynamic-port-discovery 已完成 Windows 壁纸库动态端口发现，待创建新 PR。广播的 IP:端口先走 /api/ping；广播缺端口或该端口失败时，仅扫描该广播 IP 的 8123 至 8155，四并发短超时。已删除旧的私有子网主机扫描，手动地址只允许明确指定 1024 至 65535 端口；已保存地址依然优先直连并在成功后持久化。壁纸专项 21/21、前置专项 5/5、主套件 300/300，合计 305/305。真实 Windows 广播、动态端口与防火墙场景待两台设备人工验收。

> 状态更新（2026-08-11）：独立工作树 codex/lyric-import-cloud-fallback 已完成本地歌词导入和云盘无词回退，待创建新 PR。保留本地曲库同名 LRC/音频内嵌歌词；新增“自动 / 本地歌词”切换及 LRC/TXT 导入（512 KiB、UTF-8/UTF-16/GB18030）。自动跨源借词仅在标题、歌手、双方时长（差值不超过 3 秒）和唯一候选优势（至少 15 分）都成立时显示；翻唱/Remix（当前或候选）、时长缺失、空词或不确定候选全部拒绝，绝不覆盖当前画面。专项 3/3、前置专项 5/5 + 主套件 298/298，合计 303/303 通过。真实云盘账号、版权歌词和导入文件的 Electron 手动验收仍待用户执行。

> 状态更新（2026-08-11）：本工作树的新分支 `codex/playback-startup-stability` 已修复新歌开始后数秒的节拍分析抢占问题，待创建独立 PR。根因是旧配置在 `0.9s` 延迟、`0.8s` 播放门槛和最长 `1.4s` idle 超时后强制开始 `decodeAudioData` / `OfflineAudioContext` / PCM 分析；缓存命中后队列预热还可能在 `2.6s` 后做同类工作。当前曲目自动全量分析改为至少稳定播放 `12s`，队列预热至少 `24s`，交互活跃或 idle 预算少于 `18ms` 时继续重排，绝不以 timeout 强制抢占。实时频谱和缓存命中不受影响。新增 `scripts/test-beat-startup-protection.js`；`npm run check` 为前置专项 `5/5` + 主套件 `295/295`，合计 `300/300`。Electron 已从本工作树启动，`127.0.0.1:3000` 返回 `200`。边界：尚未以用户实际歌曲录制 CPU trace；若在 12 秒后仍有可感卡顿，应把全量分析移出播放期而不是再次缩短等待值。

> 状态更新（2026-08-11）：本工作树 `codex/wallpaper-cache-manager` 已完成本地壁纸文件夹、分类缓存管理与背景裁切热路径修复，待创建新的独立 PR。`npm run check` 已包含专项，前置专项 `5/5` 与主套件 `294/294` 均通过（合计 `299/299`）；真实 Electron 的 Finder 打开、实际本地媒体和删除确认仍待用户点击验收。

> **选择性融合已安全同步到本机 App（2026-08-15，当前权威状态）：** 当前分支为 `codex/camera-hand-models`，基线 `effe817f38f004abb9efb7c8905a738dc2c2d550`；本轮已在该分支保存为安全实现 `ea15d81`、CI `1db4dff` 与当前文档三个 commit（存档点），未改 main、未推送或合并。P11“词境穿行”现为 16 套编排 / 12 类 motion，新增景深接力、近景回卷、折页展开、坠落回弹；运行态确认只创建 5 张歌词卡，固定五层时行数滑杆禁用，字号/字重/字距/翻译仍可用，逐字流光默认开启，360° 开关可即时切换，P11 歌单已停靠到普通 DOM host 且 3D 歌单架被抑制。QQ 搜索《手写的从前》返回官方专辑 MID 封面 `001uqejs3d6EID`，不再是 MR 图标；All 搜索同时返回 QQ 与不可直放的汽水目录结果，汽水 `playable=false`。最终本机候选已通过可断电恢复的 Safe Storage 迁移安装到唯一 `/Applications/Mineradio.app`：`app.asar` SHA-256 `7dac0a781edf167689930d0ea050323fc9af38d005a83cba11f73eb40676c024`，CDHash `96919e2fc469fa0ea4568bd794cdb8068633d1d7`，journal 为 `complete/new`，guard/pending/completed/recovery 均清空，QQ `loggedIn=true` 且 `playbackKeyReady=true`，四 provider 状态与迁移前一致。Spotlight 与 `/Applications` 只剩当前 App；另外 17 条历史备份/临时构建的 LaunchServices 注册已逐路径注销，文件本身未删除。完整 `npm run check` 当前 **274/274**，严格签名、9 项 Electron fuse、ASAR integrity、packed Safe Storage helper、universal/minOS12 handpose helper 与 Node 24 release-diff 工作流门禁通过。该包仍是 ad-hoc、无 TeamIdentifier、未公证且版本仍为 2.0.0，只允许本机融合验收，不得作为公开发布版；一次性安装 controller 绑定旧/新包哈希，未来候选严禁复用。迁移验证日志中的一次 `ERR_FAILED (-2)` 是 controller 在 provider 就绪后主动结束仍在 `loadURL` 的验证窗口产生的未处理 Promise 噪音，不影响最终正常 App；下一版应等待 `did-finish-load` 再停止验证进程，并只吞掉退出期间的预期 loadURL 拒绝。真实 App 的歌词、四种新动画、透视亮度、双手直缩与用户手模导入仍需解锁 Mac 后人工走查；验收过程中误执行了 `tccutil reset Camera com.mineradio.desktop`，当前摄像头授权回到 not determined，必须由用户在 App 内重新开启手势/透视并点系统“允许”，禁止脚本直接改 TCC。成功恢复点位于 `/Users/allenli/Library/Application Support/Mineradio Migration/backups.noindex/before-final-fusion-1786806422522-777d8c56e4db`，稳定的 `.safe-storage-handoff.lock` 必须保留。Obsidian 指定路径 `/Users/chy/菜鸡的仓库/菜鸡的仓库` 及本机备选路径均不存在，因此尚未同步 Obsidian。

> **词境穿行动画扩充、重复 App 根因与手模安全收口（2026-08-14，待安全安装）：** 当前分支 `codex/camera-hand-models` 叠加在 PR #116 基线上。用户截图中的第二个 Mineradio 不是缓存，而是桌面仓库 `dist/mac-arm64/Mineradio.app` 被 Spotlight 同时索引；该未运行构建副本已可恢复地移动到废纸篓并仅注销精确路径，当前索引只剩 `/Applications/Mineradio.app`。以后所有目录构建必须输出到 `/tmp/mineradio-performance-final.*` 或 `.noindex`，不得重新在桌面 `dist` 留 App。P11“词境穿行”由 12 套扩为 16 套，新增景深接力、近景回卷、折页展开和坠落回弹；仍只更新原五张歌词卡，不增加纹理、draw call、RAF 或定时器，并修复换句瞬移、关闭歌词时闪回、反向 seek 与 reduced-motion 大位移。隔离 Electron 以合成歌词逐帧检查四种动画起点/中段/终点，折页从约 70° 侧立展开，坠落只做一次闭式回弹。手模预检同时拒绝重复/乱序 GLB chunk、BIN 与 data URI 双来源、超量 scenes/cameras、多父 DAG 与实例化预算膨胀；16:9 槽位重关联统一使用宽高比校正距离。手模/手势专项 23/23、P11 专项 26/26、完整 `npm run check` **250/250**，语法与 diff 检查通过。当前唯一已安装 App 仍是 PR #116 的 `a88eb929…`，本段代码尚未安全替换；必须从干净提交构建、整体签名并通过内存解密→新包重加密保留 QQ 登录，不能替换单独 `app.asar`。真实摄像头、真实资料目录和凭据内容未用于自动化；Obsidian 指定路径在本机仍不存在。

> **摄像头原亮度、稳定双手缩放与可导入手模（2026-08-14，待本段最终 PR）：** 当前分支 `codex/camera-hand-models` 叠加在仍开放的 PR #116（`codex/perspective-wallpaper-qishui`）上。透视视频移除了 `brightness(.82)` 与 16% 黑遮罩，恢复摄像头本身的曝光，不改镜像和 `cover`；手势继续使用本地 Worker，但 MediaPipe Tasks Vision 升到 0.10.35，推理输入按源视频比例缩到最长边 320（1280×720→320×180），结果携带 handedness，并与最近掌心联合稳定左右手槽位。双手缩放以两只张开手掌中心距离直接映射，140ms 入场、2.5% 死区、180ms 丢手保护，不再要求双捏合、模拟滚轮、加入惯性或用双手连线旋转；单手捏合旋转仍保留。新增独立低功耗透明 WebGL 手模层和“3D / 手势”手模库：经典流光、晶体、星尘、隐藏、WebXR Generic Hand（金属材质），用户可导入自包含 GLB / 内嵌 glTF、调大小、选择、删除；自定义模型仅存 IndexedDB，拒绝外链 buffer/纹理、32MB 单文件、96MB 总量、8 个模型、35 万三角形、192 draw call、512 节点等上限之外的数据。官方实体手来自 Immersive Web WebXR Input Profiles Generic Hand（MIT），通过本地 Three.js GLTFLoader 解析；当前只做可靠的整手掌心/方向/大小跟随，不对未知骨骼做错误重定向。隔离 Chrome fake-camera 验收：透视与手势 owners 同时存在但新增 owner 前后 `captureCount` 不变，二者引用同一 MediaStream；两路视频均 `1280×720`，Worker 输入 `320×180`，GPU Worker 就绪、约 20 次/秒，页面无外部请求与 JS 异常。手模五个内置卡、实体手渲染、用户导入/删除及外链 glTF 拒绝均通过；完整 `npm run check` **250/250**。真实摄像头、真实 userData 与登录态未用于自动化。

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

> 状态更新（2026-08-11）：Windows 壁纸库批量导入与二次性能修复已创建独立 PR [#100](https://github.com/chyzsnb-commits/mr/pull/100)，当前可合并；原记录中的“待 PR”状态以此为准。

> 状态更新（2026-08-11）：本页第一条“壁纸视差/Scene 预览恢复 + 底栏音质与汽水音源入口”已创建独立 PR [#101](https://github.com/chyzsnb-commits/mr/pull/101)，父提交为 PR #100 的远端 head `b5937a8`；远端 tree 已与本地 `HEAD` 核对一致，当前可合并，未更新 `main`。

- **2026-08-11 本地壁纸文件夹、缓存管理与背景裁切性能（本工作树，待新 PR，未构建 DMG）：** 背景媒体区新增“打开壁纸文件夹”，桌面版将本地上传与 Windows 壁纸库导入的图片/视频镜像至 `app.getPath('userData')/Wallpapers` 后在 Finder 打开。系统「缓存与存储」按歌词、Chromium HTTP 缓存、节奏分析、人声分离临时文件和壁纸显示占用；安全清理只清前四项，明确勾选壁纸后才二次确认并同步清掉 IndexedDB 背景库与当前背景，不删除 Cookie、登录、设置或未勾选壁纸。裁切原卡顿根因是 `input` 事件每次进入完整 `updateCustomBackgroundControls()`，继而触发 IndexedDB Blob 读取、Object URL 重建和 `video.load()`；现在仅写裁切 CSS 变量，`280ms` 停止输入才保存。`npm run check` 前置专项 `5/5`、主套件 `294/294`、差异检查通过；浏览器运行探针连续 12 次预览最大 `0.2ms`、`customBgApplyToken` 未变化。**未验证边界：** 普通浏览器没有 Electron preload，因此 Finder、实际 IPC 占用统计及真实媒体解码要用 Electron 复验，不能据浏览器探针声称已完成此部分。[来源: `desktop/cache-manager.js`、`desktop/main.js`、`public/js/modules/07-fx/02-accent-background-controls.js`、`scripts/test-macos-cache-wallpaper-manager.js`]

- **2026-08-11 壁纸视差/Scene 预览恢复 + 底栏音质与汽水音源入口（本工作树，待新 PR，未构建 DMG）：** 壁纸部分新增独立默认关闭的 `wallpaperMouseParallax`，正常设置和 DIY 存档/导入导出均携带；本地图片/视频以临时 RAF 轻微跟随鼠标，清除或切走媒体立即归位。Scene 详情先保留 `previewUrl` 静态图，再在释放旧 `<img>` 的 `src` 后延迟接入 MJPEG；`409` 或失败最多重试一次，静态图持续显示并给出“重试实时预览”。导出完成态将“保存 MP4 到文件夹”和“应用 MP4 到 Mineradio”置于同一操作行。实测 Windows 服务中已有实时流占用时，新 Scene 收到 `409`，静态兜底仍完整可见。播放部分根因是 CSS 把 `simple-mode` 与 `≤1180px` 的 DIY `#quality-control` 直接隐藏，且音源菜单的 provider 列表遗漏 qishui；现入口均恢复。音源菜单按当前来源置顶，QS 查询只走 `/api/qishui/search`，Spotify `playable:false` 明确不可点；换源继续复用 `resumeAt` 与 `sourceSwitch:true`。专项 `23/23`、完整 `npm run check` `294/294`、语法/差异检查通过。实际页面 `1000×700` 下音质与菜单均在窗口内，汽水作为当前项时 QS 位于一级菜单首项。**未验证边界：** 未以真实登录汽水客户端的真实曲目确认跨源匹配和可播流，不能称已完成真实汽水播放验收；浏览器有既有无效封面 URL `403` 和未用户手势启动 AudioContext 警告，均与本改动无关。Electron 从本工作树 `npm start` 运行在 `http://127.0.0.1:3000`。[来源: `public/js/modules/05-playback/07-search.js`、`public/css/index.css`、`scripts/test-quality-switch-stability.js`、`scripts/test-qishui-mac-integration.js`、`scripts/test-windows-wallpaper-library.js`]

- **2026-08-11 Windows 壁纸库批量导入与二次性能修复（独立分支，待 PR，未构建 DMG）：** 用户反馈浏览仍很卡，并要求多选/全选导入。根因一是打开缓存地址时并行执行 `connect` 和局域网发现，导致重复 `ping/list` 和可能的私网探测；根因二是点击卡片、关闭详情都会 `innerHTML` 重建整个网格，重新创建远程媒体和观察器。现打开逻辑单飞：缓存地址先直连，只有失败/缺失才发现；详情改为局部切换 `.active`，搜索/筛选/排序才重建。新增独立多选状态、卡片勾选、全选当前结果和顺序本地导入队列。图片/视频与已完成导出的 Scene MP4 进入 IndexedDB 本地背景库但批量不自动替换当前背景；未导出 Scene 明确跳过。专项 `16/16`、完整 `npm run check` `289/289`、语法与差异检查通过；动态 304 条模拟记录确认详情前后保留同一 DOM 节点、筛选图片全选 `152/152`；缓存直连 `connect=1/discover=0`，失败时 `1/1` 回退发现。Electron 正从本工作树运行、`127.0.0.1:3000` 监听。**未验证边界：** 当前模拟浏览器无真实 Electron preload/Windows 服务，真实远程吞吐、媒体解码和批量下载需要 Windows 服务在线后人工验收。[来源: `public/js/modules/07-fx/10-wallpaper-library-panel.js`、`public/index.html`、`public/css/index.css`、`scripts/test-windows-wallpaper-library.js`]

- **2026-08-11 Windows Scene 录制导出路由（独立分支，待 PR，未构建 DMG）：** 用户确认 Windows 已有 Scene 录制传输能力。实际根因是 Windows 列表把 `preview.jpg` / `preview.gif` 标为 `image`，但同时携带 `sceneNeedsEngine: true`；Mac 忽略该字段后把低清预览下载到本地。现 Windows 记录先按项目目录归组：`sceneNeedsEngine` 项目改为 Scene，目录名作为 Scene ID，复用已有 `/api/live`、`/api/export-scene`、任务轮询、`/api/exported-file` 和“应用 MP4 到 Mineradio”链；视频项目存在真实视频时忽略 `preview.*`。普通原始图片保持原文件下载。未新增或变更 Windows HTTP 接口。专项 `14/14`、完整 `npm run check` `287/287`、语法与差异检查通过。**未验证边界：** 当前 Windows `:8123` 只读请求超时，无法声称实时预览、录制完成或实际 MP4 传输已验收。[来源: `desktop/wallpaper-library-bridge.js`、`scripts/test-windows-wallpaper-library.js`、`docs/superpowers/specs/2026-08-11-wallpaper-scene-export-routing-design.md`]

- **2026-08-11 Windows 壁纸库滚动性能（独立分支，待 PR，未构建 DMG）：** 304 条远程记录滚动轻微卡顿的根因有二：首屏给全部图片/视频设置媒体地址，视频还读取元数据；滚动期间卡片 hover 位移和重阴影会增加绘制负担。现图片使用 `loading="lazy"` + `decoding="async"`，视频初始 `preload="none"`，并以列表为根的 `IntersectionObserver` 在可视区及上下 `280px` 内才挂载媒体。列表增加绘制隔离和合成提示，滚动中临时关闭卡片位移/重阴影，停止 `180ms` 后恢复；滚动条、搜索、排序、点击详情与预览都不改。专项 `13/13`、完整 `npm run check` `286/286`、语法与差异检查通过；304 条模拟记录动态检查首屏 `20` 个媒体、滚动后 `40` 个，滚动态正确进出。**未验证边界：** 没有把模拟检查当作真实网络验收；需用 Windows 服务实际运行时确认远程缩略图解码和滚动手感。[来源: `public/js/modules/07-fx/10-wallpaper-library-panel.js`、`public/css/index.css`、`scripts/test-windows-wallpaper-library.js`、`docs/superpowers/specs/2026-08-11-wallpaper-library-scroll-performance-design.md`]

- **2026-08-11 Windows 壁纸库详情列布局（独立分支，待 PR，未构建 DMG）：** 用户截图中的“右边窗口显示不全”不是详情数据缺失，而是绝对定位详情抽屉覆盖列表，列表没有为其留出空间。现 `.wallpaper-library-body` 在详情打开时改为 Grid 双列：左侧网格与右侧最小 `360px`、占内容区 `42%` 的详情独立布局；视口 `≤920px` 自动隐藏列表，让详情占完整内容区，关闭详情恢复网格。详情继续内部滚动，不修改连接、预览、下载或导出状态机。按 TDD 先加入两条失败断言；专项 `12/12`、完整 `npm run check` `285/285`、差异检查通过。真实浏览器以模拟 8 项记录验证：`1280×720` 时重叠 `0`，`900×720` 时详情边界完整落在内容区内，关闭后网格恢复。**未验证边界：** 当前仍无可访问 Windows 服务，真实缩略图/MJPEG/导出正向链路需继续人工验收。[来源: `public/css/index.css`、`scripts/test-windows-wallpaper-library.js`、`docs/superpowers/specs/2026-08-11-wallpaper-detail-layout-design.md`]

- **2026-08-11 Windows 壁纸下载并应用本地背景库（待 PR，未构建 DMG）：** 用户确认 Windows 壁纸库不应只把文件保存到 Finder，图片/视频与已完成 Scene MP4 需进入 Mac 的 Mineradio 本地库。根因是原详情抽屉只走远程预览或 `showSaveDialog`，没有调用 `putCustomBackgroundBlob` / `setCustomBackgroundMedia`。现主进程仅对成功 `connect` 验证过的 Windows base URL 下载媒体，校验 MIME、空内容与 `256 MiB` 上限；渲染层把 IPC 返回字节转为 Blob 写入既有 IndexedDB `mineradio-custom-background-v1/media`，立即应用并用 localStorage 索引本地条目，后续选择同一项目优先复用本机副本。图片/视频显示“下载并应用到 Mineradio”；Scene 仅在导出 `completed` 后显示“应用 MP4 到 Mineradio”，手动“保存 MP4 到文件夹”仍保留。专项 `12/12`、完整 `npm run check`、语法和 `git diff --check` 通过。**未验证边界：** 当前环境没有可访问的 Windows `:8123` 服务，尚未声称真实传输、Windows Scene 导出或 Electron UI 点击已经通过；需启动 Windows 服务后按本轮命令行手测。[来源: `desktop/wallpaper-library-bridge.js`、`desktop/main.js`、`desktop/preload.js`、`public/js/modules/07-fx/10-wallpaper-library-panel.js`、`scripts/test-windows-wallpaper-library.js`]

- **2026-08-11 Windows 壁纸库网格与详情可视区修复（未构建 DMG）：** 用户截图确认卡片在部分运行环境会叠成文字行高，详情抽屉则被弹窗 `overflow:hidden` 裁掉底部内容。根因一是缩略图与元数据都绝对定位时，网格 auto row 只剩按钮的最小内容高度；根因二是详情面板没有自己的纵向滚动容器。现列表固定 `grid-auto-rows:minmax(128px,max-content)`，卡片显式 `width/min-height/border-box`，正常宽度仍保持 `16:9`；详情抽屉固定为内容区高度，详情面板 `height:100%`、`overflow-y:auto`，导出控件可在抽屉内滚到。先新增两条会失败的回归断言再修改 CSS；专项 `9/9`、完整 `npm run check` `282/282`、`git diff --check` 通过。**未验证边界：** 本轮独立浏览器在修复前已确认四列卡为 `256.5×144.28px`、相邻行距 `157.28px`，但重启自动化会话未回传修复后的截图；必须用真实 Electron 人工确认 304 条记录、多行滚动及详情底部“导出 MP4”可见。[来源: `public/css/index.css`、`scripts/test-windows-wallpaper-library.js`]

- **2026-08-11 Windows 壁纸库发现可靠性与 Windows UI 迁移（未构建 DMG）：** 已按上游 `XxHuberrr/Mineradio` 的 `wallpaper-engine-modal` 骨架对齐 Mac 页面：宽幅深色 modal、独立搜索主行、四列 `16:9` 实缩略图网格和点击后覆盖式详情抽屉。Mac 的自动发现/手动连接/类型/排序/Scene 导出保留为真实可用控件，放进连接次行；没有复制 Win 本机专属的“收藏/隐藏/项目设置”图标，因固定 HTTP 协议不存在对应写接口。自动发现以 UDP 广播为主，私网 `/24` `/api/ping` 探测为 UDP 被过滤的回退，UDP socket 直接报错也会单飞回退，只有 ping 与 wallpaper list 均确认才算在线。专项 `9/9`、完整 `npm run check` `282/282`、语法和 `git diff --check` 通过。**本次真实网络边界：** `192.168.1.121:8123` 与 `192.168.1.107:8123` 连接超时，故真实 Windows 列表、MJPEG 预览和导出正向路径尚未验证，不能写为完成。**下一步：** Windows 服务恢复后，从本工作树命令行启动 Electron，打开“Windows 壁纸库”，点“读取 Windows IP”；应显示已验证地址和真实卡片，点击 Scene 后验证 `<img>` MJPEG，关闭抽屉后检查其 `src` 被移除，再提交导出并确认仅 `completed` 状态出现“保存 MP4”。[来源: `desktop/wallpaper-library-bridge.js`、`public/index.html`、`public/css/index.css`、`public/js/modules/07-fx/10-wallpaper-library-panel.js`、`scripts/test-windows-wallpaper-library.js`]

- **2026-08-10 P10 一级歌架图一近景校准（未构建 DMG）：** 根因已由真实 Electron/CDP 投影确认：P10 除普通预设的局部布局外，还经过约 `2.56x` 世界比例、相机前方锚点和体素方位旋转；因此不能把普通预设的局部 `sideX` 原样套入。旧锚点前方 `18` 单位、局部中心 `sideX≈2.55` 会投成右下小架子（中心卡约 `224×136px`、中心 `x≈826,y≈343`）。现以相机局部坐标锚在前方 `10` 单位、左移 `1.2`、上移 `0.4`，并把 P10 中心局部 `sideX` 收至约 `1.08`；真实一级固定态中心卡投影为 `467×265px`、包围盒 `x=465..933,y=206..471`（`1134×638` 视口），即图一的中部偏右、竖向层叠和可读面积。只作用于 P10；普通预设、原生镜头半径/高度、右键只开一级、歌词让位及冷色玻璃卡面保持。真实右键事件在非 UI 画布上验证为 `pinned=true`、`detail=null`。专项 `21/21`、`git diff --check` 通过。**下一步：** 用本工作树命令启动 Electron，在 P10 的非 UI 画布区域右键；应直接得到上述一级构图，点击居中卡后才进入二级。[来源: `public/js/modules/04-shelf/00-layout-hover.js`、`public/js/modules/04-shelf/01-manager-core.js`、`public/js/modules/04-shelf/05-card-interactions.js`、`scripts/test-p10-voxel-interactions.js`]

- **2026-08-10 p10 右键一级歌架空闲唤醒回归修复（未构建 DMG）：** 用户反馈 p10「音域回响」右键没有显示一级歌架。根因不是 p10 构图、数据为空或一级/二级层级，而是提交 `25e1d3c` 为恢复“右键只进一级”删除了右键的 `markRenderInteraction('shelf-context', 1200)`；当窗口处于空闲降帧时，状态虽切到 `shelfPinnedOpen=true`，但 `shelfManager.update()` 未及时运行，因此不会计算可见度或世界坐标。现恢复该唤醒，且保留 `shelfHardHidden` 解除与 `clearSelected()`；右键仍绝不调用 `openContent()`，一级卡点击后才进二级。先写回归断言并观察其失败，再修复；专项 `16/16`、完整 `npm run check` `266/266`、语法和 `git diff --check` 通过。Electron 已从 `/Users/bobby/ZCodeProject/mr-system-output-close-cleanup` 启动，主页 `127.0.0.1:3000` 返回 `200`。**下一步：** 用户在 p10、队列非空且播放/暂停两种状态下右键，确认一级架子均立即显示；点击居中卡才出现二级歌曲列表。[来源: `public/js/modules/04-shelf/05-card-interactions.js`、`public/js/modules/11-main-loop.js`、`scripts/test-p10-voxel-interactions.js`]

- **2026-08-10 Mac 设置清理与音频输出对抗性修复（未构建 DMG）：** 用户质疑播放输出是否实际可用。事实：原“路由”按钮没有对应弹窗宿主，且普通主输出切换在 `setSinkId` 拒绝后仍保留新设备 ID，只有桥接路径有部分回退；未授予设备标签权限时空 `deviceId` 又会把“系统默认”渲染两次。现补回 `audio-output-workflow-modal`，主输出、桥接和镜像的成功状态都以实际路由结果为准；主输出失败会恢复前一主输出、桥接状态和镜像列表，再重新应用原输出；无播放器只记录“播放时连接”；设备枚举排除空 ID 和 `default`。Mac 设置移除关闭窗口/后台托盘选择，关闭窗口固定退出，自动更新继续禁用，用户升级使用签名 DMG 覆盖安装。专项对抗性 `8/8`、完整 `npm run check` `264/264`、语法和 `git diff --check` 通过；隔离 Electron 启动、打开“系统 → 播放输出 → 路由”确认弹窗存在且只显示一个系统默认节点。浏览器有一条无效封面 URL 的既有 `403`，与输出路径无关。**下一步：** 在有至少两个真实输出设备或虚拟声卡的 Mac 上播放歌曲，切换一个非默认设备并在系统声音输出/目标应用中确认；拒绝权限或拔出设备时确认提示“已恢复原输出”。[来源: `public/js/modules/05-playback/00-api-quality-output.js`、`public/index.html`、`public/js/modules/00-state/02-preferences-ui-modes.js`、`scripts/test-system-output-close-cleanup.js`]

- **2026-08-10 p10 完整柱体构图与左缘 300ms（未构建 DMG）：** 用户反馈 p10 右键后镜头被放大到音柱内部。根因是 `voxelShelfCameraFocusPose()` 把通用歌架 focus 的 `orbit.radius` 和 `phi` 换算进 p10 体素世界，而通用侧栏为近景 `4.2` 半径、负仰角，导致 p10 的原生约 `127` 半径被缩小。现在 p10 歌架 focus 只复用右侧方位与 lookAt 偏移，镜头半径和高度直接保留 `_voxCam` 当前值，因此滚轮/拖动后的用户机位也不会在右键时被重置。左侧边缘歌单停留从 `600ms` 调为 `300ms`，左键拖动抑制、垂直安全带、双屏保护不变。专项 `16/16`、完整 `npm run check` `256/256`、相关脚本语法检查和 `git diff --check` 通过。待用户在命令行启动 Electron 后确认 p10 右键仍显示右侧歌架但不钻入音柱，并确认 `300ms` 不会误触。[来源: `public/js/modules/02-visual/16-voxel-echo.js`、`public/js/modules/10-shell/02-peek-panels-upload.js`、`scripts/test-p10-voxel-interactions.js`]

- **2026-08-10 控制台归位与左侧歌单唤起速度（未构建 DMG）：** 根因是工作区整理器缺少 `fx-lyricscalepulse` 与 `fx-renderscale` 的目标分组，且把取色弹窗的内部 input/button 当作普通设置回收至“其他设置”。现将缩放脉动归入“歌词 → 歌词动画”，渲染分辨率归入“系统 → 性能与后台”，并忽略 `cover-color` / `color-lab` 弹窗内部控件；没有删除兼容回收机制。用户实测 `1000ms` 左边缘停留过慢，统一调整为 `600ms`，拖动抑制、垂直安全带和双屏边界保持不变。专项 `22/22`、完整 `npm run check` `256/256`、脚本语法检查与 `git diff --check` 通过。需在命令行启动 Electron 后确认“其他设置”不再出现，并确认 `600ms` 速度与误触平衡。[来源: `public/js/modules/07-fx/09-console-workspace.js`、`public/js/modules/10-shell/02-peek-panels-upload.js`、`scripts/test-fx-preset-motion-ownership.js`、`scripts/test-p10-voxel-interactions.js`]

- **2026-08-10 分析优先约束与歌单边缘防误触收尾（未构建 DMG）：** `AGENTS.md` 明确要求答复和改动前先检查错误前提、逻辑错误与信息缺失，从至少两个角度分析根因，标出依据、反证条件和最小验证方式，分析完成后才能提出或实施方案；项目功能验收以命令行为主。左侧歌单边缘触发现在必须连续停留 `1000ms`，左键按住或拖动期间同时抑制左侧歌单与右侧 3D 歌架唤醒，并清掉边缘计时和 hover 状态；p10 右键唤起歌架前清除卡片 hover 选中，避免进入错误的抬升位置。p12/p13 仅按初始机位补偿歌词，保留滚轮缩放，p13 iframe 音柱同步主相机比例。专项 `scripts/test-p10-voxel-interactions.js` 与 `scripts/test-pointer-follow-buffer.js` 20/20、`scripts/test-sonic-series-layout.js` 16/16，完整 `npm run check` 255/255，相关前端脚本语法检查和 `git diff --check` 通过。剩余验证边界是用户在命令行启动的 Electron 窗口中亲自观察拖动、边缘停留和 p10 右键构图。[来源: `AGENTS.md`、`public/js/modules/10-shell/02-peek-panels-upload.js`、`public/js/modules/04-shelf/05-card-interactions.js`、`public/js/modules/07-fx/04-preset-grid-uniforms.js`、`scripts/test-p10-voxel-interactions.js`、`scripts/test-sonic-series-layout.js`]

- **2026-08-08 Spotify 官方收藏与加歌同步：** Mac 现在支持从 Spotify 官方 Web API 读取喜欢状态、收藏/取消收藏，以及把 Spotify 歌曲加入已有的自建 Spotify 歌单。OAuth 默认加入 `user-library-modify`、`playlist-modify-private`、`playlist-modify-public`，并与已有环境变量/旧配置中自定义 scope 合并；token 与写请求均留在本地服务端，前端只请求本机 `/api`。仅 Spotify 歌曲可写入 Spotify 自建歌单，虚拟“喜欢的歌曲”和订阅歌单不可选。旧 OAuth token 不会自动增加新 scope，已有用户须在账户面板重新连接 Spotify。专项 12/12、`npm run check` 217/217 通过；未做真实 Spotify 账号人工验收，也未构建 DMG。[来源: `spotify-api.js`、`server.js`、`public/js/modules/05-playback/06-track-detail-lyrics-actions.js`、`scripts/test-spotify-account-write-sync.js`]
- **2026-08-08 修复 p12/p13 音域回响歌词字号偏小：** p12「音域地形」和 p13「音域回响·WE」的舞台歌词根据实际相机到歌词组的距离，相对普通预设参考距离 `6.6` 补偿世界空间缩放，因此屏幕显示字号与普通预设对齐；不覆盖用户的字号、位置、字体或颜色设置。p13 的异步歌词抵达后也会重新唤醒共用舞台歌词。专项 12/12、`npm run check` 217/217 通过，仍需可见窗口人工确认观感。[来源: `public/js/modules/02-visual/02-lyrics-state-layout.js`、`public/js/modules/02-visual/14-stage-lyrics-rendering.js`、`scripts/test-sonic-series-layout.js`]

- **2026-08-04 背景媒体可用性与排版修复**：基于 PR #79 head `2dff883672a8b89df6f5276aa891959c1ea10f47` 独立交付。将背景媒体归为「上传 / 封面 / 裁切 / 清除」四个等宽按钮，新增状态提示与说明型“封面鼠标视角”开关；上传媒体强制固定视角。无封面歌曲不会再假启用封面背景，异步封面消失时也不会写入失效绑定。真实 Electron 已验证上传图片、封面视差和清除回退；专项 5/5、`npm run check` **203/203**。本批只包含 `CHANGELOG.md`、`AI_HANDOFF.md`、`public/css/index.css`、`public/index.html`、两个背景媒体 JS 和对应测试，不改 main、播放、登录、雨境参数或其他预设。

- **2026-08-03 雨境流速持续响应与封面鼠标视角**：修复预设 9 水珠滑落进度越大阻力越高、后半程自行减速的问题。`rainGlassSlipDrag(drop)` 让阻力仅与尺寸相关，流速系数持续驱动加速度与终端速度；不改雨量、尺寸、歌词或其他预设。新增默认关闭的 `fx.albumBackgroundMouseBind` 与「界面 → 背景媒体 → 封面鼠标视角」开关，复用 `queueParticlePointerFrame()`，只影响 `#album-bg/#album-bg-next`，不触碰上传图片/视频、歌词或相机。专项 8/8、`npm run check` **200/200** 通过。Electron 已从 `/Users/bobby/ZCodeProject/mr-pr65` 启动，但本会话没有桌面自动化接口，仍待可见窗口人工验收。
- **交付**：从完整树 PR #77 head `42fec96c4ee07af128d015610ca087abee4cb737` 建新分支 `codex/rain-glass-speed-album-mouse`，不从损坏的 #74/#75 派生，不带入本地其他脏改动；GitHub Git API、`force:false`、不 `git push`、不改 main。
- **2026-08-03 底栏入口归位与音域回响卡片收紧**：视觉控制台布局表错误引用 `shelf-toggle-btn` 与 `lyrics-toggle-btn`，整理器会将真实底栏 DOM 移入设置页，故删除两个引用而不是复制按钮。底栏继续使用 `toggleShelfFromControls()` 与 `toggleLyricsPanel()`；桌面歌词恢复为设置内独立的 `t-desktopLyrics`、锁定、电影震动、高亮、大小、透明度、高度和帧率控件。音域回响系列入口删除重复说明文字，三按钮固定 `36px` 等高，文字单行省略。新增 `scripts/test-bottom-controls-and-sonic-card.js`，专项 3/3、`npm run check` **198/198**。真实 Electron 启动在本会话被旧实例的单实例锁和后台进程回收，未能取得可操作窗口；代码与静态 DOM 回归均已验证。设计规格：`docs/superpowers/specs/2026-08-03-bottom-controls-and-sonic-card-design.md`。
- **Git 树风险**：远端 PR #74 (`76fb657`) 与 #75 (`2f6fe62`) 的 tree 仅含少数文件，直接以其为 parent 会删除完整项目树；不要以它们派生。本修复从最后完整树 PR #72 head `6fc853084d75005227abbbb5dafacda5fdcdc524` 创建新分支、`force:false`，且只带本次入口/布局文件，不纳入 p13 歌词支线。
- **2026-08-03 音域回响歌词异步就绪竞态修复（本地 PR65 同步副本）**：用户反馈预设 10「音域回响」没有歌词。根因不是歌词接口失败，而是切换 p10 时请求尚未返回，`lyricsLines` 为空使原有唤醒函数提前结束；原歌词/自定义歌词随后应用时没有再次通知 p10，舞台会永久停在空状态。`14-stage-lyrics-rendering.js` 新增 `refreshVoxelLyricStageAfterLyricsReady()`，两个歌词应用入口在 `renderLyrics()` 后调用它，复用现有 p10 唤醒路径。逻辑只在 `fx.preset === VOXEL_PRESET_INDEX` 且 `fx.particleLyrics !== false` 时生效，不改歌词角度、位置、字体、动画或歌架，也不影响其他预设。新增异步回归断言；专项 `node --test scripts/test-sonic-series-layout.js` 5/5，全量 `npm run check` **221/221**。真实 Electron/CDP 延迟注入歌词后确认 `stageLyrics.group.visible === true`、当前文本更新且唤醒原因为 `lyrics-ready`。
- **下一步**：从远端 PR #71 head `5fbe897eaad98ed9e109246acd1b4bc2817b9668` 派生新的分支，使用 GitHub Git API 创建 tree/commit/ref（`force:false`）并开新 PR；不要追加 PR #71、不要 `git push`、不要提交 `node_modules`。用户侧只需在新 PR 版本启动 Mineradio，先退出启动页并播放一首有歌词的歌曲，再切换 p10 验证歌词出现；若仍异常，记录歌曲 ID、`fx.particleLyrics`、`lyricsLines.length` 与 `stageLyrics.currentText`。

- **2026-08-03 预设入口尺寸统一（本地 PR65 同步副本）**：用户要求所有视觉预设按钮大小一致，并把音域回响三选一压缩到与普通预设相同的入口卡内。`public/css/index.css` 现在让 `.preset-card` 与 `.preset-series-card` 固定 `94px` 高、`box-sizing:border-box`；音域系列 `.pc-series-options` 默认三列，三个 `.pc-series-option` 固定 `30px` 高，标题/作者缩小并以省略避免窄列溢出；系列外卡保留 `≤720px` 跨整行。删除旧的 `≤520px` 重复横向覆盖，未改 `setPreset()`、索引、歌词或其他预设样式。`scripts/test-sonic-series-layout.js` 新增固定尺寸与三列按钮断言；专项 4/4、全量 `npm run check` **220/220**。本轮尚未完成真实可见 Electron 窗口的人工截图验收，需确认 `1440×900`、约 `700×850` 及更窄窗口下卡片文字、省略、三项点击和 p10/p12/p13 切换。
- **下一步**：先在 `/Users/bobby/ZCodeProject/mr-pr65` 关闭旧 Mineradio 实例后启动，点击启动页进入应用，打开「视觉控制台 → 常用 → 视觉预设」，检查普通卡/音域系列同高和三按钮横排；再点三个音域按钮确认仍切换 p10/p12/p13、歌词不下沉、队列与歌架不受影响。若布局符合预期，再按项目规则从最新远端 head 新建 PR 线，通过 GitHub Git API 建 tree/commit/ref（`force:false`），不要 `git push` 或改 main；不要提交 `node_modules`。
- **2026-08-02 音域回响入口排版与 p10 歌词唤醒（本地 PR65 同步副本）**：用户反馈截图中预设入口不符合期望，且切到预设 10「音域回响」后没有歌词。本地副本 `/Users/bobby/ZCodeProject/mr-pr65`、分支 `codex/local-pr65-sync` 以 `d89ea16` 为基线，新增 `scripts/test-sonic-series-layout.js` 并纳入 `npm run check`。`public/css/index.css` 让 emily 与音域系列桌面并列，`≤720px` 系列卡跨整行，`≤520px` 三个版本恢复横向分段按钮。`public/js/modules/02-visual/14-stage-lyrics-rendering.js` 新增 `refreshVoxelLyricStageAfterPresetChange()`，`setPreset()` 接入；仅 p10 且 `fx.particleLyrics !== false` 时唤醒歌词组、当前行和预热，不改歌词位置/字体/动画/角度，也不强开用户关闭的歌词。
  - 专项测试 `node --test scripts/test-sonic-series-layout.js`：3/3；全量 `npm run check`：**219/219**。
  - 真实 Electron/CDP 验收：先退出启动遮罩 `splash-active` 后，网易云《富士山下》歌词 59 行正常加载；p9→p10 切换后 `stageLyrics.group.visible=true`、当前歌词行可见、三选一只有 p10 为 `aria-pressed=true`；把 `particleLyrics` 设为 `false` 后切换 p10 不会被强开。启动遮罩尚未点击时主循环按设计暂停，不能用该状态判断歌词渲染失败。
  - 桌面几何检查：emily 与系列卡位于同一网格行；窄面板下系列卡跨整行、选项不溢出。设计规格见 `docs/superpowers/specs/2026-08-02-sonic-series-layout-and-lyrics-design.md`。
  - 本批只改首页预设布局、歌词唤醒接线、回归测试和文档；没有改 main、Windows 专属死代码、汽水、预设 9 玻璃水珠或 Wallpaper Engine 本体。Obsidian 进度笔记已追加同一条记录。
- **下一步**：用户在真实可见 Electron 窗口中先点击启动页进入 Mineradio，再播放一首有歌词的歌曲切换 p10；如果仍无歌词，记录切换前后的 `fx.particleLyrics`、歌曲 ID、`lyricsLines.length` 和 `stageLyrics.currentText`，不要先改歌词角度。远端 PR 上传仍需按 AGENTS.md 从最新远端 head 新开分支，用 GitHub Git API 创建 tree/commit/ref（`force:false`），不要 `git push`。

- **2026-08-02 音域回响入口与频谱面板整理（独立 PR 待创建）**：用户反馈预设 10「音域回响」的「动效」页错误出现「歌单 / 队列」，并要求把预设 10/12/13 归纳为一个入口、三个互斥按钮，同时保留所有预设的频谱面板。根因是旧体素 `_voxDockPlaylist()` 在新 FX 控制台找不到旧版 `data-fx-page="playlist"` 后把宿主追加到 `#fx-panel` 根节点，活动的动效页后面因此渲染出歌单；现改为优先挂到 `data-fx-page="shelf"`，没有目标页就不挂载，旧布局仍兼容旧 playlist 页。`09-console-workspace.js` 将实时频谱/监视器/频段滑条拆为通用 `audio-spectrum` 组，`sonic-audio` 只保留预设 12 的八段权重；`updateMineradioMotionGroupVisibility()` 让 14 个预设均显示 `audio-spectrum`。`04-preset-grid-uniforms.js` 保留内部索引 10/12/13 和存档兼容，在视觉预设入口生成一张 `preset-series-card`，三项 `pc-series-option` 点击仍调用原 `setPreset()`；CSS 增加同组分段按钮样式。新增专项断言覆盖频谱分组、三选一卡片和歌单宿主归位。真实 Electron（CDP，非 headless）确认 p0–p13 显隐映射正确、频谱组在 p0/p12 均显示、三选一点击切到 p12 且只亮一项、预设 10 的歌单挂在 shelf 页且不在 motion 页；动效/常用截图人工复核通过。`npm run check` **216/216**。未改播放、登录、汽水、雨境玻璃水珠、Windows 死代码或 main。后续只需从 PR #64 远端 head `57eb006db0c3f0a99427c17e9f4a9e7075fa726a` 建议分支 `codex/spectrum-and-sonic-selector` 创建新 PR，不能追加 PR #64。
- **2026-08-01 动效 tab 预设专属设置归位彻底修复（独立 PR 待创建）**：用户反馈预设切换后动效设置互相混杂、雨境/云瀑/音域回响偶发不显示。根因不是映射遗漏，而是生命周期和遗留 CSS 叠加：① `updateMineradioMotionGroupVisibility()` 没有被 `updateFxInputs()` 调用，启动恢复/面板刷新会残留上个预设状态；② `organizeFxConsoleWorkspace()` 首次把控件整理为 `.fx-console-group` 后没有立即刷新；③ `setPreset()` 重复调用同一刷新；④ 旧体素选择器按 motion 页的直接子节点隐藏，控制台重组后会误隐藏分组。修复：在输入刷新与首次控制台归位后调用显隐刷新；切换预设只保留一次调用；旧分页选择器均限制为 `#fx-panel:not([data-console-layout="task-first-v2"])`。新增 `scripts/test-fx-preset-motion-ownership.js`（14 预设映射、三个生命周期入口、旧 CSS 防回归），并更新 `test-rain-mood-visual.js` 的兼容选择器断言。真实 Electron（非 headless，CDP）逐一执行 p0–p13 的 `setPreset` + `updateFxInputs`：p0–8=[base,particles]、p9=[base,rain-mood]、p10=[base,vox-echo]、p11=[base,rain-resonance]、p12=[base,sonic-terrain,sonic-audio,sonic-blocks]、p13=[base,sonic-we]，14/14 匹配且七个专属组未落入其他 tab；`npm run check` **213/213**。未改播放、登录、汽水、雨境玻璃水珠或 Windows 专属代码。后续仅需用户实际拖动控件作主观体验确认，无已知功能阻塞。
- **2026-08-01 首页响应式排版修复（PR #61 后续）**：用户反馈首页在约 `998×1098` 竖版窗口中「很多内容显示不了/卡片重叠」。实机根因有三处：① `≤1120px` dock 改成单列后仍保留 listen/next/discovery/ranking/radio 的旧显式列定位，CSS Grid 生成隐式第二列，第一列被压到约 86px；② `home-grid` 2 列三行挤占右侧洞察 rail 高度；③ `.home-recent-inner` 固定内容允许 `flex-shrink`，`home-next-up` 被压到 27px（内部封面仍 96px）、每日热评被压到 30px（内部多行内容仍约 84px），相邻区块发生溢出。修复：`≤1120px` 快捷区改 3 列、dock 改为两列三行（listen/next 第一行、discovery 跨整行第二行、ranking/radio 第三行）；`≤760px` hero/grid/rail 显式归回单列，五张洞察卡按 DOM 顺序排列，窄宽隐藏简报/下一首；hero kicker/标题/统计/简报/快捷行与 next/review 固定最小高度，只让最近歌曲列表 flex 滚动。新增 `scripts/test-home-layout-responsive.js` 三项并纳入 `npm run check`。真实 Electron（非 headless，CDP CSS viewport）验收 `1440×900`、`998×1098`、`998×700`、`760×850`：hero 直接子项零交叠、dock 五卡零交叠，截图人工复核通过；全量 **226/226**。本批仅改首页布局 CSS、`package.json` 测试脚本和布局测试，不改播放/登录/视觉预设。Obsidian 进度笔记已直接同步。待用户人工在本机窗口拖动/调整大小确认滚动手感。

## 当前权威入口（2026-07-29）

- **本仓库**：`chyzsnb-commits/mr`（**私有**，源码 + CI + 所有发布，单仓库架构）。
- ⚠️ `chyzsnb-commits/Mineradio-mac-` 是**独立的开源仓库，不属于本项目，绝对不要碰**。
- **main 最新 commit**：`a2d8145`（PR #26 已合并：唱歌模式、倍速、防爆音、歌架与卡死修复）。
- **当前 2.0 融合线**：PR #58，分支 `codex/mineradio-2.0-unified`（基于 `codex/public-release-2.0`，融合 Beat 修复）。2026-07-24 补修唱歌/壁纸/3s 空闲降帧；2026-07-28 落地**雨境**视觉预设（复用索引 9，THREE 雨丝对象池，主循环 bass/mid/treble 驱动；**水膜共振仍先不要**）；同日修**音域回响幽灵封面**被不透明地形深度挡住（`depthTest: false`，设置「封面图」开关仍在）；雨境加**湿玻璃幽灵封面**（正视海报，雨丝前景）；2026-07-29 已将独立雨窗的 RG Metaball 玻璃水珠后处理迁移进预设 9，并加入可调控件，水滴外背景保持锐利。最新一轮提高液滴场清晰度、扩大雨量/数量范围，并加入雨点击玻璃后的凝结态；随后消除液滴内部规则点阵：合成 shader 仅保留低频平滑微表面，删除背景逐像素颗粒。雨量现不再影响水珠尺寸或额外撞击频率；水珠仍由雨点击中后的冲击点铺展生成。水珠流速控件扩大到 `0.2–16.0`，新默认值为 `5.0`，UI、输入、运行时、恢复路径和物理速度上限同步提高；打雷阈值默认值为 `0.70`，用户保存值不变。本轮将流速因子接入附着等待、破裂/停靠相位、单段连续滑落距离和重新附着门槛，调高后水珠不会只滑一小段便永久挂住。`npm run check` **176/176**。
- **2026-07-31 汽水 PR #56 官方客户端桥迁移 + 首页补齐**：删除服务端汽水二维码创建/轮询和渲染层二维码状态；`desktop/main.js` 现在从 macOS 汽水客户端容器 `~/Library/Containers/com.soda.music/Data/Library/Application Support/SodaMusic/Cookies` 读取已登录会话，主进程通过 `applyOfficialProviderLogin(localServer, 'qishui', result)` 交给服务端校验并使用既有 `safeStorage` 持久化，Cookie 不出主进程。渲染层调用 `openQishuiMusicLogin()` 后只获取脱敏状态，入口不再跳网易。首页保留 Mac 全部既有入口，同时新增复用现有数据的“每日内容”与“接下来播放”。专项和 `npm run check` **205/205** 通过；Electron 以独立 userData 启动无错误。必须由用户在 macOS 汽水音乐客户端先登录，再人工确认读取、本源搜索、歌单和播放；不要提交 Cookie/Token。更新 PR 时仍以远端 PR #58 head 为 parent、GitHub Git API `force:false`，不使用 `git push`。
- **2026-08-01 Windows v2.1.0 功能对齐（第二批，本地曲库持久化 + 首页交互）**：新增主进程 `desktop/local-music-library.js`（Windows v2.1.0 原版适配 macOS；`music-metadata@7.14.0` 解析内嵌封面/歌词，支持 `.lrc` 侧车，`mineradio-local://` 特权协议按 Range 流式播放，索引/封面持久化在 userData 下），`main.js` 完成 `registerLocalMusicScheme` + IPC（list/lyric/authorize/import）+ `installProtocol` 接线，`preload.js` 暴露 `listLocalMusicLibrary/readLocalMusicLyric/importLocalMusicFiles`（webUtils 取真实路径，主进程 `realpath` 校验，3 分钟一次性 capability）。渲染层：拖拽/选择/整文件夹导入自动走持久化索引并进队播放，失败回退原对象 URL 路径；`00-core-stores.js` 增加 `persistentLocalLibraryTracks`；启动时 `restorePersistedLocalLibrary()` 与登录态并行，命中本地断点后恢复真实 localUrl 队列与断点（`restoreLastPlaybackSnapshot` 同步路径保留）；本地播放按需 `readLocalMusicLyric` 读内嵌/侧车歌词走既有歌词管线；封面加载与 `coverProxySrc` 支持 `mineradio-local://`。首页新增“每日热评”卡片（每日一条/可换一条/localStorage 自定义热评）与生成封面回退（无封面卡片生成品牌渐变 SVG），不迁移 Windows MP4 视频 Hero（Mac 功耗）。QQ/酷狗字段：`qqMembershipNeedsSync` 区分播放授权未完成与权益待同步，酷狗归一化兼容 `playbackReady`。`npm run check` **209/209** 通过，Electron 独立 userData 启动冒烟通过。待用户人工验收：拖入真实 mp3/flac（含内嵌封面与 LRC 侧车）验证索引、封面、断点恢复与内嵌歌词；本地曲库浏览/管理面板见第三批。
- **2026-08-01 Windows v2.1.0 功能对齐（第三批，本地曲库浏览/管理面板）**：新增 `public/js/modules/06-lyrics/07-local-library-panel.js` 与 `#local-library-modal` 弹窗——首页快捷区新增“本地曲库”chip、导入面板新增“本地曲库”入口；弹窗支持浏览、搜索（标题/歌手/专辑）、逐首播放、全部播放、从曲库移除（只删索引与封面缓存，不删源文件；正在播放被移除曲目自动切下一首）；主进程新增 `mineradio-local-library-remove` IPC，preload 暴露 `removeLocalMusicLibraryTracks`；导入成功后若面板打开会自动刷新列表。`npm run check` **210/210** 通过，Electron 独立 userData 启动冒烟通过。
- **2026-08-01 Windows v2.1.0 功能对齐（第四批，窗口恢复 + 歌词磁盘缓存）**：主进程补上 `desktop-window-restore` handler（preload 一直有调用、主进程缺 handler，最小化/隐藏窗口此前无法 restore）；新增歌词磁盘缓存 `mineradio-cache-read-lyric` / `write-lyric`（`userData/cache/lyrics`，单条 ≤1MB、总量 ≤96MB、写后淘汰最旧），preload 暴露 `readLyricCache/writeLyricCache`，渲染层 `fetchLyric` 先读缓存、未命中再走网络并回写；不迁移 Windows 的 Chromium 缓存目录搬迁与 `mineradio-cache-set-settings`（会动 sessionData，可能把 macOS 登录态/会话搞掉，违反“不影响 Mac 使用”约束）。专项 6/6、`npm run check` **211/211** 通过，Electron 独立 userData 启动冒烟通过。
- **2026-08-01 Windows v2.1.0 功能对齐（第五批，首页洞察 dock + 平台推荐中心）**：右侧 rail 保留「为你准备」tile 行的同时，新增洞察 dock——今日聆听（时长/曲数/常听歌手/连续天数）、接下来播放（优先队列下一首）、为你挑选（每日推荐/歌单/队列/本地去重选 3 首）、音乐发现与平台推荐入口；平台推荐弹窗五平台标签页只读可信推荐数据，未登录明确留空不补搜索。服务端新增 `/api/kugou/recommendations`（复用 `handleKugouGuessLike`）与 `/api/spotify/recommendations`（移植 `handleSpotifyRecommendations`：`user-top-read`→常听、`user-library-read`→喜欢，均无则 `mode:'unavailable'`）。新模块 `03a-home-dashboard-insight.js` 在既有 `renderHomeDiscover` 后挂钩渲染，不替换 Mac 首页；不迁移 Windows MP4 视频 Hero 与 quick-grid（Mac 功耗/布局约束）。新增 `scripts/test-home-dashboard-dock.js`（5 项）纳入 check；专项 5/5、`npm run check` **216/216**、Electron 本地服务冒烟（首页/模块 200、两推荐接口未登录预期返回）均通过。待人工验收：登录任一平台后在首页查看今日聆听/为你挑选/平台推荐弹窗实际数据；本批按新规另开新 PR 线，不在 PR #58/#59 追加。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记：工坊白屏修复 + FX 控制台 + 界面配色 + 缓存设置只读版）**：① 修复预设 13 白屏——macOS WebGL canvas 透明合成把 iframe 盖住（上游 Windows 无此问题），CSS 在 `body.sonic-workshop-active` 时隐藏 `#canvas-container`；另加 React 未就绪 9 秒超时自动 toast 提示并回退上一预设。② FX 控制台：`07-fx/09-console-workspace.js`（上游 1072 行原样）+ fx-console 完整 CSS 415 行 + `organizeFxPanel` 加优先分支 + `initFxConsoleSearchAndHistory` 接线（07-bindings）——设置面板重排为 6 分类 tab + 搜索框（别名搜索）+ 撤销/最近操作历史（40 条、滑条合并、可回退）；Mac 依赖（setFxPanelTab/applyFxArchiveSnapshot/configureMemoryReductFromFx/colorLabState）均已存在。③ 界面配色：index.html 加「自定义颜色」5 个 color row（ui-accent/visual-tint/home-accent/home-icon/visual-icon）+ visual-tint-row，Mac 死壳函数（reset*/update*Controls）随 UI 注入激活；翻译字号确认 Mac 已有（fx-lyrictranslationscale 等）。④ 缓存设置（Mac 只读版）：`07-fx/08-cache-storage-settings.js` 去掉 Chromium 目录搬迁（chooseCacheDirectory/setCacheSettings/restartApp 全删），主进程新增 `mineradio-cache-get-usage`/`mineradio-cache-clear-lyrics` IPC，preload 暴露 getCacheUsage/clearLyricCache，面板只读歌词缓存占用 + 手动清理。⑤ 登录彩蛋按用户决定跳过（上游解锁前清空全部登录凭据，与 Mac 登录态硬约束冲突）。新增测试第 7 项（FX/缓存/配色断言），`npm run check` **223/223** 通过。待人工验收：fx 面板新 tab/搜索/撤销、界面配色生效、缓存面板占用与清理、工坊预设 13 不再白屏。
- **2026-08-01 动效 tab 预设专属过滤完善（粒子组仅粒子预设）**：用户反馈「还是乱七八糟，每个预设只需要保留有用的特效」。分析发现：粒子参数在雨境/云瀑/音域回响/声波地形/声波工坊激活时**粒子层被 hidePoints 隐藏根本不生效**，之前当通用组显示是噪音。完善：`updateMineradioMotionGroupVisibility` 加 `nonParticlePreset`（9/10/11/12/13）→ particles 组仅粒子类预设（0-8）显示；`fx-coverres` 从 base 移入 particles 组；base 精简为真正通用的 4 项（intensity/depth/cineshake/cinema）。无头 Chrome **全量 14 预设实测**：p0-8=[base,particles]、p9=[base,rain-mood]、p10=[base,vox-echo]、p11=[base,rain-resonance]、p12=[base,sonic-terrain,audio,blocks]、p13=[base,sonic-we]。测试加断言（nonParticlePreset/particles:!nonParticlePreset/coverres 归位）；`npm run check` **228/228**。PR #63 更新。
- **2026-08-01 动效 tab 预设专属过滤（修复动效参杂）**：用户反馈「不同预设里面的动效参杂了其他很多预设的动效太杂了，需要一对一，每个预设只保留有用的特效」。实现 `updateMineradioMotionGroupVisibility()`：按 `fx.preset` 控制动效 tab 的 `.fx-console-group` 显隐（复用 `fx-sonic-hidden` class）——预设 9 雨境→rain-mood、预设 10 音域回响→vox-echo、预设 11 云瀑→rain-resonance、预设 12 声波地形→sonic-terrain/audio/blocks、预设 13 声波工坊→sonic-we，其余预设只显示通用组 base/particles。setPreset（04-preset-grid-uniforms）与 updateFxInputs（05-fx-panel-performance）双路调用。无头 Chrome 实测 6 组预设映射全部正确（p0:base,particles / p9:+rain-mood / p10:+vox-echo / p11:+rain-resonance / p12:+sonic 三组 / p13:+sonic-we）。测试加断言，`npm run check` **228/228**。PR #63 更新。
- **2026-08-01 FX 控制台动效 tab 全黑修复（续）**：用户反馈「动效里面都是黑的什么都没有」。根因：旧分页「预设专属过滤」规则 `body.rain-on [data-fx-page="motion"] > *:not(#rain-fx-section):not(#fx-stage-fold){display:none}`（及 rain-resonance-on/vox-on 同款）仍生效——FX 控制台 organize 后 motion page 直接子元素是 `.fx-console-group` 折叠块（不是 `#rain-fx-section`），**任一预设激活时动效 tab 所有分组全被隐藏 → 全黑**。修复：删除三条 `> *` 过滤规则；`body:not(.rain-on) #rain-fx-section` 等区块显隐加 `:not([data-console-layout="task-first-v2"])` 前缀仅对旧分页生效，FX 控制台接管后动效 tab 展示全部预设设置。无头 Chrome 实测 motion tab 9 组全可见、雨量/律动敏感 display 正常。更新 test-rain-mood-visual.js 断言；`npm run check` **228/228**。PR #63 更新。
- **2026-08-01 FX 控制台动效 tab 修复 + 新增雨境动效设置**：用户反馈「雨境和云瀑共振在动效里不显示设置，之前弄的动效都不见了」。根因：迁移 FX 控制台时 `FX_CONSOLE_LAYOUT` 只对齐了上游引用，**Mac 自研预设控件（雨境 9 / 云瀑 11 / 音域回响 10）全部未纳入**，organize 后被归入兜底「其他设置」→ 动效 tab 空白。修复：motion tab 新增 3 组（雨境 11 项 / 云瀑 3 项 / 音域回响 12 项），引用全部 Mac 控件 id。另按用户「加一点动效设置」新增 2 个雨境参数：**风向偏移**（fx.rainWindOffset -1~1，叠加 rm.wind 目标值）+ **雨幕浓度**（fx.rainDensity 0.3~1.5，缩放 spawnRate）——fx-defaults、saveRainToggles/loadRainToggles、渲染层、HTML、FX layout、updateFxInputs 全接线；**未碰雨境玻璃水珠（硬约束）**。layout 引用 192 个零缺失；`npm run check` **228/228**。待人工验收：动效 tab 看雨境/云瀑/音域回响设置，调风向偏移/雨幕浓度看雨丝变化。PR #63 更新。
- **2026-08-01 壁纸库接入（续：Scene 场景壁纸 Win 端录制 mp4 → Mac 播放）**：用户问「能否在 Win 端解析 PKG 上传 Mac」。结论：PKG 场景是 WE 私有格式（three.js 场景 JSON + 自定义 shader），上游仅能在 Win 端用 WE 引擎渲染（DWM 捕获），Mac 无法直接渲染。落地「Win 端录制 mp4 → Mac 播放」：共享脚本新增 `/export.html` 录制引导页（Win 端浏览器 `getDisplayMedia` 捕获 WE 窗口 → `MediaRecorder` 录 15/30/60 秒 → POST 保存到壁纸库 `_exported/`）、`/api/exported-videos` 列表、`/api/exported-file` 下载；Mac 端 bridge 的 HTTP 源扫描自动合并导出视频（「Scene 导出 · xxx.mp4」条目）。实测：导出页 200、列表返回、mp4 200 video/mp4。测试断言更新，`npm run check` **228/228**。待人工验收：Win 端真实 WE 场景录制后 Mac 播放。PR #63 更新。
- **2026-08-01 壁纸库接入（macOS，跨机读取 Win 电脑 WE 壁纸库，第七批）**：用户需求「Mac 没有 WE 壁纸库，想通过另一台 Win 电脑利用 Win 版 Mineradio + WE 库传输壁纸到 Mac」。实现两条通道：① **目录扫描**——主进程迁移上游 `desktop/wallpaper-engine-library.js`（901 行，纯 Node 跨平台；仅 `windowsSteamRegistryRoots` 为 win32 专属且 `process.platform !== 'win32'` 返回空数组，Mac 安全），支持手动指定目录（SMB 挂载 `/Volumes/...` 或拷贝的 WE 库目录）；② **HTTP 壁纸源**——新增 `tools/wallpaper-share-server.js`（Win 端可选共享脚本，Node 启动，默认 8123 端口，`/api/wallpapers` 列表 + `/api/wallpaper-file` 文件流，只读安全路径校验，CORS 开放），Mac 端 `desktop/wallpaper-library-bridge.js` 封装（scanDirectory/scanHttpSource/list/getMediaFile），main.js 加 4 个 IPC + preload 4 个 API。渲染层 `07-fx/10-wallpaper-library-panel.js`：首页快捷区「壁纸库」入口 + 弹窗（扫描目录/连接源/列表/图片视频预览）。**图片/视频壁纸 Mac 直接播放；Scene 场景壁纸（PKGV .pkg）需 WE 软件实时引擎，Mac 不可播，标注「需 WE 软件」**（上游渲染层依赖 DWM 捕获等 Windows 专属 API，不迁移）。测试 `scripts/test-wallpaper-library.js` 2 项纳入 check；`npm run check` **228/228**；共享脚本用假壁纸库实测（列表返回、图片流 200 image/jpeg、scene 标注）通过。待人工验收：真实 Win 电脑 SMB 挂载或 HTTP 源下浏览/播放图片/视频壁纸；本批另开新 PR 线。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 7：首页洞察 dock 卡片重叠修复）**：用户反馈首页排版「很多都显示不了」（附截图：右列洞察 dock 的「接下来播放/为你挑选/每日热评换一条」相互挤叠）。根因：`.home-insight-dock` 是 2 列 grid（`grid-template-columns: 1.12fr .88fr`）但 5 个直接子卡片（listen/next/discovery/ranking/radio）**无显式 grid-column/grid-row**，CSS Grid 自动布局按 DOM 顺序排多行，窗口较小时行高不足卡片相互重叠；且 `.home-grid`/`.home-rail` 在 `.empty-home-shell`（2 列 grid，3 个子元素）里无显式列定位。修复：dock 子元素显式分配（listen(1,1)/next(2,1)/discovery(1,2)/ranking:not(.radio)(2,2)/radio 整行(1/-1,3)）+ `align-items:start` + `grid-template-rows:auto auto auto`；`.home-grid`/`.home-rail` 补 `grid-column:2`。无头 Chrome 实测 600/700/800px 窗口 dock 5 卡片零重叠（`overlaps=无`）。测试加 5 处断言，`npm run check` **223/223**。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 6：首页布局重叠修复 + listen-stats v2 本地聚合）**：① 首页小窗口重叠——用户反馈「正常不放大全屏时左边每日推荐评论和歌会重叠，放大排列才正常」。根因：`.home-recent-inner`（flex column）固定内容（kicker/title/stats/brief/next-up/daily-review/quick-row）不收缩，窗口高度不足时列表 flex:1 收缩到 0，热评溢出被 `.home-hero` 的 overflow:hidden 裁剪 → 视觉重叠。修复：固定区块加 `flex-shrink:1;min-height:0`、列表 `flex:1 1 auto;min-height:48px`、`min-height:100%`→`min-height:0;height:100%`；媒体查询 ≤760px 隐藏 stats/brief/next-up、压缩 title/热评，≤640px 隐藏时间。无头 Chrome 700px 窗口实测 review_bottom=303 < list_top=313 overlap=false。② listen-stats v2——上游 v2 是「本地每日 rollup + 服务端 /api/listen/report 上报」；Mac 只迁**本地 rollup**（HOME_LISTEN_ROLLUP_V2_KEY 按天聚合 totalListenMs/sessions/daily/completed），finalizeListenSession 写入；服务端上报不迁移（上游标注 experimental-unverified，涉及把收听数据提交平台，Mac 不做）。测试加 4 处断言，`npm run check` **223/223**。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 5：review 三个 bug 修复）**：① `setFxPanelTab` 旧分页 fallback 白屏——原实现固定用新 key 集合 + legacyToNew 单向映射，若 09 模块未加载走旧分页时页面 key（presets/appearance/...）匹配不到 `fxPanelTab='home'` 初始值 → 面板空白。修复：按 `data-console-layout` 动态选择 key 集合（FX 布局 newAllowed，旧分页 legacyAllowed）+ `newToLegacy` 反向映射；同步修 `16-voxel-echo.js` 的 `fxPanelTab==='playlist'` 检查（FX 布局下是 'shelf'）。② 音源切换竞态——`switchCurrentSongSource` await `findControlSourceMatchResult` 期间用户切歌（currentIdx 改变）会把匹配结果写到新歌索引、覆盖用户选择。修复：await 后 `stillSameSong` 歌曲引用比对（currentControlSong()===song 或 playQueue[currentIdx]===song），不符则中止；catch 分支同样保护；同时去掉「未找到可切换音源」+「该平台无正版音源」双提示（只留一个）。③ 工坊降级循环——超时降级 `setPreset(prev,{noSave:true})` 不持久化，fx.preset 变了但存储仍是 13，下次启动回到工坊白等 9 秒再降级。修复：改用正常持久化（去 noSave）+ `state.degraded` 防重复 + removeLayer 重置 degraded 允许重试。测试加三处断言，`npm run check` **223/223**。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 4：FX 控制台搜索栏无响应修复）**：用户反馈「设置的搜索栏用不了」。根因：`initFxConsoleSearchAndHistory`（绑定搜索 input/focus/keydown + 撤销 + 历史事件）上一轮被误加到 `resetFx` 函数尾部——那是「恢复默认」才走的路径，**启动入口 `bindFxPanel` 没有调用**，导致应用启动后搜索框无事件绑定、输入无搜索结果（tab 正常因为 organize 在 bindFxPanel 第 3 行）。修复：按上游在 `bindFxPanel` 尾部（updateFxInputs 后）补 `initFxConsoleSearchAndHistory()`，保留 resetFx 里的调用（幂等保护 `_fxConsoleSearchHistoryBound` 保证只绑定一次，resetFx 再调直接 return 无副作用）。验证：无头 Chrome 最小页面实测 organize+init+搜索链路（registry=3、输入「粒子」弹层显示、命中逻辑正常）；测试断言 bindFxPanel 块内必须含 init；`npm run check` **223/223**。待人工验收：打开视觉控制台搜索框输入「粒子」应出「粒子尺寸」。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 3：播放标题音源切换补全）**：用户反馈「win 能看到播放的音源并可切换，mac 没有」。根因：Mac 的 `07-search.js` 切换逻辑（`toggleControlSourceSwitcher`/`switchCurrentSongSource`/`songSourceTagHtml`/`renderControlSourceSwitcher` 等）与 CSS（`control-source-chip`/`control-source-switcher`/`control-title-badges` 共 22 处）**早已存在但全是死代码**——缺的是 `15-ripples-cover-depth.js` 的 `updateControlTrackInfo` 挂载点（上游会在播放标题里动态创建 `control-title-badges` 并插入 `songSourceTagHtml(song, {switcher:true})` 音源 chip + `songVipTagHtml` VIP 标签）。修复：按上游补齐 `updateControlTrackInfo`（保留 Mac 特有的 `syncTouchBarTrack`）。验证：8 个依赖函数（normalizePlaybackProvider/cloneSong/hydrateCustomCover/safeRenderQueuePanel/currentResumeSeconds/showSourceFallbackNotice/findControlSourceMatchResult/renderControlSourceSwitcher）全部存在；新增测试断言，`npm run check` **223/223**。待人工验收：播放任意歌曲看标题旁 NE/QQ/KG/SP 音源标签，点开切换面板换到另一平台（需登录对应平台）。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批补记 2：FX 控制台 tab 空白修复）**：用户反馈「常用/界面/歌单」tab 空白。根因一：Mac `setFxPanelTab` 只认旧 key（presets/appearance/lyrics/motion/advanced/playlist），FX 控制台用新 key（home/interface/lyrics/motion/shelf/system）→ 匹配不上 → 所有 page 隐藏 → 空白。修复：换成上游版（新 key + `fxPanelTabScroll` 滚动记忆 + aria/tabindex），加 `legacyToNew` 映射（presets→home/appearance→interface/advanced→system/playlist→shelf）兼容 Mac 旧分页。根因二：`FX_CONSOLE_LAYOUT` 引用的 24 个控件 id 在 Mac index.html 不存在（上游 layout 写给 Windows，Mac 控件 id 不同或没有）→ `fxConsoleAppendItem` 找不到元素 → 对应 tab 组空。修复：全部对齐 Mac 实际结构——背景媒体改用 `background-image-input`/`bg-album-toggle-btn`/`bg-media-crop-btn`/`fx-windowbgopacity`/`fx-bgglassopacity`，性能改用 `performance-mode-seg`/`max-fps-seg`，歌单架改用 `shelf-toggle-btn`，桌面歌词改用 Mac 底栏入口 `lyrics-toggle-btn`（Mac 无独立桌面歌词控件区），移除 Mac 没有的项（译文字号/透明度、歌词清晰度 seg、t-lyricVerticalFloat/t-lyricPauseHold、t-backgroundStarRiver、Wallpaper Engine 项）。修复后 layout 全部 168 个控件引用 + 3 个选择器引用（.fx-actions/.lyric-glow-effect-row/.memory-action-row）均可在 index.html 定位，测试加「layout 引用零缺失」断言，`npm run check` **223/223**。注：无头 Chrome 验证 organize 时因无头环境 WebGL 失败中断渲染链看不到 FX page，Electron 真实环境（有 preload）不受影响；`09-console-workspace.js` 用 vm 沙箱验证顶层加载/导出正常。
- **2026-08-01 Windows v2.1.0 功能对齐（第六批，声波监视器 + 音域地形 + 音域回响·WE，本批）**：从上游迁移「声波系列」三件套——① 声波监视器 `03-beat/06-sonic-audio-monitor.js`（736 行原样）：512 频段实时频谱、8 频段划分、kick 自动跟踪（6 窗 auto-track）、触发阈值/力度检测、可选频谱面板 canvas；主循环播放中 `stepSonicAudioMonitor(frequencyData, ...)` 喂数据、暂停 `stepSonicAudioMonitor(null, ...)` 衰减，快照供预设与相机消费（Mac 既有 `readSonicRealtimeCameraSample` 死壳自动激活）。② 预设 12「音域回响·Sonic-Topography」`sonic-topography-preset.js`（上游 INDEX 7→12）：InstancedMesh 地形 + 浮空方块 + 流星拖尾 + 涟漪，8 频段 EQ 映射 shader。③ 预设 13「音域回响·Wallpaper Engine」`sonic-workshop-preset.js`（上游 INDEX 8→13）：iframe 桥接 `vendor/sonic-workshop/mineradio-bridge.html`（React 构建 1.26MB JS，跳过 preview.gif 914KB），音频/媒体/主题属性节流推送。索引避开 Mac 7=黑洞/8=极光/10=体素音域回响/11=云瀑共振；`00-core-stores.js` 定义 `SONIC_PRESET_INDEX=12`、`SONIC_WORKSHOP_PRESET_INDEX=13`、`MAX_VISUAL_PRESET_INDEX=13`。接线：fx-defaults 51 个 sonic 默认值、持久化 51 字段、presetMeta/图标/displayOrder、setPreset onPresetChange+相机基线 12/13、05-fx-panel-performance 面板控件+`updateSonicSeriesControlVisibility`（非对应预设自动隐藏 sonic 控件，`SONIC_ORIGINAL/WORKSHOP_FX_CONTROL_IDS` 对照上游）、主循环 hidePoints/背景暗度 0.82/星河 alpha、index.html「音域地形/音域频谱/音域颜色/音域方块/音域回响·WE」UI 段、CSS sonic 样式。Mac 既有 sonic 死壳（02-accent-background-controls 颜色控件、palette sonicWorkshopColors、14-stage SONIC_PRESET_INDEX 引用）随常量与 UI 注入自动生效，无需重复迁移。新增 `scripts/test-sonic-series-migration.js` 6 项纳入 check；专项 6/6、`npm run check` **222/222** 通过；Electron 本地服务冒烟（index/两预设/监视器/vendor 资源全部 200）。待人工验收：预设 12/13 真实歌曲下地形律动与工坊 iframe 渲染、频谱面板、主题切换与封面取色；本批按新规另开新 PR 线，不追加 PR #58/#59/#60。
- **当前 Codex 任务链**：PR #27（显卡模式与快速启动）→ PR #29（Mac 真实显卡占用）→ PR #30（主循环真正休眠）→ PR #31（唱歌模式省电）→ PR #32（Mac 安全内存释放）→ PR #33（伴奏/人声双滑块）→ PR #34（最近播放滚动降载与 GPU 文案）→ PR #36（播放定时器降载）→ PR #37（本地 AI 分轨）→ PR #38（AI 提速与实时精准度）→ PR #39（软件 Logo）→ PR #40（歌词选项切换降卡）→ PR #41（音频上游断线保护）→ PR #42（整队不可播保护）→ PR #43（本机崩溃记录）→ PR #44（构建缓存排除）→ PR #45（双架构 CI 运行器）→ PR #46（Touch Bar 歌曲状态）→ PR #47（K 歌升降 Key 与启动开关对齐）→ PR #48（GPU 系统/播放器占用）→ PR #49（AI 分轨热管理与实时去人声增强）→ PR #50（实时人声轨净化）→ PR #51（CoreML 全图加速）→ PR #52（切歌与进度竞态修复）均为叠加关系。
- **协作者最新工作**：PR #28，分支 `codex/fix-gesture-latency`，优化双手手势延迟与 GPU 负载；当前仍待合并，本分支未修改其手势文件。
- **2.0 公开候选**：从 PR #56 线单独创建 `codex/public-release-2.0`。公开分支删除汽水后端、登录桥、本地 Cookie 读取和音频解密器；原 PR #56 开发线保留汽水实验，后续继续在原线开发。2026-07-24 已修复首批候选中网易/QQ/酷狗官方登录被手动导入策略误拦截的回归，以及连续切换音质导致的 `0:00` 卡死、通知堆叠和巨型歌词残影：官方会话由主进程直接验证并加密保存，音质改为同曲串行换流，不重建歌词。最终 2.0.0 arm64/x64 未签名 DMG 已重新打包、挂载和安装验证，正式公开仍受 Developer ID、公证、隐私联系信息与音乐平台授权阻塞。
- **基线**：从 `Mineradio-1.1.3-arm64.dmg`（内部测试版）提取的源码。另有 `v1.1.0` 分支存正式版参考基线。
- **构建已验证**：`npm install` + `npm run build:mac` 本地跑通，产出 134MB dmg。Electron 42.4.1 + electron-builder ^26。
- **网络注意**：本环境 `github.com` 连接不稳定（git push 超时），但 `api.github.com`（gh CLI）正常。**用 gh API 推送代码，不要用 git push**。
- **本轮优化**：预设 11「云瀑共振」已按 Rainform 官网比例重做。模块现在使用 2000 条基础雨链、800 条环境雨链、1400 条暴雨雨链和 1900 条 `InstancedMesh` 细丝；25 点音乐曲线先烘焙为 256 点 `rainformCurveLut`，驱动雨幕高度、强度、水平水面、雾带及顶部雨幕包络，强度归零时整层硬抑制。珍珠 shader 加入多频 procedural liquid metal、镜面反射、Fresnel 和高光参数；不创建第二个 Canvas 或动画循环，不修改预设 9 的玻璃水珠逻辑。专项测试 9/9，Three r128 runtime smoke 通过，`npm run check` **185/185**。
- **2026-07-31 汽水内部实验恢复**：用户明确要求在 PR #58 分支恢复 macOS 可用链路。已从历史私有线恢复 `qishui-api.js` 与 `qishui-audio-decryptor/`，`/api/qishui/*` 已接回当前本地服务；`#auth` 音频只在服务端解密，96MB 有界缓存，渲染层不接触解密材料。Cookie 与 access-token 均使用 macOS `safeStorage` 加密保存，QS 搜索和手动授权入口重新显示；无登录、非法 Cookie 和不可播 URL 均有明确失败结果，继续使用既有换源回退。专项 `scripts/test-qishui-mac-integration.js` 4/4、`npm run check` 待本轮最终运行；真实汽水账号/受保护音频必须由用户手测。此能力不应回流到 `main`，也不得以自动更新或 Windows API 实现。
- **2026-07-31 汽水入口误跳网易修复**：根因是渲染层没有读取主进程的 `qishuiEnabled`，并在策略关闭/缺失时把 `qishui` 静默规范化为 `netease` 或全音源。preload 现显式传递该开关；账户、登录和搜索入口不再改选其他音源，汽水不可用时仅提示。专项 5/5、`npm run check` 195/195 通过。用户需完全退出并重新运行 Electron 后，在真实账号下确认 QS 仍保持选中且可搜索播放。
- **2026-07-31 雨境随机打雷**：预设 9 的动态面板新增默认关闭、独立持久化的“随机打雷”开关。开启后在暂停或无音乐节拍时也会在首次 4-10 秒、后续 6-20 秒随机触发；62% 为单闪，38% 为 2-3 次短促连续闪。效果复用主 Three.js 场景中的一条动态分叉 `LineSegments`、既有闪白层、雨丝和湿玻璃封面 `uFlash`，不新增 Canvas、动画循环、定时器或音频。关闭立即清空待触发队列并隐藏闪电折线。专项 7/7、`npm run check` 197/197 通过；Electron 启动 5 秒无错误。待用户在真实歌曲/暂停状态下目测频率和亮度。
- **2026-07-31 雨境打雷三选一与频率**：用户反馈“随机打雷”仍会随节奏，根因是旧实现同时保留音乐雷与随机雷。现改为“关闭打雷 / 跟随音乐 / 随机打雷”互斥模式：关闭即时清空闪白、折线和待触发队列；音乐模式只读原“打雷阈值”；随机模式完全跳过音频/节拍判断，只读 `4–40` 秒的“随机频率”滑条（默认 15 秒，70%–130% 随机扰动）。升级前 `randomThunder: true` 自动迁移到随机模式。专项 8/8、`npm run check` 198/198 通过；Electron 启动 5 秒无错误。待人工依次验收三种模式与随机频率的主观节奏。
- **2026-07-31 汽水彻底防回退 + Windows 搜索历史迁移**：汽水仍误跳网易云的根因另有三处：顶部账户入口优先首个已登录平台、汽水网页登录缺失分支、汽水搜索 URL 未映射到 `/api/qishui/search`。现分别固定为当前汽水优先、汽水公共搜索/本地授权入口和汽水本地 API，三处都不调用网易云；`scripts/test-qishui-mac-integration.js` 6/6 通过。另从 Windows 2.0.3 迁移跨音源搜索历史，所有音乐源标签可复用同一份历史，播客热门页逻辑不改；新增 `scripts/test-search-history-cross-provider.js` 并纳入总检查。`npm run check` 200/200 通过。待用户完全退出后真实测试汽水登录、搜索和播放；不得提交 Cookie 或 Token。
- **2026-07-31 汽水 PC 扫码登录补全**：根因是 `qishui-api.js` 已有 `createQishuiPcQrLogin()` / `checkQishuiPcQrLogin()`，但 `server.js` 未暴露二维码路由、前端又把桥接能力写死为 `false`，所以“登录”只能切换匹配搜索。现新增仅本地的 `/api/qishui/login/qr/create` 与 `/api/qishui/login/qr/check`：二维码 token 与轮询 Cookie 只短时保留在服务端，成功时 `saveQishuiCookie(result.cookie)` 直接写入 macOS `safeStorage`，HTTP 响应和 preload 都不返回凭据；汽水会话即使在内部实验构建也强制 Keychain 加密。前端展示二维码、每 2 秒轮询，成功只刷新汽水状态/歌单，不调用网易入口。专项 7/7、`npm run check` 201/201 通过；本机真实接口创建二维码 `200`、未扫码轮询 `waiting`，两种响应均无 Cookie/token。待用户使用真实汽水 App 扫码并验证歌单、受保护歌曲、暂停/拖动/切歌；不要提交凭据。此实验仅留在 PR #58，不能回流 `main` 或公开版。
- **2026-07-31 Windows Cuefield 智能混音 Lite 迁移**：只接入已有 macOS Web Audio 交叉淡入，不搬运 Windows 的双音轨执行器、自动下载或 Dashboard 重构。控制栏新增默认关闭、可持久化的“智能混音”开关；开启后仅当当前/下一首普通歌曲均命中已有节拍缓存且 BPM、能量接近时，把用户设定的交叉淡入缩至 85%。无缓存、分析不可信、播客、本地歌曲、随机播放与内存紧张全部保留原路径，歌词、AI 分轨、音源回退和内存保护未改。新增 `scripts/test-cuefield-automix-lite.js`，`npm run check` 206/206 通过；待用户用两首已分析歌曲确认实际交接听感。

**2026-07-29：云瀑共振改为 Rainform 授权派生的分层音乐雨景。**

- 分支：`codex/mineradio-2.0-unified`，继续使用预设索引 11，不修改雨境预设 9 的玻璃水珠逻辑。
- 视觉：替换原先单一的点云为基础/环境/暴雨三层雨链、珍珠雨滴、暴雨瀑布、撞击水花和涟漪；雨滴 shader 加入球面法线、镜面高光、菲涅尔和反射波。
- 音乐：新增 25 点雨量曲线，将 bass/mid/treble/beatPulse 沿横向分布；保留强度、旋律起伏、拍点爆发三个控件和独立持久化。
- 归属：采用用户声明已取得的 Rainform 二创授权；源码保留 Required Notice、`afterimage-lab/Rainform` 来源标识、PolyForm Noncommercial 许可说明。没有接入 Rainform 天气 API 或独立运行时。
- 验证：专项测试 5/5；`npm run check` 181/181；`node --check` 和 `git diff --check` 通过。待用户用真实歌曲确认视觉层次和音乐同步。

**2026-07-29：云瀑共振按官网视觉比例重做。**

- 生产模块：`public/js/modules/02-visual/20-rainfall-resonance.js` 不再用旧的 430 条上限，恢复官网分层数量：基础 2000、环境 800、暴雨 1400、细丝 1900。
- 视觉：珍珠材质采用多频液态金属 band、镜面/Fresnel 高光；细丝使用共享 `InstancedBufferGeometry` + `InstancedMesh`；新增底部水线和雾带，移除该预设自己的背景板，继续透出 Mineradio 场景背景。
- 数据：25 点音乐曲线通过 `rainformCurveLut` 烘焙到 256 点采样，`rainformRainfallResponse` 和 `rainformDataDrivenCeiling` 控制横向雨势峰值、可见高度和低雨量收缩；`RAINFORM_ZERO_RAIN_SUPPRESSION` 负责强度归零时关闭所有雨层。
- 验证：`node --check public/js/modules/02-visual/20-rainfall-resonance.js`；专项测试 7/7；Three r128 runtime smoke 通过；`npm run check` 183/183；Electron 已启动，本地页面 `http://localhost:3000/` 可返回。

**2026-07-29：云瀑共振补齐水平水面、顶部雨峰与旋律联动。**

- 水面：`createRainformWaterSurface()` 的网格旋转为水平面，`uRainLut` 和 `uMelodyPhase` 让横向雨量曲线驱动水面起伏、反射和雾带，不再显示为画面底部的竖直发光面板。
- 雨峰：新增 256 段 `topRain` 雨幕包络，以 `rainformDataDrivenCeiling()` 与旋律相位实时形成顶部高低峰；歌曲的中频旋律会同时推动顶部雨势、水波及雾带。
- 资源：曲线 LUT 在每帧更新后上传到共享纹理，切出预设时连同顶部雨幕、水面/雾带的几何与材质一并释放。
- 验证：新增两项回归契约；专项测试 9/9、Three r128 runtime smoke、`node --check` 与 `npm run check` **185/185** 通过。
- 待人工验收：启动 Electron，选择预设 11 并播放旋律起伏明显的歌曲，确认水面是水平透视面、顶部峰线横向移动且三项控制滑块即时生效。

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
22. **音域回响幽灵封面被挡**（PR #58 线）：体素地形改不透明写深度后，远景柱体 depth-test 掉 `(110,24,-110)` 封面平面；封面材质关 `depthTest`、`renderOrder=6`。设置「封面图」开关与 `mineradio-vox-toggles-v1` 持久化本来就在，未删功能。

### 基础设施
17. **协作规则**（#8）：`.github/AGENT_COLLABORATION.md`（Codex+GLM 协作规则、术语解释、rollback、PR 四要素）
18. **移植包**（#15）：`mac-porting/`（7 个 patch + MAC_PORTING_GUIDE.md）
19. **本机崩溃记录**（PR #43）：最新代码重新接入 crashReporter；`.dmp` 和最多 50 条诊断只存本机，递归查找 Crashpad 子目录，上传开关关闭。

### 环境整理与打包（2026-08-16）
- **桌面三合一**：`Mineradio` / `Mineradio_Beat` / `Mineradio-2.0-backups.noindex` 合并为一个 `Mineradio` 文件夹：项目文件（含 `.git`）在根目录，备份集移入 `Mineradio-2.0-backups.noindex/` 子目录；副本与原文件夹已逐字节对比一致（11798 个文件、desktop/public/build/dist/scripts/docs/mac-porting/.github/.git 与根文件全部 SAME）。原两个文件夹已删除，桌面现在只剩一个 `Mineradio` 文件夹和桌面根目录的 DMG。
- **分发教程核实**：本机 app（asar `7dac0a78…`）是 arm64 单架构 + ad-hoc + 未公证的验收包；「v1.1.3 起 Intel 与 Apple 芯片同一安装包」不成立（本项目 arm64/x64 分开发 DMG）；「已损坏」→ `xattr -cr` → 隐私与安全性「仍要打开」三步对 ad-hoc 包正确。结论见 `发布教程-核实结果.md`。
- **桌面 DMG 打包**：已用 /Applications/Mineradio.app 制作 staging（含旧 DMG 的背景图/卷图标/Applications 快捷方式）；已产出 `~/Desktop/Mineradio-2.0.0-arm64.dmg`（135M），挂载验证通过：含 `Mineradio.app`、`/Applications` 快捷方式、背景图与卷图标；app 版本 2.0.0、arm64、ad-hoc 签名，`app.asar` SHA-256 与已安装 app 一致（`7dac0a78…`）。

## 已知问题（待解决）

**2026-07-29：独立雨窗玻璃水珠迁移到雨境预设 9。**

- 新增 `public/js/modules/02-visual/19-rain-glass.js`：复用主 renderer 的四阶段后处理（锐利场景、双向模糊、Metaball 场、折射合成），不创建第二个 Canvas 或 `requestAnimationFrame`。
- 水滴现为六态物理模型（pinned/impacting/growing/breaking/slipping/settling）：新雨滴先以半透明小撞击珠铺展成附着珠，再进入面积守恒融合、蜿蜒滑落、残留微珠、接触角扰动、折射、菲涅尔、接触阴影和局部高光。
- 液滴场从 0.82 倍提升为原生分辨率（最大 2048×1280）并改用 `highp` 片元精度，降低大尺寸水珠的马赛克。动态面板的雨量范围为 `0.05–4`，水珠数量为 `0.15–2.5`，流速 `0.2–8.0`，尺寸 `0.6–1.8`；雨量不再隐式改变水珠尺寸或额外撞击频率，新水珠统一由雨点击中后的冲击点铺展生成，数量仍受用户上限约束并会替换最小旧微珠。
- 流速不仅作用于滑落加速度和终端速度，也作用于附着态等待、破裂和停靠过渡。调高“水珠流速”后，屏幕上已有的附着水珠会更早离开附着态并更快完成滑落周期。
- 关闭、切出预设、WebGL 上下文恢复或后处理失败时释放 GPU 资源；失败回退原始雨境雨丝渲染。
- 验证：新增撞击凝结与范围回归测试，雨境相关共 10 项通过；`npm run check` **175/175**；本地服务页面切到雨境，动态控件边界已核对（雨量 `0.05:4`、水珠数量 `0.15:2.5`），Console 0 errors（保留 1 条既有浏览器音频策略 warning）。
- 用户反馈背景发糊；已将合成器水滴外的 `glassBase` 从模糊纹理改为锐利场景，模糊只留在水滴内部折射层。
- 待用户手测：用真实歌曲切到雨境，确认 10 分钟播放下水珠的接触边、高光、折射、GPU 温度和壁纸模式帧率。

### 🔴 渲染进程崩溃（exitCode: 5, reason: 'crashed'）—— 最重要
- **现象**：播放某些不可播的歌（如《你不知道的事》网易云+QQ 都失败）触发 QQ 换源搜索后，渲染进程 segfault 崩溃（`exitCode: 5`）。
- **已做的**：崩溃后自动 reload 恢复（PR #20）；最新分支已重新接入本机 crashReporter，真实隐藏测试窗口崩溃成功生成 `.dmp`，不上传服务器。
- **未做的**：还没有在用户真实资料中再次复现原问题，因此尚未拿到对应 GPU 崩溃 dump，也不能确认最终根因。
- **下一步**：用户运行最新分支并复现《你不知道的事》等场景，然后收集 `CrashDumps/` 下的 `.dmp` 和 `crash-diagnostics.json` 分析。

### electron-builder 签名阶段偶发卡住
- 本地构建有时卡在签名阶段（Apple Development 证书 + Keychain 交互）。用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 可跳过。

## 待办清单

- [x] **修复本机应用启动失败**：恢复 8 月 15 日完整验收包，签名、归档头、运行进程、QQ 登录与更新关闭状态已核验。
- [x] **按用户要求追加到 PR #125（合并请求）**：版本清单修正、禁用更新配置及窗口验收记录已推送到 `bugfix/web-art-four-issues`，后续统一在 #125 审查。
- [ ] **主人审查 PR #125（合并请求）**：保持现有目标分支，未经主人明确同意不执行合并。
- [x] **修复后窗口验收**：重新启动后看到真实页面、封面、歌词、粒子和播放控制条；未在真实资料上自动改封面或登录态。
- [ ] **音频与摄像头人工验收**：确认持续音频输出和长时间稳定性；摄像头权限由用户按需开启。
- [ ] **晚间启动复核收尾**：电脑操作通道恢复后重验进入主界面及持续运行；本轮仅看到启动页，后续退出原因未确认。
- [ ] **新版本实装**：当前为历史验收包，后续若安装最近界面变更，必须冻结并复核与新候选匹配的完整安全存储迁移链。
- [ ] **现有完整门禁失败**：核对并修复 3 项 macOS 工作流和 2 项汽水策略断言，保留正式版汽水禁用边界。
- [ ] **补同步 Obsidian**：挂载真实库后，将 `docs/obsidian-sync/2026-09-06-app-repair.md` 追加到开发进度笔记，不创建冒充原库的目录。
- [x] **全局透视模式与共享摄像头**：摄像头作为所有预设通用底图，默认歌词/封面、粒子、P10/P11 保持前景；手势与透视使用单流 owner 管理，隐藏/最小化/遮挡时暂停，假摄像头隔离验收通过。
- [x] **选择性恢复 Wallpaper Engine 局域网库**：只接入验证后的发现、素材导入和 Scene 预览/导出，不整版覆盖 PR #113，不恢复已删除的背景裁切界面。
- [x] **安全恢复汽水目录**：只提供无需登录的公开目录与歌词，并经严格匹配自动换源；直接播放、登录、会话读取和解密链路保持禁用。
- [x] **交付本轮透视/Wallpaper/汽水目录融合**：提交 `b9cd6ae` 已推送并创建 PR #116；228/228、本机干净 arm64 构建、严格签名、登录/权限迁移和唯一 App 实装均已完成。GitHub Actions 目前仅被仓库 Billing 阻止启动。
- [ ] **下一发布版恢复匿名活跃统计（发布阻塞）**：补齐同时在线、DAU、WAU、MAU、YAU、累计安装/下载、版本分布与趋势；实现明确 opt-in、默认拒绝、可撤回的前台有界心跳，完成后端时间窗口与隐私字段验收。当前 2.0 不得中途开启。
- [x] **重新接入崩溃记录**：本机 crashReporter 已在最新代码启用，真实测试生成 `.dmp`，上传关闭。
- [x] **雨境玻璃水珠迁移与写实增强**：独立 RG Metaball 后处理已接入预设 9；动态控件支持开关、数量/流速/尺寸，雨量扩大并驱动尺寸，新增撞击凝结态；背景保持锐利；已消除合成噪声造成的规则像素点阵；`npm run check` 176/176。
- [x] **云瀑共振音乐雨幕预设**：新增索引 11 与 Rainform 授权派生的分层雨景；包含雨链、珍珠雨滴、暴雨瀑布、撞击水花、涟漪、水平水面、顶部雨幕包络和 25 点音乐雨量曲线，动态面板支持雨幕强度、旋律起伏、拍点爆发并独立持久化；保留 Required Notice、来源和 PolyForm Noncommercial 许可说明；专项测试 9/9，`npm run check` 185/185。
- [x] **Windows Cuefield 智能混音 Lite**：控制栏新增默认关闭的持久化开关；仅在两首已缓存、BPM/能量接近的普通歌曲之间将已有交叉淡入缩短至 85%，无缓存、播客、本地、随机和内存紧张均严格回退。
- [x] **汽水登录迁回 PR #56 macOS 官方客户端桥**：删除不可靠的服务端扫码链；只从本机汽水客户端的已登录会话读取，主进程安全保存，渲染层不接触 Cookie。
- [x] **Windows 首页信息层迁移**：在不替换 Mac 首页的前提下加入“每日内容”和“接下来播放”，前者复用每日推荐、后者复用当前队列。
- [x] **Windows v2.1.0 本地曲库持久化**：主进程索引 + `mineradio-local://` 特权协议 + IPC/preload 接线；渲染层导入/启动断点恢复/内嵌歌词/封面链路全部接入；`npm run check` 209/209。
- [x] **Windows 首页每日热评 + 生成封面回退**：每日热评卡片（可换一条、自定义热评列表）+ 无封面卡片生成品牌渐变 SVG；不迁 MP4 Hero。
- [x] **QQ/酷狗 v2.1.0 字段**：`qqMembershipNeedsSync` 区分播放授权未完成/权益待同步；酷狗兼容 `playbackReady`。
- [x] **本地曲库 UI 面板**：首页与导入面板新增“本地曲库”入口，弹窗支持浏览/搜索/播放/全部播放/移除（只删索引与封面缓存，不删源文件）；主进程新增 `mineradio-local-library-remove` IPC。
- [x] **窗口恢复 + 歌词磁盘缓存**：补 `desktop-window-restore` handler；歌词按曲目缓存到 userData（≤96MB 自动淘汰），`fetchLyric` 先读缓存；不迁 Chromium 缓存搬迁（防丢 macOS 登录态）。
- [ ] **本地曲库人工验收**：拖入含内嵌封面/歌词的 mp3/flac 与 `.lrc` 侧车文件，确认索引、封面、断点恢复、内嵌歌词显示；再删除源文件确认启动后不崩溃并提示重导。
- [ ] **首页每日热评人工验收**：确认未登录/登录态首页都显示热评卡片，“换一条”可切换且重启后当日仍稳定；自定义 `mineradio-daily-review-quotes-v1` 热评生效。
- [ ] **汽水本机验收**：先登录 macOS 汽水音乐客户端，完全退出后在 Mineradio 点击“读取本地汽水”；确认 QS 保持选中、歌单/搜索/播放不跳网易。不得记录或提交 Cookie/Token。
- [ ] **智能混音 Lite 听感验收**：开启后用两首已完成节拍分析的普通歌曲检查交接；再确认播客、本地歌曲、随机播放和内存紧张时保持原交叉淡入行为。
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

## 发布新版本流程（固定，发版时照此执行）

1. 确认 `npm run check` 全绿 → 构建：`CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac:arm64`（需要时加 x64）。
2. `gh release create vX.Y.Z dist/Mineradio-X.Y.Z-arm64.dmg -R chyzsnb-commits/Mineradio-mac- --title "Mineradio vX.Y.Z" --notes "更新说明"`。
3. 更新 `Mineradio-mac-` main 分支根目录 `version.json`（version/notes/url 三字段）并推送。
4. `curl https://raw.githubusercontent.com/chyzsnb-commits/Mineradio-mac-/main/version.json` 验证。安装实例 30 秒~6 小时内收到提示。

## 工作规则（给接手 AI）

- **分支命名**：`codex/任务名`（Codex）、`glm/任务名`（GLM/ZCode）。不直接改 main，走 PR。
- **每次更新单独开新 PR 线**（2026-08-01 用户确认）：每批功能/修复/文档更新都新建分支 + 新 PR，**禁止往已开的 PR 上追加 commit**。PR #58（`codex/mineradio-2.0-unified`）已封线。新线从最近一次远端 head 分叉，更新用 GitHub Git API 以该 head 为 parent 创建 tree/commit 后 PATCH 新 ref（`force:false`），不使用 `git push`；新 PR 的 base 一般为该线当前 head，diff 只含本批文件。
- **PR 四要素**：变更 / 验证 / 未验证 / 是否需要用户手动操作。
- **commit 是存档点**：一任务多小 commit，出问题可 revert。
- **用英文术语带中文解释**（commit/branch/PR/issue/repo/main/merge/rollback/diff/CI）。
- **每次完成改动的最终回复必须给用户“命令行测试”代码块**：命令可直接复制运行，针对本次实际改动，并说明通过时的预期结果；AI 已跑过检查也不能省略。
- **每次完成任务必须同步更新 Obsidian**：笔记库在 `/Users/chy/菜鸡的仓库/菜鸡的仓库/02 知识编译/Mineradio Mac 开发进度.md`。完成新任务后，把成果追加到这个笔记的「已完成的优化」表格和「待办」清单里。这是用户的知识库，代码改了笔记也要跟着更新，不能只改代码不记笔记。
- **每次完成任务也要更新本文件（AI_HANDOFF.md）**的工作日志和待办清单，让下一个接手的 AI 知道最新状态。
- **每次完成任务的最终回复必须附「转交提示词」**：一段可复制的文字（当前工作树/分支/HEAD、本次完成内容、验证命令、未验证待办、提醒下一位先读 AGENTS.md + AI_HANDOFF.md + Obsidian 项目记忆），供用户直接粘贴给下一位 AI。AI_HANDOFF 更新不能替代转交提示词。
- **首次接手本项目必须按顺序读三处**：① AGENTS.md → ② AI_HANDOFF.md → ③ 本地 Obsidian（`/Users/chy/菜鸡的仓库/菜鸡的仓库/Codex Memory/10 项目记忆/Mineradio/` 的当前进度.md 与项目约束.md），读完向用户复述接手状态再动手。
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
- 随后已含 tip 的 arm64/x64 DMG 打到 bobby 桌面（Development 签名，未公证）。

**2026-07-28：落地雨境（节奏雨丝）视觉预设；水膜仍搁置。**
- 分支：`codex/mineradio-2.0-unified`。
- 映射：把 weather-mood 的气象可视化思路改成音频驱动——低频/鼓点控雨量与雨丝粗细，中频控风向，高频+强拍偶发雷闪；**不是水膜，也不另起 Canvas**。
- 接入：复用已下架索引 9；新模块 `public/js/modules/02-visual/18-rain-mood.js`（THREE.Points 对象池 ≤900）；`index-loader` 加载；主循环 `hidePoints` + `updateRainMood(dt)`；预设网格/图标/相机基线；主粒子 shader 9 号分支置空；星河叠层关闭。
- 硬约束：用户确认**水膜共振先不要**。
- 验证：`scripts/test-rain-mood-visual.js` + 更新 beat-unified；`npm run check` **165/165**；`git diff --check` 通过。
- 未验证：真实歌曲听感与壁纸模式下的雨境观感需用户手测。

**2026-07-28：修复音域回响幽灵封面被不透明地形挡住。**
- 现象：用户反馈「专辑唱片图片不能打开了」；代码里功能并未删除——`fx.voxGhostCover` 默认 true，设置 → 动态 → 音域回响 →「封面图」可开关，独立持久化 `mineradio-vox-toggles-v1`。
- 根因：`b8c557e` 把体素地形改成不透明写深度后，远景柱体把 `(110,24,-110)` 的封面平面整块 depth-test 掉；封面材质此前只关了 `depthWrite`，没关 `depthTest`。
- 修复：`16-voxel-echo.js` 幽灵封面 `ShaderMaterial` 加 `depthTest: false`，`renderOrder` 提到 6（在流星/粒子之上画氛围层）。
- 验证：`test-beat-unified-regressions.js` 新增幽灵封面断言；`npm run check` **166/166**。

**2026-07-28：雨境加湿玻璃幽灵封面。**
- 不复用体素 140 大斜面：雨境机位 radius≈7.2，做成居中海报 `5.6×5.6 @ (0, 0.55, -7.2)`。
- 效果：冷调 + 竖向雨痕 UV 扭曲 + 软边/底部溶进黑场；鼓点轻呼吸、随风微偏；约 55% 雨丝落在封面前。
- 管线：复用主 `coverTex` / `uHasCover`；无封面隐藏；切走关平面。层级：暗底 < 封面 < 雨丝 < 闪白。
- 验证：`test-rain-mood-visual.js` 增封面断言；`npm run check` **171/171**。

**2026-07-28：雨境雨量与打雷阈值可调。**
- UI：动态 tab 雨境区顶部加「雨量」「打雷阈值」滑条；`fx.rainAmount` 默认 1.0（0.1–2.5）、`fx.rainThunder` 默认 0.55（0.15–0.95）。
- 驱动：spawn 乘雨量倍率；flash 的 treb/beat/energy 门与随机通过率由 `rainThunder` 控制（低=更易闪）。
- 持久化：写入 `mineradio-rain-toggles-v1` 的 amount/thunder；启动 `loadRainToggles` 恢复。
- 验证：`test-rain-mood-visual.js` 增断言；`npm run check` **171/171**。

**2026-07-28：移除未完成的玻璃水珠原型。**
- 原因：玻璃水珠/屏幕水滴桌面效果观感不合格、当前不可用；用户仍在另线修复，产品线先不带。
- 删除：`public/rain-window.html`（metaball 水珠实验页）、`.claude/launch.json`（仅服务该预览）、雨境注释与交接文档中的水珠条目。
- 保留：雨丝、湿玻璃幽灵封面、雨量/打雷阈值、封面图开关。

**2026-07-28：雨境封面图开关（动态 tab）。**
- UI：`#rain-fx-section` → 动态 tab；仅 `body.rain-on` 显示；`t-rainGhostCover` 与音域回响「封面图」同构。
- 状态：`fx.rainGhostCover` 默认 true；独立持久化 `mineradio-rain-toggles-v1`；启动 `loadRainToggles()`；`toggleFx` 写盘并 toast。
- 显隐：`updateRainMoodCover` 要求有封面且开关未关；切走清 `rain-on`。
- 验证：`test-rain-mood-visual.js` 增开关断言；`npm run check` **171/171**。

**2026-07-28：唱歌模式默认不开麦。**
- 根因：开唱歌模式会走 `syncSingingMicPowerState` → `getUserMedia`，只为可视化跟嗓，不是混音必需。
- 修复：新增 `singingMicEnabled` 默认 false；`singingMicShouldRun` 双门；`setSingingMode(true)` 默认不申请麦、toast 去掉“正在开麦”。
- 验证：更新 power-save / graph-rebuild 测试；`npm run check` **171/171**。

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

**2026-07-29：云瀑共振官网结构对齐与开场尺寸校准。**
- 移除独立 `topRain` 顶部包络线。顶部高低峰现在只由基础雨链、暴雨雨链和细丝的实际高度共同构成，避免出现脱离雨幕的“波形线”。
- 25 点横向雨势直接采样真实 `frequencyData` 的 25 段频谱，并做轻度时间平滑；旋律换音会改变峰谷横向位置，不再用固定正弦波伪造旋律。
- 新增 `768×384` 双 RenderTarget 高度场。雨链落水会把冲击写入高度场，水面读取高度和梯度生成可衰减的涟漪、暗色浅水反射、Fresnel 与局部镜面高光；资源在切换预设时释放，目标创建失败时仍可回退旧水面。
- 开场基础珍珠缩放到 `0.62`，瀑布珠缩放到 `0.56`，保留原有音频能量驱动的增长，让静态/低能量时雨景更细密而非大颗粒。
- 验证：专项 `scripts/test-rainfall-resonance.js` 13/13、`node --check public/js/modules/02-visual/20-rainfall-resonance.js`、`npm run check` 189/189 通过。未验证：需在 Electron 中选择预设 11 并播放旋律和鼓点明显的歌曲，人工确认水面透视、峰谷跟随与控件即时响应。[来源: `public/js/modules/02-visual/20-rainfall-resonance.js`、`scripts/test-rainfall-resonance.js`，2026-07-29]

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
- 发布边界：汽水继续禁用且后端实现不进入包；“水膜共振”已从本次发布完全撤下。**2026-07-28 用户再次确认：水膜共振先不要**——不恢复、不打磨、不排期，除非用户当场点名。本地 Cookie/Token/Provider 文件加入 `.gitignore`。
- 播放竞态追加修复：`HTMLMediaElement.currentSrc` 在刚写入新 `src` 后仍可能返回上一首，旧实现因此会把有效的新请求判为过期并清空。播放请求、重试和进度恢复的身份比较统一改为优先读取 `media.src`；真实 QQ 登录状态下在“那天下雨了”和“我知道”之间交替快速切换 12 次，12/12 次进入播放。
- 发布界面：负载监视器删除“手势 / 推理 xx ms @ xx/s”开发诊断行；没有改变用户确认过的歌单结构与上下滑动方向。
- 成功播放视觉回归：成功路径原先调用 `switchPlaybackVisualToEmily()` 强制跳到保存的播放预设，而拿不到音频地址的失败路径没有执行，因此同一界面会因播放成功/失败呈现两套样式。现在只退出首页预览并保留当前视觉，不再在播放成功时擅自切换预设。
- 最终验证：`npm run check` 158/158；安装版 QQ 登录有效，“我喜欢”22/22 首；“我知道 / 当你”交替快速切换 12/12 次启动，测试预设保持在选择值 `0` 而未跳到强制值 `2`；负载栏无手势推理行，汽水和水膜均不可见。壁纸模式窗口实测从普通 `1470×923 @ (0,33)` 扩展到完整显示器 `1470×956 @ (0,0)`，退出后恢复普通窗口。
- 最终产物：`Mineradio-2.0.0-arm64.dmg` SHA-256 `1c5bbf88b0f99b9bbf15993b11fab10c7ff4b37c1ac3823557559459ad151117`；`Mineradio-2.0.0-x64.dmg` SHA-256 `3f9a02deec3f2746968599cf6cbbd05ab6afcf957c591457151ae5c79c354488`；两包和 `/Applications/Mineradio.app` 的 `app.asar` 均为 `7192f2c0af235f510c1c3b7fade88dce6df80058687e1ffb44f44de7c29b7477`。两份 DMG 均实际挂载并含 `Mineradio.app` 与 `/Applications` 快捷方式，二进制分别为 arm64 / x86_64。
## 2026-09-07：移除汽水入口、主页中性色与卡顿治理（追加到 PR #125）

- 分支：`bugfix/web-art-four-issues`（PR #125 的现有头分支）。
- 前端搜索不再提供 QS/汽水模式或汽水搜索请求；音源切换器和主页推荐面板不再加入汽水，正式版策略保持 `qishuiCatalogEnabled=false`，后端历史目录接口仍由发布策略拦截。
- 主页玻璃层改为中性黑灰，覆盖动态封面取色对玻璃背景的红色染色；封面图片本身不去色。玻璃模糊从 22/26px、较高饱和度降到 14/16px、低饱和度，减少 GPU 合成压力。
- 修正主循环限帧保留时间余量，避免 45/30/18 FPS 在 60Hz 屏被错误降成约 30/20/15 FPS；自动性能治理跳过主动 2 FPS 的空闲渲染，避免越用越降档。
- 验证：相关 JS `node --check` 通过；`scripts/test-public-release-policy.js` 7/7 通过。尚未重新打包或替换 `/Applications/Mineradio.app`，避免破坏已冻结的 Safe Storage 恢复链。
- 完整 `npm run check`：288 项中 284 项通过；剩余 4 项为既有上游音频中断测试偶发失败，以及 3 个 macOS CI 工作流断言（运行器、paths、Node 版本），与本次 UI/调度改动无关。相关专项 22/22 通过。
- 待办：由仓库主人审查 PR #125；安装包仍需在安全存储链冻结后另行重打包，不能直接替换当前验收 App。

**2026-07-29：云瀑共振湖面与歌词构图修复。**
- 用户截图中的底部白色点阵来自独立水花粒子与线段涟漪层，不是高度场水面。两层现已移除，雨链撞击只写入 `768×384` 高度场，连续湖面根据高度梯度显示暗水、细波、反射、Fresnel 与局部高光。
- 湖面材质改用低频 `lakeSheen`，去除高密度雨幕反射条纹，底部不再呈现白色粒子带。
- 新增 `RAINFORM_DEFAULT_STAGE_SCALE = 1.42`。云瀑默认采用局部构图，不再完整展示整个瀑布；每帧读取 `fx.lyricScale`，云瀑组平滑跟随“歌词大小”缩放，歌词自身位置、字体和动画保持原逻辑。
- 验证：专项 `scripts/test-rainfall-resonance.js` 14/14、`node --check public/js/modules/02-visual/20-rainfall-resonance.js`、`npm run check` 190/190 通过；`npm start` 已启动本地 Electron 服务，无启动错误。未验证：需要用户在真实歌曲中确认湖面亮度与默认局部裁切是否符合观感。[来源: `public/js/modules/02-visual/20-rainfall-resonance.js`、`scripts/test-rainfall-resonance.js`，2026-07-29]

**2026-08-10：P10 一级歌架构图与玻璃卡面修复。**
- 根因：PR65 恢复时一并撤掉了旧的玻璃卡面与 P10 世界布局适配；后续仅补了根节点缩放和默认 yaw，普通预设的低位大斜切被直接放入体素远景，导致一级卡压歌词、透视失真且 `bgOpacity` 接近 `1` 时成为纯黑大板。
- 最终修复：以用户图二为构图基准，中心卡回到右侧中部（不再上提到右上角），恢复完整纵向卡距和轻微斜切；P10 根组固定跟随焦点相机，隔离通用封面粒子的旋转及换封面瞬时扭曲。普通预设布局不变；P10 卡面使用歌词色板驱动的冷色玻璃，背景透明度保留但最终 alpha 钳在 `0.26..0.54`，切入/切出 P10 强制重绘。
- 回归：右键仍只打开一级、保留原生 P10 半径/高度、不进入音柱，`markRenderInteraction('shelf-context', 1200)` 仍保留。专项 `18/18`，完整 `npm run check` **268/268**，语法与 `git diff --check` 通过。人工验收：P10 右键确认一级卡处于右侧安全区、主歌词不被遮挡、封面与文字可读。

**2026-08-10：P10 一级歌架斜切与纯黑回归修复。**
- 用户复测指出上一版一级歌架仍然角度不对、卡面发黑。根因分别是 P10 适配层把普通侧栏 `sideRotY` 从 `0.28` 降为 `0.18`，以及 P10 独立底色在深色体素背景和透明材质叠加后对比不足。
- 修复：P10 只继续使用远景世界坐标/相机半径保护和焦点根姿态，恢复一级卡 `0.28` 斜切；冷色玻璃底色提高到 `alpha 0.34..0.62` 和可读冷色范围，仍跟随歌词色板且不变成不透明色块。普通预设、二级详情降亮逻辑不变。
- 新增回归断言覆盖图二斜切范围与一级卡面 rgba 可读范围；P10 专项当前 `19/19`。待命令行 Electron 真实验收视觉位置、卡面文字/封面可读性，以及点击一级卡后二级背景仍按预期降亮。

**2026-08-10：P10 一级歌架最终黑屏根因修复。**
- 用户实机截图确认：卡架位置落在红框中部，但整张一级卡只有近黑轮廓。运行时对照显示 Canvas 画布、封面数据和卡片材质均有亮像素；问题不是继续提高玻璃 alpha。
- 根因：P10 歌架世界比例复用了普通 `orbit.baselineRadius`。P10 初始化前后该值会在 `6.6` 与 `50` 间变化，使歌架从约 `19.4x` 突变到约 `2.4x`；配合体素远景机位，卡架会在音柱远处变黑，或放大钻入音柱。
- 修复：新增稳定的 `VOX_SHELF_REFERENCE_RADIUS = 50`，P10 歌架比例不再读取普通 orbit；右键一级歌架使用相机前方安全锚点，并将横向偏移校准回用户红框的中部区域。普通预设、P10 自由镜头、右键一级/二级状态机和歌词让位逻辑未改。
- 对抗性验证：命令行 Electron 实测 `fx.preset=10`、`shelfPinnedOpen=true`、歌架可见度为 `1`；真实截图中卡片封面、文字和冷色玻璃均可读，不再是纯黑；P10 专项 `21/21`，完整 `npm run check` `271/271`，语法与 `git diff --check` 通过。

**2026-08-11：Windows 壁纸库自动发现实机修复。**
- 根因：macOS `arp -an` 的 `(incomplete)` 条目被误算为邻居，导致 254 个伪候选在 `8128` 之前耗尽扫描时限；手动连通不代表自动路径成功。
- 修复：排除 `incomplete` / `FAILED`；打开弹窗、读取和刷新共用 `wallpaperLibraryDiscoverAndConnect()` 单飞事务，缓存验证失败后才扫描。来源分为 `manual`、`cache`、`udp`、`subnet`，手动成功不再显示“自动读取 Windows IP”。
- 实机证据：无 UDP 时，主进程发现返回 `http://192.168.1.107:8128`（`source: subnet`），诊断中该 URL 为 `PING_OK`。专项 31/31、完整检查 310/310。Scene 预览、导出和下载仍待用户跨机验收。

**2026-08-19：启动边界回归纳入正式检查并完成 Electron 对抗验证。**
- 根因：`scripts/test-startup-boundaries.js` 已存在并单独通过，但此前未被 `package.json` 的 `precheck` 调用，导致冷启动 URL/空资源回归可能被正式检查遗漏。
- 修复：将该专项加入 `precheck`，不改变运行时代码和既有专项顺序。
- 命令行证据：`npm run precheck` 前置专项 `36/36`；`npm run check` 主套件 `344/344`；`git diff --check`、`node --check server.js`、`node --check desktop/main.js` 通过。
- Electron 冷启动（隔离 `MINERADIO_USER_DATA_DIR`）：页面 `http://127.0.0.1:3000/`、`readyState=complete`、DOM `2887`、Canvas `7`、LongTask `0`、运行态异常 `0`。真实 CDP 连续 20 次滚轮后 DOM 保持 `2878 -> 2878`，LongTask 仍为 `0`。
- 边界：本轮未使用真实登录、真实音频、触控板温度或跨 Windows 壁纸服务；这些不能由本次冷启动证据替代。测试 Electron 已全部关闭，未提交、未推送。

**2026-08-23：全功能收口审计与主页触控唤起修复。**
- 正确工作树仍为 `/Users/bobby/.config/superpowers/worktrees/mr/pr113-cli-runtime`，分支 `codex/keep-vsync-auto-governor`，HEAD `bad9c4d`；当前改动未提交、未推送、未构建，不能把它描述为 GitHub 或 `/Applications` 包体。
- 主页底栏根因已修复：通用播放器恢复逻辑尊重 `home-controls-locked`；主页保留明确鼠标点击打开播放器控制台，触控开始/移动/合成 click 不得唤起。真实 Electron/CDP 证据：触控 `locked=true, visible=false, awake=false`；鼠标 `locked=false, visible=true, awake=true`。
- 命令行证据：`npm run precheck` `36/36`，`npm run check` `349/349`，`git diff --check` 通过；真实 Electron `http://127.0.0.1:3000/` 冷启动成功，歌词转场探针覆盖 20 组单/双/三/自定义多行组合，逐帧 `buildLyricMesh=0`。
- 功能核对：退出登录、汽水歌单/不可播放诊断、音质内联切换、歌词导入/本地缓存、P10 右键歌架与非黑构图、拖动缓冲四档与 300ms 边缘唤起、主页滚动/底栏守卫、动态端口发现、壁纸多选/下载/缓存/视差、音频输出入口均有代码入口和回归覆盖。
- 不能宣称已由本地测试证明：汽水存在可播放 URL 后的 `canplay/playing` 连续播放；真实 Windows 跨机发现、MJPEG/Scene 导出；真实硬件输出切换；用户前台真实歌曲下的长期帧率、温度和内存趋势。这些须在对应设备上验收。
