# Codex + GLM Collaboration Guide

本文档定义 Codex、GLM 以及其他 AI agent 在 `chyzsnb-commits/mr` 私有仓库中的协作规则。目标是让多个 agent 可以共同维护同一个 GitHub 仓库，同时避免互相覆盖、重复开发或绕过审查。

## 基本原则

- GitHub 是共享工作台：任务从 issue 开始，代码通过分支和 PR 交付。
- 用户也可以直接在聊天中下发任务，不必手动创建 issue。接任务的 agent 负责把聊天任务转成分支、提交和 PR。
- 每个 agent 只修改自己任务相关的文件，不重写无关历史，不覆盖其他 agent 的分支。
- `main` 始终保持可构建状态，任何 agent 都不能直接向 `main` 提交。
- PR 是唯一合并入口。即使是小改动，也先开 PR，等用户或维护者确认后再合并。
- 如果用户在 issue、PR 评论或聊天中给出新要求，以最新明确要求为准。

## 懒人工作流

用户不需要手动去 GitHub 创建 issue。可以直接在聊天里说：

```text
去 mr 仓库修复启动卡顿，完成后开 PR。
```

接任务的 agent 应该自动完成：

1. 阅读 `AGENTS.md`、`AI_HANDOFF.md` 和本文档。
2. 从最新 `main` 创建任务分支。
3. 修改代码并验证。
4. 推送分支并创建 PR。
5. 在 PR 描述里写清楚变更、验证和未完成事项。

如果用户只是口头描述任务，不要求保留长期讨论记录，可以不创建 GitHub issue。需要长期追踪、多人讨论或拆分子任务时，agent 可以代用户创建 issue，并在聊天里返回 issue 链接。

## 同步方式

Codex、GLM 和其他 agent 不应该把自己的本地目录当成权威状态。权威状态只有 GitHub：

- `main`：稳定基线。
- `codex/...`、`glm/...`：任务分支。
- PR：当前任务的共享同步点。

如果 GLM 已经开了 PR，Codex 接手时应读取 GLM 的 PR 分支继续工作，或者从该分支新建接手分支。反过来也一样。不要让两个 agent 在互不读取对方分支的情况下分别改两份本地代码。

如果用户希望两个 agent 共同处理同一个任务，可以使用一个共享任务分支：

```text
agents/<short-task-name>
```

两个 agent 都必须在每次修改前读取该分支最新状态，修改后提交到同一个 PR。共享分支适合小范围协作；复杂任务仍推荐各自分支 + PR 合并，避免互相覆盖。

## 分支命名

使用 agent 前缀区分来源：

```text
codex/<short-task-name>
glm/<short-task-name>
zcode/<short-task-name>
```

示例：

```text
codex/fix-ci-check
glm/optimize-lyrics-stage
codex/agent-collaboration
```

如果一个 agent 接手另一个 agent 的未完成工作，应新建自己的分支，并在 PR 或 issue 评论中说明接手来源。

## Issue 协作流程

1. 用户创建或指定一个 issue。
2. 接任务的 agent 在 issue 评论中声明：

   ```text
   我来处理这个任务，计划分支：codex/<task-name>
   ```

3. 如果另一个 agent 已经声明处理同一任务，后来的 agent 应先阅读该 issue、相关 PR 和 `AI_HANDOFF.md`，再决定是协助、接手还是等待。
4. 任务完成后，agent 在 issue 或 PR 中写明：
   - 改了什么
   - 验证了什么
   - 没验证什么
   - 是否需要用户手动操作

## PR 规则

PR 标题建议使用中文，清楚说明变更目的：

```text
建立 Codex 与 GLM 协作规则
修复 macOS 构建检查失败
优化歌词舞台渲染开销
```

PR 描述必须包含：

```markdown
## 变更

- ...

## 验证

- ...

## 未验证 / 待办

- ...

## 是否需要用户手动操作

- ...
```

