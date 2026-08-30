# Changelog

- 新增软件内更新检查（自研轻量方案）：启动 30 秒后与每 6 小时读取公开清单（`Mineradio-release` 仓库的 `version.json`），semver 对比发现新版本在右下角提示"发现新版本"，一键下载 dmg 到 `~/Downloads`（带进度与 `.part` 半截文件防护），完成后自动打开安装器。主进程走 Electron `net.fetch` 遵循系统代理；下载源流错误、HTTP 失败、超时均清理不留伪包；清单解析对坏 JSON/非法版本/非 https 全部静默降级，检查失败绝不影响主功能。因无 Developer ID 证书，macOS 不允许后台静默替换应用（系统限制），本方案为现实可行的"检查 + 一键下载安装"。新增 `scripts/test-update-checker.js` 回归（semver/清单解析/四路径检查/下载落盘与中断清理）并接入 `npm run check`（主套件 347/347）；真实 Electron 实测经系统代理拉取真实 GitHub 清单返回 `ok:true, hasUpdate:false`，卡片无误弹。发布新版本时需同步更新 `Mineradio-release` 的 `version.json` 与 Release dmg。

- 修复 Windows 壁纸库缩略图媒体类型误判：缩略图标签此前只按 `record.type` 决定，视频壁纸的服务端静态图片预览（`preview.jpg/gif/png/webp`）被塞进 `<video>`，真实 Electron 复现为 `readyState=0`、`videoWidth=0` 的黑屏缩略图。现按 `previewUrl` 实际媒体类型选择标签（仅 URL 本身为 mp4/webm/ogg/mov/m4v 才用 video），详情页仍按 `record.type` 用 `record.fileUrl` 播放真实视频，Scene 实时 MJPEG 预览路径不变。新增 `scripts/test-wallpaper-library-thumb-media-type.js` 回归并接入 `npm run check`（主套件 342/342）；隔离 Electron 于真实 Windows 服务（246 条记录、动态端口 8137）实测：修复后图片预览加载成功（`naturalWidth=1024`）、视频预览正常解码（`videoWidth=1920`）、246 条记录 0 错标、连续抽屉开合与滚动后 DOM 无增长。

- 性能治理（方案 A）：完全移除“云瀑共振”预设、其运行时模块、控制台控件和相关绑定，避免持续维护一条未使用的视觉链；为不让旧 DIY/自动保存误指向“声波地形”，保留退役索引 `11` 并统一迁移到雨境 `9`，后续预设仍为 `12/13`。雨境玻璃保留主场景、水滴场和合成的全帧渲染，但将两次模糊纹理 pass 限为 `30Hz`，首次、尺寸变化及 WebGL 恢复仍强制刷新，避免黑纹理。P10 音域回响的专用 512-bin 频谱分析同样限制为 `30Hz`，画面、镜头与城市更新仍按主渲染帧率运行。新增每个雨境 pass 的 CPU/GPU 诊断标签和 P10 分析探针；专项 `6/6`、完整 `npm run check` 前置专项 `5/5`、主套件 `340/340` 通过，当前 Electron 从本工作树启动且 `127.0.0.1:3000` 返回 `200`。本轮优先级固定为“流畅性 > Bug 风险 > 温度”；实际不同显卡上的温度和帧时间仍须用户在常用曲目与预设中复验。

- 修复主页误唤起左侧“歌单 / 队列”面板：主页状态下统一拒绝左边缘停留、直接队列打开、常开歌单和歌单 tab 的唤起请求，并在进入 Home 时清除已排队的边缘计时与已有面板显示状态；常开偏好保留，离开 Home 回到听歌页后恢复原有行为。3D 歌单架、队列数据、播放和听歌页右键逻辑均未修改。新增主页歌单守卫回归；完整 `npm run check` 前置专项 `5/5`、主套件 `350/350` 通过。独立浏览器会话验证主页左边缘停留 `450ms` 仍不可交互，离开 Home 后按原 `300ms` 停留与后续移动可正常打开。

- 接入协作者 PR #111 的原生滚动、右上角单状态卡与登录退出入口，并继续修复播放器和切歌热路径：超长歌名下收藏/加歌按钮固定为同一行；连续上一首/下一首输入在 `64ms` 内合并到最终目标，过期的换源、重试和自动降级不能回放旧曲或覆盖新状态；远程音源先预取再提交，节拍磁盘缓存改为播放成功后异步读取；队列当前项与 3D 歌架改为增量更新，播放输出路由按设备与 epoch 去重串行。PR #111 基线 `npm run check` 为前置专项 `5/5`、主套件 `327/327`，新增 21 条回归后为 `5/5`、`348/348`。隔离 Electron 实测首页、搜索、歌单、视觉控制台各 40 次滚动均无 long task，处理器 p95 分别约 `0.1/0.2/0.2/0.2ms`；长标题按钮同排、登录页“退出 网易云音乐”可见、连续状态更新只保留最新一张。真实汽水可播流、真实账号退出和实际曲库的触控板/切歌手感仍需用户验收。

- 修复登录接入弹窗的两处回归：新增“退出当前平台”后，`.login-panel-head > div { display:none }` 错误隐藏了动作区，导致退出和关闭按钮不可见；现只隐藏旧标题节点。已登录状态下还会调用不存在的 `loginProviderDisplayName()`，触发运行时错误并中断后续登录 UI 更新；现复用已有平台名称元数据。登录弹窗开场不再对整块半透明玻璃面板施加 `blur(12px)`，避免短暂发白。Chrome 本地页验证“退出 网易云音乐”可见、面板 `filter:none`；专项与完整 `npm run check` `321/321` 通过。

- 修复 macOS 汽水音乐播放诊断丢失上游元数据的问题：已登录会话搜索“蝴蝶 / 陶喆”命中准确曲目 `6705032260845832194`，但本机服务未获得可播放流，故不将自动切换视为汽水播放成功。`track_v2` 在上游以 2xx 返回非 JSON 内容时现保留 HTTP 状态、Content-Type 和 `QISHUI_INVALID_JSON`，界面会说明“无法确认可播放流（可能需要重新登录、接口变更或被上游拦截）”；不读取、不记录 Cookie、Token、签名 URL，也不绕过登录、版权、地区或访问控制。新增回归覆盖该 2xx 非 JSON 分支；真实 Chrome `canplay`、`playing` 与持续 10 秒播放尚未获得证据。

- 修复 macOS 汽水音乐“歌单入口存在但无法真实使用”的完整前端链路：已登录时歌单面板会请求并渲染 `/api/qishui/user/playlists`，详情和“播放歌单”会走 `/api/qishui/playlist/tracks`；首次播放、无缝预取与当前歌曲切音质统一请求 `/api/qishui/song/url`，不再错误请求网易云接口。新增列表/详情/队列/音频路由回归以及本地假上游正向契约测试；未登录、空歌单和无可播地址均返回明确失败状态。完整 `npm run check` `315/315` 通过。真实已登录汽水账号的受保护音频解密和浏览器播放仍需用户在 Electron 中验收。

- 修复 Windows 壁纸库“读取 Windows IP”在 UDP 广播未抵达 Mac 时完全没有候选的问题：主进程现在记录 UDP `45678` 的监听、最后消息、解析失败和每个 `/api/ping` 结果；无广播时先查本机 ARP 邻居，再受限地在活跃私网接口的同段渐进探测 `8123–8155`，优先 `8130`，全局最多 `32` 个短超时请求。只接受私网地址和 `/api/ping` 返回 `ok: true` 的服务；大网段只从本机 `/24` 渐进，绝不扫描公网或完整端口空间。界面会区分未收到广播、广播格式错误、ping 超时/拒绝/连接失败，并说明 Windows 应监听 `0.0.0.0`、防火墙需放行 UDP `45678` 与 TCP 服务端口。模拟无 UDP + ARP `192.168.1.107` + `8130` 已自动回填完整地址；专项 `27/27`、完整检查 `306/306` 通过。当前实网 `192.168.1.107:8130` 返回连接拒绝，故真实跨机正向链路仍待 Windows 服务恢复后验收。

- 播放器音质选择同步为 Windows 的歌曲信息内联样式：音源、会员标签与当前音质胶囊均在标题旁紧凑显示，移除底栏独立大入口。无歌曲时入口禁用并说明原因；换流时展示加载状态；当前档位、曲目上限与 SVIP 限制保留明确的选中/锁定状态。原位换流、失败恢复旧流与播放进度续播链路未改；真实会员和各平台实际档位仍待 Electron 人工验收。

- 修复 Windows 壁纸库的动态端口前端回填：不再把 `8123` 显示成固定地址，手动连接提示改为要求完整 `http://Windows-IP:端口号`（1024-65535）。UDP 发现或缓存直连成功后，输入框、状态文本和本地存储都保留实际完整 base URL，例如 `http://192.168.1.107:8130`。新增端到端回归，覆盖 `8130` 广播、缓存优先请求和界面显示；真实 Windows 服务联机验收仍待执行。

