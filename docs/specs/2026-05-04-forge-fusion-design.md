# Forge — OpenSpec × Superpowers 融合方案设计文档

- **作者**:msc(由 Claude Opus 4.7 协助 brainstorming)
- **日期**:2026-05-04
- **状态**:草案,待用户审阅
- **目标**:把 OpenSpec 的产物驱动工作流和 superpowers 的行为塑造 skill 体系融合成一个独立的新项目 `forge`,作为长期使用的个人方法论框架

---

## 0. 决策快照

| # | 决策 | 选项 |
|---|---|---|
| 1 | 融合定位 | OpenSpec 作主干(产物 + 归档);superpowers 作武器库(行为纪律);独立项目,不依赖任一边 |
| 2 | 形态 | npm CLI + 多 harness 适配器(参考 OpenSpec 形态) |
| 3 | 工作流 | 线性 6 命令流水线(brainstorm → propose → apply → review → verify → archive) |
| 4 | 支持 harness | **v0.1 = Claude Code + Codex(2 harness)**;OpenCode 推 v0.2 等 plugin(`experimental.chat.messages.transform`)实现。基于 Phase 0.5 spike 实测结果(详见 [`spike/RESULTS.md`](../../spike/RESULTS.md)) |
| 5 | 移植 superpowers skill | 12 个(见 §2.2) |
| 6 | 移植 OpenSpec workflow | 4 个公开 + 1 个内部:propose、apply、verify、archive-change(公开 slash 命令);specs-sync(内部模块,仅 archive 内部调用,不公开为 CLI) |
| 7 | brainstorm 输出形态 | draft → promote(`forge/drafts/` 草稿区,propose 时消费) |
| 8 | 项目名 / 命令前缀 | `forge` / `/forge:*` |
| 9 | 技术栈 | TypeScript + Node 20+ + ESM + Vitest + pnpm + commander |
| 10 | 配置注入 | 保留 OpenSpec 的 `forge/config.yaml`(tech stack + per-artifact rules 注入到产物指令) |
| 11 | review 强制度 | end-of-change `/forge:review` 强制(archive 检查 `.review-passed`) |
| 12 | verify 强制度 | 强制(archive 检查 `.verify-passed`) |
| 13 | failure 反馈回路 | 自动追加失败项为 tasks.md 新条目 + archive 阻断 |
| 14 | apply 重跑语义 | pending-only 幂等,无 strict 模式 |
| 15 | adapter 失败 | 三阶段原子化(Stage→Backup→Commit + 反向回滚,见 §4.2) |
| 16 | 标记文件管理 | `.verify-passed`/`.review-passed` 是 YAML,**分层 hash 绑定**:verify 绑 [tasks_hash + content_hash + evidence log_hash + pass];review 绑 [tasks_hash + content_hash + git.head + git.diff_hash]。进 git;archive 按 §3.4 验证;`--force` 显式接受两类降级:human-override 标记 + 非 git 项目跳过 git 字段(均打印 warning) |
| 17 | skill eval 自动化 | 12 skill 全做 + multi-turn 进 v1 + weekly + PR cadence |
| 18 | 三 harness spike 结果 | **已完成**:Claude Code PASS / Codex PASS / OpenCode FAIL(skill 路径只注册工具不自动注入,需写 plugin)→ v0.1 收紧到 2 harness |
| 19 | review-passed 时机 | 仅当本轮接受意见已实现 + 测试通过 + 无新增 task 时才打 |
| 20 | LLM 调用边界 | 用户运行时不调;开发期 eval 允许调 Anthropic API,key 走 CI secret |
| 21 | OpenSpec 迁移工具 | v0.1 不做,v0.2 加 `forge migrate-from-openspec` |

---

## 1. 顶层架构

### 1.1 三层结构

```
┌─────────────────────────────────────────────────────────────────┐
│                      forge (npm package)                        │
│                                                                 │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────┐   │
│   │   CLI Layer     │   │  Core Engine    │   │  Harness    │   │
│   │  (commander)    │──▶│                 │──▶│  Adapters   │   │
│   │                 │   │  - schema       │   │             │   │
│   │  forge init     │   │  - validate     │   │  - claude   │   │
│   │  forge update   │   │  - artifact-    │   │  - codex    │   │
│   │  forge config   │   │    graph        │   │  - opencode │   │
│   │  forge archive  │   │  - templates    │   │             │   │
│   │  (sync internal)│   │                 │   │             │   │
│   └─────────────────┘   └─────────────────┘   └─────────────┘   │
│           │                      │                    │         │
│           └──────────────────────▼────────────────────┘         │
│                                  │                              │
│                                  ▼                              │
│             写入用户项目:                                        │
│             ┌────────────────────────────────────────┐          │
│             │  <project>/                            │          │
│             │    forge/                              │  ◀ 默认目录│
│             │      config.yaml                       │          │
│             │      drafts/                           │          │
│             │      changes/<id>/{...}                │          │
│             │      changes/archive/YYYY-MM-DD-<id>/  │          │
│             │      specs/                            │          │
│             │    .claude/skills/forge-*/             │          │
│             │    .claude/commands/forge/*.md         │          │
│             │    .codex/skills/...                   │          │
│             │    AGENTS.md  (根级,生成补丁)          │          │
│             └────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 三个不可妥协的原则

1. **CLI 不写业务逻辑**——CLI 只负责参数解析、用户提示、调度。所有写文件、模板渲染、校验都在 Core Engine 里。CLI 薄到几乎不用单测,Core 集中覆盖。
2. **Harness Adapter 是单一接口**——`HarnessAdapter` interface 定义 `installSkills()`、`installCommands()`、`detectInstalled()`、`getBootstrapPath()`。Claude/Codex/OpenCode 三个实现各自处理路径差异。**新增 harness = 新增一个 adapter,核心逻辑零修改**。
3. **产物目录用 `forge/`**——独立项目沿用 `openspec/` 会让人误解为依赖关系。v0.1 不提供从 OpenSpec 项目自动迁移的命令(需要熟悉 OpenSpec 内部结构),迁移工具推迟到 v0.2 加 `forge migrate-from-openspec`。MVP 阶段如需从 OpenSpec 切过来,人工照搬目录结构。

### 1.3 Bootstrap 自动触发

各 harness 在会话开始时加载 `using-forge` bootstrap(等价 `using-superpowers`),让 12 个 skill 能按红旗清单自动触发——而不是用户必须显式打 `/forge:brainstorm` 才进入 brainstorming 模式。

每个 harness 注入机制不同:

| Harness | 注入路径 |
|---|---|
| Claude Code | `.claude/skills/forge-using-forge/SKILL.md`(plugin marketplace 形态) |
| Codex | plugin manifest |
| OpenCode | `AGENTS.md` 注入 + `.opencode/skills/` 铺设 |

具体实现细节由各 adapter 内部封装。

---

## 2. 组件清单

### 2.1 npm package 内部模块(给 forge 维护者)

| 模块 | 职责 | 大致来源 |
|---|---|---|
| `cli/index.ts` | 入口,commander 注册 5 个公开 CLI 命令 | 仿 OpenSpec `bin/openspec.ts` |
| `cli/commands/init.ts` | `forge init`:扫描项目、检测 harness、调用 adapters 铺文件、生成 `forge/config.yaml` | 仿 OpenSpec `core/init.ts` |
| `cli/commands/update.ts` | `forge update`:重新铺 skills/commands(用户改 config 后) | 仿 OpenSpec `core/update.ts` |
| `cli/commands/config.ts` | `forge config profile/get/set` | 仿 OpenSpec `commands/config.ts` |
| `cli/commands/validate.ts` | `forge validate <id>`:跑产物完整性校验、specs GWT 格式、tasks 不变量 hash 比对。被 slash 命令模板(propose / verify)和 archive 命令引用 | 仿 OpenSpec `core/validation/` |
| `cli/commands/archive.ts` | `forge archive <id>` / `--force` / `--recover`:把 changes/<id>/ 移到 archive/、内部调 sync,**强制检查 verify+review 标记 YAML 内容与 hash**;`--recover` 子模式检测并修复 crash 后的半归档状态(详见 §3.5) | 新写,借 OpenSpec `core/archive.ts` 思路 |
| `core/specs-sync/` | **internal-only**(不公开为 CLI):把 changes/<id>/specs/ 的 deltas 合并到 `forge/specs/`。仅由 `archive.ts` 内部调用,用户**无法**手动跑 sync 绕过 verify/review 门禁。需要 escape hatch 时使用 `forge archive --force` | 参考 OpenSpec `core/specs-apply.ts` 的实现思路(同概念,forge 命名为 specs-sync,功能等价) |
| `core/schema/` | YAML schema 定义(spec-driven schema 的 forge 版,可扩展 `forge-tdd-driven`) | 仿 OpenSpec `core/schemas/` |
| `core/validate/` | 校验产物完整性(proposal 有 why/what、specs 有 Given/When/Then、tasks 有 checkbox) | 仿 OpenSpec `core/validation/` |
| `core/artifact-graph/` | 产物间依赖(proposal → specs → design → tasks),决定哪个能跑哪个不能 | 仿 OpenSpec `core/artifact-graph/` |
| `core/templates/` | 6 个 slash 命令模板 + 12 个 skill 模板(都是 markdown 字符串) | **核心创新点**——把 OpenSpec command 模板和 superpowers skill markdown 揉在一起 |
| `core/harness-adapters/` | 三个 adapter:`claude.ts` / `codex.ts` / `opencode.ts`,实现 `HarnessAdapter` 接口 | 各自独立写,共享 interface |
| `core/bootstrap/` | `using-forge.md` 内容 + 各 harness 的注入逻辑 | 借 superpowers `using-superpowers` 文本 |

### 2.2 模板内容(给 AI 用,运行时塞进 harness)

#### 6 个 slash 命令模板(每个一份 markdown)

| 命令 | 模板做的事 |
|---|---|
| `/forge:brainstorm <topic>` | 提示 AI 调用 `brainstorming` skill,产出落 `forge/drafts/<date>-<topic>.md` |
| `/forge:propose <change-id> [--from-draft <name>]` | 检查是否有 draft,有则读取作为输入;调用 `writing-plans` skill;产出 `forge/changes/<id>/{proposal,specs,design,tasks}.md` |
| `/forge:apply [--parallel]` | 调用 `subagent-driven-development` + `test-driven-development`;读 tasks.md 派子代理,每个 task red/green/refactor;`--parallel` 开 `dispatching-parallel-agents` + `using-git-worktrees` |
| `/forge:review` | 调用 `requesting-code-review`(派审查 subagent)+ `receiving-code-review`(主代理收反馈) |
| `/forge:verify` | 调用 `verification-before-completion`;运行 `forge validate`;若失败,**自动 append 失败项为 tasks.md 新条目并标记 verify-failed** |
| `/forge:archive` | 调用 CLI `forge archive`;**CLI 检查 verify-passed + review-passed 标记,缺一拒绝** |

#### 12 个移植 skill(直接复制 superpowers markdown 文本)

| Skill | 角色 | 移植改动 |
|---|---|---|
| `using-forge`(对应 `using-superpowers`) | bootstrap,会话开始注入 | 改名 + 替换命令清单 |
| `brainstorming` | `/forge:brainstorm` 核心 | 输出路径改 `forge/drafts/` |
| `writing-plans` | `/forge:propose` tasks 阶段 | 改名引用 |
| `subagent-driven-development` | `/forge:apply` 顺序模式 | 改名引用 |
| `test-driven-development` | `/forge:apply` 嵌入 | 改名引用 |
| `requesting-code-review` | `/forge:review` 主轨 | 改名引用 |
| `receiving-code-review` | `/forge:review` 配对 | 改名引用 |
| `verification-before-completion` | `/forge:verify` 嵌入 | 改名引用 |
| `systematic-debugging` | `/forge:apply` 出 bug 时 | 改名引用 |
| `dispatching-parallel-agents` | `/forge:apply --parallel` | 改名引用 |
| `using-git-worktrees` | parallel 配套 | 改名引用 |
| `finishing-a-development-branch` | archive 后续 | 改名引用 |

**许可与署名**:superpowers 是 MIT,允许复制。`forge` 仓库在 `LICENSE-THIRD-PARTY.md` 保留 superpowers 与 OpenSpec 原始 LICENSE 与 attribution。

### 2.2.1 forge/config.yaml 字段定义

```yaml
# forge/config.yaml
schema: forge-spec-driven/v1

