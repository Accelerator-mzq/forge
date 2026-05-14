---
title: Getting Started v1.1 重写 design spec
date: 2026-05-14
status: codex-r4-CONVERGED
revision_history:
  - v1 brainstorm-complete: initial design
  - v2 revised-after-codex-r1: 7 内容真问题 + 4 精度/注释修复
  - v3 revised-after-codex-r2: 11 真问题(含 1 Critical B-3 freeze staging 前置)+ 2 措辞精度
  - v4 revised-after-codex-r3: 5 Major(协议权威 + lifecycle 矛盾 + CLI 计数 + Apply 行数 + 行数上限)+ 2 Minor
  - v4.1 codex-r4 CONVERGED: 0 Critical + 0 Major + 3 Minor;顺手修 B-r4-1(行号 185→182)+ B-r4-2(§4 marker 措辞软化);B-r4-4(Apply 篇幅)留 implementation 阶段处理(2026-05-14)
target_artifact: docs/getting-started.md
deliverable_lines: 600-870
author: msc + Claude (brainstorming skill) + Codex r1/r2/r3 adversarial review
---

# Getting Started v1.1 重写 design

## 1. 背景与动机

forge-repo 当前 `package.json` 版本 `1.1.0`(2026-05-14 tag),但用户文档严重落后:

- `README.md` 通篇 "v0.3.0 release 候选",仍写 6 slash 命令 + 12 skill。
- `docs/getting-started.md` 7 步流程基于 v0.3:以 deprecated `forge init` 为主初始化路径(v1.1 仍可用但 deprecated,计划 v1.2 移除,沿 `src/cli/commands/init.ts:28-38`),不提 v1.0+ 新增能力。
- v1.0 fusion completion(plan-9a 到 plan-9j)+ v1.1 polish 新增的 `explore` / `ack 两步协议` / `verify 三维 + process_evidence freeze` / `fluid pause` / `preflight branch-check` / `三级 archive fence` / `handoff_to_backlog` 等能力,**在用户文档零提及**。

> **CHANGELOG forward 措辞警示**(Codex r2 Finding B-7):`CHANGELOG.md:57+75` 写 "`forge verify` CLI + LLM-judge 路径" 是历史措辞;实现以 `commands/verify.md` slash + `forge validate` + skill 组合为准(`src/cli/index.ts:6-18` 未注册 verify CLI)。spec 实施 + getting-started 写作时**不以 CHANGELOG 字面为权威**。

实际 v1.1 surface(已在 forge-repo 验证):

- `commands/` 9 个:`ack-confirm` / `apply` / `archive` / `brainstorm` / `explore` / `propose` / `review` / `upgrade` / `verify`
- `skills/` 16 个(排除 `_shared`):`brainstorming` / `dispatching-parallel-agents` / `exploring` / `finishing-a-development-branch` / `process-evidence` / `receiving-code-review` / `requesting-code-review` / `subagent-driven-development` / `systematic-debugging` / `test-driven-development` / `using-forge` / `using-git-worktrees` / `verification-before-completion` / `verifying-three-dimensions` / `writing-plans` / `writing-skills`
- `src/cli/commands/` 13 个 .ts:`ack` / `archive` / `config` / `evidence` / `finding` / `init` / `legacy-bridge` / `migrate` / `preflight` / `scope` / `update` / `upgrade` / `validate`(无 `verify.ts` — `/forge:verify` 经 slash 命令 + `forge validate` + skill 组合实现)

结论:**新用户拿现 getting-started 等于拿 v0.3 地图开 v1.1 的车**,这是本 spec 要解决的核心问题。

## 2. Brainstorm 决策记录

四个 clarifying 通过 AskUserQuestion 收到的回答:

| Q | 决策 |
|---|---|
| Q1 目标读者 | **纯新用户**(从零跑通,非 v0.3 升级用户、非 contributor) |
| Q2 范围策略 | **主线 + 自然出现处嵌入示范小段**(explore/ack/pause/preflight 不独立成章) |
| Q3 位置策略 | **直接重写 `docs/getting-started.md`**(不并存 docs/workflow.md) |
| Q4 深度调性 | **详尽教学**,500-700 行,每个嵌入场景完整 walkthrough |

三个 approach 选择 **A:严格线性 + 嵌入式插叙**(对照 B 两遍法 / C 场景驱动)。