- Windows 壁纸库改为动态端口发现：UDP 45678 广播携带的合法端口优先通过 /api/ping 验证；广播无端口或该端口失败时，只扫描该广播 IP 的 8123 至 8155，最多四并发、短超时。移除旧的整段私有子网扫描；手动地址必须明确提供 1024 至 65535 端口。已保存地址仍优先直连，成功后持久化。壁纸专项 21/21、前置专项 5/5、主套件 300/300 通过（合计 305/305）；真实 Windows 广播和防火墙仍待双机人工验收。

- 新增本地歌词与云盘无词回退：本地曲库继续使用同名 LRC 和音频内嵌歌词；播放器可在“自动 / 本地歌词”间切换，歌词弹窗可导入不超过 512 KiB 的 LRC/TXT，兼容 UTF-8、UTF-16、GB18030。自动模式优先可信平台歌词，无词时才回退已保存的本地歌词。跨源借词必须同时匹配标题、歌手、时长（差值不超过 3 秒）和候选唯一性；当前或候选为翻唱/Remix、时长缺失、歌词为空或候选不唯一都拒绝，不缓存也不覆盖当前歌词。专项 3/3、前置专项 5/5、主套件 298/298 通过（合计 303/303）；真实云盘账号、版权歌词仍待 Electron 人工验收。

- 修复每首新歌播放初期的周期性卡顿：根因是未命中节拍缓存时，切歌后约 `0.9s + 0.8s + 1.4s` 就会强制启动完整音频解码、四段 `OfflineAudioContext` 渲染与 PCM 分析；缓存命中时，下一首预热也可能在 `2.6s` 后启动同类工作。现在当前曲目的重分析至少等待 `12s` 稳定播放，队列预热至少等待 `24s`；用户交互活跃或浏览器 idle 预算不足 `18ms` 时重排而不强制执行，磁盘/内存缓存命中和实时频谱保持即时。新增回归测试；前置专项 `5/5` 与主套件 `295/295` 通过（合计 `300/300`）。[来源: `public/js/modules/00-state/03-beat-dj-state.js`、`public/js/modules/03-beat/00-tempo-worker-cache-prefetch.js`、`scripts/test-beat-startup-protection.js`]

- 新增本地壁纸文件夹与 macOS 缓存管理：背景媒体区可在 Finder 打开 `~/Library/Application Support/Mineradio/Wallpapers`，上传或从 Windows 壁纸库导入的图片/视频同步镜像到该目录；系统「缓存与存储」可按歌词、网络、节奏分析和人声分离临时文件显示占用、执行安全清理，或在二次确认后清除本地壁纸。安全清理不移除 Cookie、登录态、设置或壁纸。修复背景裁切拖动卡顿：拖动只更新 CSS 裁切变量，静止 `280ms` 后才保存，不再逐事件重读 IndexedDB、重建 Blob/Object URL 或 `video.load()`。`npm run check` 的前置专项 `5/5` 与主套件 `294/294` 均通过（合计 `299/299`）；浏览器运行探针连续 12 次裁切最大 `0.2ms`，完整背景应用 token 未变化。Finder 与真实媒体解码仍需用户在 Electron 中人工确认。[来源: `desktop/cache-manager.js`、`desktop/main.js`、`public/js/modules/07-fx/02-accent-background-controls.js`、`scripts/test-macos-cache-wallpaper-manager.js`]

- 恢复底栏音质与汽水音源选择的真实入口：简约模式及 `≤1180px` 的 DIY 模式不再隐藏音质胶囊，既有同曲无缝换流、失败恢复旧音频和播放进度逻辑保持不变。底栏音源菜单现在把当前来源置顶并补回 QS；汽水匹配直连本机 `/api/qishui/search`，不会回落网易云；没有官方可播源的 Spotify 明确显示为不可用而不能误点。专项 `23/23`、完整 `npm run check` `294/294`、`1000×700` 实际页面边界检查通过。未用真实汽水授权曲目完成跨源播放验收。[来源: `public/css/index.css`、`public/js/modules/05-playback/07-search.js`、`scripts/test-quality-switch-stability.js`、`scripts/test-qishui-mac-integration.js`]

- Windows 壁纸库新增默认关闭的“壁纸鼠标视差”，独立于封面鼠标视角并接入正常设置、DIY 存档与导入导出。Scene 详情先显示真实静态缩略图，释放旧 MJPEG 后再延迟连接实时预览；单客户端占用或加载失败会保留静态图、有限重试并给出“重试实时预览”。Scene 导出完成后“保存 MP4 到文件夹”与“应用 MP4 到 Mineradio”在同一操作行，应用中会明确禁用。专项 `19/19`、完整 `npm run check` `294/294` 通过；真实 Windows 服务已确认静态兜底在 `409` 实时流占用时仍可用。[来源: `public/js/modules/07-fx/10-wallpaper-library-panel.js`、`public/js/modules/07-fx/02-accent-background-controls.js`、`scripts/test-windows-wallpaper-library.js`]

- 优化 Windows 壁纸库的打开与浏览性能，并增加多选本地导入：已保存的 Windows 地址现在优先直连，成功后不再重复扫描局域网；卡片选择与关闭详情只切换已有节点状态，不再重建数百张远程缩略图。工具栏新增卡片勾选、“全选当前结果”和“导入选中到 Mineradio”；图片、视频及已完成导出的 Scene MP4 按顺序写入 Mac 本地背景库，批量过程不切换当前背景，未导出的 Scene 会明确列为待导出。专项 `16/16`、完整 `npm run check` `289/289` 通过；304 条模拟记录动态检查确认详情节点保留、图片筛选全选 `152/152`，缓存直连为 `connect=1/discover=0`，直连失败才回退发现。真实 Windows 网络吞吐与下载耗时仍待在线服务人工验收。[来源: `public/js/modules/07-fx/10-wallpaper-library-panel.js`、`public/index.html`、`public/css/index.css`、`scripts/test-windows-wallpaper-library.js`]

- 修复 Windows 壁纸库把 Wallpaper Engine Scene 的 `preview.jpg` / `preview.gif` 当成普通图片下载的问题：读取 `sceneNeedsEngine` 后按项目目录将其归类为 Scene，复用已有 Windows 离屏渲染和 MP4 导出，再下载并应用到 Mac 本地背景库。视频项目若同时提供预览图与真实视频，列表只保留真实视频。没有新增或修改 Windows HTTP 接口。专项 `14/14`、完整 `npm run check` `287/287` 通过；本轮 Windows 服务只读请求超时，真实导出待人工验收。[来源: `desktop/wallpaper-library-bridge.js`、`scripts/test-windows-wallpaper-library.js`]

- 优化 Windows 壁纸库的大列表滚动：图片改为原生懒加载与异步解码，视频首屏不预读；网格以可视区为根按需挂载媒体，并在滚动中临时关闭卡片位移和重阴影以降低重绘。保留既有滚动条、网格、搜索、详情和预览逻辑。专项 `13/13`、完整 `npm run check` `286/286` 通过；304 条模拟记录首屏仅挂载 `20` 个媒体，滚动后渐进至 `40` 个。真实 Windows 服务下的远程网络和实际手感仍待人工验收。[来源: `public/js/modules/07-fx/10-wallpaper-library-panel.js`、`public/css/index.css`、`scripts/test-windows-wallpaper-library.js`]

- 修复 Windows 壁纸库详情在中等窗口宽度被网格覆盖、右侧内容显示不全的问题：内容区在详情打开时改为独立“缩略图网格 + 详情”双列，详情不再绝对覆盖网格；视口 `≤920px` 自动切为完整全宽详情，关闭后恢复网格。详情仍在自身区域内滚动，预览、下载和导出逻辑未改。新增布局回归断言；专项 `12/12`、完整 `npm run check` `285/285`、真实浏览器宽屏零重叠和窄屏完整边界检查通过。真实 Windows 服务的远程媒体传输仍待人工验收。[来源: `public/css/index.css`、`scripts/test-windows-wallpaper-library.js`]

- Windows 壁纸库新增“下载并应用到 Mineradio”本地化链路：图片、视频和已完成导出的 Scene MP4 现在通过已验证的 Windows 服务下载，写入既有 IndexedDB 背景媒体库后立即应用；重启或 Windows 断线后继续使用 Mac 本地副本，同一项目再次选择会直接复用本地媒体而不重复下载。新增 MIME、来源验证、空文件与 `256 MiB` 上限保护，失败态可重试且不会改变当前背景。Scene 仍须先由 Windows 完成导出，原“保存 MP4 到文件夹”保留为次级操作。专项 `12/12`、完整 `npm run check`、语法和 `git diff --check` 通过；真实 Windows 服务正向下载/导出待人工验收。[来源: `desktop/wallpaper-library-bridge.js`、`desktop/main.js`、`desktop/preload.js`、`public/js/modules/07-fx/10-wallpaper-library-panel.js`、`scripts/test-windows-wallpaper-library.js`]

- 修复 Windows 壁纸库在卡片媒体绝对定位、比例计算意外失效时的网格堆叠：四列列表现在显式保留 `128px` 最小行高，卡片固定占满网格单元并继续优先采用 `16:9`。详情抽屉改为与可视内容区等高的独立滚动层，预览、导出状态和操作不再被弹窗底部裁掉。新增布局回归断言；壁纸库专项 `9/9`、完整 `npm run check` `282/282`、`git diff --check` 通过。未构建 DMG，待用户在真实 Windows 服务与实际窗口尺寸下验收。[来源: `public/css/index.css`、`scripts/test-windows-wallpaper-library.js`]

