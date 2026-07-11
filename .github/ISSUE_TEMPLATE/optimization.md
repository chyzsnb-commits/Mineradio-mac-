---
name: 性能/交互优化任务
about: 从版本对比分析得出的优化项。Codex 可认领。
title: "[优化] "
labels: optimization
assignees: ''
---

## 背景

<!-- 这项优化从哪里来？关联哪个版本对比结论？ -->

## 目标

<!-- 要达到什么效果？可量化的指标（如体积、启动时间、行数）？ -->

## 受影响文件

<!-- 列出要改的文件 -->

- `desktop/xxx.js`
- `package.json`

## 验收标准

- [ ] `npm run check` 通过
- [ ] `npm start` 实际运行无报错
- [ ] <!-- 具体验证项 -->

## 验证步骤

1. `npm install && npm run check`
2. `npm start`，检查 <!-- 具体功能 -->
3. `npm run build:mac:dir` 确认打包不报错

## 给 Codex 的说明

在 issue 评论 `@codex` 即可认领。实现时遵守 `AGENTS.md` 的「关键约束」，改动后更新 `CHANGELOG.md` 顶部。