## 3. 文档结构(Section 1 落地)

### 3.1 文件 / 编码

- **路径**:`forge-repo/docs/getting-started.md`(直接覆盖现 v0.3 版)
- **长度目标**:600-870 行(Codex r3 Finding B-r3-7 修:上限 800 → 870,因 Apply 章 record-tdd + four-option pause 实际需要更多空间;Codex r1 Finding 9 + r3 Finding B-r3-2 累积校准);§5/§6 deep-dive 链外可压到 750;超 870 触发拆分讨论
- **编码**:UTF-8 无 BOM,LF 换行(跟 repo 现有文档一致)
- **markdown 风格**:CommonMark + GitHub-flavored;不依赖 HTML(`<details>` 折叠改为 `> 💡 深入:` 引语块)

### 3.2 整体形态

```
# Forge Getting Started(v1.1 端到端工作流)
> 一行价值主张

## 在你开始前
## TOC(顶部目录,长文必备)

## 第 0 步 — 安装
## 第 1 步 — Brainstorm 出 draft
## 第 2 步 — Propose 出 4 件套       [嵌入 explore deep-dive]
## 第 3 步 — Apply 实施              [嵌入 preflight + fluid pause]
## 第 4 步 — Review                  [嵌入 ack 两步协议]
## 第 5 步 — Verify 三维             [章节主体即 deep-dive]
## 第 6 步 — Archive 三级 fence      [章节主体即 deep-dive]

## 出问题怎么办
## 与 superpowers plugin 共存
## 接下来
```

### 3.3 关键设计点

1. **§0 安装独立成章** — v0.3 版把"安装"和"开始干活"混在一节,新版分离,降认知负担。
2. **§1-6 跟 6 个核心 slash 命令 1:1 映射** — 读者读完后命令记忆链条天然形成。
3. **嵌入式 deep-dive 用 `> 💡 深入:` 引语块**(不用 `<details>` 折叠) — markdown 编辑器渲染稳定、终端阅读清晰、不依赖 HTML 渲染。
4. **brownfield / OpenCode / Codex / 协议设计**从主文档剥离,只在 §"接下来"留链(跟 Q1 纯新用户决策一致)。
5. **`forge init` 在 §0 处理**(Codex r1 Finding 3 修):v1.1 仍可用但 deprecated(v1.2 移除,见 `src/cli/commands/init.ts:28-38`);§0 主推 plugin 路径,**只在末尾用一行 `> 注:legacy projects 仍可 forge init,v1.2 移除` 留 fallback 提示**,不展开。

## 4. 章节大纲(Section 2 落地)

