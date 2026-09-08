# Windows 壁纸 Scene 导出路由

## 目标

避免 Mac 将 Windows Wallpaper Engine 的 `preview.jpg` 或 `preview.gif` 下载为低清图片。Scene 必须复用 Windows 已有的离屏渲染、MP4 编码和下载流程。

## 根因与取舍

Windows 列表把 Scene 项目的预览文件标为 `image`，同时携带 `sceneNeedsEngine: true`；Mac 此前忽略该字段，因而把预览文件当作可应用的静态图片。视频项目也会同时出现预览图片和真实视频，造成用户容易选择低清预览。

不新增 HTTP 接口：有 `sceneNeedsEngine` 的项目使用目录名作为 Scene ID，进入既有 `/api/live/<scene>` 和 `/api/export-scene` 流程。按项目目录归组后，Scene 优先显示一个 Scene 卡片；其他项目若存在真实媒体则忽略 `preview.*`，只保留真实图片或视频。只有没有真实媒体的非 Scene 项目才保留预览文件。

## 验证

- 回归测试覆盖 Scene 预览转为 Scene、使用项目目录 ID，以及视频项目删除 `preview.jpg` 后保留原 MP4。
- `npm run check` 必须通过。
- 真实 Windows 服务需在线后人工确认实时预览、导出完成和下载到 Mac 本地库；本轮网络请求超时，不能宣称真实导出已完成。
