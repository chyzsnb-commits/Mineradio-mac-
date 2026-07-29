# Mineradio 第三方组件说明

Mineradio 包含或调用下列第三方组件。各组件仍受其原始许可约束：

- Electron 42.4.1 — MIT License
- electron-builder 26 — MIT License
- Three.js r128 — MIT License，Copyright 2010-2021 Three.js Authors
- MediaPipe Tasks Vision / Hand Landmarker — Apache License 2.0
- GSAP 3.15.0 — GreenSock Standard License
- music-tempo — MIT License，Copyright 2017 killercrush
- SoundTouch AudioWorklet — Mozilla Public License 2.0
- mpg123-decoder — MIT License
- NeteaseCloudMusicApi — MIT License
- `audio-separator`（用户主动启用本地 AI 分轨时由本机环境调用）— 以安装版本随附许可为准
- Rainform（本预设「云瀑共振」使用其经授权的视觉结构与着色器设计派生实现）— PolyForm Noncommercial License；来源：`afterimage-lab/Rainform` / https://rainform.pages.dev/；Required Notice：Rainform / 数据成雨 © 2026 afterimage。Mineradio 的适配代码位于 `public/js/modules/02-visual/20-rainfall-resonance.js`，不得删除或弱化上述归属与许可说明。

随包源文件中的许可证头和 `public/vendor/**/LICENSE`、`public/vendor/music-tempo.LICENCE` 应与本说明一并保留。发布者在最终公开分发前仍应对实际打包清单执行一次许可证清单核对。