| § | 章节 | 目的 | 关键 surface | 行数预估 |
|---|---|---|---|---|
| 0 | 安装 | 拿到能跑 forge 的 Claude Code 会话 | Tier 1 plugin 路径(`/plugin marketplace add` + `install` + `/reload-plugins`)、git init 前置、`/exit` 重启 session、装完看到 16 skill + 9 slash 命令 | 50-70 |
| 1 | Brainstorm | 触发 `forge:brainstorming` skill,产 `forge/drafts/<date>-<topic>.md` | "我想做 X" → AI 反问 2-3 轮 → 写 draft → commit | 50-60 |
| 2 | Propose | draft 转 4 件套(proposal/specs/design/tasks) | `/forge:propose <id> --from-draft ...` → `forge:writing-plans` scale-aware mode(<200 行 → light / 否则 full)→ `forge/changes/<id>/{proposal,specs,design,tasks}.md`;**嵌入** `/forge:explore` 不确定时先探路 | 70-90 |
| 3 | Apply | 派子代理 TDD 实施每个 task | `/forge:apply` → invoke subagent-driven-development + test-driven-development → fresh 子代理 red→green→refactor → **每个 task 完成 AI 调 `forge evidence record-tdd` 记录 red/green/refactor 证据到 `.evidence/process-evidence.staging.yaml`**(Codex r2 Finding A-5/B-3 修:freeze 必须前置 staging);主代理回写 tasks.md;**嵌入 1** `forge preflight branch-check` 防误改 main;**嵌入 2** Fluid Pause Decision Point(Codex r2 Finding A-7/B-2 修 — 用户视角明确化):AskUserQuestion 四选项(1=扩本 change scope / 2=加 task 进本轮 / 3=转 out-of-scope[必填 `non_blocking_rationale`]/ 4=Other[必填 `other_rationale` + `other_acked_by`])→ 用户选 → AI 会记录该 pause decision(内部 marker 写入时机存在已知 forge doc bug,见 §9.0;**用户不手动操作 marker**)— 沿 `commands/apply.md:82-85,117-131`+`skills/subagent-driven-development/SKILL.md:333-339`(Codex r4 Finding B-r4-2 修:措辞软化避免与 §9.0 lifecycle 矛盾段冲突);**注**:`record-tdd` 等 helper 是 AI 自动调用,用户不需手敲(Codex r2 Finding B-4 修);**helper 权威来源**:`commands/apply.md:179-182` + `src/cli/commands/evidence.ts:152/348/474/602`(`commands/review.md` / `commands/verify.md` 缺该 helper 引用是 doc bug,见 §8 follow-up — Codex r3 Finding B-r3-1 修)| 140-170 |
| 4 | Review | 派 review 子代理 + 主代理判 accept/reject | `/forge:review` → 子代理审 [proposal+specs+design+diff] → 主代理逐条 accept/reject → **review 结束 AI 调 `forge evidence record-review` 记录 review 证据到 staging**(权威:apply.md:179-185 helper list,review.md 未引用是 doc bug);接受意见 append tasks.md → 三条件全满足写 `.review-passed`;**嵌入**(Codex r1 Finding 1 修):WARNING finding(AI 主判,severity=WARNING)走 `forge ack propose --action ack-warning` → 用户审 → `forge ack confirm/reject` 两步协议;**CRITICAL finding(工具客观判定)必修,不能 ack 降级**(沿 `skills/receiving-code-review/SKILL.md:230 + 263`)| 100-120 |
| 5 | Verify 三维 | syntax / semantic / process 三维 + LLM-judge + evidence record→freeze | `/forge:verify` → slash command 走:invoke verification-before-completion → 跑 `forge validate <id>` → 跑用户测试套(读 `forge/config.yaml` 的 `test.test_command`,**不是** `context.test_command`,沿 `src/core/schema/types.ts:83`+`src/core/archive/fence.ts:146` — Codex r2 Finding A-6 修)→ invoke verifying-three-dimensions skill 产 Completeness/Correctness/Coherence findings → 写 `.verify-passed` 含 evidence log_hash → **AI 调 `forge evidence record-verify` 记录测试/验证证据到 staging**(权威:apply.md:179-185 helper list,verify.md:107-123 未显式提 record-verify 前置是 doc bug)**→ 跑 `forge evidence freeze <id> --kind verify` 把 staging 凝固到 `marker.process_evidence`**(Codex r2 Finding A-5/B-3 修 — Critical 阻塞:沿 `src/cli/commands/evidence.ts:47/152/348/474/602`,staging 缺失 freeze 会 exit 1 + 提示"必须先调 record-*");`forge finding hash` helper(JCS SHA256);LLM-judge 在哪一维参与 | 100-130 |
| 6 | Archive 三级 fence | 严格校验 + 落归档 + handoff_to_backlog | `/forge:archive` → 校验 marker schema + hash + git integrity → 三级 fence:critical 硬墙 / warning ack / suggestion soft → handoff_to_backlog 三类聚合 → 调 finishing-a-development-branch skill 提示 git 后续 | 70-90 |
| — | 出问题怎么办 | 高频故障对照表 | bootstrap 没生效 / archive 拒绝 / verify 三维失败 → cli-reference 链接 | 40-50 |
| — | 与 superpowers plugin 共存 | 保留现 v0.3 内容微调到 v1.1 | 命名空间隔离 + 显式 `/forge:*` / 关 superpowers 两种方案 | 30-40 |
| — | 接下来 | 进阶分流 | cli-reference / harness-setup / migration / specs | 15-25 |

**合计**:~665-855 行(Codex r3 Finding B-r3-2 修后:§3 Apply 110-140 → 140-170)。落 600-870 区间(§3.1 上限调到 870);**§5/§6 deep-dive 链外 spec 设计文档可压回 750-800 内**;若实施时仍超 870,触发 §3.1 拆分讨论。

## 5. 呈现模板 + AI 交互写法(Section 3 落地)

### 5.1 每章 5 段统一模板