# OpenSpec 风格的产物上下文注入(tech stack + per-artifact rules)
context: |
  Tech stack: TypeScript, React, Node.js
  Style: ESLint with Prettier, strict TypeScript

rules:
  proposal:
    - 包含 rollback plan
  specs:
    - 用 Given/When/Then 格式

# review 时计算 git.diff_hash 用的 pathspec(见 §3.4)
# include 是白名单;exclude 在用户声明之外还会自动追加默认排除
code_paths:
  include:
    - "src/**"
    - "tests/**"
  exclude:           # 可选,会与默认 exclude 合并
    - "src/generated/**"

# 默认 exclude(不可关闭,即使用户不写也会追加):
#   - "forge/**"
#   - "**/*.md"
#   - "**/.verify-passed", "**/.review-passed"
#   - "**/.verify-failed", "**/.review-failed"
#   - "**/.evidence/**"
```

`code_paths.include` 缺省时:include = 仓库根除默认 exclude 之外的全部 tracked 文件(行为类似 OpenSpec 的"约定优于配置")。

### 2.3 边界 — 我**不做**的事

- 不在用户运行时写 LLM 调用——所有用户的 AI 行为都通过 harness 发生,forge 不替代 harness 也不直接调 Anthropic API 服务用户。**例外**:forge 自身的开发期 skill eval(§5.5)允许调 Anthropic API,因为这是维护者的测试工具,不在用户路径上。eval 的 `ANTHROPIC_API_KEY` 通过 CI secret 注入,不打包进 npm 发布产物。
- 不做 web UI(OpenSpec 有 dashboard,v1 不做)
- 不做 telemetry(隐私 + 工作量)
- 不做 brownfield onboarding(OpenSpec 的 `/opsx:onboard`,v2 再说)
- 不做 `bulk-archive` / `continue-change` / `ff-change`(OpenSpec 提供,v2 再说)

---

## 3. 数据流

### 3.1 Happy Path(从模糊想法到归档)

```
T0  用户在项目根目录跑一次性安装:
    $ pnpm dlx forge init
    ┌──────────────────────────────────────────────────────────────┐
    │ forge CLI:                                                   │
    │  1. 检测 harness(读 .claude/、.codex/、AGENTS.md)            │
    │  2. 询问启用哪些(默认全选已检测到的)                          │
    │  3. 各 harness adapter 铺文件:                               │
    │       .claude/skills/forge-using-forge/SKILL.md  (bootstrap) │
    │       .claude/skills/forge-brainstorming/SKILL.md            │
    │       ... 12 个 skill ...                                    │
    │       .claude/commands/forge/*.md  (6 个 slash 命令)         │
    │       .codex/...   .opencode/...                              │
    │  4. 创建 forge/config.yaml(用户填 tech stack/rules)          │
    │  5. 创建 forge/{drafts,changes,specs}/  空目录占位            │
    └──────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────
T1  用户在 Claude Code 起新会话,第一句话:
    "我想做点 X,但我也不太清楚要怎么做"

    ┌──────────────────────────────────────────────────────────────┐
    │ harness 加载 using-forge bootstrap → 进入 forge 模式          │
    │ bootstrap 的红旗清单触发 brainstorming skill                  │
    │ AI: "在我提任何方案前,要先问几个问题..."                     │
    │   - 多轮 Q&A(2-3 方案、逐段确认、写 design 草稿)            │
    │   - 完成后写入 forge/drafts/2026-05-04-X.md                  │
    │   - 提示用户:"draft 写好了,确认要推进就跑                   │
    │              /forge:propose <change-id> --from-draft 2026-05-04-X" │
    └──────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────
T2  用户审完 draft,执行:
    /forge:propose add-x-feature --from-draft 2026-05-04-X

    ┌──────────────────────────────────────────────────────────────┐
    │ slash 命令模板 → AI 行为:                                    │
    │  1. 读 forge/drafts/2026-05-04-X.md                          │
    │  2. 读 forge/config.yaml(tech stack/rules → 注入提示)       │
    │  3. 调用 writing-plans skill                                 │
    │  4. 产出 forge/changes/add-x-feature/                        │
    │     ├── proposal.md         why + what + 范围                │
    │     ├── specs/              spec deltas (Given/When/Then)    │
    │     │    └── x-feature.md                                    │
    │     ├── design.md           技术方案、数据模型、接口          │
    │     └── tasks.md            checkbox 任务列表(供 apply 消费)│
    │  5. 把 draft 移到 forge/drafts/.consumed/                    │
    │  6. 跑 forge validate 确认产物完整                            │
    └──────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────
T3  用户审完 4 个产物,执行:
    /forge:apply              (顺序)
    /forge:apply --parallel   (并行,适合无依赖 task)

    ┌──────────────────────────────────────────────────────────────┐
    │ slash 命令模板 → AI 行为:                                    │
    │  1. 读 tasks.md                                              │
    │  2. 调 subagent-driven-development:                          │
    │     for each task:                                           │
    │       - 派一个 fresh subagent(顺序模式 = 主工作区;          │
    │         --parallel 模式 = 独立 worktree)                    │
    │       - subagent 拿 [task + 相关 spec + 相关 design] 启动    │
    │       - subagent 跑 TDD: red → green → refactor              │
    │       - subagent **必须 git commit 改动**(顺序模式 commit   │
    │         到主分支;parallel 模式 commit 到 worktree 分支)      │
    │       - 主代理 review subagent 的 commit + test 日志,        │
    │         通过则在主工作区勾掉 task                             │
    │  3. --parallel:dispatching-parallel-agents 开 worktree 隔离 │
    │     代码合并与 tasks.md 写入均**严格串行**(详见下方协议):  │
    │                                                              │
    │     代码合并:                                               │
    │       a. 每个子代理在自己的 worktree 跑 TDD 并 commit       │
    │       b. 子代理交付后,主代理在主工作区 cherry-pick 该       │
    │          worktree 的 commit(一次只 cherry-pick 一个 worktree)│
    │       c. 成功 → 销毁 worktree + 进入 tasks.md 写入步骤      │
    │       d. cherry-pick 冲突 → 立即跑 `git cherry-pick --abort`│
    │          清理主工作区(必须先恢复主工作区干净);abort 失败  │
    │          → 进入人工恢复(打印 cherry-pick 临时状态路径,     │
    │          退出码 3)。abort 成功 → 销毁 worktree + 失败该      │
    │          task + append 一条 merge-conflict-fix-N 修复任务    │
    │                                                              │
    │     tasks.md 写入(主代理单点串行):                        │
    │       a. worktree 内 tasks.md 是只读快照,子代理不写         │
    │       b. 主代理在主工作区原子地把 [ ] 改 [x]                │
    │       c. failure task append 仅由主代理在主工作区执行       │
    │       d. 同一时间只有一个 cherry-pick + tasks.md 写在跑     │
    │  4. 全部完成 → 在 tasks.md 末尾追加(parallel 多 commit 用     │
    │     列表):                                                   │
    │       applied_commits:                                        │
    │         - <task-id-1>: <commit-hash>                          │
    │         - <task-id-2>: <commit-hash>                          │
    │       final_head: <git rev-parse HEAD>                        │
    └──────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────
T4  /forge:review

    ┌──────────────────────────────────────────────────────────────┐
    │  1. requesting-code-review:打包 [proposal + specs + design  │
    │     + diff] → 派 review subagent                             │
    │  2. review subagent 输出意见列表                              │
    │  3. receiving-code-review:主代理对每条意见判断接受/拒绝     │
    │  4. 接受的意见 → append 到 tasks.md 作为新 task              │
    │  5. 仅当满足以下三条才打 review-passed(YAML,见 §3.4):       │
    │     a. 无拒绝意见的"已用证据反驳但未存档"项                  │
    │     b. 接受的意见已全部实现 + 测试通过(本轮新接受=不能本轮通过)│
    │     c. 满足 a+b 时,本轮 review 无新增 task → 才打 review-passed│
    │     写入字段:tasks_hash、content_hash、reviewed_by、         │
    │     git.{is_git_repo, head, diff_hash}、review_outcomes      │
    │  6. 否则进入 §3.2 failure loop:跑 apply 消化 → 再跑 review   │
    └──────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────
T5  /forge:verify

    ┌──────────────────────────────────────────────────────────────┐
    │  1. forge validate 跑产物完整性                               │
    │  2. 调 verification-before-completion:                       │
    │     - 每个 spec 的 scenario 必须有对应 test                  │
    │     - 每条声称的"完成"必须附证据(test 文件路径 + 通过日志) │
    │     - 把每个证据落到 changes/<id>/.evidence/ 下              │
    │  3. 失败 → 见 §3.2 failure loop                              │
    │  4. 通过 → 写 changes/<id>/.verify-passed(YAML,见 §3.4):  │
    │       schema、verified_at、verified_by、tasks_hash、         │
    │       content_hash、evidence(每条含 log_path + log_hash +    │
    │       pass=true)                                             │
    └──────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────
T6  /forge:archive
    内部调 forge CLI:

    ┌──────────────────────────────────────────────────────────────┐
    │  1. 校验 .verify-passed(详规则见 §3.4):                    │
    │     a. 文件存在 + YAML 解析成功                              │
    │     b. 重算 tasks_hash / content_hash 必须等于               │
    │     c. 每条 evidence 的 log_path 存在 + log_hash 等 + pass   │
    │     d. 任一不符 → 拒绝                                       │
    │  2. 校验 .review-passed(详规则见 §3.4):                    │
    │     a. 文件存在 + YAML 解析成功                              │
    │     b. 重算 tasks_hash / content_hash 必须等于               │
    │     c. is_git_repo=true → 重算 git.head / diff_hash 必须等于;│
    │        is_git_repo=false → **仅 --force 接受**(跳过 git     │
    │        字段 + 打印 warning);非 --force 直接拒绝             │
    │  3. 若 verified_by/reviewed_by = human-override              │
    │     → 仅 archive --force 接受;否则拒绝                      │
    │  4. archive 顺序原子化(详协议见 §3.5):                    │
    │     a. fs.rename forge/changes/<id>/ →                       │
    │        forge/changes/archive/<date>-<id>/                    │
    │     b. 内部 sync:把 archive/<date>-<id>/specs/ 的 deltas     │
    │        应用到 forge/specs/                                    │
    │     c. sync 失败 → 反向 rename 回 forge/changes/<id>/ +      │
    │        specs/ 从备份恢复                                      │
    │  5. 提示 finishing-a-development-branch skill,问用户         │
    │     "要不要进 git PR 流程"                                    │
    └──────────────────────────────────────────────────────────────┘
```

### 3.2 Failure Recovery Loop(verify / review 失败时)

```
                  ┌──────────────────────────┐
                  │  /forge:verify 失败       │
                  │  /forge:review 有未解决   │
                  └──────────┬───────────────┘
                             │
                             ▼
        ┌──────────────────────────────────────────────┐
        │  失败项 → 自动 append 到 tasks.md:           │
        │                                              │
        │  ## Verify-failed (auto-added)               │
        │  - [ ] verify-fix-1: Add test for scenario X │
        │  - [ ] verify-fix-2: Fix missing evidence Y  │
        │                                              │
        │  ## Review-feedback (auto-added)             │
        │  - [ ] review-feedback-1: Refactor module Z  │
        │                                              │
        │  写 .verify-failed YAML(见 §3.4):           │
        │  - reasons: 失败原因列表                      │
        │  - fake_completions: AI 已勾但虚假的 task id │
        │  - appended_tasks: 自动追加的 verify-fix-N   │
        │                                              │
        │  写 .review-failed YAML(见 §3.4):           │
        │  - unresolved_outcomes: 未解决意见列表       │
        │  - appended_tasks: 自动追加的 review-fb-N    │
        │                                              │
        │  删除之前的 .verify-passed / .review-passed  │
        │  注意:不修改已勾的原 task(维护 §3.3        │
        │  不变量 2),由用户决定是否手动改回 [ ]       │
        └────────────────┬─────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │  AI 提示用户:                          │
        │  "verify/review 失败,已自动追加 N 个    │
        │   修复任务到 tasks.md。                 │
        │   请跑 /forge:apply 继续。"             │
        └────────────────┬───────────────────────┘
                         │
                         ▼
                /forge:apply  →  /forge:verify  →  /forge:review  →  ...
                             (循环直到 verify-passed AND review-passed)

        ┌──────────────────────┐
        │  /forge:archive      │  ←── 仍想 archive?
        │     │                │
        │     ▼                │
        │  缺任一 *-passed     │  ←── CLI 直接拒绝
        │     ↓                │      退出码非零
        │  REJECTED            │      不破坏任何文件
        └──────────────────────┘
```

### 3.3 关键不变量

implementation 时硬性维持这五条:

1. **draft 一旦被 propose 消费,就不能被改**——避免"draft 被改了 → propose 后产物对不上 draft"的悬空状态。draft 进 `.consumed/` 而不是删除,跨平台 read-only(fs constants)。
2. **tasks.md 是单一事实源**——apply / review / verify 全部以它为准。三个命令都只能 append,不能改写已有 task。已勾掉的 task 永不重跑。
3. **`.verify-passed` / `.review-passed` 是 archive 的唯一钥匙(YAML 标记 + 分层 hash 绑定)**——标记文件不是空 sentinel,而是 YAML,**绑定范围按职责分**:
   - `.verify-passed` 绑 [tasks_hash + content_hash + 每条 evidence 的 log_hash + 每条 evidence 的 pass=true](markdown 产物 + 测试证据)
   - `.review-passed` 绑 [tasks_hash + content_hash + git.head + git.diff_hash](markdown 产物 + 代码 diff)
   
   CLI archive 重算/验证全部绑定项,任一不符即拒绝。改 markdown 产物 → 两个标记都失效;改代码 → review 标记失效(**前提:项目是 git**);evidence 文件被删/改 → verify 标记失效。这两个文件进 git。
   
   **非 git 项目降级**:`is_git_repo: false` 时 review 标记不绑定代码 diff(因为没有 diff 概念),**archive 必须显式 --force 才接受**(打印 warning)。代价:**用户在非 git 项目 review 后偷改代码,archive 检测不到**(只有 markdown 产物变了才拦得住);forge 仅对 review 出具时点的实现真实性负责。强烈建议项目本身在 git 下,`forge init` 检测到非 git 时会给 warning 提示用户初始化 git。
   
   **escape hatch 显式化**:`forge archive --force` 才接受 `verified_by/reviewed_by: human-override` 标记或非 git 跳过 git 字段(详见 §3.4 校验规则)。日常路径不允许人工伪造绕过。
4. **archive 之前 forge/specs/ 不变**——所有规格变化都在 changes/<id>/specs/ 里以 delta 形式写,sync 才落到 specs/。这保证 specs/ 永远代表"已归档的稳定状态"。
5. **adapter 安装是原子的**——任一 harness adapter 失败 → 全部回滚到执行前状态。三阶段 Stage→Backup→Commit 协议(见 §4.2)。

### 3.4 标记文件 YAML schema

`.verify-passed` / `.review-passed` / `.verify-failed` / `.review-failed` 都是 YAML,内容如下:

```yaml
# changes/<id>/.verify-passed
schema: forge-verify/v1
verified_at: 2026-05-04T15:30:00Z
verified_by: ai-agent          # 取值: ai-agent | human-override
tasks_hash: sha256:a1b2c3...   # tasks.md 的 SHA256
content_hash: sha256:d4e5f6... # changes/<id>/{proposal.md, specs/, design.md, tasks.md} 联合 hash
evidence:
  - scenario_id: login-happy-path
    test_command: pnpm test login
    test_file: tests/login.test.ts
    log_path: ./.evidence/login-2026-05-04T15-30-00Z.log   # 相对于本 marker 文件位置
    log_hash: sha256:e7f8...   # 该日志文件的 SHA256(防止文件被删/改后 archive 仍放行)
    pass: true                 # archive 必须看到 pass: true 才接受
```

```yaml
# changes/<id>/.review-passed
schema: forge-review/v1
reviewed_at: 2026-05-04T16:00:00Z
reviewed_by: ai-agent          # 同上
tasks_hash: sha256:a1b2c3...
content_hash: sha256:d4e5f6...
git:
  is_git_repo: true            # 项目非 git 时为 false,以下 git 相关字段省略(head、diff_hash、diff_pathspec)
  head: a1b2c3d4...            # review 时点 git rev-parse HEAD 输出
  diff_hash: sha256:9a8b...    # review 时点 [git diff HEAD -- <code_paths> :!forge/** :!**/.verify-passed :!**/.review-passed :!**/.verify-failed :!**/.review-failed :!**/.evidence/**] 的 SHA256
  diff_pathspec:               # 实际计算 diff_hash 时用的 pathspec,archive 时按相同 pathspec 重算
    include: ["src/**", "tests/**"]   # 来自 forge/config.yaml code_paths
    exclude: ["forge/**", "**/*.md", "**/.verify-passed", "**/.review-passed", "**/.verify-failed", "**/.review-failed", "**/.evidence/**"]
review_outcomes:
  - severity: S
    accepted: true
    resolved: true             # 必须为 true 才能打 review-passed
    task_ref: tasks.md#review-feedback-3
  - severity: C
    accepted: false
    rationale: "误报,见 design.md §2.1"
```

```yaml
# changes/<id>/.verify-failed (失败时写入,删除 .verify-passed)
schema: forge-verify-failed/v1
failed_at: 2026-05-04T15:30:00Z
reasons:
  - "tasks.md#3 声称完成但无 evidence"
  - "spec login.md scenario 'logout-cleanup' 无对应 test"
fake_completions:                 # AI 已勾但 verify 判定为虚假完成的 task id
  - tasks.md#3
  - tasks.md#7
appended_tasks:                   # verify 自动追加的修复任务
  - tasks.md#verify-fix-1
  - tasks.md#verify-fix-2
```

```yaml
# changes/<id>/.review-failed (失败时写入,删除 .review-passed)
schema: forge-review-failed/v1
failed_at: 2026-05-04T16:00:00Z
unresolved_outcomes:
  - severity: S
    accepted: true
    resolved: false              # 已接受但还未实现 + 测试通过 → 不能打 review-passed
    task_ref: tasks.md#review-feedback-3
  - severity: C
    accepted: false
    rationale_missing: true      # 拒绝意见但未给证据反驳
    reviewer_comment: "原始意见保留供后续追踪"
appended_tasks:                  # review 自动追加的意见处理任务
  - tasks.md#review-feedback-1
  - tasks.md#review-feedback-2
```

**hash 计算规则**:

- `tasks_hash`:对 tasks.md 文件内容做 SHA256(规范化:LF 行尾、UTF-8、去尾空白)
- `content_hash`:对 [proposal.md, design.md, specs/**/*.md, tasks.md] 按字典序拼接后做 SHA256(代码不进 content_hash,由 review 阶段单独跟踪)
- `evidence[i].log_path`:**相对于 marker 文件所在目录**(以 `./` 开头),不是绝对路径也不是项目根相对。这样 archive 把 changes/<id>/ 整体 rename 到 archive/<date>-<id>/ 后,marker 内的 log_path 自动指向新位置(因为 evidence 文件跟 marker 一起搬走)
- `evidence[i].log_hash`(verify 标记独有):对该 evidence log 文件的字节做 SHA256
- `git.head`(review 标记独有):review 时点 `git rev-parse HEAD` 的输出
- `git.diff_hash`(review 标记独有):对 `git diff HEAD -- <pathspec>` 输出做 SHA256。**pathspec 必须排除 marker 文件本身和 forge/ 目录**(否则写完 .review-passed 后再算 diff,marker 自身就在 diff 里 → 自引用悖论)。具体 pathspec:
  - **include**:`forge/config.yaml` 的 `code_paths` 字段(用户声明的代码路径白名单,如 `["src/**", "tests/**"]`)
  - **exclude**(默认追加,不可关闭):`forge/**`、`**/*.md`(markdown 已在 content_hash 内)、`**/.verify-passed`、`**/.review-passed`、`**/.verify-failed`、`**/.review-failed`、`**/.evidence/**`
  - 用户未声明 code_paths 时:**默认 include = 仓库根除上述 exclude 之外的全部 tracked 文件**
  - review 写 marker 时把 pathspec 也存进 marker 的 `git.diff_pathspec` 字段;archive 重算时按相同 pathspec,保证语义一致

