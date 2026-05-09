# Plan 6 — Release v0.3.0 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:跑通 release-gate-checklist v0.3 全部 5 项验证 + 三 harness fresh install + upgrade-from-v0.2 + bundled 离线 三套 acceptance test 全绿,然后 maintainer 手动跑 npm publish + git tag + GitHub release。

**Architecture**:沿用 v0.2 release 流程(release-gate.mjs + 手动 acceptance + 手动 publish);v0.3 加 Plan 5 落地的 §3.1-§3.5 v0.3 段验证。**v0.3 不自动 publish**(maintainer 责任,与 v0.2 同),plan 6 走到"全 acceptance PASS,等 maintainer 跑 publish"为止。

**Tech Stack**:无新依赖。

**Spec 引用**:[`2026-05-09-v0.3-plugin-migration-design.md`](../specs/2026-05-09-v0.3-plugin-migration-design.md) §6(文档更新清单)、§8(验收标准 1-8 全部)。

**前置**:Plan 0a + Plan 1 + Plan 2 + Plan 3 + Plan 4 + Plan 5 全部完成。Plan 0b(forge full fixture spike)在 Plan 6 之前跑(它 unblock release)。

---

## File Structure(Plan 6 完成时改动)

```
docs/
├── README.md                            ← 改:安装段从 npx forge init → /plugin install
├── getting-started.md                    ← 改:5 分钟跑通(三 harness 各一遍)
├── installation.md(v0.3 新)              ← 拆 claude-install.md / codex-install.md / opencode-install.md
├── harness-setup.md                      ← 标 deprecated(内容移到 install.md)
├── cli-reference.md                      ← 加 forge upgrade 文档
├── v0.2-known-limitations.md             ← 文末加 "v0.3 已解" 段
├── migration/
│   └── v0.2-to-v0.3.md(v0.3 新)         ← upgrade walkthrough
├── release-gate-checklist.md             ← Plan 5 已加 §3 v0.3 段
└── ...

CHANGELOG.md                              ← 改:加 v0.3.0 段(7 决策 + breaking changes)

release-gate-evidence/v0.3/                ← Plan 5 + Plan 6 evidence 集中归档
├── claude-fresh-install.transcript.md     ← Plan 6 Task 6.2.1
├── opencode-fresh-install.transcript.md   ← Plan 6 Task 6.2.2(若 Tier 2 启用)
├── codex-fresh-install.transcript.md      ← Plan 6 Task 6.2.3(若 Tier 3 启用)
├── upgrade-from-v0.2.transcript.md        ← Plan 6 Task 6.3
├── bundled-offline-install.transcript.md  ← Plan 5 Task 5.2 已落
├── hook-failure-fallback.transcript.md    ← Plan 6 Task 6.4
└── npx-version-mismatch.warn.log          ← Plan 6 Task 6.5
```

---

## Task 6.1:文档更新

**Files:**
- Modify: `README.md`、`docs/getting-started.md`、`docs/cli-reference.md`、`docs/v0.2-known-limitations.md`、`CHANGELOG.md`
- Create: `docs/installation.md` + `docs/migration/v0.2-to-v0.3.md` + 三 harness install 子文档

### 6.1.1 README.md

- [ ] **Step 1**:Read 现有 README.md
- [ ] **Step 2**:改安装段 — 从 `pnpm dlx @accelerator-mzq/forge init --harness claude` 改为:

```markdown
## Installation

Tier 1 — Claude Code(全功能):
```
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
```

Tier 2 — OpenCode(skills + skill-driven CLI,Plan 0a.3 实测 commands FAIL):见 `docs/opencode-install.md`

Tier 3 — Codex(skills + skill-driven CLI,Plan 0a.2 实测 commands FAIL):见 `docs/codex-install.md`
```

### 6.1.2 docs/installation.md(新)+ 三 harness 子文档

- [ ] **Step 1**:写 `docs/installation.md` — 入口文档,引导到三 harness 各自 install.md
- [ ] **Step 2**:写 `docs/claude-install.md`(Plan 0a.1 验证过的命令)
- [ ] **Step 3**:写 `docs/opencode-install.md`(Plan 0a.3 Path A 验证过的命令)
- [ ] **Step 4**:写 `docs/codex-install.md`(Plan 0a.2 验证过的命令 + symlink + npm i -g)

