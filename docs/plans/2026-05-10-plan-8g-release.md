# Plan 8g — `forge migrate` Phase 7 Release 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:加 release-gate-checklist.md §4 v0.4 段;CHANGELOG.md v0.4.0 段;全量 verification 跑一轮 + 决定版本号(v0.4.0 仅 OpenSpec / v0.4.1 全 + LLM)。M7 里程碑。

**Architecture**:沿用 forge 现有 release-gate-checklist 风格(参见 §3.1-3.6 v0.3 段);CHANGELOG 写"采纳 codex 二轮 + opus 自检 + 4 阻塞修订定稿"作为 release notes 来源。

**Tech Stack**:无新依赖;纯文档 + 全量测试。

**Spec 引用**:[`2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md) §6.2 docs/migration、§7.3 与 forge upgrade 关系。

**前置**:Plan 8a-8f 全部完成;CLI + docs 全到位。

---

## File Structure(Plan 8g 完成时改动)

```
docs/release-gate-checklist.md            ← 改:加 §4 v0.4 段
CHANGELOG.md                              ← 改:v0.4.0 段(或 v0.4.0 + v0.4.1)
package.json                              ← 改:version 0.3.0 → 0.4.0
```

---

## Task 7.1:release-gate-checklist 加 §4 v0.4 段

**Files:** Modify `docs/release-gate-checklist.md`

- [ ] **Step 1:加段(参考 §3.1-3.6 v0.3 段格式)**

```md
## §4 v0.4 forge migrate 发布门(2026-05-10)

### §4.1 代码 + 测验证

- [ ] `pnpm format:check` 0 error
- [ ] `pnpm lint` 0 error
- [ ] `pnpm typecheck` 0 error
- [ ] `pnpm test` 全 PASS;含 tests/migrate/* 与 tests/cli/migrate.test.ts
- [ ] `pnpm build` 0 error;dist/cli/index.js 可调起 `forge migrate --help`

### §4.2 端到端手测

- [ ] 用 `tests/fixtures/migrate/openspec-minimal/` 跑一次完整 `--no-regenerate`,验 forge/ 树就位
- [ ] 用 `tests/fixtures/migrate/superpowers-minimal/` 跑一次完整 `--no-regenerate`(启 git fixture);验 [needs-fix] 标准
- [ ] 在真 OpenSpec 项目跑 `forge migrate openspec --regenerate`(可选:开发者本机手测,验 LLM 路径)
- [ ] 在真 superpowers 项目跑 `forge migrate superpowers --regenerate`(同上)

### §4.3 兼容性

- [ ] `tests/core/archive/lock.test.ts:188` 旧断言"another forge archive..."仍 PASS(spec §5.1 v3 兼容性约束)
- [ ] `tests/cli/archive.test.ts:516` 旧断言仍 PASS
- [ ] forge upgrade(v0.2 → v0.3)依然跑通;migrate 不影响其工作流(spec §7.3 独立)

### §4.4 文档完整

- [ ] README "从已有项目搬过来" 段加;链接到 docs/migration/
- [ ] docs/migration/from-openspec.md 6 段齐
- [ ] docs/migration/from-superpowers.md 含配对算法 + archive 推测 + bundled 限制
- [ ] CHANGELOG v0.4.0 段写完(本 plan Task 7.2)
- [ ] design spec 仍 commit 在 docs/specs/(本 release 关联设计源头)

### §4.5 npm 包

- [ ] package.json `version` = `0.4.0`;`bin` 字段保 `forge`
- [ ] `pnpm pack` 产 tarball;解压检查 dist/cli/commands/migrate.js 在
- [ ] `pnpm publish --dry-run` 验包内文件清单(forge-repo files 字段)

### §4.6 plugin 形态(若同步发 plugin)

- [ ] commands/migrate.md 已加(若决定 plugin 中也提供 `/forge:migrate`;本 plan 不强制)
- [ ] bundled plugin tarball(若发):dist/cli/commands/migrate.js 含
```

- [ ] **Step 2:commit**

```bash
git add docs/release-gate-checklist.md
git commit -m "docs(release): migrate-7.1 release-gate-checklist 加 §4 v0.4 段"
```

---

## Task 7.2:CHANGELOG v0.4.0 段

**Files:** Modify `CHANGELOG.md`

- [ ] **Step 1:在 `## [Unreleased]` 段下加 `## [0.4.0] - 2026-05-XX`**

```md
## [0.4.0] - 2026-05-XX

### Major changes — forge migrate(openspec / superpowers 项目搬运)

29. **`forge migrate <source>` 命令**:把外部框架的项目仓库一键搬到 forge 工作目录;两源默认 `--regenerate`(LLM 补缺件,会显示估价 + ack);`--no-regenerate` 走纯结构 + markdown-aware transformer + `[needs-fix]` 标记
30. **markdown-aware walker**(`src/core/migrate/markdown-aware.ts`):公共 4 层 bridge 的 Layer 1 — 逐行扫描 + fenced code state(``` / ~~~ 同种 token 收尾)+ table-row 跳过;不识 indented code(known limitation);自切 section 替代 parse/markdown.ts(后者不 fence-aware)
31. **MigrateSource 接口 + 两 adapter**(openspec / superpowers):统一契约 detect/scan/classify/prepareCopy/transform/listMissingArtifacts;新源接入只需加新 adapter
32. **archive 完整性约束(M13)**:推测 archive 但缺件 → 必须用户二次确认;`--no-interactive` 模式 abort exit 4(反静默状态变化)
33. **trace journal NDJSON + 原子 rename(M14)**:三步走 cp(journal pending → write .tmp → rename → committed)+ 末态 fs.rename `.ndjson`→`.json` + reader 优先级算法;crash 可基于 journal 反向 rollback
34. **facts 目标分桶(M15)**:`extractMotivationFacts(design)` 验 proposal、`extractBehaviorFacts(tasks)` 验 specs、`extractFacts(content)` 给 OpenSpec 已有件;facts < 5 / JSON parse fail / 重复去重;superpowers fidelity 阈值 0.6(brownfield 0.9)
35. **bundled plugin 行为(M16)**:bundled + openspec 静默退化 `--no-regenerate`;bundled + superpowers 前置 prompt 让用户确认是否继续(必产 [needs-fix])
36. **不复用 legacy-bridge ack/budget/quality**:brownfield 硬编码不兼容;migrate 写专属;只复用 `redact.ts`(字符串处理无 brownfield 耦合)+ 扩 `archive/lock.ts:LockMode` union 加 'migrate'(LockHeldError 文案不动以保兼容)

### Added — CLI(P1 + P6)

- `forge migrate <openspec|superpowers>` 主命令 + 8 个选项(--no-regenerate / --dry-run / --force / --archive-list / --no-interactive / --redact-rules)
- LockHeldError CLI 入口友好 catch:"forge migrate is blocked by lock: ..."(避免用户以为 archive 命令占锁)

### Added — Core(P2-P5)

- `src/core/migrate/`:11 模块 + 全部 type;markdown-aware walker;archive-detect 推测引擎(checkbox + git keyword + word boundary + critical-task-pending);conflict.ts plan 阶段全锁定 + --imported-N 递增 + --force trash;report.ts journal NDJSON;ack/budget/quality 三套自实现;regenerate.ts 主流程 + AbortController + .partial 写入

### Added — Tests + Docs(P6 + P7)

- `tests/migrate/*`(12 个 test);`tests/cli/migrate.test.ts` 端到端
- `tests/fixtures/migrate/{openspec-minimal,superpowers-minimal,conflict-existing,unsafe-slug}/`
- README "从已有项目搬过来" 段
- `docs/migration/from-openspec.md` + `docs/migration/from-superpowers.md`

### Changed

- `src/core/archive/lock.ts:LockMode` union 加 'migrate'(LockHeldError 文案保持现状,保兼容现有 lock.test.ts:188)
- `package.json` dependencies 锁 `@anthropic-ai/sdk ≥ 0.27.0`(AbortSignal 支持)

### Fixed — codex 一轮 40 + Opus 12 + codex 二轮 4 阻塞 全采纳

- M9 复用边界收紧:不反向调 brownfield ack/budget/quality
- M10 transformer 升级 markdown-aware
- cp 三步走防孤儿文件
- LockHeldError 文案兼容现有断言
- bundled + superpowers 不静默退化
- archive 完整性不静默降级

### Acknowledgments

设计经 codex 对抗性审查 2 轮 + opus subagent 自检 1 轮,共修 60+ 条问题。完整修订链:
- v1 commit 935fed8(初稿)
- v2 commit ef4187a(codex 一轮 40 + 内部代码核实)
- v3 commit 4ab68c1(opus 12 + 6 表面解决)
- v4 commit 5f748b0(codex 二轮 4 阻塞 + 5 关键 major)
- v4.1 commit 0fd2d8a(加 §1.1 Bridge 架构图)

完整 spec:[`docs/specs/2026-05-10-forge-migrate-design.md`](docs/specs/2026-05-10-forge-migrate-design.md)。
完整 plan 链:[`docs/plans/2026-05-10-plan-8-forge-migrate-master.md`](docs/plans/2026-05-10-plan-8-forge-migrate-master.md) + plan-8a..g。
```

- [ ] **Step 2:commit**

```bash
git add CHANGELOG.md
git commit -m "docs(release): migrate-7.2 CHANGELOG v0.4.0 段"
```

---

## Task 7.3:全量 verification + version bump + final commit

**Files:** Modify `package.json`(version)

- [ ] **Step 1:bump version**

```bash
cd D:/ClaudeProject/opsp/forge-repo
# 手编辑 package.json 或:
pnpm version 0.4.0 --no-git-tag-version
```

- [ ] **Step 2:全量 verification**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack
```

预期:全 0 error;tarball 产生;`@accelerator-mzq/forge-0.4.0.tgz` 含 dist/cli/commands/migrate.js。

- [ ] **Step 3:跑 release-gate(若 forge 自身有 release-gate.mjs)**

```bash
node scripts/release-gate.mjs
```

预期:全 §4 项目 PASS;打印 release ready。

- [ ] **Step 4:final commit + tag(由人决定 publish 时机)**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore(release): v0.4.0 — forge migrate openspec/superpowers 项目搬运

里程碑 M7:release-gate §4 全 PASS;v0.4.0 候选发布。

完整变更:
- 新命令 forge migrate(openspec / superpowers 两 source adapter)
- markdown-aware transformer + LLM regenerate 路径
- 4 层 bridge 架构(walker / source 规则 / forge schema / facts 语义)
- codex 二轮 + opus 自检定稿;14.5 工日实施

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"

# 不强制 push / publish;由人决定:
# - git tag v0.4.0
# - git push origin <branch> --tags
# - npm publish
```

---

## Task 7.4:回到 master plan self-review

**Spec 引用**:master plan §6 Self-Review 清单。

- [ ] 跑 master plan §6 Self-Review 全 12 项;若发现 spec 未覆盖,回对应 phase plan 加 task 补回

- [ ] commit P7 + master 完成

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(migrate): Plan 8 全 phase 完成里程碑(M7)

P1-P7 全 task 完成;codex 二轮 + opus 自检定稿;
forge migrate v0.4.0 候选;release-gate §4 全 PASS。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Plan 8g Self-Review

- [ ] release-gate-checklist §4 v0.4 全 §4.1-4.6 段写齐
- [ ] CHANGELOG v0.4.0 含 8 条 major changes + 三大 Added 段(CLI / Core / Tests + Docs)+ Changed + Fixed + Acknowledgments
- [ ] package.json version = 0.4.0
- [ ] pnpm pack 产 tarball;manifest 含 dist/cli/commands/migrate.js
- [ ] release-gate.mjs 不强制必跑(无该脚本则跳;有则跑全 PASS)
- [ ] 不在 plan 内自动 publish / push;留给人决定

---

**P7 完成,M7 里程碑达成。`forge migrate v0.4.0` 候选发布。**

后续(plan 之外):
- 真实仓库手测(开发者本机或 CI 上 1-2 个真 OpenSpec 仓库 + 1-2 个真 superpowers 仓库)
- 收 1-2 周用户反馈
- 修必要 bug 后 `v0.4.1` 增量;若实施期发现 spec 漏洞,回到 v4 spec 加 v5 修订
