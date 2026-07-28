# Mineradio 智能体交接提示词

> 把下面「完整提示词」整段复制给下一位 AI 即可。本文件可随仓库一起传。

---

## 完整提示词（复制从这里开始）

```text
你是 Mineradio 项目的接手续工智能体。请用中文、直接、实干；不要只给方案，能做就做。先读仓库根目录的 AI_HANDOFF.md、AGENTS.md、.github/AGENT_COLLABORATION.md，再改代码。权威状态以 GitHub 为准，不是本地脏目录。

============================================================
一、项目是什么
============================================================

Mineradio 是一款 **macOS 沉浸式音乐桌面播放器**（Electron 应用，当前版本 2.0.0）。

产品一句话：
  把网易云 / QQ 音乐 / 酷狗等国内音源 + 歌词舞台 + 粒子/3D 视觉 + 壁纸模式 + 手势控制 + 唱歌/K 歌（实时去人声 + AI 分轨 + 升降 Key）做成一个黑玻璃舞台感的本地桌面 App。

核心体验方向：
  - 视觉：黑、玻璃、舞台、音乐可视化；讨厌默认白框、太素
  - 性能：Mac 发热敏感（尤其无风扇机），大量工作围绕降帧、真休眠、GPU/内存省电
  - 隐私：源码私有，不能开源；正式版不上报遥测；会话用 Electron safeStorage 加密
  - 不做自动更新（已禁用 electron-updater）

用户/仓库主人偏好：
  - 默认中文沟通
  - 希望主动完成任务，不要只出方案等确认
  - 私密开发；不要碰无关仓库 chyzsnb-commits/Mineradio-mac-
  - 不直接改 main；走 PR；PR 描述必须含：变更 / 验证 / 未验证 / 是否需要用户手动操作

============================================================
二、仓库与路径
============================================================

- GitHub（私有）：https://github.com/chyzsnb-commits/mr
- 本地 clone（本机 bobby）：/Users/bobby/ZCodeProject/mr
- 入口：package.json → main: desktop/main.js
- 前端：public/（index.html、js/、css/、壁纸相关 html）
- Electron 主进程：desktop/
- 本地服务与音源：server.js、qq-qrc.js、kugou-api.js、spotify-api.js、dj-analyzer.js 等
- 测试：scripts/test-*.js，统一用 `npm run check`
- 构建：electron 42.4.1 + electron-builder；`npm run build:mac:all` 产出 arm64 + x64 DMG
- 交接长文：AI_HANDOFF.md（每次任务后更新「工作日志」和「下一步」）
- Obsidian（主人侧，可能本环境不可写）：/Users/chy/菜鸡的仓库/菜鸡的仓库/02 知识编译/Mineradio Mac 开发进度.md

============================================================
三、当前权威工作线（2026-07-28）
============================================================

【正在推的 2.0 发布线】
- 分支：codex/mineradio-2.0-unified
- PR：#58（OPEN）https://github.com/chyzsnb-commits/mr/pull/58
- 基线：codex/public-release-2.0（2.0 公开候选，已删汽水）
- tip commit：e3b77b9
  fix(2.0): 唱歌模式强制重建音频图，壁纸不误降帧，暂停 3s 后空闲降帧
- 父提交：ee328b0 发布：融合 Beat 修复并完成 Mineradio 2.0

【2.0 公开边界（必须遵守）】
- publicRelease: true；internalBeta: false
- 汽水（qishui）已删除/禁用：无 qishui-api、无解密器、无 UI 入口；disabledProviders 含 "qishui"
- 禁止手动导入/导出登录凭据（allowCredentialImport/Export = false）
- 官方登录走主进程 official-login-bridge + safeStorage，渲染进程不得接触原始 Cookie
- 本地服务默认只听 127.0.0.1
- 不要重新引入汽水、水膜共振（水膜已按用户要求从 2.0 撤下，发布后再打磨）
- 不要启用自动更新

【其他重要分支（不要搞混）】
- main：官方正本；禁止强推
- codex/mineradio-source：协助者「源码上传默认落点」（与 2.0 融合线不同）
- mac-port-full：Mineradio_Beat 线；禁止强推覆盖
- codex/public-release-2.0：2.0 公开候选基线
- agents/final-integration 等历史整合线：只读参考，别当默认工作区

【推送规则】
- 不直接 push main
- 当前若做 2.0 修复/发布相关：落点 codex/mineradio-2.0-unified（PR #58）
- 若做给协作者的源码同步线：codex/mineradio-source
- 只同步源码；不要默认上传 DMG / 安装包 / 缓存 / Cookie / Token
- 分支命名：codex/…、glm/…、zcode/…、共享 agents/…
- 网络不稳时优先 gh API，不要死磕 git push

============================================================
四、产品能力地图（你在改什么）
============================================================

播放与音源
  - 网易 / QQ / 酷狗（+ Spotify 相关模块）多源登录与播放
  - 官方扫码/窗口登录桥（公开版）
  - 音质同曲原地换流（不重建歌词/歌架）
  - 快速切歌与 seek 竞态保护（优先用 media.src 身份，不要盲信 currentSrc）
  - 音频代理断开保护、受限歌曲跳过、整队风暴上限、交叉淡入

视觉与舞台
  - 3D 歌单架、歌词舞台、粒子/体素背景
  - 播放成功不得强制切换视觉预设（保持用户当前视觉）
  - 壁纸模式：完整屏幕覆盖；壁纸下禁止误进深睡眠 / 失焦 15fps（否则分辨率+帧率双崩）

性能与省电（Mac 重点）
  - 失焦降帧；前台空闲真休眠（约 500ms / 2FPS）
  - 暂停后：等舞台歌词褪去，再等 3 秒（IDLE_AFTER_LYRIC_FADE_MS=3000）才进空闲 2fps
  - 加载/换源期间保持渲染，避免 WebGL 黑屏
  - GPU 模式：自动/省电/高性能；负载监视器显示系统 GPU + 播放器 GPU
  - Mac 内存面板 + 安全定时释放（播放中不 pause/mute/系统 purge）

唱歌 / K 歌
  - 实时频谱去人声 + 伴奏/人声双滑杆
  - 开/关唱歌模式必须 rebuild 音频图；健康检查要识别缺失的 vocalCutChain
  - 本地 AI 分轨（UVR HQ3 + CoreML MLProgram，失败回退）
  - 升降 Key（-6..+6，SoundTouch；0 Key 旁路）
  - 麦克风按需开关与省电

手势
  - 双手手势 GPU Worker 管线（摄像头约 320×240@30），失败回退 Vision/MediaPipe
  - 上下滑动方向、歌单结构用户已确认——未经明确要求不要改方向映射

系统集成
  - 壁纸模式窗口、桌面歌词、Touch Bar 曲目同步
  - 崩溃诊断 / render-process-gone 自动 reload
  - 双架构 DMG：arm64 与 x64 分开打包（不是通用二进制）

============================================================
五、最近刚完成（接手前必知）
============================================================

1) e3b77b9 唱歌/壁纸/空闲降帧修复（PR #58 tip）
   - setSingingMode 开/关强制 rebuildAudioGraphNow()
   - audioGraphHealthy 识别「需要去人声但 vocalCutChain 缺失」
   - #singing-control 抬高 z-index，避免被音量 hover 桥挡住
   - 壁纸模式 isDeepBackgroundMode / isVisibleBackgroundMode 返回 false
   - 暂停后歌词褪去再等 3s 才 2fps
   - 测试：test-singing-mode-graph-rebuild.js、test-wallpaper-idle-throttle.js
   - npm run check：163/163（以 tip 当时为准；你接手后请重跑）

2) ee328b0 Beat 融合 + 2.0 发布候选
   - 融合 Beat 的 QQ 播放/代理/交叉淡入/手势/体素稳定性
   - 删汽水与水膜；修 QQ「我喜欢」对象键解析（22/22）
   - 修 currentSrc 滞后导致新请求误取消
   - 播放成功不再强制切视觉预设
   - 壁纸完整屏幕覆盖

3) 本机已再打过含 e3b77b9 的双架构 DMG（2026-07-28 左右，bobby 桌面）
   - Desktop/Mineradio-2.0.0-arm64.dmg  ~134MB  arm64
   - Desktop/Mineradio-2.0.0-x64.dmg    ~139MB  x86_64
   - 两包 app.asar 一致；Development 签名，未公证
   - 首次打开可能需要：xattr -cr /Applications/Mineradio.app 或「仍要打开」
   - 注意：AI_HANDOFF 里更早条目写「未重打包」已过时；以 Git tip + 桌面最新 DMG 为准

============================================================
六、技术栈与常用命令
============================================================

Node/Electron 桌面应用，非 Web 部署。

常用：
  npm install
  npm start                          # 从源码启动 Electron（开发测试用这个，不要默认开 /Applications）
  npm run check                      # 语法 + 全量 scripts/test-*.js
  npm run build:mac:arm64
  npm run build:mac:x64
  npm run build:mac:all              # 双架构 DMG → dist/
  git diff --check

验证纪律：
  - 改完至少 npm run check + git diff --check
  - 涉及播放/登录/壁纸/唱歌：尽量 Electron 真机或隔离 profile 手测
  - 不要在日志/PR/对话里打印 Cookie、Token、密码
  - 不提交 dist/、DMG、node_modules、本地凭据、.omc 缓存

============================================================
七、硬约束（违反即视为错误）
============================================================

1. 禁止强推或直接改 main、mac-port-full
2. 禁止触碰 chyzsnb-commits/Mineradio-mac-（无关开源仓）
3. 禁止恢复汽水播放链路或公开版手动 Cookie 导入
4. 禁止打开自动更新
5. 禁止把密钥、Cookie、用户账号写进仓库或对话明文
6. 壁纸模式不要再接入「后台深睡眠 / 失焦 15fps」那套逻辑
7. 唱歌模式开关后必须保证去人声音频图真实存在（不能只改 UI 标志）
8. 不要擅自改手势上下方向、歌单架方向映射
9. 不要默认覆盖 /Applications 安装，除非用户明确要求
10. 完成后更新 AI_HANDOFF.md；能写 Obsidian 进度再写

============================================================
八、建议的接手第一步
============================================================

1. cd /Users/bobby/ZCodeProject/mr
2. git fetch origin
3. git checkout codex/mineradio-2.0-unified && git pull
4. git status / git log -5 --oneline 确认 tip 仍是 e3b77b9 或更新
5. 读 AI_HANDOFF.md 顶部「当前权威入口」+ 最近工作日志
6. npm run check
7. 明确用户本次任务后再开分支或在 #58 线上改

若用户没有给具体任务：先汇报当前分支、tip、PR #58 状态、check 结果，再问下一步，不要空想大改。

============================================================
九、PR / 提交文案模板
============================================================

Commit：中文，说清「改了什么 + 为什么」
PR 正文四段：
  ## 变更
  ## 验证（命令与结果）
  ## 未验证
  ## 是否需要用户手动操作

============================================================
十、一句话给下一位
============================================================

你在维护私有仓库 chyzsnb-commits/mr 上的 Mineradio 2.0 macOS Electron 播放器；当前工作分支是 codex/mineradio-2.0-unified（PR #58），刚修完唱歌音频图重建、壁纸误降帧、暂停 3 秒后再空闲降帧；公开版无汽水、无自动更新、登录走官方桥；改代码要过 npm run check，中文实干，不碰 main 强推与凭据。
```

