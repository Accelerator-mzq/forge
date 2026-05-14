# Forge Release Gate Checklist

每发版必须人工跑一遍。任一不通过不发版(spec §5.1)。

## 1. 自动化部分(在 dev 或 release 候选分支上跑)

```bash
pnpm install --frozen-lockfile
node scripts/release-gate.mjs
```

`release-gate.mjs` 会:
- 跑 5 个本地命令(typecheck / lint / format:check / build / vitest)
- `pnpm pack --dry-run` 验证 tarball 内容仅含 `dist/` + 3 个 license/readme 文件
- 创建临时目录,`npm install` tarball,验证 `forge --version` 退出码 0

任一 step 失败 → 报错并退出非 0,不进入手动部分。

## 2. 手动部分:harness acceptance test(spec §5.1)

**v0.1 必须跑两 harness:Claude Code + Codex。任一失败不发版。**

### 2.1 Claude Code

1. 起一个空目录 `mkdir /tmp/forge-release-test-claude && cd $_`
2. `git init`(forge 在非 git 项目下会 warn,在 git 下表现完整)
3. `pnpm dlx @accelerator-mzq/forge init --harness claude`(若发版前,可用本地 tarball 替换:`npm install -g <forge-tarball>` 后跑 `forge init --harness claude`)
4. 起 Claude Code 会话(`claude` 命令)
5. **第一句发**:`我想做个 todo list 应用`
6. **期望(✅ 通过条件,全满足才算 PASS)**:
   - AI 不写代码,反而开始问问题
   - AI 提到至少一个 forge 概念(如 "forge:brainstorming" / "forge/drafts/")
   - 多轮对话完成后,`forge/drafts/<date>-todo-list.md` 文件被创建
7. 把 transcript 复制到 `docs/release-gate-evidence/<version>-claude.md`(供后续 release notes 引用)

### 2.2 Codex

同上,但 step 3 改为 `--harness codex`,step 4 改为起 Codex 会话。

文件路径变为 `.agents/skills/forge-*/SKILL.md`(共享 Claude Agent SDK 约定)而非 `.claude/`。

### 2.4 Brownfield Acceptance(v0.2 新增)

**v0.2 必须跑 7 个 brownfield scenario。任一失败不发版。**

#### 2.4.1 opt-in 流程

1. 起空目录 `mkdir /tmp/forge-bf-1 && cd $_ && git init`
2. `pnpm dlx @accelerator-mzq/forge init --harness claude`
3. 不在 `forge/config.yaml` 加 `legacy_bridge.allow_llm_calls`
4. 跑 `forge legacy-bridge regenerate`
5. **期望(✅)**:exit 1 + 提示 "legacy-bridge 命令需要发送数据到 Anthropic API"

#### 2.4.2 redact 真生效

1. 写 `docs/legacy/secret-srs.md`,含 `<<aws-example-placeholder>>` + `ghp_aaaaaaaa...` + `foo@example.com`
2. 配 anchors.yaml + 启用 LLM(`forge legacy-bridge --acknowledge-data-transfer`)
3. 跑 `forge legacy-bridge regenerate --redact-report --dry-run`
4. **期望(✅)**:stdout 输出 ≥ 3 类规则命中数(aws / github-pat / email)

#### 2.4.3 preflight 阻塞(**需 ANTHROPIC_API_KEY**)

> 当前实现:archive preflight 总是现场调 LLM 跑 sync-check,不读已有 `forge/legacy-sync-state/<id>.yaml`。
> 所以本 scenario 必须配 ANTHROPIC_API_KEY 真触发 LLM 产生 critical diff,无法用手编辑 yaml 短路。
> 真 cache 路径(`--use-cached-sync-state` 等)推 v0.3。

1. `forge/config.yaml` 加 `legacy_bridge.enforce_sync: true` + `legacy_bridge.allow_llm_calls: true`
2. 准备一个真 change:`forge/changes/add-payment/proposal.md` 含与某个 anchor(SRS / HLD)有冲突的语义改动(如新增"支付幂等性"约束,而老 SRS 没写)
3. 配好 anchors.yaml 指向冲突的老文档,跑 `forge legacy-bridge --acknowledge-data-transfer`
4. 跑 `forge archive add-payment`(已有合法 .verify-passed + .review-passed)
5. **期望(✅)**:exit 2,stderr 含 "X 项 critical 差异未 resolve",并产出 `forge/legacy-sync-state/add-payment.{md,yaml}`
6. 后续 resolve 路径:用户改 yaml status=resolved-by-doc-update / false-positive / skipped → `forge legacy-bridge resolve add-payment` exit 0

