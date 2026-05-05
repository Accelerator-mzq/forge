# Forge Getting Started(5 分钟跑通)

本文带你从空目录一直走到 `forge archive` 完成第一次归档。

## 前置

- Node.js ≥ 20.19,pnpm ≥ 9
- 已装 Claude Code 或 Codex(本教程用 Claude Code)
- 一个干净空目录,**最好 git init 过**(非 git 项目下 review 标记不绑代码 diff,archive 必须 --force 才接受)

## 1. 安装 + 初始化(30 秒)

```bash
mkdir my-todo-app && cd my-todo-app
git init
pnpm dlx @accelerator-mzq/forge init --harness claude
```

会发生什么:

- 检测到当前目录(空但有 `.git/`),自动选择 `claude` adapter
- 把 12 个 skill 铺到 `.claude/skills/forge-*/SKILL.md`
- 把 6 个命令铺到 `.claude/commands/forge/*.md`
- 创建 `forge/config.yaml` + `forge/{drafts,changes,specs}/` 骨架

确认:

```bash
ls .claude/skills/         # 12 个 forge-* 目录
ls .claude/commands/forge/ # 6 个 .md
cat forge/config.yaml      # harness: [claude]
```

## 2. 起 Claude Code 会话,触发 brainstorming(2 分钟)

```bash
claude
```

第一句话发:

> 我想做个 todo list 应用

期望发生(✅ 表示 forge 工作正常):

- AI **不**直接写代码
- AI 反而问 2-3 个澄清问题(目的、约束、成功标准)
- 多轮对话后,AI 提议把 design 写到 `forge/drafts/<date>-todo-list.md`

如果 AI 直接写代码 → bootstrap 没生效,看 [`docs/harness-setup.md`](harness-setup.md) 排查。

完成后,确认:

```bash
ls forge/drafts/  # 至少一个 .md 文件
```

## 3. 把 draft 转 change(1 分钟)

在 Claude Code 里发:

```
/forge:propose add-todo --from-draft 2026-05-05-todo-list
```

(把 `2026-05-05-todo-list` 替换为实际 draft 文件名,不带 `.md`)

期望发生:

- AI 读 draft 内容
- AI 调 `forge:writing-plans` skill,产出 4 件套到 `forge/changes/add-todo/`:
  - `proposal.md` — Why + What + Scope
  - `specs/<area>.md` — Given/When/Then 格式
  - `design.md` — 技术方案
  - `tasks.md` — checkbox 列表(每个 task 2-5 分钟粒度)
- draft 移到 `forge/drafts/.consumed/`

确认:

```bash
ls forge/changes/add-todo/
```

## 4. AI 实施 tasks(1 分钟主代理时间;子代理可能跑数分钟)

```
/forge:apply
```

期望发生:

- AI 调 `forge:subagent-driven-development` + `forge:test-driven-development`
- 对每个未勾选 task:
  - 派 fresh 子代理拿 [task + 相关 spec + design] 启动
  - 子代理跑 red→green→refactor + git commit
  - 主代理 review 子代理 commit + test 日志,通过 → 在主工作区把 `[ ]` 改 `[x]`
- 全部完成后 tasks.md 末尾追加 `applied_commits` 列表

## 5. 派 review subagent + 处理反馈(2 分钟)

```
/forge:review
```

期望发生:

- 派 fresh review 子代理审 [proposal + specs + design + git diff]
- 主代理对每条意见判断 accept / reject(用证据反驳,不机械接受)
- 接受的意见 append 到 tasks.md 末尾作为新 task
- 满足三条件(无悬挂意见 + 接受意见已实现 + 本轮无新增 task)→ 写 `.review-passed` YAML

## 6. 验证 + 归档(30 秒)

```
/forge:verify
```

跑 `forge validate` + 跑用户测试套 + 写 `.verify-passed` YAML(含 evidence log_hash)。

```
/forge:archive
```

调 `forge archive add-todo` CLI:

- 校验 .verify-passed + .review-passed marker schema + hash + git integrity
- 严格 + Move 到 `forge/changes/archive/<date>-add-todo/` + Sync specs deltas 到 `forge/specs/`
- 调 `forge:finishing-a-development-branch` 提示 git 层面合并/PR/清理决策

确认:

```bash
ls forge/changes/archive/   # 含 <date>-add-todo
ls forge/specs/             # 应有归档 change 留下的 spec 文件
```

## 接下来

- [`docs/cli-reference.md`](cli-reference.md):5 个 CLI 命令的完整参数 + 退出码
- [`docs/harness-setup.md`](harness-setup.md):Claude Code + Codex 安装详解 + bootstrap 注入路径
- 改坏了想重来:`rm -rf forge/ .claude/ && pnpm dlx @accelerator-mzq/forge init --harness claude`(慎用,会丢全部 draft / change / spec)

## 出问题怎么办

- bootstrap 没生效(AI 直接写代码) → 检查 `.claude/skills/forge-using-forge/SKILL.md` 文件存在;重启 Claude Code 会话;`forge update --force` 强制重铺
- archive 拒绝(`marker 已过期`) → tasks.md 或 specs/ 被改过,重跑 `/forge:verify` + `/forge:review`
- `forge update` 报"已被用户修改" → 默认行为(spec §4.2);`forge update --force` 强制覆盖

完整问题清单见 [`docs/cli-reference.md` 的"错误退出码"段](cli-reference.md#错误退出码)。