### 6.1.3 docs/migration/v0.2-to-v0.3.md(新)

- [ ] **Step 1**:写 walkthrough — Step 1: install forge@v0.3 → Step 2: forge upgrade → Step 3: install plugin → Step 4: 起 session 验证

### 6.1.4 docs/v0.2-known-limitations.md 文末加段

- [ ] **Step 1**:加 "v0.3 已解" 段

```markdown
## v0.3 状态(2026-05-XX)

- **P0 skill auto-trigger 完全失效**:Plan 0a.1.4 实测 PASS,plugin 加载的 skills 真进 Claude Code auto-trigger 池
- **P1 forge CLI 不在全局 PATH**:Plan 3 落地的 `scripts/run-forge.mjs` helper 用 `npx -y --package` 解决,bundled plugin 提供离线变体
- **P2 brainstorming skill 与 init 不匹配**:Plan 2.1 加 git-aware preflight,空 repo 主动询问
- **P3 tasks.md 过度生成**:Plan 2.2 加 scale-aware mode + light_threshold config + `--light` flag,trivial change 走 light mode

完整设计:`docs/specs/2026-05-09-v0.3-plugin-migration-design.md`。
完整 spike 实测:`spike/v0.3/0a-summary.md`。
```

### 6.1.5 CHANGELOG.md

- [ ] **Step 1**:加 v0.3.0 段

```markdown
## v0.3.0 (2026-05-XX)

### Major changes (7 decisions)

22. v0.3 范围:三 harness plugin 化 + P2/P3 模板修复 + v0.2→v0.3 upgrade
23. 分发渠道:自建 git marketplace
24. CLI 双轨:主 plugin (npx) + bundled (vendored dist) 变体
25. 三 harness manifest:`.claude-plugin/` + `.codex-plugin/` + `.opencode/plugins/`
26. skills 体系重构 + commands 重构(Tier 1 helper / Tier 2/3 内化到 skill)
27. 升级路径:`forge upgrade` 命令(5 阶段事务化)
28. Phase 0.5 重跑:Plan 0a 三 harness 协议 spike(全 unblock,无 DEFER)

### Breaking changes

- `forge init` deprecated(v0.4 移除),改用 `/plugin install forge@accelerator-mzq-forge`
- v0.2 项目升级:跑 `forge upgrade` 清理 legacy adapter 产物
- OpenCode + Codex 路径下 `/forge:*` slash 命令不可用(Plan 0a 实测确认),改用 skill auto-trigger + 内嵌 fenced bash

### Bug fixes

- P2:brainstorming skill 加 git base 检测,避免空 repo 静默 commit
- P3:writing-plans 加 scale-aware mode,trivial change 不再产 511 行 tasks.md

### Acknowledgments

Plan 0a spike 经 Codex 5 轮 + opus subagent 1 轮独立 review,共修 64 条问题(11 条作为已知限制列在 plan 末尾)。
```

- [ ] **Step 2**:Commit 6.1 全部

```bash
git add README.md docs/ CHANGELOG.md
git commit -m "docs(v0.3): release notes + installation paths + migration guide"
```

---

## Task 6.2:三 harness fresh install acceptance

**Files:**
- Create: `release-gate-evidence/v0.3/{claude,opencode,codex}-fresh-install.transcript.md`(若对应 Tier 启用)

### 6.2.1 Claude Code(Tier 1 必)

- [ ] **Step 1**:fresh fixture 项目(`/tmp/forge-fresh-claude/` + git init)
- [ ] **Step 2**:`/plugin marketplace add Accelerator-mzq/forge` + `/plugin install forge@accelerator-mzq-forge` + `/reload-plugins`
- [ ] **Step 3**:重启 session 验证 SessionStart hook 注入 + 12 skills 进 auto-trigger 池
- [ ] **Step 4**:走完整 happy path(brainstorm → propose → apply → review → verify → archive)
- [ ] **Step 5**:贴 transcript 到 `release-gate-evidence/v0.3/claude-fresh-install.transcript.md`