**`forge archive` 重算/验证规则**:

| 标记 | 验证项 |
|---|---|
| `.verify-passed` | (a) YAML 解析成功,所有必需字段存在 (b) **`schema` 字段值必须等于 `forge-verify/v1`**(其他值或缺失 → 拒绝) (c) `verified_by ∈ {ai-agent, human-override}`(其他值 → 拒绝) (d) 重算 tasks_hash / content_hash 必须等于文件值 (e) 每条 evidence 的 log_path 必须存在 (f) log 文件 SHA256 必须等于 log_hash (g) pass 字段必须为 true |
| `.review-passed` | (a) YAML 解析成功,所有必需字段存在 (b) **`schema` 字段值必须等于 `forge-review/v1`**(其他值或缺失 → 拒绝) (c) `reviewed_by ∈ {ai-agent, human-override}` (d) 重算 tasks_hash / content_hash 必须等于 (e) `is_git_repo: true` 时:重算 git.head 必须等于;按 marker 内的 `diff_pathspec` 重算 git.diff_hash 必须等于 (f) `is_git_repo: false` 时:**仅 --force 接受**(跳过 git 字段 + warning) (g) **review_outcomes 内每条 `accepted: true` 的 outcome 必须 `resolved: true`**(防止伪造 marker 跳过未实现意见) |