```markdown
## 第 N 步 — <名字>

### 你要做的(1-2 句)
<目的 + 一句 CLI / prompt 起点>

### 准确操作
` ``bash 或 文本 fence
<完整可复制命令 / 在 Claude Code 会话发的字面 prompt>
` ``

### 期望发生(✅ 表示 forge 工作正常)
- ✅ AI invoke `forge:<skill>` skill
- ✅ <文件 / marker / commit>
- ✅ <下一句 prompt 提示>
> ❌ 如果 X → 看 §出问题怎么办 第 N 条

### 嵌入 deep-dive(仅 §2/§3/§4 有)
> 💡 **深入:<主题>**
> <2-4 段实例 walkthrough>

### 确认(读者可独立 verify)
` ``bash
ls forge/<path>/
cat forge/changes/<id>/.<marker>
` ``
```

### 5.2 AI 交互写法约定

| 场景 | 写法 |
|---|---|
| 字面 prompt | ` ```` 围栏 + 首行 `# 在 Claude Code 会话里:` 注释 |
| 期望 AI 调 skill | `- ✅ AI invoke \`forge:<skill-name>\` skill` |
| 期望 AI 写文件 | `- ✅ 创建 \`forge/<path>\`` + §确认段给 ls/cat |
| 期望 AI 提问 | `- ✅ AI 问 2-3 个澄清问题(类型描述,不锁措辞)` |
| AI 调子代理 | `- ✅ AI 派 fresh 子代理(subagent_type=...)拿 [task + 相关 spec + design] 启动` |
| AI 自动后续动作 | `- ✅ AI 主动 invoke <next-skill>` |
| 用户决策点 | `> 🛑 **你的决策点**:<问题> → 回答 \`accept\`/\`reject\`/<其他>` |

### 5.3 不写字面 AI 响应内容

**只写期望发生什么类型的事 / 产生什么文件 / 提示什么类型的问题**。理由:
- 避免锁死 AI 措辞(LLM non-determinism,memory 中 plan-v1.1 多次实证)
- 文档维护成本低(不随 LLM 行为微调失效)
- 跟现 getting-started.md ✅ 风格一致但更系统化

### 5.4 marker / YAML 示例风格

给**结构骨架**而非真实样本。例:

```yaml
# forge/changes/add-todo/.review-passed(关键字段)
schema_version: 2
log_hash: <jcs-hash>
reviewed_at: <iso8601>
findings_acked: []
```

## 6. 衔接策略(Section 4 落地)

### 6.1 入站修改(README 最小动)

同 commit 完成:
1. `README.md` 顶部 `v0.3` 字样 → `v1.1`
2. README "5 分钟跑通" 段重写为 8 行 quick reference(主线 6 命令)+ 一句 "完整端到端工作流见 [`docs/getting-started.md`](docs/getting-started.md)"
3. README "状态" 段 v0.3 release 候选 → v1.1 release

**不动** README 致谢 / 许可 / 安装 / migrate / 设计文档段(它们 v1.1 仍正确)。

### 6.2 出站链接表

每章末尾 "深读" 用 `- [<标题>](path) — <一句描述>` 格式:

| 章 | 出站目标 |
|---|---|
| §0 | `docs/installation.md` / `docs/claude-install.md` |
| §1 | `skills/brainstorming/SKILL.md` |
| §2 | `skills/writing-plans/SKILL.md` / `skills/exploring/SKILL.md` |
| §3 | `skills/subagent-driven-development/SKILL.md` / `skills/test-driven-development/SKILL.md` / `docs/cli-reference.md`(总览页 — preflight/ack/evidence 等 v1.1 CLI 详情待下轮 cli-reference 重写后再补 anchor — Codex r2 Finding A-4 修:不再写不存在的 anchor)|
| §4 | `skills/receiving-code-review/SKILL.md` / `docs/cli-reference.md`(总览页同上)|
| §5 | `skills/verifying-three-dimensions/SKILL.md` / `skills/process-evidence/SKILL.md` / `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §verify-三维 |
| §6 | `skills/finishing-a-development-branch/SKILL.md` / `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` §archive-三级-fence + §handoff-to-backlog(Codex r1 Finding 11 修:完整路径替代省略号)|
| §出问题 | `docs/cli-reference.md#错误退出码` |
| §接下来 | cli-reference / harness-setup / migration / specs |