**fallback(无 API key 时)**:跑 `pnpm vitest run tests/cli/legacy-bridge/archive-integration.test.ts`,确认 preflight 集成测试全过(LLM mock 返 critical → preflight 阻塞 + sync-state.yaml 写入 + lock 释放,覆盖 §2.4.3 决策路径)。

#### 2.4.4 lock 并发

1. 终端 A:`forge legacy-bridge regenerate &`(后台)
2. 终端 B 立即:`forge archive add-x`
3. **期望(✅)**:终端 B exit 5,stderr 含 "another forge archive is in progress"
4. 终端 A 跑完后,终端 B 重跑应正常

#### 2.4.5 多 harness skill smoke 不退化

跑 §2.1 + §2.2 的 Claude Code + Codex acceptance test 各一次。
**期望(✅)**:Plan 4 e2e brainstorming 逻辑无变化。

#### 2.4.6 Excel 解析

1. 准备多 sheet `.xlsx`(用 `tests/fixtures/legacy-bridge/_make-excel-fixture.mjs` 生成 fixture)
2. 配 anchors.yaml `path: ./test.xlsx, sheet: TestCases`
3. 跑 `forge legacy-bridge regenerate --role system-tests --dry-run`
4. **期望(✅)**:exit 0,无 ExcelParseError

#### 2.4.7 disclaimer 含 license

1. 跑 `forge legacy-bridge regenerate`(配好 anchors)
2. cat `forge/docs/regenerated/SRS.md`
3. **期望(✅)**:frontmatter 含 `license: derived-from-source` + 顶部 disclaimer 含 "此文档由 forge 自动生成"

#### 失败处理

任一不满足:

- 不发版
- GitHub Issue 标 `release-gate-fail` + `brownfield`
- 检查最近 PR 是否动了 `src/core/legacy-bridge/` 或 `forge-eval/regeneration-*`
- 修复 → 重跑全套 release gate

### 2.3 失败处理

任一 harness 不满足上述期望:
- **不发版**
- 在 GitHub Issues 开 issue,标 `release-gate-fail` label
- 检查最近 PR 是否动了 `src/core/templates/skills/using-forge.md` 或 `forge:brainstorming` 文本
- 修复 → 跑全套 release gate(自动 + 手动)→ 通过后再发版

## 3. 发版动作(checklist 全过后,maintainer 手动)

```bash
# 1. 更新版本号(根据 CHANGELOG.md)
npm version <patch|minor|major> --no-git-tag-version

# 2. 提交 version bump
git add package.json
git commit -m "chore: release v<X.Y.Z>"

# 3. push 并合并到 main(走标准 PR 流程,等 CI 绿)

# 4. 打 git tag
git tag v<X.Y.Z>
git push origin v<X.Y.Z>

# 5. npm publish
npm publish --access public

# 6. 在 GitHub 上 Create release(从 v<X.Y.Z> tag),粘贴 CHANGELOG.md 该版本段
```

## 4. 发版后 sanity check

```bash
# 在干净环境验证全球可装
mkdir /tmp/forge-postrelease && cd $_
npm install -g @accelerator-mzq/forge
forge --version       # 应输出 X.Y.Z
forge init --harness claude
ls .claude/skills/    # 应见 12 个 forge-*/
```

任一不通过 → 立即在 GitHub Issues 开 issue,考虑 unpublish(`npm unpublish` 仅在发版 72 小时内可用)+ patch release。

---

## §3 v0.3 Plugin Migration release gate(2026-05 加)

v0.3 新增 6 项验证(Plan 0a + Plan 5 落地)。release v0.3.0 前必须 evidence 全归档到 `release-gate-evidence/v0.3/`。

### §3.1 Plugin install fresh path(三 harness)

- [ ] **Tier 1 Claude Code**(必)
  - [ ] 准备 fresh fixture 项目(`mkdir /tmp/forge-fresh-claude && cd $_ && git init -q`)
  - [ ] session 内 `/plugin marketplace add Accelerator-mzq/forge` + `/plugin install forge@accelerator-mzq-forge` + `/reload-plugins`
  - [ ] 重启 session,输入 "我想做个 todo list" → AI 自动 invoke `Skill(forge:brainstorming)` + 走完 brainstorming 流程
  - [ ] Evidence:`release-gate-evidence/v0.3/claude-fresh-install.transcript.md`
