# 雨境玻璃水珠迁移设计

## 目标

将独立雨窗中已验证的透明水珠效果迁移到 Mineradio 的雨境预设（索引 9）。效果叠加在现有雨丝和主场景之上，独立页的夜景背景不迁移。

## 架构

- `18-rain-mood.js` 继续负责雨丝、幽灵封面和雨境设置持久化。
- 新模块 `19-rain-glass.js` 只负责水滴状态机、Metaball 场、模糊纹理、折射/Fresnel 合成和 GPU 资源生命周期。
- 主循环复用现有 `renderer`、`scene`、`camera` 和主动画调度，不创建第二个 Canvas 或 `requestAnimationFrame`。
- 后处理失败时返回 `false`，主循环回退到 `renderMainSceneWithGpuSample`。

## 交互

雨境动态面板提供玻璃水珠开关、水珠数量、水珠流速和水珠尺寸。数量、流速和尺寸分别独立保存到 `mineradio-rain-toggles-v1`；尺寸只改变水滴半径，不改变水滴数量。

## 粒子与材质

水滴使用 pinned、growing、breaking、slipping、settling 五态模型；大滴沿带横向扰动的玻璃通道滑落，按面积守恒与小滴融合。GPU 场使用有限的多瓣几何，合成阶段从场梯度求法线，采样锐利/模糊场景实现折射、局部色散、接触阴影、菲涅尔边缘和高光。

## 资源与回退

后处理建立锐利场景、水平模糊、垂直模糊和 Metaball 场四个 render target。切出雨境、关闭玻璃水珠、上下文恢复或渲染失败时释放 target、材质和几何资源；下一次开启时重新创建。

## 验证

- 静态测试确认模块加载顺序、设置绑定、持久化、主循环后处理和资源释放。
- `node --check` 检查新增模块及接入模块。
- `npm run check` 执行全量回归测试。
- Electron 启动后检查雨境、玻璃水珠开关以及数量/流速/尺寸控件。