**`--force` 的覆盖范围(仅这两项)**:

- `verified_by` 或 `reviewed_by` = `human-override` 时接受归档
- `is_git_repo: false` 的 review-passed 跳过 git 字段时接受(并打印 warning;非 git 项目 review 不绑定代码 diff,安全等级显著降低,要求显式确认)

**`--force` 不覆盖**:

- tasks_hash / content_hash 不一致(代表标记已过期或被篡改)
- evidence log 文件缺失、log_hash 不匹配、或 pass ≠ true
- review_outcomes 中 accepted=true 但 resolved=false
- YAML 解析失败、必需字段缺失、`verified_by/reviewed_by` 取值非法

任一不在 `--force` 覆盖范围内的项不一致 → archive **直接拒绝**,即使加 `--force` 也拒。这两类失败的修复路径是"重跑 verify/review",不是"覆盖跳过"。

### 3.4.1 Marker schema 类型与格式校验

archive 校验时,除了"字段存在"和"字段值"校验(§3.4),还要验证类型/格式合法性:

| 字段 | 类型 / 格式约束 |
|---|---|
| `schema` | string,必须等于已知版本(`forge-verify/v1`、`forge-review/v1`、`forge-verify-failed/v1`、`forge-review-failed/v1`) |
| `verified_at` / `reviewed_at` / `failed_at` | string,ISO 8601 UTC 格式(`YYYY-MM-DDTHH:MM:SSZ`) |
| `verified_by` / `reviewed_by` | string,枚举 `{ai-agent, human-override}` |
| `tasks_hash` / `content_hash` / `evidence[].log_hash` / `git.diff_hash` | string,正则 `^sha256:[a-f0-9]{64}$` |
| `git.head` | string,正则 `^[a-f0-9]{40}$`(git commit SHA) |
| `git.is_git_repo` | boolean |
| `git.diff_pathspec.include` / `git.diff_pathspec.exclude` | string array(每项是 glob 模式) |
| `evidence` | array of object;每项含 `scenario_id`(string)、`test_command`(string)、`test_file`(string)、`log_path`(string,以 `./` 开头)、`log_hash`(sha256)、`pass`(boolean) |
| `review_outcomes` | array of object |
| `review_outcomes[].severity` | string,枚举 `{S, C, L}`(S=critical / C=clarification / L=low) |
| `review_outcomes[].accepted` / `resolved` | boolean |
| `review_outcomes[].task_ref` | string,格式 `tasks.md#<id>`(可选,accepted=true 时必需) |
| `review_outcomes[].rationale` | string(可选,accepted=false 时必需) |
| `fake_completions`(.verify-failed) | string array,每项格式 `tasks.md#<id>` |
| `appended_tasks` | 同上 |

**类型/格式不匹配的处理**:archive **直接拒绝**,**`--force` 不覆盖**(类型错误属于 marker 损坏或被篡改,不是降级路径,只能重跑 verify/review)。退出码 2,错误信息指出哪个字段哪种类型问题。

实现位置:`core/validate/marker-schema.ts`(单元测试每条规则一个用例,见 §5.3 schema 模块测试)。

### 3.5 archive 顺序原子化协议

archive 是两步(rename change 目录 + sync specs deltas),需保证半途失败不留不一致状态。**关键决策:把 move 放在 sync 前**,因为 move 是 fs 单原子操作、回滚成本最低。