- [ ] **Tier 2 OpenCode**(若 Tier 2 启用,Plan 0a.3 PASS 后必)
  - [ ] 配 `~/.config/opencode/opencode.json` plugin 数组(file: 协议指本地或 git+https URL)
  - [ ] 重启 OpenCode 验证 `'experimental.chat.messages.transform'` hook 注入 + skill auto-trigger
  - [ ] Evidence:`release-gate-evidence/v0.3/opencode-fresh-install.transcript.md`
- [ ] **Tier 3 Codex**(若 Tier 3 启用,Plan 0a.2 PASS 后必)
  - [ ] clone forge → symlink `~/.agents/skills/forge` → `npm i -g @accelerator-mzq/forge@^0.3` → 重启 Codex
  - [ ] 输入 "我想做 X" → AI 自动 invoke skill(Plan 0a.2 实测 PASS)
  - [ ] Evidence:`release-gate-evidence/v0.3/codex-fresh-install.transcript.md`

### §3.2 forge upgrade from v0.2 fixture

- [ ] 准备 v0.2 完整 fixture:`npm i v0.2 forge` + `forge init --harness claude` + 假 `forge/changes/<id>/` 内容
- [ ] 跑 `forge upgrade`,选 y → STASH 完成 + plugin install 指引输出
- [ ] 验 `forge/` 目录 0 损失(diff 前后)
- [ ] 24h 内跑 `forge upgrade --recover` → 全部回原位 + 验 hash
- [ ] 重新 `forge upgrade` y + 装 plugin → 完整工作流跑通
- [ ] Evidence:`release-gate-evidence/v0.3/upgrade-from-v0.2.transcript.md`

### §3.3 bundled plugin 断网装 + 跑通 happy path(Tier 1 only)

- [ ] 跑 `node scripts/build-bundled-plugin.mjs` 产 `dist-bundled/forge-bundled-v<version>.tgz`
- [ ] 验证 tarball 大小合理(0.2-7 MB,含 dist/)
- [ ] 解压验证内容:含 `.claude-plugin/` + `dist/` + patched `scripts/run-forge.mjs`(spawn node + dist/cli/index.js,无 npx 引用);**不含** `.codex-plugin/` plugin manifest 与 `.opencode/plugins/`(bundled 仅 Claude Code,Plan 5 已实测)
- [ ] 断网,在另一 fixture 项目 `/plugin install --from-tarball <path>` → 重启验证 brainstorming auto-trigger + helper 调本地 dist/(无 npx + 无网)
- [ ] Evidence:`release-gate-evidence/v0.3/bundled-offline-install.transcript.md`

### §3.4 SessionStart hook fail 时 fallback

- [ ] 模拟 hook 不可执行:`chmod -x ~/.claude/plugins/cache/.../hooks/session-start`(具体路径看用户 cache)
- [ ] 重启 session,验证 fallback — system prompt 无 using-forge,但 plugin skills 仍进 auto-trigger 池(brainstorming auto-trigger 仍 work,Plan 0a 实测过的双层防护)
- [ ] Evidence:`release-gate-evidence/v0.3/hook-failure-fallback.transcript.md`

### §3.5 npx 拉 forge 0.3 with 用户机已有 forge 0.2 全局

- [ ] `npm i -g @accelerator-mzq/forge@0.2.0`(模拟旧版)
- [ ] plugin v0.3 commands.md 调 helper → helper 内 `--package @accelerator-mzq/forge@^0.3` semver 解析 → 拉新版 + 报警老版本 + 退出非零
- [ ] Evidence:`release-gate-evidence/v0.3/npx-version-mismatch.warn.log`

### §3.6 命令矩阵明确(spec §8 验收 #3)

- [ ] `forge init`(deprecated,stderr 警告 + 不阻塞 — Plan 4 Task 4.5 落地)
- [ ] `forge upgrade`(v0.3 新增,Plan 4 Task 4.3-4.4)
- [ ] `forge validate` / `forge archive` / `forge config` / `forge update` / `forge legacy-bridge`(原)
- [ ] 共 7 个公开命令,跑 `forge --help` 验证全列出

