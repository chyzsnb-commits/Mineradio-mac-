# 音域回响系列入口与歌词唤醒设计规格

## 背景

预设 10「音域回响」、预设 12「音域回响·Sonic-Topography」和预设 13「音域回响·Wallpaper Engine」共享一个视觉系列入口，但原入口占满预设网格整行，导致首张预设卡与系列卡无法并列。用户同时反馈切换到预设 10 后歌词偶尔不出现，需要在不改变歌词设置的前提下恢复舞台。

## 目标

1. 在桌面宽度下让 emily 与音域回响系列卡并列，后续预设从下一行继续双列排列。
2. 在窄面板下让系列卡自动回退整行，三个版本仍保持互斥三选一。
3. 切入预设 10 时唤醒已有歌词舞台、恢复当前歌词和预热轨道，不改变歌词位置、字体、动画或倾角。
4. 用户明确关闭歌词时，切换预设不能强制重新开启。

## 非目标与平台边界

- 不改变预设 9 雨境玻璃水珠、预设 11 云瀑或其他预设的渲染逻辑。
- 不改音源、播放链、登录和 Wallpaper Engine 软件本体。
- 不把 Windows 的页面或播放器依赖带入 macOS。
- 不覆盖用户已有的歌词存档，包括 `particleLyrics`、位置和角度。

## 设计

### 系列入口

`buildPresetGrid()` 仍以内部索引 10/12/13 生成一张 `.preset-series-card`，三个 `.pc-series-option` 保持原有 `setPreset()` 路由和 `aria-pressed` 状态。默认预设网格使用自动列定位，使系列卡与第一张 emily 卡并列；`max-width: 720px` 时系列卡跨满整行，`max-width: 520px` 时三个选项恢复横向分段按钮。

### p10 歌词唤醒

新增 `refreshVoxelLyricStageAfterPresetChange(reason)`，由 `setPreset()` 在每次预设刷新后调用。函数只在 `VOXEL_PRESET_INDEX` 且 `fx.particleLyrics !== false` 时运行：确保歌词组存在并可见，标记一次渲染交互，必要时重新应用当前歌词，然后触发播放恢复、短预热和完整轨道预热。歌词关闭时直接返回，避免覆盖用户选择。

启动遮罩 `splash-active` 未退出时，主循环按设计暂停，因此真实验收必须先点击启动页进入 Mineradio；进入后 p10 的歌词舞台才会随播放时间推进。

## 测试契约

新增 `scripts/test-sonic-series-layout.js`，覆盖：

1. 桌面系列卡不再强制占满整行。
2. 窄面板系列卡跨整行且保留三选一结构。
3. p10 切换接入歌词唤醒函数，并保留 `particleLyrics === false` 的关闭状态。

验证命令：

```bash
node --test scripts/test-sonic-series-layout.js
npm run check
```

## 验收标准

- 桌面预设入口中 emily 与音域回响系列同一行，雨境和云瀑共振从下一行双列开始。
- 窄面板没有横向溢出，三个系列按钮只有一个 `aria-pressed="true"`。
- 播放有歌词的歌曲并先进入 Mineradio 后切换到 p10，歌词舞台可见且当前行会更新。
- 关闭歌词后切换 p10，`fx.particleLyrics` 仍为 `false`，不会被 helper 强开。
