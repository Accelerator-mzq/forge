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

## 与 superpowers plugin 共存(常见问题)

forge 的 12 个 skill 是从 [superpowers](https://github.com/obra/superpowers) MIT 移植 + 命名空间改名(`superpowers:` → `forge:`,见 `LICENSE-THIRD-PARTY.md`)。所以**装了 superpowers plugin 的 Claude Code 会话同时跑 forge 项目时,会看到两组同主题 skill 共存**:

| 维度                                                          | 冲突? |
| ------------------------------------------------------------- | ------ |
| 安装路径(项目级 `.claude/` vs 用户级 `~/.claude/plugins/`)  | ❌ 不冲突 |
| skill 名(`forge:brainstorming` vs `superpowers:brainstorming`) | ❌ 命名空间隔离 |
| slash 命令(forge 6 个 `/forge:*` vs superpowers 不带命令)   | ❌ 不冲突 |

**但行为可能重叠**:你说"我想做个 todo list 应用"时,Claude 看到两个 brainstorming skill 都"1% 可能匹配",可能优先 invoke `superpowers:brainstorming`(plugin auto-load 抢先注册)→ 走完引导但**不写 `forge/drafts/<date>-<topic>.md`** → 下一步 `/forge:propose --from-draft <name>` 找不到 draft。

### 两种解决方案

**A. 显式用 `/forge:*` slash 命令触发(推荐)**

`/forge:brainstorm` 等命令直接调 `forge:*` skill,优先级高于 skill auto-trigger,绕过 superpowers 抢跑:

```bash
# 在 Claude Code 会话里,不说"我想做 X",而是显式打:
/forge:brainstorm
# AI 在 forge:brainstorming 引导下提问 + 写 forge/drafts/<date>-<topic>.md
```

**B. 跑 forge 项目时通过 `/plugins` 暂时关掉 superpowers**

forge 12 个 skill 内容跟 superpowers 几乎相同(同源 MIT 移植),关掉 superpowers 不会损失能力,只剩 `forge:*` 命名空间,Claude 不会困惑。

```
# 在 Claude Code 会话里:
/plugins
# 选择 superpowers plugin → disable for this session
```

## 7. 已有老文档项目接入(v0.2 brownfield)

> 适用场景:已有完整 SRS / HLD / 测试用例的项目接入 forge,且老文档不能被替代(合规 / 客户验收 / 审计要求)

完整流程见 [`docs/legacy-bridge.md`](./legacy-bridge.md)。三步初始化:

```bash
# 1. 启用 LLM 调用(在 forge/config.yaml 加 legacy_bridge.allow_llm_calls: true 后)
forge legacy-bridge --acknowledge-data-transfer

# 2. 二阶段 mapping
forge legacy-bridge map
# 审改 forge/legacy-anchors-draft.yaml 后:
mv forge/legacy-anchors-draft.yaml forge/legacy-anchors.yaml

# 3. 复写器 + 索引(one-shot)
forge legacy-bridge regenerate
forge legacy-bridge index
```

后续每次 `forge archive` 自动 sync-check;详见手册。

合规场景(enterprise / air-gapped):保持 `allow_llm_calls: false`,
brownfield 工具 graceful skip,主工作流不变。