⚠️ 标记:**cli-reference.md 当前缺 v1.1 新增 6 段 CLI 文档**(Codex r1 Finding 4 修:不是 3 段,真实缺口=`ack` / `migrate` / `evidence` / `scope` / `finding` / `preflight`;`verify` / `explore` 是 slash 命令不是 CLI)。

### 6.3 cli-reference 缺段处理 — 方案 a 修订(brainstorm 选定 + Codex r1 校准)

本轮 spec **scope-out**"补 cli-reference 6 段"。getting-started.md 出站链**不依赖 cli-reference v1.1 anchor**,而是:
- 链到 `docs/cli-reference.md` 总览页(不指 anchor)
- 在 getting-started 各章嵌入式 deep-dive 段**内嵌一句话简介 + 关键参数**(够用户跑通,不替代完整 CLI reference)
- 等下轮 cli-reference 重写完再补 anchor + 升级 getting-started 出站链

**Follow-up task**:"补 cli-reference.md v1.1 6 命令文档"(范围:ack / migrate / evidence / scope / finding / preflight)独立 brainstorm + spec + 实施,留下一轮。

### 6.4 边界:本文档**不写**什么

- v0.3 → v1.1 升级流程 → `docs/migration/`(下一轮)
- Brownfield / legacy-bridge 详解 → `docs/legacy-bridge.md` 已有,留链
- OpenCode / Codex harness 路径 → `docs/opencode-install.md` / `codex-install.md` 已有
- 协议设计 / "为什么 verify 要三维" → `docs/specs/`(留链)
- 命令完整参数表 → `docs/cli-reference.md` 总览页(Codex r2 Finding A-4 修:不指向不存在的 anchor)

## 7. 验证标准(Section 5 落地)

### 7.1 闸 1 — 字面可执行性

