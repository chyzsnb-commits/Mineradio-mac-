# Mineradio 实时双语歌词高可用重构设计

日期：2026-06-26

状态：已确认方案，待实现

## 1. 目标

为 Mineradio 构建一套稳定、可降级、视觉统一的实时双语歌词系统，覆盖主播放器舞台歌词与桌面歌词悬浮窗两套界面，并满足以下目标：

- 双语歌词开关关闭时不产生额外翻译请求。
- 优先使用平台官方返回的翻译歌词。
- 官方翻译缺失时，通过服务端统一代理的多引擎公共翻译矩阵补齐缺失行。
- 任一翻译引擎失败、超时、返回异常时，播放器必须优雅降级为仅显示原歌词，不得阻塞播放或导致界面报错。
- 原歌词与翻译歌词在 DOM 结构、激活状态、缩放、透明度、位移和发光表现上视作同一个物理实体，保持像素级视觉同步。

## 2. 当前项目现状

当前代码中已存在以下能力：

- `public/index.html` 中存在 `bilingualLyrics` 开关与前端歌词渲染逻辑。
- `public/lyric-translation.js` 中已存在：
  - 官方翻译行与原歌词的时间轴合并工具；
  - 批量翻译文本按行缝合的基础工具。
- `server.js` 中已存在一个单一的公共翻译接口：
  - `/api/translate/lyrics`
  - 当前只依赖 Google gtx 客户端。
- `public/desktop-lyrics.html` 中桌面歌词仍采用 `line + subline` 的双节点结构。
- 主播放器舞台歌词逻辑实际位于 `public/index.html` 内，而不是独立的 `public/assets/js/lyrics-stage.js` 文件。

这意味着本次实现将以当前项目真实结构为准，不新建伪路径文件，而是在现有文件中做结构化重构。

## 3. 推荐方案

采用全链路重构方案：

1. 服务端新增 `TranslationService`，统一封装多引擎翻译与责任链降级。
2. 前端保留并升级现有 `bilingualLyrics` 开关，不新增重复概念。
3. 主舞台歌词与桌面歌词统一改为 `.lyric-group > .lyric-original + .lyric-translation` 结构。
4. 所有激活状态与动画目标提升到 `.lyric-group` 容器层。
5. 保留现有播放器与桌面歌词主流程，不改动歌曲播放、歌词推进、桌面歌词通信等核心链路。

## 4. 架构设计

### 4.1 服务端 TranslationService

在 `server.js` 中新增一组服务端翻译核心函数，统一由 `/api/translate/lyrics` 使用。

建议拆分为以下职责：

- `translateViaGoogleGtx(text, options)`
- `translateViaLingva(text, options)`
- `translateViaBing(text, options)`
- `translateViaMyMemory(text, options)`
- `translateViaLibreTranslate(text, options)`
- `splitTranslationBatches(lines, options)`
- `runTranslationFallbackPipeline(batch, options)`
- `translateLyricLineSet(lines, options)`

### 4.2 引擎顺序与降级链

固定责任链顺序如下：

1. Google gtx
2. Lingva
3. Bing
4. MyMemory
5. LibreTranslate

行为规则：

- 对每个 batch 按顺序尝试引擎。
- 某引擎成功返回可用文本后，立即停止后续引擎尝试。
- 若单个 batch 全部失败，仅该 batch 回退为空翻译，不能中断整首歌的翻译流程。
- 若整首歌所有 batch 都失败，接口返回成功结构，但翻译内容为空，并带失败元信息。

### 4.3 批处理与字符限制

翻译请求只处理“有主歌词文本且当前没有翻译”的歌词行。

流程如下：

1. 前端将待翻译歌词行提交到服务端。
2. 服务端先清洗文本并保留原顺序。
3. 将歌词行按引擎安全字符上限拆分为多个 batch。
4. 每个 batch 内使用 `\n` 拼接为一个请求体。
5. 多个 batch 使用 `Promise.all` 并发执行，但每个 batch 内部仍按责任链顺序串行降级。
6. 结果返回后按原索引缝合回原歌词时间轴。

保守字符阈值：

- Google gtx：4000
- Lingva：3500
- Bing：2500
- MyMemory：500
- LibreTranslate：2500

实际分批逻辑应采用“按当前 batch 可用引擎中的最保守阈值切分”，默认以 500 字符为绝对安全线，避免 MyMemory 失败时不得不重切。

### 4.4 返回结构

`/api/translate/lyrics` 返回结构建议统一为：

```json
{
  "translatedText": "按批次拼接后的完整文本",
  "translatedLines": ["行1", "行2"],
  "provider": "google-gtx",
  "providersTried": ["google-gtx", "lingva"],
  "partial": false,
  "failedBatches": [],
  "from": "auto",
  "to": "zh-CN"
}
```

当部分 batch 失败时：

- `partial: true`
- `failedBatches` 记录失败批次索引和最后错误摘要
- 接口仍返回 200，避免前端把它视为播放器错误

### 4.5 错误处理与可观测性

所有 adapter 与批处理节点都必须包裹 `try/catch`。

日志要求：

- 输出引擎名
- 输出 HTTP 状态码
- 输出错误体摘要
- 输出当前 batch 序号
- 截断错误体，避免日志过大

日志前缀统一：

- `[LyricTranslate:google]`
- `[LyricTranslate:lingva]`
- `[LyricTranslate:bing]`
- `[LyricTranslate:mymemory]`
- `[LyricTranslate:libre]`
- `[LyricTranslate:pipeline]`

## 5. 前端数据流