- Windows 壁纸库按 Windows 端信息层级重排：保留宽幅深色弹窗、四列 `16:9` 真实缩略图网格和覆盖式详情抽屉；搜索与筛选成为主工具栏行，Mac 专属的自动读取 Windows IP、手动地址、连接和刷新改为独立次行，避免挤占搜索区域。不会伪造 Windows 本机的收藏、隐藏或项目设置按钮，因为局域网 HTTP 协议没有这些写接口。发现链路维持 UDP `45678` 广播、私网 `/24` ping 回退、UDP 异常回退与 `/api/ping` 认证；Windows 服务离线时不误报在线。专项 9/9、完整 `npm run check` 282/282、语法和 `git diff --check` 通过；本次检查时 `192.168.1.121:8123` 与 `192.168.1.107:8123` 均 TCP 超时，尚未声称真实 Windows 卡片/Scene 正向验收完成。[来源: `desktop/wallpaper-library-bridge.js`、`public/index.html`、`public/css/index.css`、`public/js/modules/07-fx/10-wallpaper-library-panel.js`、`scripts/test-windows-wallpaper-library.js`]

- 修复 P10 音域回响一级歌架投到右下远景：P10 的体素世界比例、相机前方锚点和方位旋转会把普通预设的局部布局投错位置。一级固定态现以相机局部前方 `10`、左移 `1.2`、上移 `0.4` 锚定，并把局部中心 `sideX` 收至约 `1.08`；真实 Electron 投影的中心卡为 `467×265px`、包围盒 `x=465..933,y=206..471`（`1134×638` 视口），形成图一的中部偏右竖向卡组。普通预设、原生镜头保护、右键仅一级、歌词让位和冷色玻璃卡面不变；真实右键验证只打开一级（`pinned=true`、`detail=null`）。专项 `21/21` 通过。[来源: `public/js/modules/04-shelf/00-layout-hover.js`、`public/js/modules/04-shelf/05-card-interactions.js`、`scripts/test-p10-voxel-interactions.js`]

- 修复 P10 音域回响一级歌架角度回归：保留体素远景相机的半径/高度保护，恢复图二所需的 `0.28` 卡片斜切。
- 修复 P10 一级歌架纯黑问题：增强歌词色板驱动的冷色玻璃底色，透明度限制在 `0.34..0.62`，普通预设和二级详情逻辑不变。P10 专项回归测试 `19/19` 通过。

- 修复 p10「音域回响」右键偶发没有一级 3D 歌架：恢复右键作为显式渲染交互时的主循环唤醒。此前恢复“右键只打开一级歌架”时误删这一步，空闲降帧下虽然已写入固定打开状态，但歌架管理器不会及时计算可见度和世界变换，画面看起来无反应。现只恢复 1.2 秒渲染唤醒，不改变一级/二级层级、p10 构图、歌词或歌单数据回退。新增回归断言；P10 专项 `16/16`、完整 `npm run check` `266/266`、语法和 `git diff --check` 通过；Electron 已从正确工作副本启动，待真实右键人工验收。[来源: `public/js/modules/04-shelf/05-card-interactions.js`、`scripts/test-p10-voxel-interactions.js`]

- 修复 Mac「系统 → 播放输出」的可用性与失败回退：恢复“路由”弹窗承载实际设备选择；主输出或虚拟麦克风桥接只有 `setSinkId` 成功后才显示已连接，真实失败会恢复此前主输出、桥接和镜像偏好；无播放器时仅保存为“播放时连接”。设备权限未授予时产生的空 `deviceId` 不再重复渲染为两个“系统默认”节点。移除 Mac 端“关闭窗口行为/后台托盘”设置，关闭窗口固定退出；软件内自动更新仍禁用，升级方式为下载签名 DMG 覆盖安装。专项对抗性 `8/8`、完整 `npm run check` `264/264`、隔离 Electron 路由弹窗验收和 `git diff --check` 通过；未构建 DMG。[来源: `public/js/modules/05-playback/00-api-quality-output.js`、`public/index.html`、`public/js/modules/00-state/02-preferences-ui-modes.js`、`scripts/test-system-output-close-cleanup.js`]

- 修复 p10「音域回响」右键歌架将镜头推入音柱：体素场不再把通用歌架的近景半径和负仰角映射到 p10 大世界，右键仍保留右侧歌架的方位与视线偏移；用户先滚轮缩放或调整高度后，右键也会保持当时的完整柱体构图。左侧歌单边缘停留由 `600ms` 调整为 `300ms`，左键拖动抑制、顶部/底部安全带与双屏保护保持不变。专项 `16/16`、完整 `npm run check` `256/256`、语法检查和 `git diff --check` 通过；未构建 DMG。[来源: `public/js/modules/02-visual/16-voxel-echo.js`、`public/js/modules/10-shell/02-peek-panels-upload.js`、`scripts/test-p10-voxel-interactions.js`]
- 修复视觉控制台“其他设置”混入歌词和性能控件：缩放脉动归入“歌词 → 歌词动画”，渲染分辨率归入“系统 → 性能与后台”，颜色弹窗内部控件不再被整理器误判为独立设置。左侧歌单边缘持续停留从 `1000ms` 调整为 `600ms`，仍保留左键拖动抑制和顶部/底部安全带。专项 `22/22`、完整 `npm run check` `256/256`、语法检查和 `git diff --check` 通过；未构建 DMG。[来源: `public/js/modules/07-fx/09-console-workspace.js`、`public/js/modules/10-shell/02-peek-panels-upload.js`、`scripts/test-fx-preset-motion-ownership.js`、`scripts/test-p10-voxel-interactions.js`]
- 明确项目级 AI 工作流：任何问题先检查前提、缺失信息和逻辑链，从至少两个角度分析根因并给出依据、反证条件和最小验证方式，完成分析后才能提出或实施方案；功能验收以命令行为主。同步收紧左侧歌单边缘唤醒：左键按住或拖动期间左右歌单栏均不唤醒，左边缘需连续停留 `1000ms`；p10 右键唤起歌架前清除 hover 选中态，避免卡片带着抬升偏移进入固定构图。p12/p13 歌词改为仅以初始机位补偿，滚轮缩放不再被实时距离抵消，p13 音柱同步主相机比例。专项 `20/20`、歌词/音域布局 `16/16`、完整 `npm run check` `255/255`、相关脚本语法检查和 `git diff --check` 均通过；未构建 DMG。[来源: `AGENTS.md`、`public/js/modules/10-shell/02-peek-panels-upload.js`、`public/js/modules/04-shelf/05-card-interactions.js`、`public/js/modules/07-fx/04-preset-grid-uniforms.js`、`scripts/test-p10-voxel-interactions.js`、`scripts/test-sonic-series-layout.js`]
- Spotify 账户互动同步：Spotify 歌曲现在可读取喜欢状态、收藏/取消收藏，并加入已有的自建 Spotify 歌单。OAuth 默认新增 Spotify 库和歌单写权限，同时保留既有自定义 scope；旧 token 需在账户面板重新连接 Spotify 才会获得新权限。写请求与 token 均留在本机服务端，虚拟“喜欢的歌曲”和订阅歌单不会作为加歌目标。专项 12/12、`npm run check` 217/217 通过；未做真实账号人工验收，未构建 DMG。[来源: `spotify-api.js`、`server.js`、`public/js/modules/05-playback/06-track-detail-lyrics-actions.js`、`scripts/test-spotify-account-write-sync.js`]
- 修复 p12「音域地形」与 p13「音域回响·WE」歌词在屏幕上偏小：舞台歌词按实际相机距离相对普通预设的参考距离动态补偿世界空间缩放，用户设置的歌词字号、位置、字体和颜色保持不变；p13 异步歌词到达后会重新唤醒共用歌词舞台。专项 12/12、`npm run check` 217/217 通过，仍待真实窗口观感验收。[来源: `public/js/modules/02-visual/02-lyrics-state-layout.js`、`public/js/modules/02-visual/14-stage-lyrics-rendering.js`、`scripts/test-sonic-series-layout.js`]

- 修复背景媒体区的可用性和排版：将上传、封面、裁切、清除归为一排等宽操作，新增状态提示与封面鼠标视角说明；上传图片/视频会保持固定视角。没有可用封面时，“封面”不会再进入空状态或遗留鼠标绑定。真实 Electron 已验证上传图片、封面视差和清除回退；全量 `npm run check` **203/203** 通过。[来源: `public/index.html`、`public/css/index.css`、`public/js/modules/07-fx/02-accent-background-controls.js`、`public/js/modules/07-fx/07-bindings-shelf-immersive.js`、`scripts/test-rain-glass-speed-and-album-mouse-bind.js`]

## 2.0.0

