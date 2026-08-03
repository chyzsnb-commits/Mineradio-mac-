# Mineradio 软件 Logo 替换设计

## 目标

将用户提供的 1024 x 1024 PNG 原图设为 Mineradio 软件 Logo。保留原图内容、比例、透明通道和方形构图，不裁剪、不加圆角、不重新设计。

## 实现范围

- 用原图替换 `build/icon.png`，供壁纸模式等运行时代码读取。
- 从同一原图生成包含 macOS 所需多种尺寸的 `build/icon.icns`，供软件窗口、Dock、访达和安装包读取。
- 不修改 Windows 使用的 `build/icon.ico`，避免把本次 Mac Logo 任务扩大到未验证的平台。
- 不修改软件界面、音频、性能和业务逻辑。

## 生成方式

1. 以 1024 x 1024 原图作为最大尺寸。
2. 生成 16、32、64、128、256、512、1024 像素的标准 iconset 文件。
3. 使用 macOS `iconutil` 生成 ICNS，并检查输出可被系统识别。

## 验证

- 检查 `icon.png` 仍为 1024 x 1024 RGBA PNG。
- 用 `iconutil` 反向展开 `icon.icns`，确认标准尺寸齐全。
- 运行 `npm run check`，确认现有代码检查不受影响。
- 使用未签名 Mac 目录打包，确认生成的 `Mineradio.app` 内包含新图标。
- 从打包后的 App 读取图标并与源图做像素或哈希比对，确认没有误用旧资源。

## 交付

更新 `AI_HANDOFF.md` 和 Obsidian 的 Mineradio Mac 开发进度笔记，提交到 `codex/app-logo` 分支，并创建一个以 PR #38 为基础的 PR（合并请求）。