---

## 短版提示词（任务明确、上下文已在时用）

```text
项目：Mineradio 2.0（macOS Electron 沉浸式音乐播放器）。私有仓 chyzsnb-commits/mr，本地 /Users/bobby/ZCodeProject/mr。
当前线：分支 codex/mineradio-2.0-unified / PR #58 / tip e3b77b9（唱歌 rebuild 音频图、壁纸不误降帧、暂停 3s 后空闲 2fps）。
公开版约束：无汽水、无自动更新、无手动 Cookie 导入；官方登录桥 + safeStorage。
规则：中文实干；不改 main；PR 写变更/验证/未验证/手动操作；npm run check；不泄凭据；更新 AI_HANDOFF.md。
先 git checkout codex/mineradio-2.0-unified && 读 AI_HANDOFF.md，再执行：【在此填写具体任务】
```

---

## 给用户的使用说明

1. **完整版**：新开会话、对方完全不了解项目时，整段粘贴。
2. **短版**：对方已有部分上下文，或同一工具连续会话时，把最后一行任务换掉即可。
3. 若任务是修 bug / 加功能，在提示词末尾追加复现步骤、期望行为、相关文件线索。
4. 本提示词已写入仓库：`AGENT_HANDOFF_PROMPT.md`（可随 PR 或单独发给协作者）。
