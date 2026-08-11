# Windows 壁纸下载并应用设计

## 目标

Windows 壁纸库中的图片、视频和已完成导出的 Scene MP4 可被保存到 Mac 本地 Mineradio 背景库并立即应用。后续切换或重启必须使用本地副本，不依赖 Windows 继续在线。[来源: 用户确认，2026-08-11]

## 根因与边界

当前普通媒体仅通过 Windows URL 预览；Scene 完成后仅调用原生“保存到文件夹”流程。两条路径均没有调用现有 IndexedDB 背景媒体库，因此不会成为可应用背景。[来源: `public/js/modules/07-fx/10-wallpaper-library-panel.js`; `desktop/wallpaper-library-bridge.js`]

禁止将远程 URL 直接存入背景设置，因为 Windows 断线后背景将失效。禁止在 Scene 未导出完成前提供应用操作。[来源: 用户确认，2026-08-11]

## 方案

主进程新增受限下载桥接。它只接受通过现有 `connect` 验证的 Windows 基址，普通媒体固定请求 `/api/wallpaper-file?id=...`，Scene 仅能请求 `/api/exported-file?name=...`。桥接返回媒体字节、MIME 与安全文件名，不暴露 Windows 路径。

渲染层把返回字节构造为 Blob，调用现有 `putCustomBackgroundBlob` 保存到 `mineradio-custom-background-v1/media`，随后调用 `setCustomBackgroundMedia`。媒体 ID 采用本地时间和随机后缀，避免覆盖用户已有背景；成功后刷新现有背景网格。

详情抽屉中：图片和视频显示“下载并应用到 Mineradio”；Scene 在导出状态为 `completed` 时显示“应用 MP4 到 Mineradio”。原“保存 MP4”可作为次级手动保存能力保留。

## 失败与安全

下载前后都检查可信基址、HTTP 成功、允许的 `image/*` 或 `video/*` MIME、有效文件名和最大响应体限制。Windows 断线、错误 MIME、响应超限、IndexedDB 写入失败和导出未完成均进入可重试失败态，不改变当前背景。

## 验收

专项自动测试覆盖：普通图片/视频下载应用、已完成 Scene 应用、未完成 Scene 禁止应用、异常 MIME/断线/超限拒绝、详情可见按钮与状态。完整 `npm run check`、语法检查与真实 Electron 命令行启动后可复验。[来源: 用户任务，2026-08-11]
