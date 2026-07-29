# 云瀑共振音乐雨幕设计

## 目标

新增独立的 11 号视觉预设「云瀑共振」，把歌曲频谱转成具有音乐喷泉感的分层雨景：低频控制雨势与雨线厚度，中频控制横向列的旋律起伏，高频增加细雨亮点，拍点触发短促的纵向爆发。视觉结构沿用经项目所有者确认可二创的 Rainform 参考，包括雨链、珍珠雨滴、暴雨瀑布、撞击水花和涟漪；该预设不修改「雨境」9 的雨丝和玻璃水珠行为。

## 边界与约束

- 复用 Mineradio 当前的 Three.js `scene`、主 renderer、主循环和已有 `bass`、`mid`、`treble`、`beatPulse` 状态。
- 不创建第二个 Canvas，不创建第二个 `requestAnimationFrame`，不建立 Rainform 的天气 API 或独立运行时；只在本模块内保留经授权的派生视觉结构与 GLSL 处理，并保留 Required Notice、来源标识和 PolyForm Noncommercial 许可说明。
- 预设切出时隐藏并释放几何体与材质；没有歌曲播放时保留低强度毛毛雨，避免视觉突然冻结。
- 背景保持由主项目管理；新模块只渲染透明雨幕点云。

## 组件设计

### `20-rainfall-resonance.js`

模块维护固定对象池：基础雨链、环境雨链和暴雨雨链三层粒子，另有暴雨瀑布、撞击水花和涟漪池。雨滴片元着色器使用球面法线、镜面高光、菲涅尔和反射波，水花与瀑布使用独立的高精度点精灵着色器，保证画面结构接近参考而不是单一点云。

频谱值先由 `rainResonanceEase()` 平滑到 `bassS`、`midS`、`trebS`、`beatS`，再写入 shader uniform。强拍使用快升慢落，旋律使用连续正弦列相位，保证音乐停止或短暂静音时不会发生跳变。

模块提供 `rainResonanceActive()`、`ensureRainResonance()`、`updateRainResonance(dt)`、`disposeRainResonance()` 四个生命周期入口，以及三个设置读取函数和独立的 `localStorage` 存储键。

### 主循环和预设接入

`index-loader.js` 加载模块；`11-main-loop.js` 在雨境之后更新云瀑，并在预设 11 时屏蔽默认星河粒子。预设元数据、显示顺序、相机基线和默认值分别增加 11 号配置。

### 用户控件

动态面板增加「雨幕强度」「旋律起伏」「拍点爆发」三个滑块，范围分别为 `0–1.6`、`0–1.8`、`0–1.8`，默认值为 `0.90`、`0.80`、`0.75`。输入事件对值进行钳位并写入 `mineradio-rain-resonance-v1`，启动时恢复，避免污染雨境的设置存储。

## 数据流

```text
audio analyser -> bass/mid/treble/beatPulse
                         |
                  smooth tracking
                         |
        25-point rain curve + layered shader uniforms
                         |
                   transparent scene
```

## 验证策略

- 专项静态契约测试确认模块生命周期、shader 属性、主循环接入、预设元数据和控件范围。
- `node --check` 检查新增和修改的 JavaScript。
- `npm run check` 验证既有回归测试不受影响。
- `git diff --check` 检查空白错误。
- 用户手测：启动 Electron，切换「云瀑共振」，播放节奏明显的歌曲，确认低频雨势、中频列起伏、高频亮点和拍点爆发均可见，调节三个滑块即时生效。

## 非目标

- 本轮不把 Rainform 的天气 API、数据结构或独立应用代码移入 Mineradio；只保留经过授权的视觉派生实现，并在源码与第三方声明中保留 Required Notice。
- 本轮不把玻璃折射、背景模糊或雨滴滑壁物理迁移到新预设；这些仍属于雨境 9。