- 修复雨境玻璃水珠后半程自行减速：原滑落状态把阻力从 `4.2` 持续增至 `16.7`，即使“水珠流速”滑条不变，水珠也会在后半段被逐渐刹慢。现在阻力只与水珠尺寸相关，滑落全过程持续使用同一流速系数驱动加速度与终端速度，保留原有弯道、融合、停靠和重挂壁状态。新增“封面鼠标视角”开关（默认关闭），开启后当前歌曲的 `#album-bg` 双层封面背景复用既有画布鼠标坐标做轻微视差；不影响上传图片、视频背景、歌词或任何预设。专项 8/8、`npm run check` **200/200** 通过；当前自动化环境无法取得 Electron 可见窗口，仍待人工确认实际观感。[来源: `public/js/modules/02-visual/19-rain-glass.js`、`public/js/modules/03-beat/05-cover-loading-crop.js`、`public/js/modules/02-visual/00-pointer-cover-particles.js`、`public/css/index.css`、`scripts/test-rain-glass-speed-and-album-mouse-bind.js`]

- 修复视觉控制台错误搬走底栏入口：`shelf-toggle-btn` 与“词”按钮不再被控制台整理器 `appendChild()` 到设置页，底栏恢复原来的 3D 歌单架开关与歌词校准入口；桌面歌词恢复为“歌词”页内独立的开关、锁定、动效、高亮、大小、透明度、高度与帧率设置，不复用底栏按钮。音域回响系列卡移除重复说明，三个版本按钮增至等高 `36px`，标题/副标题保持单行省略，避免遮挡。新增回归测试，`npm run check` **198/198** 通过。[来源: `public/index.html`、`public/js/modules/07-fx/09-console-workspace.js`、`public/js/modules/07-fx/04-preset-grid-uniforms.js`、`public/css/index.css`、`scripts/test-bottom-controls-and-sonic-card.js`]
- 修复预设 10「音域回响」的歌词异步竞态：切入 p10 时如果歌词请求尚未完成，原逻辑会因 `lyricsLines` 为空提前结束，歌词随后到达也不会再唤醒舞台，导致一直看不到歌词。现在原歌词和自定义歌词应用完成后都会通知 p10 重新恢复歌词组、当前行与预热；仅对 p10 生效，不强开用户关闭的歌词，也不改变歌词角度、位置、字体、动画或其他预设。新增异步回归测试，专项 5/5、`npm run check` **221/221**；真实 Electron/CDP 注入延迟歌词后确认舞台可见且显示新歌词。[来源: `public/js/modules/02-visual/14-stage-lyrics-rendering.js`、`public/js/modules/05-playback/06-track-detail-lyrics-actions.js`、`scripts/test-sonic-series-layout.js`]
- 统一视觉预设入口卡片尺寸：普通预设卡与音域回响系列外卡固定为 `94px` 高并使用 `border-box`，避免内容差异导致网格行高跳动；音域回响的原版、Sonic-Topography、Wallpaper Engine 三个按钮压缩为同高 `30px` 的横向三选一，长标题在按钮内部省略，不改变预设索引或切换逻辑。删除仅在 `≤520px` 生效的重复横向规则，保留 `≤720px` 系列卡整行回退。新增尺寸回归断言，专项 4/4、`npm run check` **220/220** 通过；待真实 Electron 窗口验收不同尺寸下的视觉密度与三项点击切换。
- 修复预设 10「音域回响」切换后歌词舞台偶发不唤醒，并按用户截图重排视觉预设入口：emily 与音域回响系列在桌面网格中并列，雨境/云瀑等预设从下一行继续双列；窄面板自动让系列卡跨整行，三个版本继续互斥三选一。切入 p10 时只在用户未关闭歌词的情况下恢复歌词组、当前播放行和预热，不覆盖歌词位置、字体、动画、倾角或其他预设。新增 `scripts/test-sonic-series-layout.js`，真实 Electron 验收 p9→p10 歌词恢复与桌面/窄面板几何布局；`npm run check` **219/219**。
- 修复音域回响设置页的歌单错位，并整理三套音域预设入口：体素歌单宿主现在只挂到「歌单架」页，不再追加到 FX 控制台根节点，因此预设 10 的「动效」页不会再显示「歌单 / 队列」；预设 10/12/13 在「常用 → 预设与存档」合并为一张「音域回响」卡片，卡片内用互斥三选一按钮切换原版、Sonic-Topography 与 Wallpaper Engine，内部索引与存档格式保持不变。频谱面板拆为所有预设通用的「频谱面板」组，八段音域权重仍只在预设 12 显示。新增 3 项回归断言，真实 Electron 验收 14 个预设、三选一点击和动效页零歌单；`npm run check` **216/216**。
- 修复 FX 控制台「动效」tab 的预设专属设置归位生命周期：`updateFxInputs()` 与控制台首次完成分组归位后现在都会刷新 `updateMineradioMotionGroupVisibility()`，避免启动恢复预设或打开面板后残留上一个预设的设置；`setPreset()` 同时去除重复刷新。旧分页雨境/云瀑/音域回响与体素的 CSS 过滤规则改为仅作用于非 `task-first-v2` 控制台，防止体素预设把重组后的分组全部隐藏。新增 `scripts/test-fx-preset-motion-ownership.js`，并更新雨境兼容选择器断言。真实 Electron 逐一切换 14 个预设：p0–8=`base+particles`、p9=`base+rain-mood`、p10=`base+vox-echo`、p11=`base+rain-resonance`、p12=`base+sonic-terrain+sonic-audio+sonic-blocks`、p13=`base+sonic-we`，专属组未出现在其他 tab；`npm run check` **213/213**。
- 动效 tab 预设专属过滤完善（每个预设只显示有效动效）：粒子参数（fx-point/fx-speed/fx-bloom/封面清晰度等）在雨境/云瀑/音域回响/声波地形/声波工坊激活时**粒子层被隐藏（hidePoints）根本不生效**，之前作为「通用组」显示是噪音。现将「粒子与光影」组改为**仅粒子类预设（0-8）显示**，`fx-coverres` 从「基础画面」移入粒子组；「基础画面」精简为所有预设真正通用的 4 项（律动强度/景深/电影镜头/电影开关）。最终映射（无头 Chrome 全量实测 14 预设）：p0-8=[base,particles]、p9 雨境=[base,rain-mood]、p10 音域回响=[base,vox-echo]、p11 云瀑=[base,rain-resonance]、p12 声波地形=[base,sonic-terrain,sonic-audio,sonic-blocks]、p13 声波工坊=[base,sonic-we]。`npm run check` **228/228**。
- 动效 tab 预设专属过滤（修复「不同预设动效参杂太乱」）：现在每个预设的动效 tab **只显示自己的动效组 + 通用组**，不再混杂其他预设——预设 9 雨境（雨境组）、预设 10 音域回响（音域回响组）、预设 11 云瀑（云瀑组）、预设 12 声波地形（音域地形/频谱响应/音域方块组）、预设 13 声波工坊（音域回响·WE 组），其余预设只显示基础画面/粒子与光影通用组。实现：新增 `updateMineradioMotionGroupVisibility()`（05-fx-panel-performance），按 `fx.preset` 给动效 tab 的 `.fx-console-group` 切换 `fx-sonic-hidden`，setPreset 与 updateFxInputs 双路调用。无头 Chrome 实测 6 组预设映射全部正确。`npm run check` **228/228**。
- 修复 FX 控制台动效 tab 全黑（续）：上一轮加了雨境/云瀑/音域回响组后用户反馈「动效里面都是黑的什么都没有」——根因是旧分页时代的「预设专属过滤」规则 `body.rain-on [data-fx-page="motion"] > *:not(#rain-fx-section){display:none}`（及 rain-resonance-on/vox-on 同款）仍生效：FX 控制台 organize 后 motion page 的直接子元素是 `.fx-console-group` 折叠块，不是 `#rain-fx-section`，导致**预设激活时动效 tab 所有分组全被隐藏**。修复：删除这三条 `> *` 过滤规则；`body:not(.rain-on) #rain-fx-section` 等区块显隐改为**仅旧分页生效**（`:not([data-console-layout="task-first-v2"])` 前缀），FX 控制台接管后动效 tab 展示全部预设的设置（用户可随时查看，不受当前预设限制）。无头 Chrome 实测：动效 tab 9 个 group（基础画面/粒子/音域地形/频谱/方块/工坊/雨境/云瀑/音域回响）全部可见，雨量/律动敏感控件 display 正常。更新 `test-rain-mood-visual.js` 断言。`npm run check` **228/228**。
- 修复 FX 控制台动效 tab 缺 Mac 预设控件：雨境（预设 9）、云瀑共振（预设 11）、音域回响（预设 10 体素）的全部控件在迁移 FX 控制台时未纳入 `FX_CONSOLE_LAYOUT`，organize 后被归入兜底「其他设置」导致动效 tab 空白。现动效 tab 新增 3 组：雨境（湿玻璃封面/玻璃水珠/雨量/打雷模式/打雷阈值/随机频率/水珠数量流速尺寸/风向偏移/雨幕浓度）、云瀑共振（雨幕强度/旋律起伏/拍点爆发）、音域回响（自转/封面取色/流星/封面图/悬浮方块/闪烁点/柱体数量/律动敏感/自转速度/体素颜色/冲击波颜色/背景颜色）。另按建议新增 2 个雨境动效设置：**风向偏移**（fx.rainWindOffset -1~1，雨丝水平飘移叠加在音乐驱动风向上）与**雨幕浓度**（fx.rainDensity 0.3~1.5，缩放雨丝整体强度）——fx-defaults/持久化（saveRainToggles）/渲染层/HTML 控件/FX layout/updateFxInputs 全部接线，不碰雨境玻璃水珠（硬约束）。`npm run check` **228/228**。
- 壁纸库接入（续）：**Scene 场景壁纸「Win 端录制 mp4 → Mac 播放」方案**——共享脚本 `tools/wallpaper-share-server.js` 新增场景导出能力：① `/export.html` 录制引导页（Win 端浏览器打开，用 `getDisplayMedia` 捕获 WE 场景窗口 → `MediaRecorder` 录 15/30/60 秒 mp4 → POST 回服务保存到壁纸库 `_exported/` 目录）；② `/api/exported-videos` 列出已导出视频、`/api/exported-file` 下载。Mac 端 `wallpaper-library-bridge.js` 的 HTTP 源扫描自动合并 `_exported` 视频（「Scene 导出 · xxx.mp4」条目），Mac 壁纸库面板即可浏览播放。实测：导出页 200、导出视频列表返回、mp4 下载 200 video/mp4。测试断言更新，`npm run check` **228/228**。待人工验收：Win 端真实 WE 场景录制后 Mac 端播放。
- 新增壁纸库接入（macOS，从另一台 Windows 电脑读取 Wallpaper Engine 壁纸库）：Mac 本地没有 WE 软件/库，本功能让 Mac 版直接读取 Win 电脑上的 WE 壁纸库——两条通道：① 目录扫描（SMB 挂载 `/Volumes/...` 或拷贝的 WE 库目录，主进程 `desktop/wallpaper-engine-library.js` 扫描器为纯 Node 跨平台实现，仅注册表发现为 win32 专属且 Mac 安全返回空）；② HTTP 壁纸源（Win 端运行 `tools/wallpaper-share-server.js` 可选共享脚本，Mac 输入 `http://WinIP:8123` 拉取壁纸列表与文件流）。首页快捷区新增「壁纸库」入口，弹窗支持扫描目录/连接源/列表浏览/图片视频预览。**图片/视频壁纸在 Mac 直接播放；Scene 场景壁纸（PKGV）需 WE 软件实时引擎，Mac 无法播放，标注「需 WE 软件」**。主进程 IPC：`mineradio-wallpaper-library-scan-dir`/`scan-http`/`list`/`media`，preload 暴露 4 个 API。新增 `scripts/test-wallpaper-library.js`（2 项）纳入 `npm run check`；专项 2/2、全量 **228/228** 通过；共享脚本实测（假壁纸库：列表返回、图片流 200 image/jpeg、scene 标注）。待人工验收：真实 Win 电脑 SMB 挂载/HTTP 源下浏览与播放图片/视频壁纸。
- 修复首页响应式排版重叠（PR #61 后续修复）：根因一是 `≤1120px` 洞察 dock 改成单列后仍保留旧的显式第 2 列定位，生成隐式列导致「今日聆听/为你挑选/平台推荐」被压到窄列；根因二是 `home-grid` 的 2 列三行高度挤占洞察 rail；根因三是最近播放 hero 的固定内容块被 `flex-shrink` 压扁，封面和多行热评溢出到相邻区块。现在中等宽度使用 3 列快捷卡 + 两列洞察（推荐条跨整行、两个入口并列），极窄宽度显式归回单列并由首页滚动；hero 顶部信息和下一首/热评保持自身最小高度，只让歌曲列表滚动，≤760px 窄宽隐藏简报/下一首。新增 `scripts/test-home-layout-responsive.js`（3 项）纳入 `npm run check`；真实 Electron CSS viewport `1440×900`、`998×1098`、`998×700`、`760×850` 几何检查均为 hero/dock 零交叠，截图人工复核通过；全量 **226/226** 通过。仅改首页布局 CSS、测试和检查脚本，不改播放/登录/视觉预设。
- 修复首页洞察 dock 卡片重叠：用户反馈首页排版「很多都显示不了」——洞察 dock（今日聆听/接下来播放/为你挑选/榜单/平台推荐 5 个卡片 + 为你准备 tile 行）是 2 列 grid 但子元素无显式定位，CSS Grid 自动布局在窗口较小时把卡片挤叠。修复：dock 子元素显式分配行列（listen(1,1)/next(2,1)/discovery(1,2)/ranking(2,2)/radio 整行(1/-1,3)）+ `align-items:start`，`home-grid`/`home-rail` 补 `grid-column:2` 显式定位。无头 Chrome 实测 600/700/800px 窗口 dock 5 卡片零重叠。
- 修复首页小窗口布局重叠：窗口高度不足（未全屏）时，「最近播放」hero 内的每日热评（Daily Review）与歌曲列表重叠——根因是 `.home-recent-inner`（flex column）里固定内容不收缩，列表 `flex:1` 收缩到 0 后热评溢出被 `overflow:hidden` 裁剪。修复：固定区块（kicker/title/stats/热评/接下来播放/快捷行）允许收缩 + 列表保底 `min-height:48px`，并在小窗口（≤760px 高）隐藏次要元素（stats/每日简报/接下来播放/时间），≤640px 进一步精简。无头 Chrome 实测 700px 窗口下 `review_bottom < list_top` 不重叠。
- 升级 listen-stats 本地每日聚合（Windows v2.1.0 v2 rollup）：新增 `HOME_LISTEN_ROLLUP_V2_KEY` 每日收听聚合（totalListenMs/sessions/daily 按天统计，含完成数），`finalizeListenSession` 写入；**纯本地**，不迁移上游的 `/api/listen/report` 服务端上报（平台收听同步为上游 `experimental-unverified` 能力，Mac 不迁移避免数据外发）。
- 修复三个 review 发现的 bug：① `setFxPanelTab` 旧分页 fallback 白屏——现按面板实际 `data-console-layout` 选择 key 集合（FX 布局用 home/interface/...，旧分页用 presets/appearance/...），并加 `newToLegacy` 反向映射，旧分页不再映射到不存在的页面；同步修复 `16-voxel-echo.js` 的 `fxPanelTab === 'playlist'` 检查兼容 'shelf'。② 音源切换竞态——`switchCurrentSongSource` 在等待匹配结果期间用户切歌会覆盖新选歌曲索引，现 await 后用歌曲引用比对中止切换，catch 分支同样保护。③ 工坊预设降级循环——超时降级用 `noSave:true` 导致持久化仍停在预设 13、每次启动白等 9 秒再被降级，现改为正常持久化 + `state.degraded` 防重复 + removeLayer 重置允许重试。新增测试断言，`npm run check` **223/223** 通过。
- 修复 FX 控制台搜索栏无响应：根因是 `initFxConsoleSearchAndHistory`（绑定搜索输入/撤销/历史事件）被误加到 `resetFx`（恢复默认时才走），**启动入口 `bindFxPanel` 里没有调用**——导致启动后搜索框无事件绑定、输入无搜索结果。现按上游在 `bindFxPanel` 尾部补上调用（organize 之后），并保留 `resetFx` 里的调用（幂等保护 `_fxConsoleSearchHistoryBound` 保证只绑定一次）。`npm run check` **223/223** 通过。待人工验收：打开视觉控制台，搜索框输入「粒子」应出现「粒子尺寸」等结果。
- 补全播放标题音源切换（Windows v2.1.0 对齐）：播放器标题旁新增当前音源 chip（NE/QQ/KG/SP 标签，随歌曲来源显示），点击弹出「切换音源」面板——列出网易云/QQ/酷狗/Spotify 四个平台，显示「当前音源 / 自动换源 / 可切换 / 不可用」状态，点击即搜索同名同歌手版本并原地切换（保留播放进度）。Mac 的 `07-search.js` 切换逻辑与 CSS 此前已存在（死代码），缺的是 `15-ripples-cover-depth.js` 的 `updateControlTrackInfo` 挂载点——现按上游补齐 `control-title-badges` 容器 + 音源 chip + VIP 标签渲染（保留 Mac 的 `syncTouchBarTrack`）。新增测试断言，`npm run check` **223/223** 通过。待人工验收：播放任意歌曲看标题旁音源标签，点开切换面板换到另一平台。
- 修复 FX 控制台「常用/界面/歌单」等 tab 空白：两个根因——① `setFxPanelTab` 只认旧 tab key（presets/appearance/...）而 FX 控制台用新 key（home/interface/lyrics/motion/shelf/system），匹配不上导致所有 page 隐藏；现换成上游版（新 key + 滚动记忆）并加旧 key→新 key 映射。② `FX_CONSOLE_LAYOUT` 引用的 24 个控件 id 在 Mac index.html 不存在（上游 layout 是写给 Windows 的，Mac 控件 id 不同或没有）；现全部对齐 Mac 实际结构——背景媒体改用 `background-image-input`/`bg-album-toggle-btn`/`fx-windowbgopacity`，性能改用 `performance-mode-seg`/`max-fps-seg`，歌单架改用 `shelf-toggle-btn`，桌面歌词改用 Mac 底栏入口 `lyrics-toggle-btn`，移除 Mac 没有的项（译文字号/透明度、歌词清晰度、浮动/暂停保留、背景星河、Wallpaper Engine）。修复后 layout 全部 168 个控件引用 + 3 个选择器引用均可在 index.html 定位（测试断言零缺失），`npm run check` **223/223** 通过。
- 修复预设 13「音域回响·Wallpaper Engine」在 macOS 白屏：根因是 macOS 的 WebGL canvas 透明合成与 Windows 不同——即使 `alpha:true`，合成器也可能把 canvas 当不透明层盖住底下的 `#sonic-workshop-layer` iframe。现在工坊激活时隐藏 `#canvas-container` 让 iframe 完全透出；另加 React 未就绪 9 秒超时自动提示并回退上一预设（WebGL 受限环境下不再白屏挂死）。
- 迁移 Windows v2.1.0「FX 控制台 + 界面配色 + 缓存设置（Mac 只读版）」：fx 面板升级为任务优先布局——「常用/界面/歌词/动效/歌单架/系统」6 个分类 tab + 顶部搜索框（支持别名如「粒子/缓存/歌词」搜索定位）+ 撤销/最近操作历史（会话内最多 40 条、滑条拖动合并、可回退到任一项之前）；「界面配色」新增界面高亮/视觉主色/Home 填充/主页图标/视觉图标 5 个取色行（Mac 端控件函数此前已存在，随 UI 注入激活）；「本地缓存」面板只读显示歌词磁盘缓存占用（条数/体积/路径）+ 手动清理，不迁移 Chromium 缓存目录搬迁（macOS 动 sessionData 会破坏登录态，AGENTS.md 硬约束）。登录彩蛋按用户决定跳过（上游解锁前清空全部登录凭据，与 Mac 登录态约束冲突）。新增 `scripts/test-sonic-series-migration.js` 第 7 项（FX/缓存/配色断言）纳入 `npm run check`；专项 7/7、全量 **223/223** 通过。
- 迁移 Windows v2.1.0「声波监视器 + 音域地形 + 音域回响·WE」三件套：新增声波监视器模块（`03-beat/06-sonic-audio-monitor.js`，512 频段实时频谱、kick 自动跟踪、触发阈值/力度检测，主循环播放中喂频域数据、暂停时衰减；fx 面板新增「音域频谱」可折叠频谱面板），新增预设 12「音域回响·Sonic-Topography」（声波地形：地形起伏/密度/范围/自转、浮空方块、流星拖尾、封面取色或自定义配色）与预设 13「音域回响·Wallpaper Engine」（声波工坊：iframe 桥接 vendor 独立渲染，音频/媒体/主题属性持续推送，10 套主题 + 封面取色分区配色）。索引避开 Mac 既有 7=黑洞/8=极光/10=体素音域回响/11=云瀑共振，`SONIC_PRESET_INDEX=12`、`SONIC_WORKSHOP_PRESET_INDEX=13`。主循环按 sonic 预设隐藏粒子/封面层并降背景暗度，星河 alpha 对齐上游（地形 0、工坊 0.28）。fx 默认值/持久化/面板控件（地面起伏等 20 滑条 + 频谱面板 + 颜色行 + 主题 seg）/显隐联动（非对应预设自动隐藏 sonic 控件）全部接入。vendor 只搬运行时必需 4 文件（bridge+assets JS/CSS+project.json），跳过 preview.gif 省 914KB。新增 `scripts/test-sonic-series-migration.js` 6 项并纳入 `npm run check`；专项 6/6、全量 **222/222** 通过；Electron 本地服务冒烟全部资源 200。需人工验收：预设 12/13 真实歌曲下的地形律动、频谱面板、工坊 iframe 渲染与主题切换。
- 首页继续对齐 Windows v2.1.0（本批，洞察 dock + 平台推荐中心）：右侧「为你准备」上方新增洞察 dock——今日聆听（时长/曲数/常听歌手 + 连续聆听天数）、接下来播放（优先队列下一首，空队列回退每日推荐/本地音乐）、为你挑选（每日推荐/歌单/队列/本地混合去重选 3 首）、音乐发现与平台推荐两个入口；「平台推荐」弹窗提供网易云/汽水/QQ/酷狗/Spotify 五个标签页，只读取平台可验证的推荐数据（网易云每日推荐与推荐歌单、酷狗猜你喜欢、Spotify 常听/喜欢、汽水/QQ 有接口才展示），不用关键词搜索补位。服务端新增 `/api/kugou/recommendations` 与 `/api/spotify/recommendations`，`spotify-api.js` 移植 `handleSpotifyRecommendations`（未登录明确返回 `mode:'unavailable'`）。保留 Mac 首页全部既有入口（最近播放/天气/歌单/「为你准备」tile 行），未迁移 Windows 的 MP4 视频 Hero 与 quick-grid 布局（Mac 功耗与既有双列首页不破坏）。新增 `scripts/test-home-dashboard-dock.js` 并纳入 `npm run check`；专项 5/5、全量 **216/216** 通过；Electron 本地服务冒烟：首页 200、新模块 200、两个推荐接口未登录返回预期。
- 补全 Windows v2.1.0 的窗口恢复与歌词磁盘缓存：主进程新增缺失的 `desktop-window-restore` handler（preload 早已暴露调用，此前最小化/隐藏窗口无法恢复）；歌词请求结果按曲目写入 `userData/cache/lyrics`（单条 ≤1MB、总量 ≤96MB、自动淘汰最旧条目），再次播放同曲直接读缓存、不再重复请求；渲染层 `fetchLyric` 改为先读缓存后走网络。不迁移 Windows 的 Chromium 缓存目录搬迁（避免影响 macOS 登录态与会话）。专项 6/6、`npm run check` **211/211** 通过。
- 本地曲库面板（Windows v2.1.0 对齐）：首页快捷区与导入面板新增“本地曲库”入口，弹窗支持浏览、搜索（标题/歌手/专辑）、逐首播放、全部播放与从曲库移除；移除只删除索引与封面缓存，不删除源文件，若正在播放被移除曲目会自动切到下一首。主进程新增 `mineradio-local-library-remove` IPC，preload 暴露 `removeLocalMusicLibraryTracks`。专项 5/5、`npm run check` **210/210** 通过。
- 对齐 Windows v2.1.0 的持久化本地曲库：新增主进程 `desktop/local-music-library.js`（`music-metadata` 解析标题/歌手/专辑/时长/内嵌封面与 LRC 侧车/内嵌歌词，`mineradio-local://` 特权协议按字节范围流式播放，索引加密键值持久化在 userData）；拖拽/文件选择/整文件夹导入自动走持久化索引并立即进队播放，导入失败时回退原对象 URL 路径；启动时自动恢复索引中的本地曲目与断点（含歌词进度），本地歌播放时按需读取内嵌/侧车歌词走既有歌词管线。新增 `scripts/test-v210-migration-lite.js` 并纳入 `npm run check`。
- 首页继续对齐 Windows v2.1.0：新增“每日热评”卡片（每日一条、可换一条、支持 localStorage 自定义热评列表）与生成封面回退（无封面卡片自动生成品牌渐变 SVG 封面），保留 Mac 最近播放/天气/歌单/视觉入口；不迁移 Windows MP4 视频 Hero（Mac 功耗考虑）。
- QQ/酷狗登录状态字段对齐 v2.1.0：新增 `qqMembershipNeedsSync` 区分“播放授权未完成”与“权益待同步”，酷狗登录归一化同时接受 `playbackReady` / `playbackKeyReady`。
- 完整验证：`npm run check` **209/209** 通过；Electron 以独立 userData 启动、首页新元素与模块由本地服务正常下发、无渲染错误。
- 将不可用的汽水服务端扫码登录替换为 PR #56 的 macOS 官方客户端会话桥：主进程只读 `~/Library/Containers/com.soda.music/.../SodaMusic/Cookies` 中已登录会话，直接交给本地服务校验并通过 macOS `safeStorage` 加密保存；Cookie 不会暴露给渲染层。已删除二维码创建/轮询路由和页面逻辑，汽水入口不再跳转网易云。新增专项回归，`npm run check` 205/205 通过；需先在本机汽水音乐客户端登录后人工验收。
- 首页保留 Mac 的最近播放、天气电台、歌单、视觉入口和跨音源推荐，同时补入 Windows 首页的“每日内容”和“接下来播放”：前者复用每日推荐，后者优先显示当前播放队列，不新增请求、播放器或 Windows 依赖。新增首页回归，`npm run check` 205/205 通过。
- 从 Windows Cuefield 同步 macOS 安全版“智能混音 Lite”：播放器交叉淡入区新增默认关闭、可持久化的开关。只有当前曲和下一曲都命中本地节拍缓存，且 BPM 与能量接近时，才把既有交叉淡入缩至用户设定时长的 85%；没有缓存、播客、本地歌曲、随机播放和内存紧张时全部保留原播放路径。没有新增音频链、下载或 Windows 依赖。新增专项测试，`npm run check` 206/206 通过。
- 补全 macOS 内部实验的汽水音乐 PC 扫码登录：本地服务创建/轮询汽水二维码，短时会话只留在服务端；扫码成功后的 Cookie 直接使用 macOS `safeStorage` 加密保存，渲染层只获得二维码和脱敏登录状态。登录面板不再把汽水“登录”退化为匹配搜索或手动导入；汽水登录成功只同步汽水账号、歌单与播放能力，不会跳转网易云。新增专项回归，`npm run check` 201/201 通过；二维码创建与未扫码轮询已本机冒烟验证，真实账号扫码与受保护歌曲仍需用户手测。
- 彻底修复 macOS 内部实验的汽水音乐误跳网易云：顶部账户按钮在当前汽水搜索源时保持汽水；汽水“登录”入口只进入汽水公共搜索或本地 Token/Cookie 授权；汽水搜索请求明确指向 `/api/qishui/search`，不再落到网易云默认接口。专项测试 6/6、`npm run check` 200/200 通过；真实账号仍需用户手测。
- 从 Windows 2.0.3 迁移“跨音源搜索历史”：网易、QQ、酷狗、汽水、Spotify 和综合搜索标签均展示并复用同一份本地历史，播客仍保持热门内容页。新增回归测试并纳入 `npm run check`。
- 雨境打雷改为“关闭打雷 / 跟随音乐 / 随机打雷”三选一，彻底消除随机雷与节奏雷叠加的歧义；新增独立“随机频率（秒）”滑条（4-40 秒，默认 15 秒，附带随机扰动），而“打雷阈值”只在跟随音乐模式生效。旧版随机开关存档自动迁移。专项 8/8、`npm run check` 198/198 通过。
- 雨境动态面板新增默认关闭的“随机打雷”开关：开启后不依赖音乐播放或节拍，首次随机等待 4-10 秒、后续每 6-20 秒触发一次。雷击随机呈现单闪或 2-3 次短促连续闪，并以复用的 Three.js 分叉折线、冷色全场提亮、雨丝与湿玻璃封面反光营造云层照明；关闭会立即清空未发生的连闪。专项 7/7、`npm run check` 197/197 通过。
- 修复汽水入口误跳网易云：preload 现在向渲染进程显式传递 macOS 汽水实验开关，账户、登录和搜索入口不再把用户选中的汽水静默改写为网易或全音源；不可用时保持当前选择并明确提示。新增回归测试，`npm run check` 195/195 通过。
- 恢复 macOS 内部实验用的汽水音乐播放桥：QS 搜索/授权入口重新接入，Cookie 和 access-token 均经 macOS `safeStorage` 加密落盘；带 `#auth` 的本地音频代理只在服务端解密并以受限内存缓存返回，渲染层不会读取密钥。未登录、非法 Cookie、无可播地址均返回明确状态并保留现有换源回退；新增专项测试并纳入 `npm run check`。真实账号、付费曲目及受保护音频播放仍需用户手测。
- 云瀑共振底部改为连续暗湖面：移除会形成白色点阵的可见水花粒子和线段涟漪，雨滴只写入高度场并通过湖面法线表现入水细波、反射与高光。云瀑默认以 `1.42` 倍局部构图展示，且平滑跟随“歌词大小”缩放；专项 14/14、全量检查 190/190 通过。
- 云瀑共振继续向 Rainform 官网视觉收敛：移除独立顶部波形，改由真实 FFT 频段驱动分层雨链自身形成峰谷；底部改用双 RenderTarget 高度场接收雨点击入，生成衰减扩散的暗色水面波纹、法线高光和列状倒影。开场珍珠与瀑布雨珠分别缩至原尺寸的 `0.62`、`0.56`，音乐能量升高时才显著变大；专项 13/13、全量检查 189/189 通过。
- 优化预设 11「云瀑共振」的 Rainform 派生雨景：底部改为真实水平水面而非竖直光板，25 点音乐曲线同步驱动水面位移、反射和雾带；新增 256 段顶部雨幕包络，使雨峰随旋律沿横向移动。保留既有主场景/主循环，不创建第二个 Canvas 或动画循环；专项测试 9/9、全量检查 185/185 通过。
- 重做预设 11「云瀑共振」的 Rainform 视觉层：恢复官网比例的 2000 条基础雨链、800 条环境雨链、1400 条暴雨雨链和 1900 条实例化细丝；加入 256 点雨量 LUT、数据驱动雨幕高度、零雨抑制、底部水线和雾带。预设 9 雨境玻璃水珠逻辑未改动。
- 云瀑共振珍珠材质改为多频 procedural liquid metal：珠面 band、镜面反射、球面法线、Fresnel 和高光参数统一进入 shader；不创建第二个 Canvas 或动画循环。专项测试 7/7，Three r128 runtime smoke 和 `npm run check` 183/183 通过。
- 新增独立预设「云瀑共振」（索引 11）：在 Mineradio 主 Three.js 场景和主循环中接入经授权的 Rainform 派生分层雨景，保留雨链、珍珠雨滴、暴雨瀑布、撞击水花和涟漪结构；低频驱动雨势，中频驱动横向旋律起伏，高频增加细雨亮点，拍点触发短促爆发。动态面板提供雨幕强度、旋律起伏、拍点爆发三个独立持久化控件。保留 Rainform 的 Required Notice 和 PolyForm Noncommercial 许可归属。
- 云瀑共振新增 25 点音乐雨量曲线，将频谱沿横向雨景分布，避免单一雨柱与音乐脱节；专项测试 5/5，`npm run check` 181/181 通过。
- 项目协作规则要求每次完成改动的交付回复附上针对本次变更、可直接复制运行的命令行测试代码与预期结果。
- 修复高流速水珠只短滑一段便重新黏住的问题：单次连续滑落距离现在随流速和水珠尺寸增长；滑落后重新附着的黏附门槛会随速度降低，`16` 下可持续完成多段滑落。
- 雨境“水珠流速”范围扩大到 `0.2–16.0`，新默认值设为 `5.0`；UI、输入、存档恢复与物理速度上限同步更新，`16` 相比 `8` 仍会继续加速。
- 修复雨境“水珠流速”滑条只改变数值、已附着水珠却未明显提早滑落的问题：流速现在同时缩短附着等待时间，并提高破裂、停靠过渡速率；现有水珠调高流速后会更快开始滑落。
- 雨境“水珠流速”上限继续扩到 `8.0`，运行时读取、持久化恢复与物理终端速度同步放宽；打雷阈值默认值调整为 `0.70`，已保存的用户自定义值不受影响。
- 雨境“水珠流速”上限从 `2.2` 扩大到 `4.0`；持久化钳位、滑动速度系数和大水珠终端速度同步放宽，最大值不再被旧物理限制吞掉。
- 雨境玻璃水珠取消雨量对水珠尺寸和额外撞击频率的隐式控制；“水珠尺寸”和“水珠数量”保持各自独立，新增水珠统一由雨点击中后的微小冲击点铺展形成。
- 修复雨境玻璃水珠内部出现规则像素点阵：将合成着色器的高频边缘噪声收敛为低频平滑微表面，降低法线扰动，并移除水滴外逐像素动态颗粒；背景与水珠外部继续保持锐利。新增回归断言，`npm run check` 176/176 通过。
- 雨境玻璃水珠提高为原生分辨率 RG 场（最大 2048×1280、`highp` 片元精度），扩大雨量至 `0.05–4`、水珠数量至 `0.15–2.5`；雨量会独立放大水珠尺度，新增雨丝撞击后从半透明小珠铺展为附着水珠的凝结态，持续替换旧微珠而不突破用户数量上限。`npm run check` 175/175 通过。
- 雨境预设（索引 9）接入独立雨窗的照片级玻璃水珠后处理：复用主 renderer/scene/camera，不创建第二个 Canvas 或动画循环；支持 Metaball 融合、沿玻璃滑落、折射、菲涅尔边缘、接触阴影与局部高光。
- 雨境动态面板新增玻璃水珠开关、水珠数量、流速和尺寸设置；尺寸调节不改变数量，参数独立持久化，关闭或切出雨境会释放 GPU render target、材质和几何资源，后处理失败自动回退原始雨丝渲染。
- 新增 `scripts/test-rain-glass-postprocess.js` 与迁移设计文档；`npm run check` 全量 174 项通过。
- 修复玻璃水珠后处理把整幅雨境背景一起模糊的问题；水滴外改用锐利场景采样，模糊仅保留在水滴内部折射层。
- 修复唱歌模式开启后去人声链/麦克风接线偶发不生效：开关时强制重建音频图，并在健康检查中识别缺失的去人声链；唱歌按钮 z-index 抬高，避免被左侧音量 hover 桥接层挡住。
- 修复壁纸/桌面模式误进深睡眠与失焦 15fps 导致的分辨率塌缩和掉帧；暂停后等舞台歌词完全褪去，再等 3 秒才进入空闲 2fps 降帧。
- 正式版身份统一为 `mineradio` / `com.mineradio.desktop`，关闭 `internalBeta` 与匿名遥测，Intel x64 和 Apple Silicon arm64 使用独立产物名。
- 融合 `Mineradio_Beat` 的稳定性修复：QQ 播放密钥自动续期、失效 CDN 地址探测、受限歌曲跳过无效音质降级、自动换源通知与整队跳转上限、封面/音频代理断开释放、内存感知等功率交叉淡入和音频欠载防护。
- 双手推拉改用两只手拇指与食指捏合点的中点计算距离和连线，保留 PR #53 的 30FPS Worker 低负载管线；滤波响应适度提高，短暂丢手保护不变。
- 音域回响在默认黑底使用不透明早期深度剔除；自定义图片、视频或颜色背景时自动恢复透明并弱化封底，不再遮成黑块。
- 修复 QQ 音乐“我喜欢”接口把歌曲 ID/MID 返回为对象键时被错误解析成 `[object Object]`，导致卡片有数量但打开为空；实号验证 22/22 首均可导入。
- “显卡模式”和“性能档位”合并为一个“性能模式”四档控件，自动、省电、均衡、高性能会同步调整播放器负载与显卡功耗偏好，避免两个设置互相冲突。
- 修复 macOS 壁纸模式窗口被系统限制在 `workArea`，导致菜单栏后方露出原系统壁纸；现在允许主窗口覆盖显示器完整边界，同时保持菜单栏、Dock 和桌面图标正常使用。
- 壁纸模式菜单栏状态项移除重复的 `MR` 文字，只保留 MR 图标，显著缩短占位，降低菜单栏拥挤时被 macOS 挤出可见区域的概率。
- “水膜共振”暂不进入本次发布，入口、渲染文件和联动代码已全部撤下，留待发布后继续打磨。
- 本地 Cookie、Token、Provider 状态文件加入 Git 忽略规则，避免账号文件被误提交。
- 公开包不再包含汽水音乐模块与音频解密器；禁用本地 Cookie 数据库读取、Cookie/Token 粘贴、模拟官方客户端扫码和汽水直接播放，保留在私有历史分支中的内部实验不进入 DMG。
- 公开版关闭所有登录 Cookie 手动导入与导出；网易、QQ、酷狗的运行会话改用 macOS `safeStorage` 加密落盘，Spotify OAuth token 同样加密保存。
- 修复公开版把网易云、QQ 音乐和酷狗的官方登录结果误送到已禁用的手动 Cookie 导入接口，导致扫码成功后仍无法登录的问题；官方窗口会话现在由 Electron 主进程直接验证并加密保存，原始 Cookie 不再返回渲染进程。
- 登录界面在公开版只显示官方扫码、官方窗口与 Spotify OAuth，不再显示不可用的 Cookie 模式或手动导入按钮。
- 旧版本遗留的明文登录态会在 `safeStorage` 可用时自动加密迁移；无法安全加密时拒绝继续使用或落盘，不以明文凭据换取表面上的“已登录”。
- 旧歌单或播放队列里残留的汽水曲目会明确标记为已移除音源，不再错误回落到网易接口；登录页和搜索音源栏均不显示汽水入口。
- 恢复底部控制条的即时功能说明：鼠标移到音质、收藏、播放、歌单架、歌词、唱歌、沉浸和全屏等 15 个按钮时，会显示对应按钮用途，不再只依赖系统延迟较长的原生提示。
- 3D 歌单架触控板滚动阈值由偏钝的 `190` 调整到中间档 `140`；仍保留累计降敏，不退回最初“一次滚轮事件翻一格”的过敏状态，上下滑动方向保持不变。
- 账号界面不再显示“普通 / VIP / SVIP / Premium / Free”等等级徽标，避免平台字段延迟或缺失造成错误身份提示；后台权限信息仍保留给音质和受限歌曲播放判断使用。
- 修复连续切换音质后卡在 `0:00`、重复弹出多张音质通知和巨型歌词残影回归：音质切换改为同曲原地换流，新流确认可用前继续保留旧流，快速选择只应用最后一次，启动失败自动恢复旧流与原播放位置，不再重建歌词舞台或重置听歌会话。
- 修复快速切歌时浏览器 `currentSrc` 仍短暂指向上一首、导致新播放请求被误判过期并清空的竞态；播放身份现在优先使用刚赋值的 `src`，真实 QQ 登录状态下交替快速切歌 12/12 次成功。
- 播放启动成功不再强制跳到固定视觉预设；只退出首页启动预览并保留用户已经选好的画面，成功与失败路径不会再显示两套不同样式。
- 底栏音质胶囊和红心按钮增加固定占位与间距；桌面全屏下音质控件保留 `64px` 宽度，不再挤到红心按钮。
- 负载监视器移除“手势 / 推理 xx ms @ xx/s”开发诊断行，发布版只显示帧率、分辨率、CPU、GPU 和内存。
- 本地 HTTP 服务默认只监听 `127.0.0.1`，拒绝非本机同源页面调用账号/播放 API，移除宽松的 `Access-Control-Allow-Origin: *`。
- 增加摄像头与麦克风用途说明、`PRIVACY.md` 和第三方组件说明；手势画面、麦克风音频、AI 分轨结果与崩溃诊断均不上传。
- 公开发布前仍需 Developer ID 签名与 Apple 公证；当前本机没有有效签名证书时只能生成测试用未公证包。