四要素缺一不可：变更（改了什么）、验证（怎么确认没问题）、未验证（哪些没测到、哪些有风险）、是否需要用户手动操作（比如配 secret、装 App、手动测试某功能）。

不允许在 PR 中混入无关重构、格式化大改或构建产物。不要提交 `node_modules/`、`dist/`、`build/.omc/`。

## 交接规则

重要上下文写在两个地方：

- 短期任务状态：issue / PR 评论
- 长期项目状态：`AI_HANDOFF.md`

完成较大任务后，应更新 `AI_HANDOFF.md` 的工作日志和下一步。只做连通性测试、文档微调或无业务影响的小改动时，可以只在 PR 描述中记录。

## 冲突处理

- 如果两个 agent 改了同一文件，后提交者负责 rebase 或重新应用自己的改动。
- 如果需求冲突，暂停代码修改，在 issue 或 PR 评论中向用户确认。
- 如果 CI 或检查失败，开 PR 的 agent 优先修复；接手者必须在评论中说明接手原因。

## GitHub API 模式

当前环境中 `github.com` 的 git HTTPS 连接可能不稳定，但 `api.github.com` 可用。agent 可以优先使用 GitHub API 完成：

- 创建分支
- 创建或更新文件
- 创建 PR
- 评论 issue / PR

使用 API 提交时，仍然必须遵守同样的分支和 PR 规则。

## 术语解释（面向非技术读者）

用户要求：用英文技术词时，必须顺手给中文解释，不要只堆术语。统一约定：

- **commit**：代码存档点 / 一次保存记录。每个 commit 是一个可回退的快照。
- **branch**：分支 / 一条独立的工作线。在分支上改代码不影响 main（主分支/稳定版本）。
- **PR（Pull Request）**：合并请求 / 提交给维护者审查后再合并的改动。
- **issue**：任务单 / 问题单，用于跟踪要做什么。
- **repo（repository）**：代码仓库 / 项目仓库。
- **main**：主分支 / 稳定版本。任何 agent 都不能直接改 main，必须走 PR。
- **merge**：合并 / 把分支上的改动并入 main。
- **rollback**：回滚 / 回到之前某个 commit 的代码状态，用于撤销出问题的改动。
- **diff**：改动差异 / 两份代码之间的不同点。
- **CI（Continuous Integration）**：自动检查 / 自动构建流程，GitHub Actions 跑的那套。
- **rebase**：把分支的改动重新嫁接到最新的 main 之上。
- **review**：审查 / 合并前看一遍代码。

agent 在 PR 描述、issue 评论、聊天回复中遇到这些词，第一次出现时都要带中文解释。

## Rollback 存档点（可回溯）

每次重要修改都要形成清晰的 commit，作为"代码存档点"。目的是出问题时能快速回到上一个能用的状态：

- **一个任务一个分支，分支上可以有多个小 commit**。不要把一整个大任务压成单个 commit，否则中间任何一步出问题都无法定位。
- **commit 信息用中文，说清改了什么、为什么**。格式参考：`fix(telemetry): 改为 opt-in`、`feat(更新): 移除自动更新`。前缀用类型（fix/feat/refactor/docs），括号里写影响范围。
- **每个 commit 都应能独立通过 `npm run check`**（语法检查）。不要提交跑不通的中间状态。
- **出问题时回滚**：
  - 如果是分支上的某个 commit 出问题，且 PR 还没合并：直接在分支上 revert 那个 commit（`git revert <sha>`，或 API 方式新建一个反向 commit）。
  - 如果已经合并到 main：在 main 上 revert 合并 commit（`git revert -m 1 <merge-sha>`），然后开 PR 合并这个 revert。**不要直接强推（force push）覆盖 main 的历史**，main 历史必须可追溯。
- **存档点命名建议**：关键里程碑（如"基线入库"、"首个优化完成"、"发版 v1.1.4"）在 AI_HANDOFF.md 的工作日志里记下 commit sha，方便快速跳转。