### 6.2.2 OpenCode(Tier 2 启用)

(若 Plan 0b.3 PASS,本 task 必;若 Plan 0b.3 FAIL,本 task 跳,Tier 2 推 v0.4)

- [ ] **Step 1**:fresh fixture + 配 opencode.json plugin 数组(Path A,Plan 0a.3 验证)
- [ ] **Step 2**:重启 OpenCode 验证 transform hook 注入 + skills.paths discovery
- [ ] **Step 3**:输入 "我想做 todo list" 验证 brainstorming auto-trigger
- [ ] **Step 4**:走 happy path(skill 内嵌 fenced bash 调 helper,Plan 3 落地)
- [ ] **Step 5**:贴 transcript

### 6.2.3 Codex(Tier 3 启用,若 Plan 0b.2 PASS)

- [ ] **Step 1**:clone forge 到 `~/.codex/forge` + symlink `~/.agents/skills/forge` + `npm i -g @accelerator-mzq/forge@^0.3`
- [ ] **Step 2**:重启 Codex 验证 skill auto-trigger
- [ ] **Step 3**:走 happy path(同 OpenCode,skill 内嵌 fenced bash)
- [ ] **Step 4**:贴 transcript

- [ ] **Step 5**:Commit 三 fresh install evidence

---

## Task 6.3:upgrade-from-v0.2 fixture acceptance

**Files:**
- Create: `release-gate-evidence/v0.3/upgrade-from-v0.2.transcript.md`

- [ ] **Step 1**:准备 v0.2 完整 fixture(npm i v0.2 forge,跑 `forge init --harness claude`,产生 `.claude/skills/forge-*/` + `.claude/commands/forge/`,加假 `forge/changes/<id>/` 内容)
- [ ] **Step 2**:升级到 v0.3:`npm i -g @accelerator-mzq/forge@0.3.0`(或 npx)
- [ ] **Step 3**:跑 `forge upgrade` → 列清单 + 询问 → y → STASH 完成 + plugin install 指引输出
- [ ] **Step 4**:验证 `forge/` 目录 0 损失(diff 前后)
- [ ] **Step 5**:跑 `forge upgrade --recover`(24h 内)→ 全部回原位 → 验 hash 一致
- [ ] **Step 6**:重跑 `forge upgrade y` + 装 plugin → 完整工作流(Plan 0b.1 验证过的 happy path)PASS
- [ ] **Step 7**:贴 transcript + Commit

---

## Task 6.4:Hook fail fallback acceptance

**Files:**
- Create: `release-gate-evidence/v0.3/hook-failure-fallback.transcript.md`

- [ ] **Step 1**:用 Plan 0a.1 验证过的 fixture
- [ ] **Step 2**:模拟 hook 不可执行:`chmod -x ~/.claude/plugins/cache/.../hooks/session-start`(具体路径看用户 Claude Code plugin cache)
- [ ] **Step 3**:重启 session,验证 fallback — system prompt 无 using-forge,但 plugin skills 仍进 auto-trigger 池(brainstorming auto-trigger 仍 work)
- [ ] **Step 4**:贴 transcript

---

## Task 6.5:npx version mismatch acceptance

**Files:**
- Create: `release-gate-evidence/v0.3/npx-version-mismatch.warn.log`

- [ ] **Step 1**:`npm i -g @accelerator-mzq/forge@0.2.0`(模拟用户旧版)
- [ ] **Step 2**:在 Claude Code session 内跑 `/forge:propose <id>` → commands.md 调 helper → helper 内 npx ^0.3 → 拉新版 + 报警旧版 + 退出非零
- [ ] **Step 3**:贴 stderr 输出到 log 文件

---

## Task 6.6:5 个本地命令 + 全 eval

- [ ] **Step 1**:5 local cmds 全 0(typecheck / lint / format:check / build / test)
- [ ] **Step 2**:`pnpm eval` 全 PASS(包含 Plan 2 P2/P3 fixture)
- [ ] **Step 3**:CI Linux + Windows 双绿(Plan 1 既有 CI 工作流应自动跑)

---

## Task 6.7:验收清单 + maintainer 跑 publish