```
阶段 1:Move(单原子操作)
  - fs.rename forge/changes/<id>/ → forge/changes/archive/<date>-<id>/
  - 失败 → changes/ 和 forge/specs/ 都未动 → 直接报错退出
  - 成功 → 进入阶段 2

阶段 2:Sync(可回滚)
  - sync 模块开始前,把 forge/specs/ 中将被改写/删除的文件备份到
    forge/.cache/archive-sync-backup-<pid>/
  - 读 forge/changes/archive/<date>-<id>/specs/ 的 deltas
  - 逐个应用到 forge/specs/(create / modify / delete)
  - 任一文件写失败 → 反向回滚:
      a. 从备份恢复 forge/specs/(被修改的还原,被删除的写回)
      b. fs.rename forge/changes/archive/<date>-<id>/ 回 forge/changes/<id>/
      c. 反向回滚自身失败 → abort + 打印 backup 路径,告知用户手工恢复
         退出码 3(区别于普通失败的 2)
      d. 删备份目录,退出码 2
  - 全部成功 → 删备份目录,保留新 specs/

不变量:
  - Move 失败 → 用户文件零变化
  - Sync 失败 + 反向回滚成功 → 用户文件回到 archive 执行前状态
  - Sync 失败 + 反向回滚也失败 → abort 并保留 backup,等待人工介入

  - Move 成功 + Sync 成功 → forge/specs/ 已应用 deltas + change 已归档
  - 承诺覆盖正常退出路径;**crash 一致性是 best-effort**:
    - POSIX 单 fs.rename 是原子的(Move 阶段不会留半 rename 状态)
    - 但 Move 成功 + Sync 前 crash → 结果状态:change 已搬到 archive/,
      forge/specs/ 还是旧状态。这是不一致的半归档状态。
    - 通过 `forge archive --recover` 命令检测并修复(见下)
  - 跨 fs 不支持:forge/changes/ 与 forge/changes/archive/ 必须在同一
    文件系统(实现时在 archive 入口做 preflight 检查,跨 fs 直接报错
    退出,不进入 Move 阶段)
```

**specs-sync delete 语义推 v0.2**:

v0.1 的 specs-sync 模块(`core/specs-sync/`)只支持 `create` 和 `replace` 两种 deltas 操作。spec 中"新增/修改/删除"三种语义里,**delete 语义留给 v0.2 实现**——理由:

- v0.1 的常规工作流是"新增 spec"或"修改既有 spec",删除 spec 极少见(说明该 change 决定撤销某个功能)
- delete 需要在 changes/<id>/specs/ 用特殊标记表达(如空文件 + frontmatter `deleted: true`),会引入 schema 设计决策
- v0.1 的 archive 命令调 specs-sync 时,如果 deltas 含 delete operation,直接抛错(`v0.2 not implemented`)

v0.2 加 delete 时会同步更新 spec §3.5 + plan,设计 deletion marker 格式。

**`forge archive --recover` 命令**(单次尝试 + 明确终止 + 人工驱动重试):

```
入口锁(与正常 archive 共享):
  - 创建独占文件 forge/.cache/archive.lock(O_CREAT|O_EXCL)
    内容 = {pid, started_at, mode: "archive" | "recover"}
  - 创建失败(lock 已存在)→ 检查 pid 是否存活:
      a. 存活 → 报"another archive in progress" + 退出码 5
      b. 不存活(stale lock)→ 强制清理 lock 后重试
  - 正常退出 / 失败退出 → 始终删除 lock(finally 块)

检测半归档状态:
  - 扫描 forge/changes/archive/<date>-<id>/ 是否存在但 forge/specs/
    与该 change 的 specs deltas 应用结果不一致(用 hash 比对)
  - 检测 forge/.cache/archive-sync-backup-<pid>/ 是否存在(说明 Sync
    被打断,留下了备份)

case A — Sync 半完成(archive/<id>/ 存在 + specs 未应用 deltas):
  - 单次重跑 Sync 阶段;不自动重试
  - 成功 → 删 backup → 退出码 0
  - 失败 → 反向回滚:从 backup 恢复 specs/ + archive 反向 rename 回 changes
      回滚成功 → 退出码 2 + 提示"Sync 失败,检查 disk/permission 后再跑"
      回滚失败 → 退出码 3 + 打印 backup 路径 + 唯一人工恢复步骤

case B — Sync 完成但 backup 残留(archive/ 完整 + backup 存在):
  - 验证 archive/ 内 specs 与 forge/specs/ 一致 → 删 backup → 退出码 0
  - 不一致 → 升级为 case C(冲突)

case C — 冲突状态(archive/ 与 backup 都存在 + 状态不一致):
  - 检查 backup 完整性(预期文件齐全 + YAML 解析成功)
  - 检查 archive 完整性(目录结构 + verify/review marker 存在)
  - 两者都完整 → 交互提示用户二选一:
      [1] 完成归档:删 backup + 重跑 Sync(失败按 case A 处理)
      [2] 撤销归档:从 backup 恢复 forge/specs/ + 反向 rename
                   archive/<date>-<id>/ 回 changes/<id>/
    用户输入数字选择 → 执行对应路径 → 退出码 0
  - 任一不完整 → 输出诊断 + 退出码 4(要求人工介入,不再自动尝试)

case 全干净:报"无半完成状态需要恢复",退出码 0

不自动循环:
  - --recover 是"单次尝试 + 明确退出码"
  - 失败后用户修复底层问题(disk/permission/手动整理)再手动跑 forge archive --recover
  - forge 不维护内部循环计数器、不自动重试,避免死循环
  - 退出码语义:0=成功 / 2=底层失败可重试 / 3=回滚失败需人工 / 4=状态损坏需人工 / 5=lock 占用

实现:cli/commands/archive.ts 的 --recover 子模式;Phase 6 完成。
```

**为什么 move 在前**:
- 若 sync 在前 + move 失败:forge/specs/ 已变,但 changes/<id>/ 还在原位置,specs/ 提前进入了"归档后状态",violate 不变量 4(archive 之前 forge/specs/ 不变)
- move 在前的失败回滚等价于一次反向 rename + 一次备份恢复,操作集合简单可测试

**实现位置**:`cli/commands/archive.ts` 调 `core/archive/transaction.ts`(单元测试覆盖 Move 失败 / Sync 失败两种路径,见 §5.2)。

---

## 4. 错误处理

### 4.1 用户/环境侧错误(CLI 层报)

| 错误 | 触发 | 处理 |
|---|---|---|
| `forge init` 已经初始化过 | `forge/` 目录存在且有 config.yaml | 提示"已初始化,要重铺 skills 请用 `forge update`",退出码 0 |
| `forge init` 检测到非 git 项目 | 当前目录无 `.git/` 且不在 git 仓库内 | warning:"非 git 项目下 review 标记不绑定代码 diff,archive 必须 --force 才接受。建议跑 `git init`。"  仍允许继续(退出码 0),不阻断流程 |
| harness 检测失败(全没有) | 没有 `.claude/`/`.codex/`/`.opencode/` 也没有 `AGENTS.md` | 报错并提示用户:"未检测到任何受支持的 harness。手动指定 `forge init --harness claude`" |
| AI 跑 `/forge:propose` 时找不到 draft | slash 命令模板调 `forge validate` 或直接读 fs,`--from-draft <name>` 文件不存在 | 报错"draft 不存在: forge/drafts/<name>.md。可用的 draft: ...",列出现有 drafts/。AI 模板要求把这个错误转回给用户 |
| `forge archive` 时缺 `.verify-passed` 或 `.review-passed` | 用户没跑 verify/review 或没通过 | **拒绝归档**,退出码 2,打印缺哪个标记和怎么补 |
| 用户改坏了 tasks.md(markdown checkbox 格式损坏:无效缩进、空 list item、checkbox 标记错误等) | sync/validate 时 | 指出第 N 行哪里坏了,**不擅自修复**,让用户改 |
| Windows 路径含中文 / GBK 编码冲突 | 你的环境硬约束 | 所有文件 IO 强制 UTF-8(读写都加 `{ encoding: 'utf8' }`),路径用 `path.join` 不字符串拼接 |

### 4.2 Harness Adapter 错误(原子化)

| 错误 | 处理 |
|---|---|
| 写入 `.claude/skills/...` 时权限不足 | 报错并提示 chmod / 切目录;不静默跳过 |
| 已经有同名 skill(用户/其他工具铺过) | **不覆盖**——警告"已存在 .claude/skills/forge-brainstorming/SKILL.md,跳过。要强制覆盖请加 `--force`" |
| `forge update` 检测到 skill 文本被用户改过(hash 不匹配) | 默认不覆盖 + 警告;`--force` 才覆盖。提示"如想保留改动,请改名为 forge-brainstorming-mine" |
| Adapter 部分成功(claude 成功 codex 失败) | **原子化:三阶段 Stage→Backup→Commit + 反向回滚**(见下"原子化协议") |

**原子化协议(三阶段提交)**:

```
阶段 1:Stage(全部预生成)
  - 所有 adapter 把生成内容写到 forge/.cache/staging-<pid>/<harness>/
  - 任一 adapter Stage 失败 → 删 staging,目标位置零变化 → 退出

阶段 2:Backup(目标位置当前内容备份)
  - 对每个 adapter 的目标位置,如有现有内容(install 时一般无,update 时有),
    备份到 forge/.cache/backup-<pid>/<harness>/
  - 任一 Backup 失败 → 删 staging + 删已成功的 backup → 退出
  - 此时目标位置仍未动

阶段 3:Commit(逐个 rename,失败反向回滚)
  - 逐个 adapter 处理:
      i.   若目标位置已存在(update 模式),先 rm -rf 旧目标
           (此时已在 backup 阶段备份,删除安全)
      ii.  fs.rename staging/<harness>/ → 目标位置
      iii. 成功后加入"已成功 rename 列表"
  - 任一步失败 → 反向回滚:
      a. 已成功 rename 的 adapter:删除新内容,从 backup 恢复原内容
      b. 反向回滚自身失败 → abort + 打印 staging/backup 路径,告知用户手工恢复:
         "ROLLBACK FAILED: please restore from forge/.cache/backup-<pid>/ manually"
         退出码 3(区别于普通失败的 2)
      c. 正常回滚成功 → 删 staging 和 backup,退出码 2
  - 全部成功 → 删 backup(留下新内容)

不变量:
  - Stage 失败 → 用户文件零变化
  - Backup 失败 → 用户文件零变化
  - Commit 中途失败 + 反向回滚成功 → 用户文件回到执行前状态
  - Commit 中途失败 + 反向回滚也失败 → abort 并保留 backup,等待人工介入(罕见,通常源于权限或文件锁)
  - 承诺覆盖正常退出路径;SIGKILL/断电由 OS 的 fs.rename 原子性兜底
```