## 待发布功能（基于 v1.1.3 基线的优化）

### 手势模式低延迟 Worker 管线（Codex）

- HandLandmarker 改为 GPU Worker 首选，`ImageBitmap` 直接转移，避免 Renderer 主线程同步推理和 canvas GPU→CPU 回读。
- 保留双手识别；摄像头采集降为 30FPS，推理输入固定为 256×192，并用单帧背压防止结果排队增加延迟。
- Swift/Vision ANE 与主线程 MediaPipe 保留为降级路径，不删除现有平台能力。
- 实机持续压测：端到端平均 19.4ms、26.5 次/秒；旧 Vision 路径约 80–170ms、约 6 次/秒。
- 摄像头没有首帧时 6 秒自动退出并释放流与 Worker，不再永久停在“正在加载”。

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

- 更新克劳德：创建 .claude/agents/claude-code-guide.md，包含 Claude Code 完整指南、工具调用、slash commands、快捷键、Agent SDK、API 集成等内容。
- 保持 Mineradio 协作规则：不直接修改 main，使用 codex/mineradio-source 推送。

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

## 2026-08-10

- 修复 P10 音域回响右键一级歌架：按参考图恢复右侧中部的纵向卡架、完整卡距与轻微斜切，并隔离普通封面旋转，避免卡架扭到右上角。
- 修复 P10 一级卡面过黑：改为歌词色板驱动的冷色玻璃，并限制背景 alpha；切换预设时强制重绘卡面。
- 新增 P10 构图和玻璃卡面回归测试；`npm run check` 268/268 通过。