按 spec §8 验收 8 项逐一 check:

- [ ] 1. Plan 0a 三 harness 协议 spike PASS(已 commit)
- [ ] 2. Plan 0b 三 harness full fixture spike PASS(Plan 0b 在 Plan 6 之前跑)
- [ ] 3. eval 不回归(`pnpm eval` 全绿)
- [ ] 4. CLI 命令矩阵明确(7 个公开:init deprecated / upgrade / validate / archive / config / update / legacy-bridge)
- [ ] 5. 5 个本地命令全绿 + CI Linux + Windows 双绿
- [ ] 6. release-gate-checklist v0.3 段 evidence 全归档
- [ ] 7. upgrade-from-v0.2 fixture PASS,forge/ 产物 0 损失,--recover 24h 内可还原
- [ ] 8. bundled plugin 断网装 + happy path PASS
- [ ] 9. README + getting-started 走通(Tier 1 必;Tier 2/3 启用必)

**全 PASS 后**,maintainer:

```bash
# 1. 跑 release-gate.mjs
pnpm release-gate

# 2. 手动 publish(确认 ANTHROPIC_API_KEY 等 secret 不进 npm tarball)
pnpm publish

# 3. git tag + GitHub release
git tag v0.3.0
git push origin v0.3.0
gh release create v0.3.0 --title "v0.3.0 — Plugin Migration" --notes-file CHANGELOG.md \
  dist-bundled/forge-bundled-v0.3.0.tgz   # bundled tarball 作为 release artifact
```

- [ ] **Step 1**:maintainer 跑 release-gate
- [ ] **Step 2**:maintainer 跑 npm publish
- [ ] **Step 3**:maintainer 跑 git tag + gh release create
- [ ] **Step 4**:Commit + push + 通知用户 v0.3.0 已发布

```bash
git add CHANGELOG.md
git commit -m "release: v0.3.0 — Plugin migration (three-harness, P2/P3 fixes, upgrade command, bundled)"
git tag v0.3.0
git push origin --tags
```

---

## Self-Review

**Spec 覆盖**:
- ✅ §6 文档更新清单 → Task 6.1 全部
- ✅ §8 验收标准 1-9 → Task 6.7 逐项 check
- ✅ §5.4 release-gate-checklist v0.3 段 → 由 Plan 5 Task 5.3 落地,Plan 6 Task 6.2-6.5 跑

**Placeholder scan**:
- Task 6.4 Step 2 模拟 hook 不可执行的具体 path 取决于 Claude Code 用户 plugin cache 实际位置;实施时实测路径再填
- Task 6.5 Step 1 装 v0.2 时若 npm registry 没 v0.2.0 包(开发期),用 local tarball 替代

**Type consistency**:`forge` plugin name / `forge-bundled` 变体名 / `accelerator-mzq-forge` marketplace name 三层命名一致;Tier 1/2/3 决策跟 Plan 0a-summary.md 的 Decision action 严格对齐。

**已知风险**:
- Plan 6 不能跳到 maintainer publish(plan 中 Step 1-3 由 maintainer 手动跑)— 实施时确保 maintainer 真在场
- Tier 2/3 启用条件依赖 Plan 0b 结果;若 Plan 0b.2 / 0b.3 实测 FAIL,Plan 6 Task 6.2.2/6.2.3 跳 + spec §7 R3 修订(已留 fallback)

---

**Plan 6 完成,落地于** `docs/plans/2026-05-09-plan-6-release.md`。

**v0.3.0 release 阻塞解除条件**:
- Plan 0a + 0b 三 harness 全 PASS(已 0a PASS,0b 待 Plan 1+2+3+4 完成后跑)
- Plan 1-5 全部 commit + 测试通过
- Task 6.1-6.6 evidence 全归档
- Task 6.7 验收 9 项逐一 PASS

**v0.3.0 ship 范围确认**(基于 Plan 0a 实测):
- Tier 1 Claude Code:全功能 ENABLE
- Tier 2 OpenCode:PARTIAL_SHIP(skills + skill-driven CLI;commands 推 v0.4)
- Tier 3 Codex:PARTIAL_SHIP(同上)