### v0.3 release 阻塞门禁

§3.1 Tier 1 + §3.2 + §3.3 + §3.6 必须 PASS;§3.1 Tier 2/3 + §3.4 + §3.5 PASS 才启用对应能力。任一阻塞项 FAIL → 退回相应 Plan 修。

## §4 v0.4 forge migrate 发布门(2026-05-10)

### §4.1 代码 + 测验证

- [ ] `pnpm format:check` 0 error
- [ ] `pnpm lint` 0 error
- [ ] `pnpm typecheck` 0 error
- [ ] `pnpm test` 全 PASS;含 tests/migrate/\* 与 tests/cli/migrate.test.ts
- [ ] `pnpm build` 0 error;dist/cli/index.js 可调起 `forge migrate --help`

### §4.2 端到端手测

- [ ] 用 `tests/fixtures/migrate/openspec-minimal/` 跑一次完整 `--no-regenerate`,验 forge/ 树就位
- [ ] 用 `tests/fixtures/migrate/superpowers-minimal/` 跑一次完整 `--no-regenerate`(启 git fixture);验 [needs-fix] 标准
- [ ] 在真 OpenSpec 项目跑 `forge migrate openspec --regenerate`(可选:开发者本机手测,验 LLM 路径)
- [ ] 在真 superpowers 项目跑 `forge migrate superpowers --regenerate`(同上)

### §4.3 兼容性

- [ ] `tests/core/archive/lock.test.ts` 旧断言"another forge archive..."仍 PASS(spec §5.1 v3 兼容性约束)
- [ ] `tests/cli/archive.test.ts` 旧断言仍 PASS
- [ ] forge upgrade(v0.2 → v0.3)依然跑通;migrate 不影响其工作流(spec §7.3 独立)

### §4.4 文档完整

- [ ] README "从已有项目搬过来" 段加;链接到 docs/migration/
- [ ] docs/migration/from-openspec.md 完整(前置 + 流程 + transformer + FAQ + cleanup)
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

## §5 v1.0 fusion completion 发布门(2026-05-14)

本段沿 §4 v0.4 模板,验 plan-9z release(plan-9a 到 plan-9j 9 sub-plan 累积 + plan-9z polish 9 工作单消化)。

### §5.1 代码 + 测验证

- [ ] `pnpm format:check` 0 error
- [ ] `pnpm lint` 0 error
- [ ] `pnpm typecheck` 0 error
- [ ] `pnpm test` 全 PASS;含 9a 横切 + 9b out-of-scope + 9c fluid-pause + 9d verify-three-dimensions + 9e archive-soft-warning + 9f explore + 9g process_evidence + 9h SDD + 9i writing-skills + 9j marker-deprecation 全部 test 模块
- [ ] `pnpm build` 0 error;`dist/cli/index.js` 可调起:
  - `forge --help` 列出所有 9 sub-plan 引入的子命令
  - `forge preflight branch-check --help`(plan-9h)
  - `forge ack --help`(plan-9a)
  - `forge verify --help`(plan-9d)
  - `forge upgrade --resign-markers --help`(plan-9j)
  - `forge explore --help`(plan-9f,若 9f 引入 CLI 入口)
- [ ] `forge-eval` baseline 跑 main-agent-stop.yaml 3 scenario 全 pair_pass=true(plan-9z Task 5 消化)

### §5.2 端到端手测

- [ ] `forge init` 在新目录创建 forge 工作树(verify init.ts:38 warning 文本含 "v1.2" 字样)
- [ ] `forge migrate openspec/superpowers` 仍可用(plan-8/v0.4 兼容性)
- [ ] `forge ack propose/confirm/reject` 三子命令协议跑通(plan-9a)
- [ ] `forge upgrade --resign-markers <changeId>` 在 v0.4 marker 上跑通(plan-9j)
- [ ] `forge verify` LLM-judge 路径跑通(plan-9d;可选,需 ANTHROPIC_API_KEY)
- [ ] `forge archive <changeId>` 全 13 不变量校验 + handoff_to_backlog(plan-9e)

### §5.3 兼容性

- [ ] v0.4 native marker(无 `created_by_tool_version` / 无 `legacy=true`)走 strict path 不被 9j legacy-exemption 拦
- [ ] v0.2 fixture(brownfield 路径)仍跑通(spec §5.1 v3 兼容性约束)
- [ ] `forge upgrade`(v0.2 → v0.3 → v0.4 → v1.0)仍跑通

