# Plan 8 — `forge migrate` 实施 master plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:实施 `forge migrate <openspec|superpowers>` 命令,把外部框架的项目仓库搬到 forge 工作目录;两源默认 `--regenerate` LLM 补缺件,`--no-regenerate` 走纯结构 + markdown-aware transformer;冲突 merge + `--imported` 后缀;源默认 cp 不动。

**Architecture**:`src/core/migrate/` 模块组织 § 4 层 bridge(markdown 结构 walker → source 专属规则 → forge target schema → facts 语义);两个 `MigrateSource` adapter(openspec / superpowers)实现统一接口;反向调 `legacy-bridge/redact.ts`(字符串处理无 brownfield 耦合)+ 扩 `archive/lock.ts:LockMode` union(不动 LockHeldError 文案);自实现 migrate 专属 ack/budget/quality(brownfield 硬编码不兼容)。

**Tech Stack**:Node 20+、TypeScript ESM、commander 12、`@anthropic-ai/sdk` ≥ 0.27.0(AbortSignal 支持)、yaml、gray-matter(已有依赖,不新增)。

**Spec 引用**:[`2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md) v4.1(797 行,§0 决策表 16 条 + §1 架构 + §2 数据流 + §3 错误矩阵 + §4 测试 + §5 模块清单)。

**前置**:Plan 1-6 已完成(forge v0.3 plugin + CLI + skills 体系到位);本 plan 落地 v0.4.0 / v0.4.1。

---

## 0. 总览

按 spec §8 路线图,实施分 7 phase / 7 子 plan(每 phase 一份子 plan 文件):

| Phase | 子 plan 文件 | 内容 | 估算 |
|------|-------------|------|------|
| P1 | [plan-8a-foundation.md](2026-05-10-plan-8a-foundation.md) | 骨架 + types.ts + LockMode 扩展 + CLI 子命令注册 | 1 day |
| P2 | [plan-8b-openspec-source.md](2026-05-10-plan-8b-openspec-source.md) | OpenSpecSource 完整(scan + classify + prepareCopy + markdown-aware transformer) | 3 days |
| P3 | [plan-8c-superpowers-source.md](2026-05-10-plan-8c-superpowers-source.md) | SuperpowersSource(配对 + slug 安全 + archive-detect 严格化 + transformer) | 3 days |
| P4 | [plan-8d-conflict-report.md](2026-05-10-plan-8d-conflict-report.md) | conflict.ts + report.ts + journal NDJSON + 原子 rename + reader 优先级 | 1.5 day |
| P5 | [plan-8e-regenerate.md](2026-05-10-plan-8e-regenerate.md) | regenerate 完整路径(ack + budget + quality 三套 prompt + AbortController + .partial + mock) | 4.5 days |
| P6 | [plan-8f-cli-docs.md](2026-05-10-plan-8f-cli-docs.md) | CLI 端到端测 + README + docs/migration/from-*.md | 1 day |
| P7 | [plan-8g-release.md](2026-05-10-plan-8g-release.md) | release-gate-checklist § v0.4 + CHANGELOG + 全 verification | 0.5 day |

**总计**:~14.5 工日(spec 写"~16-18 浮动",实施期可能 +2d 用于 P5 prompt 调优)。

**版本拆分**(若按 release 节奏走):
- `v0.4.0`(~8 工日):P1 + P2 + P4 + P6 + P7 — OpenSpec 源 + 纯结构搬运 + 冲突 + report + 文档 + 发布
- `v0.4.1`(~9 工日):P3 + P5 — superpowers 源 + LLM regenerate(P5 工作量超 v0.4.0 全部)

---

## 1. File Structure(全部 7 phase 完成时仓库改动)

```
src/
├── cli/
│   ├── index.ts                          ← 改(P1):注册 migrate 子命令 + 公开 runMigrate
│   └── commands/
│       └── migrate.ts                    ← ★ NEW(P1):commander 子命令骨架
└── core/
    ├── archive/
    │   └── lock.ts                       ← 改(P1):LockMode union 加 'migrate'(文案不动)
    ├── parse/
    │   └── markdown.ts                   ← 不改;migrate 不复用(spec §5.1 v4 修订)
    └── migrate/                          ← ★ NEW
        ├── index.ts                      ← P1:runMigrate 主流程编排
        ├── types.ts                      ← P1:MigrateSource 接口、ScanResult、CopyOp 等
        ├── markdown-aware.ts             ← P2:walker(逐行 + fenced state + table-row 跳过 + 自切 section)
        ├── conflict.ts                   ← P4:--imported-N 递增 + plan 阶段全锁定 + --force trash
        ├── archive-detect.ts             ← P3:推测引擎(checkbox + git keyword + word boundary + slug)
        ├── report.ts                     ← P4:journal NDJSON + 末态原子 rename + reader 优先级
        ├── ack.ts                        ← P5:migrate 专属 opt-in prompt + .forge-ack/migrate-<ts>.yaml
        ├── budget.ts                     ← P5:migrate 专属 cost 估算(按件长度);MIGRATE_WARN_USD = $5
        ├── quality.ts                    ← P5:三套 prompt 分桶 + facts < 5 阈值 + 0.6 fidelity + callAnthropic
        ├── regenerate.ts                 ← P5:--regenerate 主流程 + AbortController + .partial 写入
        └── sources/
            ├── index.ts                  ← P1:source registry
            ├── openspec.ts               ← P2:OpenSpecSource 实现
            └── superpowers.ts            ← P3:SuperpowersSource 实现

tests/
├── cli/
│   └── migrate.test.ts                   ← ★ NEW(P6):CLI 端到端
└── migrate/
    ├── markdown-aware.test.ts            ← ★ NEW(P2)
    ├── conflict.test.ts                  ← ★ NEW(P4)
    ├── archive-detect.test.ts            ← ★ NEW(P3)
    ├── report.test.ts                    ← ★ NEW(P4)
    ├── ack.test.ts                       ← ★ NEW(P5)
    ├── budget.test.ts                    ← ★ NEW(P5)
    ├── quality.test.ts                   ← ★ NEW(P5)
    ├── openspec.test.ts                  ← ★ NEW(P2)集成测
    ├── superpowers.test.ts               ← ★ NEW(P3)集成测
    ├── regenerate.test.ts                ← ★ NEW(P5)集成测(mock SDK)
    └── sources/
        ├── openspec.test.ts              ← ★ NEW(P2)transform 单元测
        └── superpowers.test.ts           ← ★ NEW(P3)transform 单元测

tests/fixtures/migrate/                   ← ★ NEW
├── openspec-minimal/
│   └── openspec/
│       ├── specs/
│       │   ├── foo/spec.md               # H4 Scenario + list-prefix WHEN/THEN(基础)
│       │   ├── bar/spec.md               # 含代码块内 #### Scenario 示例(测 fenced 跳过)
│       │   └── baz/spec.md               # 表格列出 step;Description 段在 Requirement 下;多行 WHEN 续行
│       ├── changes/
│       │   ├── add-bar/{proposal.md, tasks.md, design.md}
│       │   ├── three-level/tasks.md      # 三层编号 1.2.3.
│       │   └── archive/old-baz/{proposal.md, tasks.md, design.md, specs/x.md}
│       ├── explorations/idea-x.md
│       └── config.yaml
├── superpowers-minimal/
│   ├── docs/superpowers/
│   │   ├── specs/2026-01-01-add-auth-design.md
│   │   ├── specs/2026-04-01-cleanup-deps-design.md
│   │   ├── plans/2026-01-01-add-auth-plan.md          # 全 [x],3+ tasks,**Step 1.1** 嵌套 + 中文冒号
│   │   ├── plans/2026-04-01-cleanup-deps-plan.md      # 部分 [x]
│   │   ├── plans/2026-03-01-orphan-plan.md            # plan-only;**STEP 1**(大写测)
│   │   └── plans/2026-02-01-single-task-plan.md       # 1 task 100% → 不应自动 archive(< 3)
│   └── .git/                              # commits:含 close 关键词 + slug 共同命中
├── conflict-existing/
├── unsafe-slug/
└── regen-mocked/

package.json                              ← 改(P5):dependencies.@anthropic-ai/sdk ≥ 0.27.0
docs/
├── migration/
│   ├── from-openspec.md                  ← ★ NEW(P6)
│   └── from-superpowers.md               ← ★ NEW(P6)
├── release-gate-checklist.md             ← 改(P7):加 §4 v0.4 段
└── CHANGELOG.md                          ← 改(P7):v0.4.0 段
README.md                                 ← 改(P6):加"从已有项目搬过来"段
```

---

## 2. 跨 Phase 共用约定

### 2.1 Commit 格式

每 task 末尾 commit 前缀:
- 新模块:`feat(migrate): <summary>`
- 改现有:`feat(<area>): migrate-<task-no> <summary>`(例 `feat(lock): migrate-1.1 加 'migrate' mode 到 LockMode union`)
- 测试:`test(migrate): <summary>`
- 文档:`docs(migrate): <summary>`

每 commit 末尾必须含:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

### 2.2 本地 verification 循环(每 task 末尾,push 前必跑)

参考 user MEMORY `feedback_local_verification_format`:CI 含 prettier 失败短路。每 task commit 前:

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm format:check                # prettier 必跑
pnpm lint
pnpm typecheck
pnpm test -- tests/migrate/<具体 test>      # 单 task 范围
```

P7 phase 末尾跑全量:
```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

### 2.3 Subagent 模型选择

参考 user MEMORY `feedback_subagent_model_selection`:
- **haiku**:固定机械(commit 命令、文件 mv、Bash glob)
- **sonnet**:review、单元测核对、type 一致性检查
- **opus**:design 类(prompt 设计、错误矩阵补、类型架构)— Plan 8e Task 5.4-5.6 prompt 设计强制 opus

### 2.4 跨 phase 依赖

```
P1(骨架)
  ↓
P2(OpenSpec)─┐
P3(SP)──────┤
            ↓
P4(冲突 + report)
            ↓
P5(LLM regenerate)
            ↓
P6(CLI 端到端 + 文档)
            ↓
P7(release)
```

P2 + P3 可并行(各自独立 source adapter);其他严格串行。

---

## 3. 进入 Phase 1

详见 [`2026-05-10-plan-8a-foundation.md`](2026-05-10-plan-8a-foundation.md)。

包含 8 个 task:
- Task 1.1 — `LockMode` union 加 `'migrate'`(改 `lock.ts`,不动 LockHeldError 文案)
- Task 1.2 — `src/core/migrate/types.ts`(MigrateSource 接口 + 全部 type)
- Task 1.3 — `src/core/migrate/sources/index.ts`(空 registry)
- Task 1.4 — `src/core/migrate/sources/openspec.ts` 空骨架
- Task 1.5 — `src/core/migrate/sources/superpowers.ts` 空骨架
- Task 1.6 — `src/core/migrate/index.ts`(`runMigrate` 空骨架 + 主流程编排框架)
- Task 1.7 — `src/cli/commands/migrate.ts`(commander 子命令 + 友好 LockHeldError catch)
- Task 1.8 — 注册到 `src/cli/index.ts` + 公开 `runMigrate`;P1 完成 verification

P1 完成后:`forge migrate openspec --dry-run` / `forge migrate superpowers --dry-run` 可调起空骨架(打印"not implemented"),**所有公共 type / 接口 / lock 扩展就位**,P2/P3 可并行接手。

---

## 4. 实施顺序与里程碑

| 里程碑 | Phase 完成态 | 用户可验收 |
|------|-------------|----------|
| M1 | P1 done | `forge migrate <source> --dry-run` 命令存在,打印 "not implemented" |
| M2 | P1 + P2 done | `forge migrate openspec --no-regenerate` 真能搬 openspec 项目(纯结构 + transformer) |
| M3 | P1 + P2 + P3 done | `forge migrate superpowers --no-regenerate` 也能搬(superpowers 源跑通,但缺件 [needs-fix]) |
| M4 | + P4 done | 冲突 merge 跑通;trace journal 落地;rollback 测通 |
| M5 | + P5 done | `--regenerate` 端到端跑通(可在真 Anthropic API 上跑一次手测) |
| M6 | + P6 done | 文档齐;CLI 端到端测全绿 |
| M7 | + P7 done | release-gate 通过;v0.4.0 候选 |

---

## 5. 风险与已知限制(spec §7.1)

实施期需注意:

1. **markdown-aware walker 不识 indented code(4 空格)** — known limitation;spec §7.1;不写测;遇真实样本触发转 GitHub issue
2. **OpenSpec 表格内 GWT step 不转换** — 接受;walker 跳过 table-row;文档说明用 list 替代
3. **task 父子语义降级**(`Step 1` 与 `Step 1.1` 扁平 task-1 / task-1-1)— 接受;forge tasks parser 实测不识别父子
4. **AbortController 取消能力** — 锁 SDK ≥ 0.27.0;最坏情况 LLM 已生成内容被丢
5. **superpowers fidelity threshold 0.6**(brownfield 0.9)— 文档明示;集成测断言

---

## 6. Self-Review(本 master plan 完成时检查)

完成所有 7 phase 后,fresh 跑一遍 spec 全文,逐节核对实施落地:

- [ ] §0 决策表 M1-M16 每条都有对应 task / 已落代码
- [ ] §1.1 4 层 bridge 在代码层级清晰可见
- [ ] §1.2 模块组织与 src/core/migrate/ 实际目录一致
- [ ] §1.3 MigrateSource 接口在 types.ts 全字段实现
- [ ] §1.4 CLI 选项 8 个全 wire up
- [ ] §1.5 主流程伪码与 runMigrate 实际逻辑顺序一致(尤其 missingPreview 早算 + dry-run 前置 + cp 三步走)
- [ ] §2.5 / §2.6 transformer 规则在 openspec.test / superpowers.test 全覆盖
- [ ] §3.1 错误矩阵每行有对应 exit code 测试
- [ ] §3.4 trace journal NDJSON / 原子 rename / reader 优先级在 report.test 验证
- [ ] §4 测试分层全建,CI 兼容(path.join + git fixture + format:check)
- [ ] §5.2 三套 prompt(extractMotivation/Behavior/Facts)在 quality.ts 实现
- [ ] §6 README + docs/migration/from-*.md 写齐
- [ ] §7 风险表已知限制在文档明示

发现 gap 即在对应 phase plan 加 task 补回。

---

**master plan 结束**。下一步:产 plan-8a..g 子 plan 文件;P1 子 plan 已就绪,详见 `plan-8a-foundation.md`。