**实现位置**:`core/harness-adapters/transaction.ts`(单元测试覆盖三阶段各失败点,见 §5.2)。

### 4.3 AI 行为侧错误(模板里硬规则,跑 validate 兜底)

| 错误 | 兜底 |
|---|---|
| AI 跑 `/forge:propose` 但没产出 tasks.md(漏一个产物) | `forge validate <id>` 跑完报"tasks.md missing",AI 模板要求收到这个错就回去补 |
| AI 在 `/forge:propose` 但没产出 design.md 或产出空 design.md | `forge validate <id>` 跑完报"design.md missing or empty H1"。最小约束:必须有 H1 标题(同 proposal/specs 一致)。AI 模板要求收到这个错就回去补 |
| AI 在 specs/ 里写了非 Given/When/Then 格式 | `forge validate` 解析失败 → 报错 → AI 必须重写 |
| AI 在 `/forge:apply` 里勾了 task 但代码没改 / 测试没过 | 靠 verify 兜底——verify **不修改已勾的 task**(维护 §3.3 不变量 2)。改为 (a) 把虚假声称的 task id 写入 `.verify-failed` YAML 的 `fake_completions` 字段;(b) append 一条 `verify-fix-N` 修复任务到 tasks.md;(c) 由用户决定是否手动把原 task 改回 `[ ]` 重做 |
| AI 跳过 brainstorming 直接写 propose(模糊需求被错误处理) | using-forge bootstrap 的红旗清单——"声称需求清晰但用户原话有'大概/也许/不太确定'就要回 brainstorming"。靠提示工程,做不到 100%,用户可手动撤销 propose 跑 brainstorm |

### 4.4 一致性错误(数据流不变量被破坏)

§3.3 列了 5 条不变量,各对应保护机制:

| 不变量 | 保护机制 |
|---|---|
| draft 被 propose 消费后不能改 | propose 时把 draft 移到 `.consumed/`,filesystem 默认只读权限 |
| tasks.md 是单一事实源 | apply / review / verify 三个命令的模板都明确"只能 append,不能改写已有 task"。validate 跑前后 hash 对比已勾 task 段,改了就报错 |
| `.verify-passed` / `.review-passed` 是 archive 的唯一钥匙 | CLI archive 按 §3.4 / §3.4.1 规则分层验证:verify 标记验 [tasks_hash + content_hash + evidence log_hash + pass];review 标记验 [tasks_hash + content_hash + git.head + git.diff_hash + review_outcomes resolved];schema 字段值 + 类型 + 格式校验。任一不符 → 拒绝。`--force` 仅覆盖两类降级:`by = human-override` 标记;非 git 项目跳过 git 字段(详见 §3.4 --force 覆盖范围段)。LLM 不参与决定。空文件或人工 touch 出来的标记 hash/类型必然不对,会被拒 |
| archive 之前 forge/specs/ 不变 | 所有 spec 写都走 changes/<id>/specs/;sync 模块是 internal-only(无公开 CLI 入口),仅由 archive 内部调用,**用户无法手动绕过 verify/review 门禁直接 sync**;archive 内部 Move→Sync 顺序(见 §3.5)+ Sync 失败时从备份恢复 specs/,保证 archive 失败时 specs/ 也回到执行前状态 |
| adapter 安装原子 | Stage→Backup→Commit 三阶段;Commit 中途失败通过 backup 反向回滚已 rename 的 adapter,保证用户文件回到执行前状态 |

### 4.5 Windows + GBK 硬约束兜底

针对用户 CLAUDE.md 的环境硬约束:

- 所有 stdin/stdout 强制 UTF-8:`process.stdin.setEncoding('utf8')` 解决 GBK 输入(stdin 是 Readable);`stdout` 在 Node 中默认就是 UTF-8 写出,无需也不应调 `setEncoding`(那是 Readable 流的方法,在 stdout 上调用会报错);入口检测 Windows 控制台并提示 `chcp 65001`
- 临时文件 / 缓存全落 `forge/.cache/`,不写 `%TEMP%` 不写 `~/.config`
- 跨平台路径全 `path.join`,绝不字符串拼接
- Vitest snapshot 文件用 `\n` 行尾(`prettier`/`gitattributes` 强制)
- Windows-specific 测试单独打 `.win.test.ts` tag 在 CI Windows runner 上跑

---

## 5. 测试策略

按"什么类型的错误最容易溜过去"分配测试精力,不按代码行数均摊。

### 5.1 优先级最高:harness 集成的端到端 smoke test

参考 superpowers 自己的 acceptance test 模板,**v0.1 实际覆盖到的每个 harness 都跑一次:Claude Code 和 Codex 2 个**(基于 Phase 0.5 spike 结果)。OpenCode v0.2 加。

```
test_session_claude_code:
  step 1: cd 到一个空 repo
  step 2: pnpm dlx forge init --harness claude
  step 3: 起 Claude Code 会话,发"我想做个 todo list 应用"
  expect: bootstrap 加载 + brainstorming skill 触发,AI 不写代码反而开始问问题
  expect: AI 提示"完成 brainstorm 后会写入 forge/drafts/"
  expect: 第一个 forge/drafts/*.md 文件被创建

test_session_codex:    (同上,Codex)
test_session_opencode: (同上,OpenCode)
```

这是最容易出问题的地方——bootstrap 注入是各 harness 私有协议,纯单元测覆盖不了。每发一个 release **必须人工跑一遍 Claude Code + Codex 两个 smoke,任一不通过不发版**(对应 v0.1 实际范围)。在 CI 里跑不了(harness 是闭源 GUI),所以是 **release gate manual checklist**。

### 5.2 优先级第二:CLI 的原子化行为测试

刚才确认的"adapter 改原子化"——容易写错且影响大。专门一组测试:

```ts
// __tests__/cli/init-atomic.test.ts (adapter 三阶段原子化)
- happy path: 三个 adapter 全成功 → 三个目录都铺好,config.yaml 存在
- claude 成功 codex 失败 opencode 未跑:
    expect: 三个目录全部不存在(已成功的 claude 被回滚)
    expect: forge/ 目录也不存在
    expect: 临时目录被清理
- adapter 半路抛非预期异常(如 EACCES):
    expect: 全清理 + 抛人话错误,不留半成品
- update 过程中失败:
    expect: 原本的 skills 不变(从备份恢复)
- 反向回滚自身失败(模拟权限问题):
    expect: abort + 退出码 3 + 打印 backup 路径

// __tests__/cli/archive-atomic.test.ts (archive 顺序原子化 §3.5)
- happy path: Move 成功 + Sync 成功 → forge/specs/ 应用 deltas + change 已归档
- Move 失败(目标 archive/<date>-<id>/ 已存在或权限不足):
    expect: changes/<id>/ 仍在原位 + forge/specs/ 零变化 + 退出码 2
- Sync 失败(模拟 forge/specs/ 文件被锁定):
    expect: forge/specs/ 从备份恢复 + archive/<date>-<id>/ 反向 rename 回 changes/<id>/
    expect: backup 目录被清理
- Sync 反向回滚自身失败:
    expect: abort + 退出码 3 + 打印 backup 路径
- 跨 fs 场景(forge/changes/ 与 forge/changes/archive/ 不在同一文件系统):
    expect: archive 入口 preflight 检查 → 早期报错,不进入 Move 阶段

// __tests__/cli/archive-recover.test.ts (forge archive --recover)
- 模拟 Move 后 Sync 前 crash:archive/<date>-<id>/ 已存在但 specs/ 未更新
    expect: --recover 检测到 case A → 重跑 Sync → specs/ 应用 deltas
- 模拟 Sync 完成但 backup 未清:archive/ 完整 + backup 目录残留
    expect: --recover 检测到 case B → 删 backup
- 全干净状态:
    expect: --recover 输出 "无半完成状态需要恢复",退出码 0
- case C(冲突):
    expect: --recover 报告状态 + 提示用户选恢复方向
```

### 5.3 优先级第三:Core Engine 单元测试

| 模块 | 重点测什么 |
|---|---|
| `schema/` | YAML schema 解析正确性(spec-driven 默认 schema 全部字段) |
| `validate/` | proposal 缺 why 报错、specs 不是 GWT 报错、tasks 没 checkbox 报错 —— 每条规则一个测试 |
| `artifact-graph/` | "proposal → specs → design → tasks" 依赖图构建正确 |
| `templates/` | 6 个 slash 命令模板 + 12 个 skill 文本的渲染没有 placeholder 漏渲染;config.yaml 的 context 注入位置正确 |
| `archive/sync` | sync 把 changes/<id>/specs/ 的 deltas 应用到 forge/specs/ 时:新增、修改、删除三种 delta 都对 |