### §5.4 文档完整

- [ ] README 主页含 v1.0 fusion completion 主题描述(若需要)+ 链接 design v3
- [ ] `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` v3 commit 在 docs/specs/(已 commit)
- [ ] 9 sub-plan 文件(plan-9a 到 plan-9j)+ master plan + plan-9z 全在 `docs/plans/`
- [ ] `CHANGELOG.md` `[1.0.0]` 段写完(plan-9z Task 2)
- [ ] `.claude/skills/writing-skills/SKILL.md` + `forge-eval-integration.md` + `subagent-driven-discipline/SKILL.md` 含 plan-9z polish 协议升级(plan-9z Task 4 / Task 5)

### §5.5 npm 包

- [ ] `package.json` `version` = `1.0.0`;`bin` 字段保 `forge`
- [ ] `pnpm pack` 产 tarball;解压检查:
  - `dist/cli/index.js` 在
  - `dist/cli/commands/preflight.js`(plan-9h)+ `dist/cli/commands/ack.js`(plan-9a)+ `dist/cli/commands/verify.js`(plan-9d)+ `dist/cli/commands/upgrade.js` 含 `--resign-markers`(plan-9j)
  - bundled `src/core/templates/` 含 9c/9g/9h apply.md + 9h SDD SKILL.md + 9i writing-skills/SKILL.md 反向同步内容
- [ ] `pnpm publish --dry-run` 验包内文件清单(forge-repo files 字段)

### §5.6 plugin 形态(若同步发 plugin)

- [ ] bundled plugin tarball(若发):dist/cli/commands/ 含全部 9 sub-plan 子命令
- [ ] `commands/preflight.md` / `commands/ack.md` / `commands/verify.md` / `commands/upgrade.md` / `commands/archive.md` / `commands/explore.md`(若 9f 引入)plugin slash 命令对齐 CLI 子命令
- [ ] `.claude/skills/writing-skills/` + `.claude/skills/subagent-driven-discipline/` 全 skill bundled(plan-9z polish 协议升级后内容)

### §5.7 plan-9z polish 9 工作单消化 verify

- [ ] **P-1**(plan-9h Task 4 concern α):`.claude/skills/subagent-driven-discipline/SKILL.md` §"Main Agent STOP Triggers" 第 6 行 cross-ref `forge preflight branch-check` 字面在
- [ ] **P-2**(plan-9h Task 4 concern β):`forge-eval/scenarios/main-agent-stop.yaml` `stop-on-repeat-failure` must_not_match regex 收紧 + 判分锚点段补
- [ ] **Pattern O**:`.claude/skills/writing-skills/SKILL.md` 步骤 1 含 "registry + scenarios + 骨架一起 commit" 警示
- [ ] **Pattern P**:`.claude/skills/writing-skills/SKILL.md` 步骤 1 含 "rubric 设计原则" 段
- [ ] **Pattern Q**:`.claude/skills/writing-skills/forge-eval-integration.md` 含 "判分锚点段示例"
- [ ] **Pattern R**:`.claude/skills/writing-skills/SKILL.md` 步骤 1 含 "RED avg > 5 立即 REFACTOR" 硬 trigger
- [ ] **P-5**:`.claude/skills/subagent-driven-discipline/SKILL.md` §2.1 含 "external protocol assumption verify"
- [ ] **P-6**:`.claude/skills/subagent-driven-discipline/SKILL.md` §3.X 含 "rubric 软度 vs 验证强度"
- [ ] **P-7**:`.claude/skills/writing-skills/forge-eval-integration.md` 含 "must_not_match 引用 vs 行为边界" 子段
- [ ] **P-8**:`.claude/skills/subagent-driven-discipline/SKILL.md` §3.X 含 "Task BLOCKED 修订决策树"
- [ ] **P-3**(scope-out 延 v1.1):若 §5.1 verify 跑复现 fence-9.2 timeout 顺手修;未复现延 v1.1
- [ ] **P-9**(scope-out 延 v1.1):`src/core/git/utils.ts` 抽出留 v1.1

### v1.0 release 阻塞门禁

以上 §5.1-§5.7 全勾 + 跨 OS CI 全绿 → 阻塞解除,maintainer 可触发 `pnpm publish`。
