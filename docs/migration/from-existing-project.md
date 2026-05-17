# 从已有 OpenSpec / superpowers 项目接入 forge

本文档是**已有项目**的 forge onboarding 端到端教程 —— 从安装、迁移产物,一直到接上 forge 主流程。

> 如果你是**从零开始**一个新项目,不用看这篇 —— 直接走 [`getting-started.md`](../getting-started.md)。那份从一个空目录起步;本篇专门解决「我已经有一个 OpenSpec / superpowers 管理的项目,想转 forge」。

## 1. 适用场景

满足以下任一条:

- 项目里有 `openspec/` 目录(OpenSpec 工作流)
- 项目里有 `docs/superpowers/{specs,plans}/`(superpowers plan 产物)
- 两者都有(见 [§3.3](#33-项目同时含两种源))

forge 提供 `forge migrate` 把这些产物**搬进** forge 工作目录(`forge/`),之后就能用 forge 的主流程 6 步继续推进。

## 2. 全景:从已有项目到 forge 主流程

迁移用户的完整路径分 5 个阶段:

```
阶段 1 安装 forge  →  阶段 2 forge migrate  →  阶段 3 验收产物 + 处理 [needs-fix]
                                                       ↓
       阶段 5 cleanup 源目录  ←  阶段 4 接入主流程(从 /forge:apply 起)
```

跟全新项目路径的区别:

| 阶段                      | 全新项目([getting-started.md](../getting-started.md)) | 已有项目(本文档)                            |
| ------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| 起点                      | 空目录 `mkdir` + `git init`                            | 已有 OpenSpec / superpowers 项目              |
| 产物来源                  | `/forge:brainstorm` + `/forge:propose` 现写            | `forge migrate` 从旧产物搬运                  |
| 接入主流程                | 从第 1 步 brainstorm 顺序跑                            | **跳过 brainstorm/propose,从第 3 步 apply 接入** |
| review → verify → archive | 一致                                                   | 一致                                          |

核心点:**迁移产出的 change 已经含 `proposal.md` / `specs/` / `design.md` / `tasks.md` 四件套** —— 相当于全新项目路径里 brainstorm + propose 两步的产物。所以迁移用户从主流程**第 3 步 apply** 接入,不重跑前两步。

## 3. 阶段 1-2:安装 + 迁移

### 3.1 安装 forge

forge 是 Claude Code plugin(Tier 1 全功能),安装见 [`installation.md`](../installation.md) 与 [`claude-install.md`](../claude-install.md)。

但有一点要先讲清:**`forge migrate` 是 CLI 子命令,不是 `/forge:*` slash 命令**。plugin 安装不会把 `forge` 放进系统 PATH。获取可执行的 forge CLI 有两种方式:

```bash
# 方式 A:不安装,每次用 pnpm dlx 临时拉起(适合只迁移一次)
pnpm dlx @accelerator-mzq/forge migrate <source>

# 方式 B:全局安装,得到常驻 forge 命令
npm i -g @accelerator-mzq/forge
forge migrate <source>
```

下文命令统一写 `forge migrate ...`;用方式 A 的话替换成 `pnpm dlx @accelerator-mzq/forge migrate ...`。

环境要求:Node ≥ 20.19、项目在 git 仓库内(archive 推测信号 + 失败回滚都依赖 git)。

### 3.2 迁移产物

在**待迁移项目根目录**跑(`forge migrate` 用当前工作目录探测源、把产物写进 cwd 下的 `forge/`):

```bash
# OpenSpec 项目
forge migrate openspec

# superpowers 项目
forge migrate superpowers
```

`forge migrate` 默认带 `--regenerate` —— 调 LLM 补缺的 `proposal.md` / `specs/`,需要 `ANTHROPIC_API_KEY` 环境变量;没设 key 会自动退化为 `--no-regenerate`(缺件标 `[needs-fix]`)。

每个 source 的完整流程、transformer 规则、archive 推测信号、FAQ:

- OpenSpec → [`from-openspec.md`](from-openspec.md)
- superpowers → [`from-superpowers.md`](from-superpowers.md)

### 3.3 项目同时含两种源

`forge migrate` 一次只吃一个 source,要串行跑两遍。**两遍之间必须备份 `forge/migrate-report.md` 与 `migrate-trace.json`**(固定文件名,第二遍会覆盖第一遍)。完整说明见 [`from-openspec.md §7`](from-openspec.md#7-项目同时含-openspec-与-superpowers)。

## 4. 阶段 3:验收迁移产物

迁移**不是终点** —— 产物搬进来后要先验收,再接主流程。

### 4.1 读迁移报告

`forge migrate` 成功后在 `forge/migrate-report.md` 落一份统计报告:

```bash
cat forge/migrate-report.md
```

报告含:`Summary`(ops / conflicts / downgrades 计数)、`Plan` 表(每件的 active/archive 分类 + transform 结果)、`Conflicts` / `Downgrades`(若有)、`Cleanup` 提示。

### 4.2 处理 [needs-fix]

`--no-regenerate` 路径(或缺 API key 退化)下,缺 `proposal.md` / `specs/` 的 change 会标 `[needs-fix]`:

```bash
grep -rn "needs-fix" forge/
```

三种处理:

- **手补**:按 `migrate-report.md` Plan 表 `validate` 列的 message 直接编辑 `forge/changes/<slug>/<file>`
- **重跑**:`forge migrate <source> --regenerate`(需 `ANTHROPIC_API_KEY`)
- **让 AI agent 补**(不用 API key):见下方

#### 让 AI agent 补缺件代替 `--regenerate`

`forge migrate` 默认的 `--regenerate` 是 **migrate CLI 进程自己内嵌的一次 Anthropic API 调用**,需要 `ANTHROPIC_API_KEY`,且**不会复用你当前所在的 AI agent 会话** —— CLI 是独立进程,拿不到 agent。

如果不想用 API key,改走 `--no-regenerate` + 让 agent 手补:

```bash
# 1. 显式跳过 LLM —— regenerate gate 整段被跳过,不实例化 client、不发网络请求,100% 不碰 API key
forge migrate <source> --no-regenerate
```

然后让你所在的 AI agent(如 Claude Code)干 `--regenerate` 本要干的活:

```
agent 读 forge/changes/<slug>/ 已有的 design.md + tasks.md
      → 推导补写 proposal.md 与 specs/<area>.md
```

这与 `--regenerate` 的 LLM 调用是**同一类活**,只是执行者从「CLI 内嵌的 API 调用」换成「你的 agent 会话」,走 agent 自身额度而非按 token 计费的 API key。

> ⚠️ **差异**:`--regenerate` 路径有 migrate 内置的 fidelity 自动校验(superpowers 阈值 0.6 / openspec 0.9)+ `.partial` 失败件 + redact 脱敏;agent 手补**没有这层 migrate 内置校验**。但缺件接入主流程后,`/forge:apply` 的 Critical Plan Review、`/forge:review`、`/forge:verify` 三维仍会审 proposal/specs 质量 —— 差异只是质量校验时机从 migrate 内移到主流程,不会逃过审查。

### 4.3 区分 active 与 archive change

迁移产物按推测分两类,落在不同位置:

| 分类                             | 位置                              | 后续动作               |
| -------------------------------- | --------------------------------- | ---------------------- |
| **active**(未完成的 change)     | `forge/changes/<slug>/`           | 接主流程(见 §5)      |
| **archive**(已完成的历史 change) | `forge/changes/archive/<slug>/`   | **已归档,无需操作**   |

archive 推测可能有误。若某个 change 分类错了,见 [`from-openspec.md §4.7`](from-openspec.md#47-archive-推测错了怎么办)。

## 5. 阶段 4:接入主流程

这是迁移用户与全新用户路径的**汇合点**。

### 5.1 为什么从 apply 接入

迁移产出的 active change 已含四件套(`proposal` / `specs/` / `design` / `tasks`)—— 这正是全新项目走完 brainstorm + propose 的产物。所以**不重跑前两步**,直接从主流程第 3 步 `/forge:apply` 接入。

`/forge:apply` 读 `forge/changes/<id>/tasks.md` 识别未勾选 task 并派子代理实施,它**不依赖 propose 阶段的 marker**(沿 `commands/apply.md` 步骤 4;前置只有步骤 0 的 `forge preflight branch-check`)。迁移产物没有 propose marker,不影响 apply。

而且 `/forge:apply` 步骤 3.5 的 **Critical Plan Review** 会让主代理通读迁移来的四件套,按完整性 / 顺序 / 清晰度 / scope 四维度逐条检查 —— 等于自带一道「审一遍迁移质量」的关卡。迁移产物(尤其 LLM regenerate 的 specs)若与 tasks 不完全对齐,主代理会弹 `AskUserQuestion` 让你决策,这是正常的。

### 5.2 接入前的两个检查

```bash
# 1. 切到 feature 分支 —— apply 步骤 0 的 branch-check 会拦 main/master
git checkout -b feature/<change-slug>
```

**2. 确认 `forge/config.yaml` 含测试命令** —— verify 阶段要用。迁移项目的 `forge/` 由 `migrate` 创建,不保证含 `config.yaml`(其 bootstrap 只建 `.cache` / `.forge-trash` / `.forge-ack` 三个目录)。缺则补:

```yaml
test:
  test_command: <你的测试命令> # 如 pnpm test
```

> ⚠️ 字段是 `test.test_command`,不是 `context.test_command`(后者是 `commands/verify.md` 的 stale doc bug,沿 getting-started 第 5 步)。

### 5.3 逐个 change 跑主流程

在 Claude Code 会话里,对每个迁移来的 active change:

```
/forge:apply --change-id <slug>
/forge:review
/forge:verify
/forge:archive
```

`--change-id` 必须显式指定 —— 迁移可能产多个 change,`/forge:apply` 无参数遇到多 change 会报错。逐个 change 走完 apply → review → verify → archive。

从 apply 往后,流程与全新项目**完全一致**。每步的详细操作、期望产物、排障见 getting-started 对应章节:

- [第 3 步 — Apply 实施](../getting-started.md#第-3-步--apply-实施)
- [第 4 步 — Review](../getting-started.md#第-4-步--review)
- [第 5 步 — Verify 三维](../getting-started.md#第-5-步--verify-三维)
- [第 6 步 — Archive 三级 fence](../getting-started.md#第-6-步--archive-三级-fence)

## 6. 阶段 5:cleanup 源目录

所有 change 接入并归档后,清理旧产物目录:

```bash
# OpenSpec 源
git rm -r openspec/

# superpowers 源
git rm -r docs/superpowers/{specs,plans}/

git commit -m "chore: migrate to forge workflow"
```

详见 [`from-openspec.md §5`](from-openspec.md#5-cleanup) / [`from-superpowers.md §9.1`](from-superpowers.md#91-cleanup)。

## 7. 完整示例(OpenSpec 项目)

一个 OpenSpec 项目的端到端命令序列:

```bash
# ── 阶段 1-2:迁移 ──
cd /path/to/my-openspec-project
export ANTHROPIC_API_KEY=sk-...            # 用 --regenerate 补缺件
forge migrate openspec

# ── 阶段 3:验收 ──
cat forge/migrate-report.md                # 看分类 + needs-fix
grep -rn "needs-fix" forge/                # 缺件清单
ls forge/changes/                          # active changes
ls forge/changes/archive/                  # 已归档的历史 change

# ── 阶段 4:接入主流程 ──
git checkout -b feature/<slug>             # 离开 main/master
# 补 forge/config.yaml 的 test.test_command
```

然后在 Claude Code 会话里,对每个 active change:

```
/forge:apply --change-id <slug>
/forge:review
/forge:verify
/forge:archive
```

```bash
# ── 阶段 5:cleanup ──
git rm -r openspec/
git commit -m "chore: migrate openspec to forge"
```

## 8. 参考

- [`installation.md`](../installation.md) — forge 三 harness 安装总览
- [`getting-started.md`](../getting-started.md) — 全新项目端到端教程(主流程 6 步详解)
- [`from-openspec.md`](from-openspec.md) — `forge migrate openspec` 完整流程
- [`from-superpowers.md`](from-superpowers.md) — `forge migrate superpowers` 完整流程
- [`cli-reference.md`](../cli-reference.md) — `forge migrate` 选项 + 退出码