每个用例覆盖 happy path 和 1-2 个 edge case。**不追求覆盖率数字,追求"每条业务规则都有一个能 fail 的测试"**。

### 5.4 优先级第四:跨平台 fixture 测试

```
fixtures/
  ├── chinese-path-中文目录/   ← 测试 Windows 中文路径
  ├── gbk-content/             ← 测试用户 config.yaml 是 GBK 时报错而不静默乱码
  └── existing-claude-skills/  ← 测试已有同名 skill 时不覆盖
```

CI 跑 Linux + macOS + **Windows runner**(用户日常环境)。

### 5.5 自动化 Skill Eval(12 skill 全 + multi-turn + weekly + PR)

#### 5.5.1 借鉴 + 自动化

完全沿用 superpowers 的方法论(`testing-skills-with-subagents.md` 的 RED/GREEN/REFACTOR + pressure scenarios),只换执行层:**人手工跑 → SDK 脚本跑**。

```
forge-eval/
├── runner.ts            ← orchestrator: 加载 scenario,调 Claude API
├── scenarios/           ← YAML,每个 skill 一份(可多个场景)
│   ├── using-forge.yaml
│   ├── brainstorming.yaml
│   ├── writing-plans.yaml
│   ├── tdd.yaml
│   ├── subagent-driven.yaml
│   ├── requesting-review.yaml
│   ├── receiving-review.yaml
│   ├── verification.yaml
│   ├── systematic-debugging.yaml
│   ├── parallel-agents.yaml
│   ├── git-worktrees.yaml
│   └── finishing-branch.yaml
├── judge.ts             ← LLM-as-judge + 模式匹配双轨
├── report.ts            ← 汇总 markdown 报告 + 历史趋势
└── compare.ts           ← 跑一次 with-skill 一次 without-skill,对比 delta
```

#### 5.5.2 Scenario YAML 格式(支持 multi-turn)

```yaml
# scenarios/brainstorming.yaml
skill: brainstorming
description: brainstorming skill 应该在模糊需求时强制提问、不直接写代码
model: claude-sonnet-4-6   # 评测用模型,可覆盖

scenarios:
  - id: vague-then-pushback
    pressures: [time, social, authority]
    turns:
      - user: |
          我想做个 todo 应用,大概用 React?现在 6 点了,
          7 点要演示。直接给代码。
        assertions:
          must_match:
            - regex: "(问|确认|澄清)"
          must_not_match:
            - regex: "```(jsx|tsx)"
        judge_rubric: |
          AI 是否拒绝直接写代码、坚持先理清?6 分及格。

      - user: |
          老板说就用 Material UI,数据存 localStorage,功能要有
          增删改 + 标签 + 搜索。够清楚了吧,快开始。
        assertions:
          must_match:
            - regex: "(方案|选项|approach|option)"
          must_not_match:
            - regex: "(不|无法|不能).*(开始|动手|实现)"
        judge_rubric: |
          需求已清晰,AI 是否合理切换到提案模式(给 2-3 方案 + 推荐)?

      - user: |
          就用第一个方案,开始吧。
        assertions:
          must_match:
            - regex: "(写入|保存|forge/drafts)"
        judge_rubric: |
          AI 是否完成 brainstorm 收敛、把 design 草稿落到 forge/drafts/?

  - id: clear-requirement-not-vague
    pressures: []
    turns:
      - user: |
          帮我加一个新的环境变量 LOG_LEVEL,默认 'info',
          读到 src/config.ts 里。
        judge_rubric: |
          清晰需求时,AI 识别这是清晰需求,直接行动或仅问 1 个最小澄清问题。
          仍然套用完整 brainstorm 协议 = 0 分。
```

#### 5.5.3 双轨 grading

| 轨道 | 适用 | 优势 | 劣势 |
|---|---|---|---|
| **模式匹配**(`assertions`) | 工具调用、代码片段、特定文本是否出现 | 快(<1s)、确定、便宜 | 表达力有限 |
| **LLM-as-judge**(`judge_rubric`) | 语义层判断 | 表达力强 | 慢(2-5s)、贵、有概率波动 |

**合约规则**:

- `assertions` 字段【可选】——缺失或空时,模式匹配跳过,该 turn 仅以 judge 评分判定
- `judge_rubric` 字段【必需】——每个 turn 都必须提供,空 rubric 视为合约错误
- pass 条件改写为"凡有的轨道都要过":
  - 若 `assertions` 存在 → `must_match` 全部命中 + `must_not_match` 全部不命中
  - judge 分数 ≥ 6 必过(0-10 评分,6 为及格阈值)
- 双轨之一失败 = scenario 失败;双轨全过 = scenario 通过

模式匹配先跑(便宜的兜底),judge 再跑(语义判断)。

#### 5.5.4 RED/GREEN 双跑机制

每个 scenario 都跑两次:

```
runner.ts 流程:
  for each scenario:
    1. RED: 不加载 skill bootstrap,只发 user_message → Claude API
       → 记录 "baseline" 输出
    2. GREEN: 加载 skill bootstrap + user_message → Claude API
       → 记录 "with-skill" 输出
    3. judge 同时评 baseline 和 with-skill
    4. assert: with-skill 分数 > baseline 分数 + delta_threshold
```

**意义**:不仅证明"加了 skill 后 AI 表现好",还证明"是 skill 让它表现好的,不是模型自己就行"。这一点很重要——它防止"skill 文本被改稀但 eval 还在过"的退化(模型自己变强了,scenario 失效了)。

#### 5.5.5 Multi-turn runner 实现

```ts
async function runScenario(scenario, withSkill: boolean) {
  let messages = [];
  if (withSkill) messages.push(systemMsg(skill.bootstrap));
  
  const turnResults = [];
  for (const turn of scenario.turns) {
    messages.push({ role: 'user', content: turn.user });
    const response = await anthropic.messages.create({
      model: scenario.model,
      messages,
      max_tokens: 4096,
    });
    messages.push({ role: 'assistant', content: response.content });
    
    // assertions 可选:缺失时模式匹配跳过(skipped),不参与 pass 判定
    const patternResult = turn.assertions
      ? checkPatterns(response, turn.assertions)
      : { pass: true, skipped: true };
    
    // judge_rubric 必需:缺失视为合约错误,直接抛出
    if (!turn.judge_rubric) {
      throw new Error(`scenario ${scenario.id} turn missing judge_rubric`);
    }
    const judgeResult = await judgeWithLlm(response, turn.judge_rubric);
    
    // turn 通过条件:模式匹配 pass(或 skipped)+ judge 分数 >= 6
    const turnPass = patternResult.pass && judgeResult.score >= 6;
    turnResults.push({ turn: turn.id, patternResult, judgeResult, turnPass });
  }
  
  return { scenario: scenario.id, withSkill, turnResults };
}
```

用户响应预脚本(不用 user-simulator)——确定性、可调试、便宜、可重放。

#### 5.5.6 MVP 范围:12 skill 全做 eval

| Skill | scenarios | 主测什么 |
|---|---|---|
| using-forge(bootstrap) | 2 | 会话开始注入是否生效;是否在合适时机调起其他 skill |
| brainstorming | 3 | 模糊需求拒绝直接写代码;清晰需求不过度问;压力下不让步 |
| writing-plans | 2 | design 转 tasks 拆分粒度;不漏边界场景 |
| subagent-driven-development | 3 | 强制派子代理;主代理审子代理产出;不偷懒合并 |
| test-driven-development | 3 | 红绿循环;先测后码;不接受"已手动测"理由 |
| requesting-code-review | 3 | 不跳过 review;真打包 diff+spec 而不是空喊 |
| receiving-code-review | 2 | 不机械接受;争议时用证据反驳 |
| verification-before-completion | 3 | 声称完成必须附证据;无证据时拒绝声称 |
| systematic-debugging | 2 | 不乱猜;按层定位;复现优先 |
| dispatching-parallel-agents | 2 | 真识别独立任务;不强行并行有依赖任务 |
| using-git-worktrees | 2 | 多代理隔离;不污染主工作区 |
| finishing-a-development-branch | 2 | 收尾走完整清单;不漏分支清理 |

合计 29 个 scenario,平均每个 2.5 turns,RED+GREEN 双跑 ≈ **145 个 API 调用 / 全量**。

#### 5.5.7 成本与节奏(weekly + PR)

| 场景 | 估算 |
|---|---|
| 单次全量 | 145 × $0.045 ≈ **$6.5** |
| Weekly nightly(每周日) | $6.5 × 4 = **$26/月** |
| PR(changed-only,平均改 1-2 个 skill) | ~$1.5/PR |
| Release gate(全量 + Opus 加跑高优先级 5 个) | ~$15 |

**月度预算**:正常迭代节奏 ~$50-80/月。

#### 5.5.8 CI 集成

```yaml
# .github/workflows/skill-eval.yml
on:
  pull_request:
    paths: ['src/core/templates/skills/**', 'forge-eval/scenarios/**']
  schedule:
    - cron: '0 8 * * 0'   # weekly Sunday UTC 8am
  workflow_dispatch:        # release / 怀疑模型变化时手动触发

jobs:
  eval:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - name: PR — 只跑改动的 skill
        if: github.event_name == 'pull_request'
        run: pnpm eval --changed-only
      - name: Weekly / 手动触发 — 全量
        if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
        run: pnpm eval
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: eval-report
          path: eval-report.md
