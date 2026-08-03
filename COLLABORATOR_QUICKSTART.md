# 给协作者的操作说明

欢迎加入 Mineradio Mac 开发！请按这个流程工作：

## 怎么改代码（每次都这样）

1. 改代码前，先拉最新：
   git checkout main
   git pull

2. 新建你的分支（不要直接改 main！）：
   git checkout -b 你的名字/改什么内容
   例如：git checkout -b zhangsan/fix-memory

3. 改代码，改完存档：
   git add -A
   git commit -m "说明你改了什么"

4. 推到 GitHub：
   git push origin 你的名字/改什么内容

5. 去 GitHub 开 PR（合并请求）：
   打开 https://github.com/chyzsnb-commits/mr/pulls
   点 New pull request → 选你的分支 → 创建

## 重要规则

- **不要直接 push 到 main**。所有改动走 PR，让仓库主人审查后合并。
- 合并后会自动删除你的分支，下次重新从 main 建新分支。
- 用中文写 commit 说明和 PR 描述。
- 详细规则见 AGENTS.md 和 .github/AGENT_COLLABORATION.md。

## 仓库主人怎么接收你的改动

你开 PR 后，仓库主人会收到通知。他会看你的改动，没问题就点合并（merge），
你的改动就进 main 了。