## v1.1.0（正式版参考基线）

- 纯净正式版，体积 126MB，main.js 1958 行，server.js 4795 行。
- 有自动更新（provider=github，指向 XxHuberrr/Mineradio）。
- DMG 有完整视觉包装（背景图、卷图标、布局）。
- 无遥测、无平台死代码。
- 本次工作流的优化方向即"照着 v1.1.0 的克制改 v1.1.3"。

## 2026-08-10

- 追加修复 P10 一级歌架黑屏根因：固定 P10 独立歌架比例，不再读取会在预设初始化中变化的普通 `orbit.baselineRadius`；右键一级歌架锚到相机前方安全空间，并校准到用户标注的中部构图。Electron 实截图确认封面、文字和玻璃卡面可读；P10 专项 21/21，完整检查 271/271。

## 2026-08-11

- 修复播放状态通知堆叠和全局滚动抢帧：同一播放链的“切换中 / 取流失败 / 切换结果”现在同步替换为唯一一张当前状态卡，避免多张 `backdrop-filter` 卡片长期叠在右上角。搜索、歌单、FX 设置、迷你队列和歌词详情不再在每个 `wheel` 事件阻止默认滚动并创建 GSAP `scrollTop` 动画，改回浏览器原生合成滚动；任一滚动期间 3D 渲染预算暂降至 20 FPS。首页最近播放封面改为可视区附近才加载，避免首屏同时解码全部封面。新增回归测试；`npm run check` 327/327、语法和差异检查通过。真实歌曲播放时的主观滚动手感仍需 Electron 验收。[来源: `public/js/modules/05-playback/11-provider-fallback.js`、`public/js/modules/06-lyrics/01-playlist-panel-shell.js`、`public/js/modules/05-playback/03-home-discover-weather.js`、`public/js/modules/11-main-loop.js`、`scripts/test-account-logout-and-qishui-diagnostics.js`、`scripts/test-recent-scroll-performance.js`]

- 修复 Windows 壁纸库自动发现的真实失效：macOS `arp -an` 的 `(incomplete)` 项此前被误当作可达邻居，导致动态端口 `8128` 从未被请求。
- 仅保留真实 ARP 邻居；弹窗自动、读取和刷新复用单飞发现事务，手动、缓存、UDP、子网来源分开显示。
- 实机无 UDP 条件下，主进程已自动返回 `http://192.168.1.107:8128` 且记录 `PING_OK`。专项 31/31，完整检查 310/310。
