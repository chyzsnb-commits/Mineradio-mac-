# Mineradio Mac 开发进度：待同步内容（2026-09-06）

状态：**待同步，未写入 Obsidian**。指定库 `/Users/chy/菜鸡的仓库/菜鸡的仓库` 在本机不存在。
目标笔记：`02 知识编译/Mineradio Mac 开发进度.md`。

## 已完成的优化（追加到原笔记表格）

| 日期 | 优化 | 验证 |
| --- | --- | --- |
| 2026-09-06 | 修复本机 Mineradio 启动失败，恢复 8 月 15 日完整验收包；保留 QQ 登录；源码重新禁用内置更新 | 严格签名、ASAR 归档头与 Info.plist 一致、主进程与本地服务正常；QQ loggedIn/playbackKeyReady 均为 true；更新 configured/updateAvailable 均为 false |

## 待办（更新原笔记清单）

- [x] 恢复 `/Applications/Mineradio.app` 启动与 QQ 登录。
- [x] 实际窗口确认：结束白屏旧进程并重开，看到《稻香》的封面、歌词、粒子和控制条。
- [ ] 人工确认持续音频输出、长时间稳定性与摄像头。
- [ ] 后续安装最近界面改动时，重新冻结并验证安全存储迁移链；本轮恢复的是历史包。
- [ ] 处理源码完整自动门禁已有的 5 个失败（282/287）：3 个 macOS 工作流、2 个汽水策略断言；不为通过测试重新开启汽水。
- [x] 按用户明确要求，将 f4b0339、60d5932、9c8648e 推送到 bugfix/web-art-four-issues 分支，追加至现有 PR #125（合并请求）。
- [ ] 审查私有仓库 PR #125（合并请求），未经主人同意不合并。

## 重要发现

损坏包把整个 app.asar 的 SHA-256 当作 Electron 归档头哈希写入 Info.plist。签名检查虽通过，Electron 仍会启动即退出；验收应同时检查归档头并真正启动应用。实际写错字段的工具尚未确认，不能把自动更新视为已证实根因。

损坏包和恢复前资料备份：`/Users/allenli/Library/Application Support/Mineradio Migration/repairs.noindex/20260906-125145/`。
当前恢复包 app.asar SHA-256：`7dac0a781edf167689930d0ea050323fc9af38d005a83cba11f73eb40676c024`。
PR：https://github.com/chyzsnb-commits/mr/pull/125 （按用户要求直接追加到现有开发分支；#127 已不再作为独立修复入口）。