### 5.1 双语歌词启用逻辑

继续使用现有 `fx.bilingualLyrics` 状态作为唯一开关。

行为调整为：

- `false`：只渲染原歌词与官方已有翻译，不触发公共翻译请求。
- `true`：
  - 先解析官方翻译；
  - 若仍存在无翻译行，再请求 `/api/translate/lyrics`；
  - 将服务端返回结果只补齐缺失行，不覆盖官方翻译。

### 5.2 前端歌词合并策略

继续扩展 `public/lyric-translation.js`，保持其为纯函数工具层。

新增或扩展职责：

- 提取待翻译行及其原始索引
- 批量翻译返回结果映射回行索引
- 保留已有 `subText` 的行不被覆盖
- 支持服务端返回 `translatedLines` 或整段 `translatedText`

## 6. DOM 与视觉重构

### 6.1 主舞台歌词

现有主舞台歌词存在旧的 `.stage-lyric-line` 表现逻辑，需要调整为统一 group 概念。

建议结构：

```html
<div class="lyric-group active">
  <div class="lyric-original">原歌词</div>
  <div class="lyric-translation">翻译歌词</div>
</div>
```

规则：

- `.active` 仅允许出现在 `.lyric-group`
- `.lyric-original` 负责主视觉
- `.lyric-translation` 负责相对较轻的辅助信息
- 无翻译时，`.lyric-translation` 可隐藏但容器结构不变

### 6.2 桌面歌词

桌面歌词从：

- `#line`
- `#subline`

改为：

```html
<div id="lyricGroup" class="lyric-group">
  <div id="line" class="lyric-original">Mineradio</div>
  <div id="subline" class="lyric-translation"></div>
</div>
```

这样可以最大程度复用现有变量命名与状态同步逻辑，降低改动风险。

### 6.3 CSS 变量继承

翻译歌词视觉效果必须从父层继承 glow 与主题变量。

新增或调整变量：

- `--lyric-group-glow`
- `--lyric-group-highlight`
- `--lyric-translation-scale`
- `--lyric-translation-opacity`

样式要求：

- 翻译字号使用相对单位，如 `0.7em`
- 翻译行颜色比原歌词更柔和
- 翻译行的 glow 不单独夺目，而是从父层获得次级发光
- hover、active、paused 状态在 group 层统一下发

## 7. 动画策略

### 7.1 动画目标统一

无论主舞台歌词还是桌面歌词，动画目标统一提升到 `.lyric-group`。

统一接管属性：

- `scale`
- `opacity`
- `y`
- `x`（如已有漂浮）
- 激活态 class

### 7.2 GSAP 接管原则

本次不强行推翻现有视觉系统，而采用“group 外层接管，内层文本继承”的方式：

- GSAP 或现有动效逻辑只操作 `.lyric-group`
- `.lyric-original` 和 `.lyric-translation` 不再各自动画
- 现有桌面歌词的 motion/canvas glow 可以继续保留，但引用 group 的实时矩形与状态

这样既能满足双语作为一个整体移动，又不会破坏当前播放器的视觉基底。

## 8. 兼容与边界

### 8.1 保持不变的内容

以下流程不在本次重构中修改语义：

- 歌曲播放流程
- 歌词时间推进逻辑
- 桌面歌词窗口通信协议主结构
- 官方歌词抓取接口
- 播放器现有主题色体系

### 8.2 风险点

主要风险有：

1. 公共翻译接口偶发不可用；
2. 不同引擎返回换行切分不稳定；
3. 舞台歌词当前逻辑混合 DOM、THREE 与现有视觉状态，重构时必须避免误改非歌词对象；
4. 桌面歌词尺寸计算目前依赖主/副文本宽度测量，改为 group 后需同步修正测量入口。

缓解策略：

- 采用服务端责任链和部分成功返回；
- 批处理缝合按索引，不按字符串猜测；
- 先补测试，再最小改动重构；
- 保留旧 id 以降低连锁修改范围。

## 9. 测试策略

严格按 TDD 执行，先补失败测试，再写实现。

建议新增测试覆盖：

1. `TranslationService` 引擎降级顺序测试
2. 单个引擎超时后自动切下一个引擎测试
3. 500 字符安全拆 batch 测试
4. 多 batch 并发返回后按原顺序缝合测试
5. 官方翻译优先，不被公共翻译覆盖测试
6. `bilingualLyrics=false` 时不触发公共翻译测试
7. 主舞台歌词改为 `.lyric-group` 结构测试
8. 桌面歌词改为 `.lyric-group` 结构测试
9. 桌面歌词依然能显示副行测试
10. 全量 `npm test` 回归测试

## 10. 文件改动计划

预计修改文件：

- `server.js`
- `public/lyric-translation.js`
- `public/index.html`
- `public/desktop-lyrics.html`
- `tests/lyric-bilingual.test.js`
- 新增一个服务端翻译测试文件（如 `tests/translation-service.test.js`）

如在实现过程中发现 `server.js` 过大，可将翻译服务抽到单独模块，但前提是不破坏当前运行方式。

## 11. 成功标准

以下全部满足才算完成：

- 用户开启双语歌词后，官方翻译可直接显示；
- 官方翻译缺失时，服务端公共翻译可稳定补齐大多数歌词行；
- 任意单一翻译引擎失败不影响歌词显示；
- 主舞台歌词与桌面歌词均使用统一的 `.lyric-group` 结构；
- 原歌词与翻译在视觉上作为一个整体同步运动；
- 测试通过；
- 成功构建最新 DMG。