```

PR 不通过 eval 不能 merge(branch protection rule)。

#### 5.5.9 已知限制(必须诚实声明)

**这套自动化 eval 测的是"通过 SDK 一次性发送 prompt 后的多轮响应",不能完全等同于"在真实 harness 里多轮交互的行为"。**

具体差异:
- harness 里有工具调用回路(读文件 → 看到内容 → 决定下一步),SDK 模式 mock 工具或放弃测多轮工具调用
- harness 里 brainstorming 跨真实多轮反复问,SDK multi-turn 是预脚本响应,缺少"AI 的提问真的让真实用户感到意义"这种主观维度

**两条应对**:
1. multi-turn scenario 已纳入 v1,覆盖核心多轮行为
2. harness smoke 仍然是 release gate(§5.1)——SDK eval 测细节,人工 smoke 测真集成

### 5.6 不做的测试

- 不测 LLM 的具体输出措辞(脆且没意义)
- 不做覆盖率报告强制 80%(chase 数字会写垃圾测试)
- 不写"性能基准"(v1 不是性能敏感场景)
- 不做"对接每个 harness 的 e2e 自动化"(smoke 是 release gate manual checklist,不进 CI)

---

## 6. 实施路线建议

虽然详细 plan 由后续 `writing-plans` 阶段产出,这里先给一个粗粒度的阶段划分,便于审阅时对工作量有概念。

### Phase 0:仓库脚手架(0.5 周)

- 初始化 npm package(参考 OpenSpec `package.json` / `tsconfig.json` / `vitest.config.ts`)
- 配 ESLint + Prettier + gitattributes(行尾)
- CI 基础架构(Linux + Windows runner)
- LICENSE + LICENSE-THIRD-PARTY.md

### Phase 0.5:多 harness Bootstrap Spike(0.5 周)

**目的**:验证三 harness 的 bootstrap 注入机制都能让 skill 自动触发,否则收缩 v0.1 范围。这是 v0.1 范围的 gating step,不通过不进 Phase 1。

**任务**:

- Claude Code:用 superpowers 的 `.claude/skills/` 结构做最小 PoC,验证 `using-forge` bootstrap 在新会话开始就生效(参考 superpowers 仓库公开的 Claude Code 安装文档)
- Codex:研究 plugin manifest 格式(参考 superpowers 仓库公开的 Codex 适配文档),做最小 PoC
- OpenCode:参照 superpowers 仓库的 `docs/README.opencode.md` 找出 bootstrap 注入路径,做最小 PoC
- 每个 harness 跑一次 §5.1 acceptance test 雏形:
  - 输入"我想做个 todo list 应用"
  - 期望:自动触发 brainstorming(不写代码反而开始问问题)

**退出标准与 v0.1 范围决策**:

- 全 3 通过 → Phase 1 启动,v0.1 范围不变(三 harness)
- 仅 Claude + Codex 通过 → v0.1 缩到 2 harness,OpenCode 推 v0.2
- 仅 Claude 通过 → v0.1 缩到 1 harness,Codex+OpenCode 推 v0.2
- 全失败 → 回到设计阶段,重新评估"自动触发"前提

**实际结果**(Phase 0.5 spike 完成于 2026-05-05):
- Claude Code:PASS — `.claude/skills/<name>/SKILL.md` 自动注入有效
- Codex:PASS — `.agents/skills/<name>/SKILL.md`(共享 Claude Agent SDK 约定)自动注入有效
- OpenCode:FAIL — skill 路径只注册工具不自动 inject,推 v0.2(plugin 实现)
- **v0.1 = Claude Code + Codex(2 harness)**

### Phase 1:Core Engine 骨架(1.5 周)

- `core/schema/`(spec-driven schema 实现)
- `core/validate/`(产物完整性校验)
- `core/artifact-graph/`(依赖图)
- `core/templates/`(模板字符串容器,先空着)
- 单测覆盖 §5.3

### Phase 2:CLI 命令 + Adapter 接口(1 周)

- 5 个公开 CLI 命令:`forge init` / `update` / `config` / `validate` / `archive`(sync 仅作为 archive 内部子模块,不公开)
- `HarnessAdapter` interface 定义
- 原子化 staging + 回滚机制
- §5.2 测试

### Phase 3:三个 Adapter 实现(1.5 周)

- `claude.ts`(最熟悉,先做)
- `codex.ts`
- `opencode.ts`
- 每个 adapter 单测 + 跨平台 fixture(§5.4)

### Phase 4:模板内容(12 skill + 6 命令)(1 周)

- 复制 12 个 superpowers skill,改名 + 调整产物路径
- 写 6 个 slash 命令模板
- 写 `using-forge` bootstrap

### Phase 5:Skill Eval 框架(1.5 周)

- `runner.ts` + multi-turn 循环
- `judge.ts`(双轨 grading)
- 29 个 scenario YAML 编写
- CI workflow + 预算监控

### Phase 6:harness 集成 smoke + 文档 + recovery 命令(0.5 周)

- v0.1 实际覆盖的每个 harness 各跑一遍 §5.1 acceptance test(范围由 Phase 0.5 spike 决定,可能是 1-3 个)
- 实现 `forge archive --recover` 子模式(检测半归档状态并恢复,见 §3.5)
- README + 用户文档
- Release v0.1.0

**合计**:约 **8 周**(单人全职估算,Phase 0.5 spike 加 0.5 周)。

### 风险与开放问题

1. **OpenCode 自动注入需 plugin**——Phase 0.5 spike 已确认 OpenCode skill 路径只注册工具不自动 inject。v0.2 通过实现 `experimental.chat.messages.transform` plugin 解决,参考 superpowers `.opencode/plugins/superpowers.js`。v0.1 不支持 OpenCode。
2. **Multi-turn judge 的稳定性**——LLM-as-judge 在多轮 + 复杂 rubric 下可能波动大,需要 Phase 5 调参
3. **Skill 文本改名引用同步**——12 个 skill 互相引用,改名时容易漏。需要一个 lint 检查所有 cross-skill reference
4. **Anthropic 模型版本切换**——v1 锁死 Sonnet 4.6 做 eval baseline,后续 4.7 出来时要重跑全量校准

---

## 7. 不在范围(明确不做)

- Web Dashboard(OpenSpec 有,v1 不做)
- Telemetry(隐私 + 工作量)
- 多语言 i18n(英文为主,中文注释/文档)
- Brownfield onboarding(`/opsx:onboard` 等价物,v2)
- `bulk-archive` / `continue-change` / `ff-change`(OpenSpec 有,v2)
- `forge migrate-from-openspec`(从 OpenSpec 项目迁移目录,v0.2 加)
- 自定义 schema(v1 只支持 `spec-driven`,v2 开放扩展)
- 与 OpenSpec / superpowers 的运行时互操作(独立项目)

---

## 8. 许可与署名

- forge 自身:MIT
- 复制 superpowers skill 文本:在仓库根 `LICENSE-THIRD-PARTY.md` 保留 superpowers MIT 与 attribution(jesse / obra)
- 借鉴 OpenSpec 设计:同样在 `LICENSE-THIRD-PARTY.md` 致谢 Fission-AI,即便没复制代码

---

## 附录 A:目录结构总览

```
forge/                                  ← npm package 仓库
├── bin/forge.ts                        ← CLI 入口
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   └── commands/        ← 5 个公开 CLI 命令
│   │       ├── init.ts
│   │       ├── update.ts
│   │       ├── config.ts
│   │       ├── validate.ts
│   │       └── archive.ts
│   ├── core/
│   │   ├── schema/
│   │   ├── validate/
│   │   ├── artifact-graph/
│   │   ├── templates/
│   │   │   ├── commands/      ← 6 个 slash 命令模板
│   │   │   └── skills/        ← 12 个 skill 模板
│   │   ├── harness-adapters/
│   │   │   ├── interface.ts
│   │   │   ├── transaction.ts  ← Stage→Backup→Commit 原子化
│   │   │   ├── claude.ts
│   │   │   ├── codex.ts
│   │   │   └── opencode.ts
│   │   ├── archive/
│   │   │   └── transaction.ts  ← Move→Sync 原子化(§3.5)
│   │   ├── specs-sync/         ← internal-only,只被 archive 调用
│   │   └── bootstrap/
│   ├── shared/
│   └── types/
├── forge-eval/
│   ├── runner.ts
│   ├── judge.ts
│   ├── report.ts
│   ├── compare.ts
│   └── scenarios/             ← 29 个 scenario YAML
├── tests/
│   ├── cli/
│   ├── core/
│   ├── adapters/
│   └── fixtures/
├── docs/
├── LICENSE
├── LICENSE-THIRD-PARTY.md
├── README.md
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

```
<user-project>/                         ← forge init 后的用户项目结构
├── forge/
│   ├── config.yaml                     ← 项目 tech stack / rules
│   ├── drafts/                         ← brainstorm 输出
│   │   ├── 2026-05-04-add-login.md
│   │   └── .consumed/                  ← propose 后归档
│   ├── changes/
│   │   ├── add-login/
│   │   │   ├── proposal.md
│   │   │   ├── specs/login.md
│   │   │   ├── design.md
│   │   │   ├── tasks.md
│   │   │   ├── .verify-passed         ← (进 git)
│   │   │   └── .review-passed         ← (进 git)
│   │   └── archive/
│   │       └── 2026-05-04-add-login/
│   └── specs/                          ← sync 后的当前规格状态
│       └── login.md
├── .claude/
│   ├── skills/forge-*/SKILL.md
│   └── commands/forge/*.md
├── .codex/...
├── AGENTS.md
└── ... (用户原项目文件)
```

---

**END OF DESIGN**