每段 ` ```bash ` 命令必须:
- 无 `<placeholder>` 除非紧跟解释怎么替换
- CLI 子命令对应 `forge-repo/src/cli/commands/<x>.ts` 真存在
- slash 命令 `/forge:<x>` 对应 `forge-repo/commands/<x>.md` 真存在
- skill `forge:<x>` 对应 `forge-repo/skills/<x>/SKILL.md` 真存在
- marker 字段位置精确:`pause_decisions` / `verify_findings` 是 `VerifyMarker` + `ReviewMarker` YAML 字段(`src/core/markers/types.ts:7/15/18/107/116`),`archive_summary` 是独立 YAML(`src/core/schemas/archive-summary.ts:17/22`),不再当成独立 marker
- **forge config 字段位置必须用 `test.test_command`**(Codex r2 Finding A-6 修:从 §9 open question 升为 §7 验证闸硬要求),`context.test_command` 是 `commands/verify.md:42` 的 stale doc bug,**spec 实施 + getting-started 写作绝对不得引用 `context.test_command`**
- **`forge evidence freeze` 必须前置 `forge evidence record-*` staging 写入**(Codex r2 Finding A-5/B-3 修):任何 doc 段写 freeze 必须先有同 changeId 下 `record-tdd`/`record-verify`/`record-review` 至少一次调用,否则 freeze exit 1 + 端到端断流

**实施时机**:spec 完稿 + doc 完稿各 grep 一次。

### 7.2 闸 2 — 出站链接全活

所有 `[<text>](path)` 链接对应文件真存在;anchor 真有对应 heading。占位 anchor(§6.3)显式标 ⚠️ 注释。

### 7.3 闸 3 — 端到端可跑通

至少一条 happy path 从 §0 → §6 一行行跑下去全 ✅ 命中,最终 `ls forge/changes/archive/` 看到归档目录。

**实施时机**:writing-plans 拆 task 时把 "端到端跑通验证" 作为最后一个 task,实施 plan 时跑一遍。

### 7.4 闸 4 — 跟 v1.1 真实 surface 对齐(Codex r1 Finding 2 修:拆分 CLI 子命令 vs slash 命令;Codex r2 Finding B-4 修:CLI 子命令再拆 user-facing vs AI-helper)

文档列出的 surface 跟 ls 出来对得上:
- **slash 命令 9 个**(`commands/`):brainstorm / propose / explore / apply / review / verify / archive / upgrade / ack-confirm — v1.0+ 新增 3 个:`explore` / `verify` / `ack-confirm`
- **skill 16 个**(`skills/` 排除 `_shared`)
- **CLI 子命令 13 个**(`src/cli/index.ts:29-65` 注册 13 次 `addCommand`),分两类(Codex r3 Finding B-4/B-r3-4 修:之前写"8 个"是计数错,清单实际 10 个,10+3=13 才对):
  - **User-facing(用户会手敲)10 个**:`config` / `validate` / `init`(deprecated)/ `update` / `archive` / `legacy-bridge` / `upgrade` / `migrate` / `ack` / `preflight`
  - **AI-helper(AI 自动调,用户不需手敲)3 个**:`evidence`(record-tdd/record-verify/record-review/freeze 4 子)/ `finding`(hash helper)/ `scope`(out-of-scope 聚合)
- 注:**`verify` / `explore` 不是 CLI 子命令**,是 slash command(由 AI 协调 skill + 已有 CLI 完成);`upgrade --resign-markers` 是 v1.0 给 upgrade 加的 option,不算独立子命令
- getting-started 在 §3/§4/§5 deep-dive 段标注每个引用 CLI 属 user-facing 还是 AI-helper(后者只描述 AI 行为,不让新用户照敲)

**实施时机**:跟闸 1 合并跑。

### 7.5 Spec self-review 清单

写完本 spec 后 inline 自查:
1. Placeholder scan(`TBD` / `TODO` / `<xxx>` 非占位用法)
2. 内部一致(Section 1-5 间无矛盾)
3. Scope 检查(getting-started 单文件 + cli-reference 补全留下轮可拆开)
4. Ambiguity 检查(每个嵌入式 deep-dive 嵌入位置精确)

### 7.6 用户复核闸

spec commit 后显式让用户过一遍全文,通过才进 writing-plans。brainstorming skill 硬要求。

## 8. Out of scope(本轮明确不做)

| 项 | 何时做 |
|---|---|
| 补 `docs/cli-reference.md` v1.1 **6 命令**段(ack / migrate / evidence / scope / finding / preflight)— Codex r1 Finding 4 修:不是 3 个 | 下一轮独立 brainstorm + spec |
| 重写整个 `README.md`(只动 3 处最小入站) | 下一轮 |
| 写 v0.3 → v1.1 升级指南 | 下一轮(`docs/migration/v0.3-to-v1.1.md`) |
| **顺手修 `docs/installation.md` + `docs/claude-install.md` 数字 + plugin install 主路径段**(12→16 skill / 6→9 slash 命令 + 删 v0.3 tarball / v0.2→v0.3 升级 stale 段)— Codex r2 Finding A-8/B-5 修:不只改数字,所有 getting-started 链接的 deep-read 入口必须能让新用户落地 | **本轮一起做**(最小 v1.1 入站修订,不全量重写) |
| 重写整个 `docs/installation.md`(深度更新 v1.1 含 OpenCode/Codex tier 比对) | 不在本轮路线图 |
| OpenCode / Codex / harness-setup 章节 | 留现状,但 getting-started §接下来在指向 `harness-setup.md` / `opencode-install.md` / `codex-install.md` 时**必须标注 "(legacy v0.2-v0.4 形态)"**(Codex r2 Finding B-5 修:残留 v0.4 移除 / v0.3 升级措辞,新用户误读会以为还有 v0.4) |
| Brownfield / legacy-bridge 教程 | 留 `docs/legacy-bridge.md` 现状 |
| 修 `commands/verify.md:42` `context.test_command` doc bug(代码事实是 `test.test_command`)— Codex r1 Finding 6 衍生;Codex r2 Finding A-6 升级:`context.test_command` 在 spec **绝对禁用** | 列 forge-repo follow-up issue,不阻塞 getting-started 实施 |
| 顺手修 `CHANGELOG.md:57/75` `forge verify CLI` 历史措辞(Codex r2 Finding B-7) | 不在本轮路线图(顶多 spec 内提示读者别误读) |
| 补 `commands/review.md` + `commands/verify.md` 加 `record-review` / `record-verify` 引用(Codex r3 Finding B-r3-1):权威 helper list 在 `commands/apply.md:179-182`,这两 commands 文档没引用是 doc 残漏 | 列 forge-repo follow-up issue,不阻塞 getting-started 实施(spec/getting-started 以 apply.md helper list 为权威) |
| 协调 `commands/apply.md:117` vs `commands/review.md:22-26` / `commands/verify.md:75` 的 pause_decisions marker 写入时机(Codex r3 Finding A-7 暴露 protocol lifecycle 矛盾)| 列 forge-repo follow-up issue,getting-started 不展示该内部矛盾 |
| **§8 verbose scope 硬约束**(Codex r3 Finding B-r3-6):本轮 installation.md / claude-install.md 修订**只动新用户安装主路径段 + 明显 stale 文案**(数字 12→16/6→9、v0.3 tarball 删、v0.2→v0.3 升级段删),**不动** OpenCode/Codex 深层 tier 比对章节(留给下轮重写) | 验收闸明确禁止 scope creep |

## 9. Open questions(implementation 阶段解决)+ 已定事实段

> Codex r1 Finding 3 已关:`forge init` v1.1 仍可用(deprecated,v1.2 移除,沿 `src/cli/commands/init.ts:28-38`),§3.3 第 5 点已定稿。
> Codex r2 Finding A-6/B-6 已关:`test_command` 字段 + marker 字段位置在下方 9.0 事实段定稿,**不再是 open question**。

### 9.0 已定事实(spec 阶段定稿,不进 open question 列表)

- **marker 字段定位**(Codex r2 Finding B-6 修):
  - `verify_findings` / `pause_decisions` 是 `VerifyMarker`(`.verify-passed`)+ `ReviewMarker`(`.review-passed`)的 YAML 字段(`src/core/markers/types.ts:7/15/18/107/116`)
  - `archive_summary` 是 archive 目录内独立 YAML(`src/core/schemas/archive-summary.ts:17/22`,schema 名 `forge-archive-summary/v1`),**不是** marker
  - getting-started 示例 marker 骨架时遵循此分类
- **`forge/config.yaml` `test_command` 字段路径**(Codex r2 Finding A-6 升级为硬要求):
  - 用 `test.test_command`(代码事实,`src/core/schema/types.ts:83` + `src/core/archive/fence.ts:146`)
  - **绝对不得用** `context.test_command`(`commands/verify.md:42` 是 stale doc bug,getting-started 实施时遇到该 doc 不得参考)
  - 示例:
    ```yaml
    test:
      test_command: pnpm test
    ```
- **Apply pause 决策落点**(Codex r1 Finding 7 + r2 Finding A-7/B-2 + r3 Finding A-7 PARTIAL 累积修):
  - apply 中段用户答完 AskUserQuestion 后,**AI 主代理直接写 marker `pause_decisions` 数组追加一项**(沿 `commands/apply.md:117-131`),用户不操作 marker
  - **forge 协议内部 lifecycle 矛盾**(Codex r3 Finding A-7 PARTIAL 暴露):`commands/apply.md:117` 写"必须在 .verify-passed / .review-passed marker 的 pause_decisions 数组追加一项",但 `commands/review.md:22-26` 显示 `.review-passed` 三条件满足才打;`commands/verify.md:75` 显示 `.verify-passed` 在 verify 阶段才写。**apply 中段两个 marker 都还不存在,协议本身有 doc bug**
  - **getting-started 处理**(决定):**不展示 marker 写入时机**(避免把 forge 协议矛盾暴露给新用户),只展示用户视角(被 AskUserQuestion 问 → 选 1-4 → AI 自动后续记录,具体内部协议见 specs 设计文档)
  - **getting-started 在 §3 嵌入段只列**:用户视角四选项 + 必填字段(option=3 必填 `non_blocking_rationale`,option=4 必填 `other_rationale` + `other_acked_by`),不展示 YAML 全量
  - **forge-repo follow-up**:协调 `commands/apply.md` ↔ `commands/review.md` / `commands/verify.md` 关于 pause_decisions 写入时机的协议表述(列 §8 follow-up table)
- **CLI helper vs user-facing 区分**(Codex r2 Finding B-4 修):见 §7.4
- **`forge backlog list` v1.1 不存在**(Codex r1 Finding 12):getting-started 实施不字面照搬 `commands/archive.md:86` 该提示,只引导用户读 `archive_summary.yaml`

### 9.1 留 open(implementation 阶段解决)

1. **LLM-judge 集成在 verify 哪一维触发?**CHANGELOG plan-9d 写 "LLM-judge 路径",但触发条件细节需读 `skills/verifying-three-dimensions/SKILL.md` 确认,implementation 阶段补足 §5 嵌入式段。
2. **`/forge:ack-confirm` slash 命令跟 `forge ack confirm` CLI 关系**(是同一动作两层入口,还是 slash 额外加 AI 引导?)。implementation 阶段读 `commands/ack-confirm.md` 确认 §4 嵌入式段写法。
3. **`forge evidence record-tdd/verify/review` 在 getting-started 写多详?**——sub-question:用户视角全部"AI 自动调"够吗,还是要列出 ack-log.jsonl 落点 + staging.yaml 文件?implementation 阶段读 `commands/apply.md:179-182` + `commands/verify.md:107-123` 决定;原则:**新用户不需手敲 record-*,但需知道"AI 会做这步,失败时报错怎么读"**。

## 10. Deliverable + 验收

**deliverable**:
- `forge-repo/docs/getting-started.md`(全量重写,600-800 行)
- `forge-repo/README.md`(3 处最小入站修改:顶部版本号 / "5 分钟跑通"段重写 / "状态"段)
- `forge-repo/docs/installation.md`(Codex r2 Finding A-8/B-5 修:除数字 12→16 skill / 6→9 slash 外,删 v0.3 tarball + v0.2→v0.3 升级段 / 标题 v0.3→v1.1 / "v0.4 移除" 字样修订;**保持最小 v1.1 入站修订,不全量重写**)
- `forge-repo/docs/claude-install.md`(同上最小 v1.1 修订)

**验收**:闸 1+2+3+4 全 pass + 用户端到端读一遍认可 + writing-plans 拆 task 完成后(下一轮)实施 + verify。

## 11. Next steps(brainstorming skill flow)

1. **本 spec self-review**(闸 1+2+4 grep + 7.5 self-review 4 点)→ inline 修 ✓ 完成 v1
2. **Codex r1 对抗性 review** → 12 finding 全验证 + 修 → spec v2 ✓ 完成
3. **Codex r2 对抗性 review** → 13 finding(1 Critical / 9 Major / 1 Minor)全验证 + 修 → spec v3 ✓ 完成
4. **Codex r3 对抗性 review** → 8 finding(0 Critical / 5 Major / 3 Minor)全验证 + 修 → spec v4 ✓ 完成
5. **Codex r4 对抗性 review**(本步进行中)→ 目标 CONVERGED(0 Critical + 0 Major)
5. **用户复核**(7.6)→ 用户 OK
6. **进入 forge 工作流实施**(Codex r2 Finding A-10 + r3 Finding B-r3-5 修):
   - 因为 deliverable 是 forge-repo 自己的文档,implementation plan 应当**走 forge 自己的工作流**:`/forge:propose <change-id> --from-draft <name>` → 自动调 `forge:writing-plans` skill → plan 落 `forge-repo/forge/changes/<change-id>/tasks.md`(沿 `skills/writing-plans/SKILL.md:18`)
   - **`--from-draft` 路径要求**(Codex r3 Finding B-r3-5):`commands/propose.md:11+33` 要求 draft 文件必须在 `forge/drafts/<date-topic>.md`,**spec 当前路径 `docs/specs/...` 不符合**。两种走法:
     - **走 A(推荐)**:先 `cp docs/specs/2026-05-14-getting-started-v1.1-rewrite-design.md forge/drafts/2026-05-14-getting-started-v1.1-rewrite.md`,再 `/forge:propose getting-started-v1.1-rewrite --from-draft 2026-05-14-getting-started-v1.1-rewrite`
     - **走 B**:不用 `--from-draft`,在 `/forge:propose` 会话里手工把 spec 全文作为上下文喂给主代理(更繁琐,但保留 spec 在 docs/specs/ 不动)
   - 当前 brainstorming 会话**没装 forge plugin**,无法直接跑 `/forge:propose`;**用户需在 forge-repo 内启动有 forge plugin 的 Claude Code 会话**才能进入 forge 工作流
   - 退路(如果不想切会话):在当前 superpowers 会话里 invoke `superpowers:writing-plans` 写 plan 到 `docs/superpowers/plans/...`(非 forge 标准落点,后续要手工搬到 `forge/changes/`)— **不推荐**
7. **实施 plan**(下一会话或本会话延续)

---

附:本 spec 由 `superpowers:brainstorming` skill 引导产出,四个 clarifying 决策 + 三个 approach 对照 + 五段 design 分段确认完整记录,见用户会话 transcript。
