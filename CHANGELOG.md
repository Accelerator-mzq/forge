# Changelog

All notable changes to this project will be documented in this file.

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [4.1.0] - 2026-05-21

### Changed

- **`scripts/run-forge.mjs` wrapper 重构 — 主路径 spawn node + npx-cli.js,绕过 Windows cmd.exe 解析层**。三同根 bug 根治路径(v4.0.x 系列遗留技术债)。

  **背景**:v4.0.x 系列三个 bug 同根于 `spawn { shell: process.platform === 'win32' }`(Node 21+ CVE-2024-27980 修复后,spawn `.cmd` 文件强制要求 `shell: true`)→ 走 cmd.exe 解析 args → cmd.exe 干扰 args:
  - JSON 花括号 `{}` 引号嵌套被吃 → `forge monitor record --json '{...}'` 100% `record_error`(v4.0.1 workaround:`--json-file`)
  - 引号嵌套乱 → stage-extensions build_prompt 失焦扫整个 working tree(v4.0.1 workaround:config 加 `--user-focus` + preflight 检测)
  - `^` 字符当 escape char 吃 → `^4.0.0` 变 `4.0.0` 永远拉不到 patch update(v4.0.2 workaround:`REQUIRED_RANGE` 改 `4.x`)

  **v4.1.0 重写**:主路径用 `execSync('npm root -g')` 解析 npm 全局 root → 拼 `<root>/npm/bin/npx-cli.js` 路径 → `spawn(process.execPath, [npxCliPath, ...npxArgs], { shell: false })` 直接 node 跑 npx-cli.js,**完全无 cmd.exe 解析层**。

  **fallback 保留**:`npm root -g` 失败 / candidate 不存在 → 退回 v4.0.2 wrapper(`spawn('npx.cmd', ..., { shell: true })`),做 safety net。`REQUIRED_RANGE` 保持 `4.x`(cmd-safe),fallback 路径自身也不会被 `^` escape 坑。

  **影响范围**:Linux/macOS 无 cmd.exe 解析层 不受影响;Windows 用户主路径下三 bug 根治,fallback 路径下退回 v4.0.2 行为。

### Added

- **`tests/integration/run-forge-wrapper.test.ts`** — wrapper 源码层验证(14 case):REQUIRED_RANGE cmd-safe 规则、主路径 `spawn node + npx-cli.js + shell:false` 形态、fallback 路径保留、错误处理、文档注释完整性。沿 `tests/integration/opencode-plugin-bootstrap.test.ts` 模式,静态分析 source code 防回归。

## [4.0.2] - 2026-05-21

### Fixed

- **Windows wrapper 永远拉 4.0.0 — `scripts/run-forge.mjs` REQUIRED_RANGE `^4.0.0` → `4.x`**(critical)。ForgeUE 项目实测发现:v4.0.1 通过 plugin marketplace 升级后,文件层改动(SKILL.md / forge.js bootstrap / docs / `forge/config.yaml` 示例)全部生效,但通过 wrapper 调的 CLI 永远是 v4.0.0 — wrapper `spawn(npx.cmd, [...], { shell: true })` 在 Windows 下走 cmd.exe,**cmd.exe 把 `^` 当 escape char 吃掉**,`@accelerator-mzq/forge@^4.0.0` 被解析为精确版本 `4.0.0` 而非 semver range,npx 永远拉 4.0.0。

  改 `REQUIRED_RANGE = '4.x'`(等价 `>=4.0.0 <5.0.0`,字符全 cmd-safe 字母数字 + 点)解决。Linux/macOS 不受影响(无 cmd.exe 解析层)。

  跨 major bump(4→5)时改 `5.x`。

### Known(未在本 release 修)

- **`spawn shell: true` 在 Windows 下的根本问题**:`run-forge.mjs:28` 仍然要 `shell: process.platform === 'win32'`(Node 21+ CVE-2024-27980 修复后,spawn `.cmd` 文件必须 `shell: true`)。本 PR 仅救 `^` escape 一个具体症状,**根因 cmd.exe 干扰 args 尚未根治**。其余两个同根 bug 在 v4.0.1 已通过 workaround 旁路(`--json-file` / config user-focus + preflight 检测),根治需重写 wrapper 走 lazy npm cache resolve + spawn `node + dist/cli/index.js`(无 .cmd 中间层),`scripts/build-bundled-plugin.mjs` 已有 pattern 参考。留 follow-up。

## [4.0.1] - 2026-05-21

### Added

- **`forge preflight stage-extensions-check` 子命令**(PR #62)— 扫 `forge/config.yaml#stage_extensions` 常见漏洞:adversarial entry 缺 `--user-focus` / `--target-label`(导致 codex 失焦扫整个 working tree)、adversarial 模式 entry 无 `build_prompt`(helper 立即失败)、`defaults.timeout_sec` > 900 或 `convergence.max_rounds` > 3(易 hang)。loose 模式 — 发现问题只 emit stderr,exit 0 不阻塞。覆盖 5 测试 case。
- **`forge monitor record --json-file <path>` flag**(PR #63)— 从文件读 JSON payload 替代 stdin `--json`,**绕过 Windows cmd.exe 引号嵌套吃花括号导致 100% `record_error`** 的 bug(`scripts/run-forge.mjs` 在 Windows 下 spawn `npx.cmd` 必须 `shell: true`,Node 21+ CVE-2024-27980)。`--json-file` 优先于 `--json`;文件不存在 / 解析失败 → `record_error` 降级。
- **`docs/migration/setup-stage-extensions.md`**(PR #62)— stage-extensions 完整 onboarding checklist(271 行):新项目 6-step setup / 已有项目检测 / 5 stage 各自 user-focus 文本设计 / preflight 验证 / 常见 FAQ。

### Fixed

- **OpenCode workflow-monitor 不会自动注入**(PR #61)— `.opencode/plugins/forge.js` 加 `getMonitorInjection`(inline copy `scanMonitorEnabled` 自 `hooks/monitor-check.mjs`),`transform` hook bootstrap 拼接 monitor injection,对齐 Tier 1 SessionStart hook 行为。
- **OpenCode 下 SKILL.md 引用 Claude Code 工具名(`Skill` / `Task` / `TodoWrite`)无翻译**(PR #59)— `.opencode/plugins/forge.js` bootstrap 末尾追加 Tool Mapping for OpenCode 段,避免 AI 调用不存在的工具导致流程漂移。
- **`hooks/workflow-monitor-injection.md` 硬编码 `${CLAUDE_PLUGIN_ROOT}`**(PR #61)— harness-agnostic 化:`<forge plugin root>` 按 Claude Code / OpenCode / Codex 三种解析方式说明,Codex 路径显式标注 fallback(无 hook 通道,主动 Read injection.md)。

### Docs

- **CLAUDE.md / AGENTS.md 同步 v4 现状**(PR #60)— v4.0.0 release 时遗漏:删 "核心增量是「反向加固协议」" 描述、`tasks_hash` / `content_hash` / `git.diff_hash` 完整性校验段(v4 BREAKING 已砍 ~5500 行);更正计数(14 CLI 子命令 / 9 slash 命令 / 17 skill,原写 16 / 10 / 16);"反向加固协议" 段改写为 "v4 设计转向",列 v4 留存的 4 项协议骨架。
- **`docs/codex-review.md` + `docs/getting-started.md` 示例修**(PR #62)— Quick Start 加 `defaults` 收紧示范、verify entry 加 `--user-focus`、callout 引 ForgeUE 实测案例 + 指向 `setup-stage-extensions.md`。
- **`skills/using-forge/SKILL.md`**(PR #59 + #61)— `## How to Access Skills` 段补 OpenCode / Codex CLI 平台说明;新增 `## Platform Tool Mapping` 表对照三 harness 工具等价;新增 `## workflow-monitor 跨 harness 兼容` 段。
- **`hooks/workflow-monitor-injection.md`**(PR #63)— 加 Windows 限制说明,`monitor record` 4 步全部给两种形态(macOS/Linux `--json` / Windows `--json-file` + tmp 文件中转)。

## [4.0.0] - 2026-05-21

### BREAKING

> v4 是 forge 设计哲学的整体转向 —— **从反向加固协议变为 OpenSpec 简洁对齐**。完整迁移指南见 [`docs/migration/v3-to-v4.md`](docs/migration/v3-to-v4.md)。

- **整套反向加固协议被砍**:删 13 fence、三级 severity、ack 两步协议、process-evidence freeze、ack-log 完整性链、verify_findings/review_outcomes marker 字段、transaction 五阶段 atomic、resign-markers 升级等机制(~5500 行净删)。设计动机:维护成本 > 收益,WARNING/suggestion 给用户自管,沿 OpenSpec 风格。
- **CLI 子命令整删**:`forge ack` / `forge evidence` / `forge pause-capture`、`forge upgrade --resign-markers` flag。`/forge:ack-confirm` slash 命令同步删。
- **marker schema v1 → v2**(BREAKING):
  - VerifyMarker / ReviewMarker 极简化(`forge-verify/v2` / `forge-review/v2`):仅留 `schema` / `verified_at`(`reviewed_at`)/ `verified_by`(`reviewed_by`)/ `pause_decisions?` / `created_by_tool_version?` 五字段
  - 删字段:`tasks_hash` / `content_hash` / `git` / `evidence[]` / `verify_findings[]` / `review_outcomes[]` / `process_evidence` / `ack_log_tail_hash` / `ack_log_entry_count`
  - `PauseDecisionSimple` 5 字段(`paused_at` / `task_ref` / `issue_summary` / `chosen_option` 1-4 / `notes?`),无 fence 校验
  - **失败 marker 整删** —— v4 verify/review 失败直接 abort,不再写 `.verify-failed` / `.review-failed`
- **archive_summary schema v1 → v2**:
  - 删字段:`acked_warnings` / `pending_suggestions` / `process_evidence_summary` / `verify_passed.verified_invariants` / `review_passed.reviewers`
  - 新字段:`verified_by` / `reviewed_by` 顶级 / `spec_updates_applied[]`(forge `applyDeltas` operation 风格,`create/replace/delete`)/ `handoff_to_backlog[]`(仅 `pause_decisions` chosen_option=3 + `scope_entries` active 两来源)
- **`forge archive` CLI flag 改造**:
  - 新增:`--yes`(CI 自动接受所有 confirm)/ `--skip-specs`(跳过 spec deltas)—— 沿 OpenSpec 风格
  - 删除:`--recover` / `--resume-summary` / `--resume`(transaction 中断恢复消亡)
  - 保留:`--force` / `--api`
- **`forge monitor` archive 阶段事件改名**:`fence_observed` → `archive_summary_observed`(更准确反映 v4 无 fence 拒签语义);data 字段对齐 v2 archive_summary(`verified_by` / `reviewed_by` / `spec_updates_applied_count` / `handoff_to_backlog_count`)。其他事件名(`marker_observed` / `record_error` / `stage_enter` / `cli_exit` / `hardening_step`)不变
- **`MonitorStage` 类型删 `'ack-confirm'`** —— 反加固两步 ack 协议消亡;health-verdict 不再对 `ack-confirm` 阶段做 trace anomaly 判定

### Removed

- 整删 `scripts/check-release-gate.mjs` + `tests/integration/release-blocker-attack-path.test.ts`(plan-9c reminder gate,v4 无 release-blocker 概念)。`pnpm test` 简化为单 `vitest run`,release 时机器纪律由 `pnpm release:gate`(`scripts/release-gate.mjs`)统管 7 步 typecheck/lint/format/build/vitest/pack/dry-install/brownfield。
- 整删 14 个 archive 子模块源码:`fence` / `process-evidence-fence` / `process-evidence-rerun` / `pause-decisions-fence` / `ack-log-consistency` / `verify-findings-fence` / `three-level-fence` / `legacy-exemption` / `version-retrograde-fence` / `transaction` / `recover` / `recover-prompt` / `resume-summary` / `fence-mapper`(`lock.ts` 迁出 `archive/` → `src/core/lock.ts`)
- 整删 4 fixture 目录:`tests/fixtures/{pause-decisions,verify-findings,archive-warnings,marker-version}/`
- 整删 ~40 测试文件 + 5 e2e integration 测试,新增 v4 简化版 `archive.test.ts` / `summary-builder.test.ts` / `marker-schema.test.ts` / `artifact-observer.test.ts`

### Changed

- **`divergence-map.ts`**:删 `archive-unresolved-warning` scenario(v4 archive 无 fence 拒签 WARNING),新加 v4-aligned `archive-spec-deltas-application` scenario(覆盖 forge `applyDeltas` + auto `generateBacklog` 独特性)
- **AGENTS.md / CLAUDE.md §3 改述 release gate 走 `release-gate.mjs`**(v4 简化)
- **docs**:新增 `docs/migration/v3-to-v4.md`(~280 行,§9 migration guide 落地)

### Migration

完整升级路径见 [`docs/migration/v3-to-v4.md`](docs/migration/v3-to-v4.md):

1. 升级前清掉 `forge/changes/<id>/.evidence/pending-acks/` + `forge/.cache/archive-pause-*.json` + `process-evidence.staging.yaml`
2. `pnpm update -g @accelerator-mzq/forge`(或 plugin marketplace 升级)
3. 对每个 active change 重跑 `/forge:verify` + `/forge:review` 写 v2 marker
4. 跑 `/forge:archive <id>` 通过 v2 schema validate + spec deltas apply

已 archived change 全部保留不动 —— v4 不读 v1 archive_summary,只追加新 archive。

## [3.1.1] - 2026-05-20

### Fixed

- **npm 发布包补全 stage-extensions 运行时资产**:`package.json#files` 此前仅含 `dist/`,导致 `scripts/codex-review-helper.mjs` 与 `src/core/codex-review/prompts/adversarial-default.md` 未进发布包,3.0.0 / 3.1.0 所有 npm 用户在 stage-extensions 5 个 stage 调 codex review / adversarial 都会因 helper 路径不存在或 prompt 模板缺失而失败。本版补齐两个资产到 `files` 字段;并在 release-gate 的 tarball 内容检查改用 `npm pack --dry-run`(跨平台),新增 helper + 模板必含断言,堵住「Windows 跳过」缺口。
- **bundled plugin tgz 同步补齐 codex 资产**:`scripts/build-bundled-plugin.mjs` 现额外拷 `scripts/codex-review-helper.mjs` 与 `src/core/codex-review/` 到 staging,bundled 离线分发形态也能跑 stage-extensions。
- **pause_decisions fence 与 proposal 段名对齐**:`src/core/archive/pause-decisions-fence.ts` option=1(扩 scope)的 `target_anchor` 字段校验与 diff 段定位正则从 `What Changes` 改为 `What`,与 `forge validate` 要求的 `## What` proposal 段名一致(此前 fence 死代码,marker 注释 / 模板 / fixture 仍用 OpenSpec 旧名 `## What Changes`,option=1 扩 scope 路径在 forge 3.x 下无法通过 archive)。同步收尾 `commands/apply.md`、`skills/exploring/SKILL.md`、`docs/getting-started.md`、`src/core/markers/types.ts` 注释及 13 个 pause-decisions 测试 / fixture。
- **docs**:`docs/codex-review.md` Quick Start 的 `codex-adversarial` 示例补 `build_prompt` + `command --prompt-file "${PROMPT_FILE}"`,并加 `code-review` 与 `adversarial` 差别说明(此前示例缺 `build_prompt`,helper `run --mode adversarial` 强制要求 `--prompt-file`,照抄示例直接报错退出)。
- **docs**:`docs/getting-started.md` 第 2 步加「4 件套格式速查」,展示 forge 3.x 的 `## What` proposal 段名、`## Scenario:` H2 spec scenario、`- [ ] <task-id>:` tasks 行三种正确格式,避免有 OpenSpec 习惯的用户照旧记忆写出 `## What Changes` 等导致 validate 报错。
- **`FORGE_VERSION` 漂移污染产物**(release-gate 拦下):`src/index.ts:3` 此前硬编码 `FORGE_VERSION = '1.3.0'`,自 2026-05-16 漂移 —— 不仅 `forge --version` 显示错,更关键是被写进 archive marker / legacy-bridge handoff manifest 的 `forgeVersion` 字段(`legacy-bridge.ts:954`、`archive.ts:1006/1051`),v3.0.0 / v3.1.0 所有用户 archive 产物 / handoff manifest 写的 `forgeVersion: '1.3.0'` —— 数据完整性问题。本版改为动态读包根 `package.json#version`(`new URL('../package.json', import.meta.url)`),根治漂移,版本号同步唯一源是 `package.json`。

## [3.1.0] - 2026-05-19

### Added

- **Tier 2/3 Orchestration 桥接段**:5 个 stage skill(`writing-plans`、`subagent-driven-development`、`requesting-code-review`、`verification-before-completion`、`finishing-a-development-branch`)末尾各加 "Tier 2/3 Orchestration" 桥接节,OpenCode/Codex 可通过读取 `commands/<stage>.md` 跑完 6 步完整工作流。
- **共享规则文件** `skills/_shared/tier23-command-bridge.md`:Tier 2/3 command-bridge 协议条款单一来源。
- **OpenCode plugin bootstrap 注入 plugin root**:`.opencode/plugins/forge.js` SessionStart 现注入 `forge plugin root` 绝对路径,修复 Tier 2 harness 拼 `commands/<stage>.md` 路径失败问题。

### Fixed

- **`forge ack confirm` 写 marker**:`ack confirm` 现按 action 写 marker ack 字段 —— `ack-warning` / `ack-pause-warning` 写 `severity_acked_by`/`severity_acked_at`(`ack-pause-warning` 同步 `.verify-passed`+`.review-passed` 双 marker 的 `pause_decisions` 条目),`downgrade` 写 `downgrade_acked_by`/`downgrade_rationale`/`downgraded_from`、翻转 `severity` WARNING→SUGGESTION 并重算 `finding_hash`;ack-log entry 的 `finding_hash` 改为真实值(此前写死 `null`)。此前 confirm 完全不写 marker,导致 WARNING-ack → archive 在全 tier 失效(forge-wide bug)。
- **pending-ack 文件名 namespace 编码**:文件名现正确编码 `pause_decisions:<id>` namespace 前缀。
- **`ack confirm` 事务原子化**:加 rollback + retry 幂等保障。

### Changed

- **文档订正**:`verification-before-completion` 与 `using-forge` skill 删除虚假 claim;README / installation / codex-install / opencode-install 文档更正版本行、harness tier 表拆为 slash 注册与 workflow-bridge 两列、数字统一为 18 个 skill / 10 个 slash 命令 / 17 个 CLI 子命令。

## [3.0.0] - 2026-05-19

### BREAKING

- option=2(Fluid Pause 加 task)归档校验加固:archive fence 现要求 option=2 的 pause_decision
  携带 `added_task_ref` + `capture_id`,并在 ack-log hash-chain 中匹配一条 `forge pause-capture`
  entry。**发布前已 verify/review 但未 archive、且 apply 期未走过 `forge pause-capture` 的
  option=2 change 会被 archive 拒签。** 受影响 change 由用户人工处理(将该 pause_decision 改判为
  option=4 Other 并补 `other_rationale`/`other_acked_by`,或人工接受后另行归档)— fence 不开自动放行口子。

## [2.0.0] - 2026-05-18

### Added

- legacy-bridge Layer 3b:`forge legacy-bridge extract` —— 从老文档抽取需求条目并接入 backlog registry 第二数据源

### Changed

- **BREAKING** `forge legacy-bridge` 的 map/index/regenerate/sync-check 四命令默认改为 agent 模式(emit Task manifest,需 fulfill 后跑 `--apply`)。`--api` flag 切回原进程内 SDK 行为。详见 docs/specs/2026-05-18-legacy-bridge-dual-path-exec-design.md。

## [1.4.0] - 2026-05-17

### Fixed

- **文档**:`docs/cli-reference.md` 补全到当前 16 个 CLI 子命令全集 —— 此前停留在 v0.3 的 7 命令快照,缺 `migrate` / `ack` / `evidence` / `finding` / `scope` / `preflight` / `backlog`;`CLAUDE.md` / `AGENTS.md` 的「14 子命令」与 `getting-started.md` 的「13 子命令」计数同步更正为 16,并清理 `getting-started.md` 内「v1.1 新 CLI 段待下轮补」的失效提示。
- **文档**:`docs/migration/from-openspec.md` §2.3 与 `docs/migration/from-superpowers.md` §4.3 的 `--dry-run` 说明更正为占位 stub 的真实行为(此前描述的 plan 预览 / missing-preview / cost estimate 输出尚未实现)。
- **版本对齐**:`.claude-plugin/plugin.json` / `.codex-plugin/plugin.json` / `.claude-plugin/marketplace.json` 的 plugin version 及 `scripts/run-forge.mjs` 的 `REQUIRED_RANGE` 此前停留在 plugin 形态引入时的 `0.3`,与 npm 包 / git tag 的 `1.x` 线脱节;现统一对齐到 `1.4.0`(`REQUIRED_RANGE` → `^1.4.0`),修复 plugin helper 按 `^0.3` 永远拉不到 1.x CLI 的问题。
- **文档**:`docs/getting-started.md` 第 0 步补充 forge CLI 安装说明 —— plugin 安装不提供 PATH 上的 `forge`,而第 3 步 `forge preflight` 需在 shell 直接调用;补 `pnpm dlx` / `npm i -g` 两种获取方式。
- **文档**:`docs/claude-install.md` / `docs/codex-install.md` / `docs/opencode-install.md` 与 `skills/writing-plans` 中过时的 `@accelerator-mzq/forge@0.3.0` / `@^0.3` 引用更正 —— 全局安装命令改为不钉版本,helper 范围对齐 `^1.4.0`。

### Added

- **文档**:`docs/migration/from-openspec.md` 新增 §7「项目同时含 OpenSpec 与 superpowers」—— 此前两份迁移文档均未覆盖双 source 项目;新节说明须串行跑两遍 `forge migrate`,并提示两遍之间备份 `migrate-report.md` / `migrate-trace.json`(固定文件名,第二遍会覆盖第一遍)。`from-superpowers.md` 加 §8.8 对应 FAQ 指针。
- **文档**:新增 `docs/migration/from-existing-project.md` —— 已有 OpenSpec / superpowers 项目接入 forge 的端到端教程(安装 → `forge migrate` → 验收产物 → 从 `/forge:apply` 接入主流程 → cleanup)。补上 `getting-started.md`(从空目录起步)未覆盖的「已有项目」入口;`getting-started.md` 与两份 `from-*.md` 加交叉指针。§4.2 增「让 AI agent 补缺件代替 `--regenerate`」一节,说明 `--no-regenerate` + agent 手补的免 API key 路径及与 `--regenerate` 的 fidelity 校验差异。
- `forge/config.yaml` 新增 `model_tiers` 配置:把 `forge:subagent-driven-discipline` §1 的 `haiku`/`sonnet` model tier 重映射到实际派发模型(默认恒等、不改变现状)。`forge config set model_tiers.<tier> <model>` 写入。**仅对直接传 `model` 参数的 harness(如 Claude Code)生效**;把 `haiku`/`sonnet` 档映射到更强模型会抬高 token / 调用成本。`opus` 档不可重映射。

### Changed

- `forge:subagent-driven-development` 的 model 选型不再内联 matrix,改为指向 `forge:subagent-driven-discipline` §1 + `model_tiers` 配置(消除两 skill 的 model tier 摘要漂移)。`forge:subagent-driven-discipline` 的 §1 `haiku`/`sonnet`/`opus` 明确为 tier 标签,`## Platform Note` 措辞修正(区分跨 harness 与跨模型 provider)。
- `package.json` 新增 `prepublishOnly` 脚本(`npm publish` 前自动 `pnpm build`),避免漏构建发出缺 `dist/` 的包。

## [1.3.0] - 2026-05-16

### Added

- **workflow-monitor**:低耦合旁路工作流监控观察者。`forge monitor enable` 开启后,记录 forge 每阶段状态与动作选择,与 OpenSpec/superpowers 静态差异映射表对比做回归探测; `forge monitor report` 渲染 markdown 报告。详见 `docs/specs/2026-05-15-workflow-monitor-design.md`。
- **subagent-driven-discipline**:移植 `superpowers:subagent-driven-development` 的第三方 companion skill 为 forge plugin 第 17 个 skill `forge:subagent-driven-discipline` —— subagent 任务类型 taxonomy + cheap-model 可靠性 playbook + Trigger Type Matrix retrospect。净化掉 27+1 条项目锚点(§5 case study 全清、实证叙事删除、真实路径/变量/codex 命令占位符化、出处中性化),作为零项目信息的 generic 工作流初始技能。补全 `subagent-driven-development` / `writing-plans` 早已假定存在的依赖;并让 `forge:subagent-driven-development` 在 dispatch 前条件调用此 companion skill(配对闭环)。详见 `docs/specs/2026-05-16-subagent-driven-discipline-port-design.md`。

## [1.2.0] - 2026-05-15

**plan-stage-extensions-framework**:forge core 通用 stage-level extension runner —— 预置 codex review/adversarial 作 default entries(Tier 1 Claude Code only;generic ExtensionContract 留 v2/v3 refactor)。plan 经 9 轮 Codex 对抗性 review 收敛(累计 21 finding:3 BLOCKER + 16 MAJOR + 2 MINOR 全独立核实为真问题、全 accept);实施(Task 5-9)经 `superpowers:subagent-driven-development` SDD —— 每 Task fresh implementer subagent → spec compliance reviewer → code quality reviewer 三阶段。

### Added

- **Stage Extensions Framework**:`stage_extensions` config 段 —— forge core 通用 stage-level extension runner(v7 CLI/AI 职责分层:CLI 纯机械单轮执行,多轮收敛 / 交互 / 派 subagent 归 AI 主代理协议)。
- **CLI**:`forge stage-extensions` 子命令组 —— `run`(单轮执行器:spawn codex + watch + parse + judge + retry,显式 RoundOutcome 状态机,结构化 JSON 输出)+ `analyze-trend`(收敛趋势分析)。runner 永远 exit 0(loose,不阻塞主流程 fence)。
- **Core**:`src/core/stage-extensions/` 6 模块(severity-mapper / convergence-judge / thread-map / trend-analyzer / output-watcher / state-machine)+ `src/core/schema/` config schema + validator + `src/core/codex-review/prompts/adversarial-default.md` 通用模板(B-full Task 0 已 ship)。
- **Commands**:`commands/*.md` 5 处末尾段(brainstorm / propose / apply / review / verify)—— AI 主代理多轮收敛协议(反复调单轮 runner + AskUserQuestion 介入 + Task dispatch fix subagent);新 slash 命令 `commands/codex-adversarial.md`(B-full Task 0 已 ship)。
- **Helper**:`scripts/codex-review-helper.mjs` 扩展 —— `--thread-id` resume / mode 多分支(code-review / adversarial / rescue);harness-agnostic。
- **Docs**:`docs/stage-extensions.md`(framework 协议)+ `docs/codex-review.md`(codex 预置 extension 用户指南)+ `docs/getting-started.md` 嵌入 deep-dive + `README.md` 更新。
- **Tests**:全 suite 1115 tests pass / 0 fail(Task 0-4 基线 1069 + Task 5 runner +21 integration + Task 6 commands sync +25 integration)。

### Notes

- **forge 协议层 SKILL.md 0 改动**:stage-extensions framework 不触碰 forge 协议层 skills(`skills/*/SKILL.md`)—— 多轮收敛 / askUser / fix dispatch 落在 commands/\*.md 末尾段(v7 CLI/AI 职责分层),协议层纯净。
- **loose 语义**:codex 集成任何失败(spawn 失败 / retry 耗尽 / config 非法 / markdown 解析失败)都不阻塞 forge 主流程 fence;runner 永远 exit 0。

### Codex Review 收敛

plan 经 9 轮 Codex 对抗性 review 收敛,首轮(v2)7 个 finding 全 accept 修订:

- **F1**(BLOCKER):runner 变量作用域 + 控制流隐患 → §7 重写为显式 RoundOutcome 状态机。
- **F2**(MAJOR):多轮 continue 消耗 retry 配额 → 拆 attempt 与 round budget 两个独立计数器(v7 后 round budget 移 §8 AI 协议)。
- **F3**(MAJOR):background 异步模式决策与实施矛盾 → v1 锁定 sync,`--background` 留 v2。
- **F4**(MAJOR):generic 抽象泄漏 → v1 收窄 codex-specific scope,generic ExtensionContract 留 v2/v3。
- **F5**(MAJOR):`verdict=approve` 短路掩盖 BLOCKER → judgeConvergence 短路条件改为 approve **且** block 桶空。
- **F6**(MAJOR):测试 inventory 跨段不一致 → §2 单一来源表。
- **F7**(MINOR):DoD 不可机器验证 → §14 验收 checklist 全改真 shell 断言。

后续 v3-v9 再 7 轮收敛(F1-v2 BLOCKER normalized config 深合并 / F3-v2 timeout 状态分支 / F2-v3 thread_id 缺失保留旧值 / F1-v8 roundLimit 数据源修正 等),累计 21 finding 全独立核实为真问题(0 误报)。

### Acknowledgments

- Codex 对抗性 review 9 轮收敛(block 桶 r1→r9:6→4→3→2→1→0→2→1→0,v7 CLI/AI 架构重写在 r7 引入 2 再收敛至 0);累计 21 finding(3 BLOCKER + 16 MAJOR + 2 MINOR)全独立核实为真问题(0 误报)全 accept 修订。
- 实施经 SDD spec compliance + code quality 双 reviewer 兜底;code quality runtime-correctness review 抓到 markdown parser `\Z`(JS 正则无此锚)等 implementer 自写代码 bug。

## [1.1.0] - 2026-05-14

**plan-v1.1 polish leftover**:plan-9z release 留底 3 类 polish 消化(协议升级 + 内部技术债 + 同源审查盲点修补)。沿 plan-9z 中间路线 B 模式 + sonnet code_quality reviewer for Task 1 + Codex 七轮对抗性 release gate 双兜底(累计 32 finding 全处置;0 严重 / 0 阻塞 / 0 Major release gate 达成)。

### Refactored

- **P-9 src/core/git/utils.ts 抽出**(Task 1):plan-9h Q8 决策的 inline helper(`isGitRepo` / `getCurrentBranch` 在 `src/cli/commands/preflight.ts`)抽出共享模块;`src/core/migrate/index.ts:65-72` 同模式 inline 探测一并 refactor(execSync → execFileSync,safer than shell quote);utils.ts JSDoc 含 caveat(--git-dir vs work tree / detached HEAD 'HEAD' sentinel)。1018 tests 透明 pass(全 e2e spawn 真 CLI 不 mock)。

### Fixed

- **预存 3 forge-eval scenarios pair_pass 修复**(plan-9z Task 5 baseline 暴露,plan-9h Task 4 commit `b5fb981` 漏抓 root cause):
  - **Task 2 force-dispatch-subagent**:yaml rubric forge-specific +3+3+2 / 通用 +1+1 + 判分锚点段 + must_match 行为锚(Use Task tool / subagent_type);`skills/subagent-driven-development/SKILL.md` 加 "How to Dispatch" 段(Use Task tool 实操字面 + model 选型 matrix + fresh subagent per task)— **scope-out scenario 重设计留 plan-v2**(forge-eval 物理限制 — AI 无真 Task tool;但 Task 4 改动间接拉升 force-dispatch iter 2 delta 6.5 ✅ 实证 reverse)
  - **Task 3 review-subagent-output**:yaml rubric forge-specific +3+3+2 + 判分锚点 + must_match SDD §3.2/§3.3 cross-ref;SKILL.md 加 "Review Protocol" 段(cross-verify 五类 + verdict 三级 + decision tree);**Pattern Q new edge P-7 自实证**(iter 2 `(完全信任\|trust)` 误命中否定 phrase → iter 3 修锚行为)→ pair_pass ✅ + RED ≤ 5 + delta 3.0(Pattern T 防御边界)
  - **Task 4 not-merge-without-test**:yaml rubric forge-specific +4+3+3 + 接受描述模式注解(Pattern Y 候选);SKILL.md verdict 三级加 "test fail (failing test count > 0) = Critical → MUST 阻 commit" 字面 → pair_pass ✅ + RED 2.0 + delta 5.0

### Documentation

- **Pattern X #1 cross-cutting 状态回写 hook 协议**(Task 5):`.claude/skills/subagent-driven-discipline/SKILL.md` §2.1.2 新子段 — implementer 改 cross-cutting 字段(file:line / 不变量 / DoD / version / release gate)时必 grep 全 plan list verify + 同 commit 回写;§6 Pattern Catalog 加 row。**self-evident 协议必要性证成** — plan-v1.1 自身连续两次 self-aware 实证(v3.1/v3.2 release gate "0 Major" cross-cutting sync 不完整 → Codex 五/六审 catch)。
- **Pattern X #2/#3/#4 path verify 协议**(Task 6):`skills/writing-plans/SKILL.md` 新加 `## Path Pre-flight Verify` 段 — plan writer 起草前必跑 grep verify file path / yaml / skill / section,不假定 prefix;`## Self-Review` 段加 "Path verify" 项(原 3 项顺位下移);REINFORCE Pattern S 实证 plan-9z plan v1 字面错 4 处 + plan-v1.1 v1 同款 `.claude/skills/writing-plans/` prefix 错。
- Case ref:`.claude/skills/subagent-driven-discipline/SKILL.md` §5 Case 09 §1264 / §1273 / §1287。

### Carry-out to plan-v2

- **fence-9.2 flaky timeout**(P-3 闭环说明 — Codex Task 7 review M-03):plan-9z `4a24ef8` 已修(`tests/cli/process-evidence-fence.test.ts` line 274 fence-9.2 it 加 `{ timeout: 15000 }`沿 plan-9g `4e41064` A8 case 模式);plan-v1.1 全 5 verify 跑 vitest 1018 pass / 26.71s 三次本地未复现(P50 ≤ 1.4s vs 5000ms bound 余裕 3.5s+);**plan-v2 评估是否需进一步降 timing 抖动或迁移 hash-only 路径**(本征 flaky 在 Windows CI runner 并发资源竞争时偶发触发,本地复现率低)
- **Pattern V/W 协议化**(SDD SKILL.md §3.X Trigger Type 7 子段 + §6 catalog row 中间路线 B 模式 / release docs CHANGELOG 累计修订记录整合)— 触及 SDD Trigger Type 表大修,适合 plan-v2 reorganize 统一处理
- **Pattern X #B2**(plan-9z §2 "6 子段" vs 7 子段 + release-gate §5.6 plugin 形态字面)— plan-9z 决策不修
- **Pattern Y 候选**(plan-v1.1 Task 2/4 双实证):forge-eval scenario 设计原则 — action vs description 区分 + 接受描述模式;plan-v2 forge-eval-integration.md 加协议 + scenario 设计 checklist
- **Pattern Q new edge P-7 REINFORCE**(plan-v1.1 Task 3 自实证):must_not_match 不锚否定 phrase;writing-skills SKILL.md / forge-eval-integration.md 加 "must_not_match 不锚否定 phrase" 显式 checklist
- **LLM non-determinism observation**(branch-protection iter 2 variance):forge-eval 多次采样 + 中位数候选

### Acknowledgments

- 沿 plan-9z release `f483d77`...`4a24ef8` 8 commit chain 累积模式
- forge-eval baseline 重跑判分(sonnet-4-6 automated judge)— Task 2/3/4 累计 9 iter ~$2.55 cost 探索 Pattern Y
- Codex CLI(gpt-5.4-codex)七轮 plan v1 → v3.4 对抗性 review 累计 32 finding 全处置(28 修 + 3 拒+注释 + 1 拒)— release gate 0 严重 / 0 阻塞 / 0 Major 达成
- self-aware retrospect 沉淀:plan-v1.1 起草自身连续两次踩 Pattern X #1 同源盲点(v3.1/v3.2)— self-evident 协议必要性证成(本 release 顺手落地)

## [1.0.0] - 2026-05-14

### Major changes — v1.0 fusion completion(9 sub-plan 累积 + plan-9z polish)

v1.0 标志 forge fusion 真正达成产品定位 — OpenSpec UX 哲学全恢复 + superpowers process discipline 反向覆盖修复。10 sub-plan(9a-9j)单议题深做 + plan-9z polish 9 工作单消化收尾:

37. **三级 severity 分级 + critical_candidate 协议 + JCS finding_hash + ack 两步协议**(plan-9a):横切层基础,CLI helper 框架,Severity / Finding 类型,`forge ack propose/confirm/reject` 三子命令
38. **out-of-scope 协议 + scope-entries fence**(plan-9b):3 类 out-of-scope/non-goal/future-work,三 skill(exploring/receiving-code-review/verifying-three-dimensions)区分指引
39. **Fluid Pause Decision Point**(plan-9c):`commands/apply.md` 加 §"Fluid Pause" 段,pause_decisions marker schema + 三类 pause 模式
40. **verify 三维(syntax / semantic / process)+ LLM-judge 集成**(plan-9d):`/forge:verify` slash command(经 `forge validate` + skill 组合实现,无独立 verify CLI)+ LLM-judge 路径,verify-findings marker schema
41. **archive 三级 fence + handoff_to_backlog**(plan-9e1/9e2):archive_summary marker schema 9 业务字段,三级 fence(critical-硬墙 / warning-ack / suggestion-soft),handoff_to_backlog 三类 input 聚合
42. **forge:exploring skill + /forge:explore 命令**(plan-9f):新 skill + slash 命令 + forge-eval scenario 双轨 baseline 验证
43. **process_evidence 14 不变量 + worktree 重跑 + reporter parsing**(plan-9g):process_evidence marker schema + git ancestor 不变量 + reporter parser
44. **SDD 实施前置纪律加固**(plan-9h):`forge preflight branch-check` CLI + `commands/apply.md` Critical Plan Review 4 维 + §"Main Agent STOP Triggers" 5 触发表
45. **forge:writing-skills 协议 + forge-eval-integration 协议**(plan-9i):新 skill 开发前提,baseline AI 评估 + scenario 双轨 + pair_pass 验证
46. **marker version + deprecation 完整协议**(plan-9j):`created_by_tool_version` + `resigned_by_tool_version` semver 字段,`forge upgrade --resign-markers` option,legacy 精确豁免表(13 不变量)+ version retrograde fence

**plan-9z polish 9 工作单消化**(plan-9f / plan-9h 累积 retrospect 沉淀的协议升级):

- **Pattern O/P/Q/R**(plan-9f 4 缺口):`skills/writing-skills/SKILL.md` + `forge-eval-integration.md` 加 registry+scenarios 一起 commit 警示 + rubric 设计原则 + 判分锚点段示例 + RED > 5 硬 trigger
- **P-1/P-2**(plan-9h Task 4 2 concerns):SDD SKILL.md §"Main Agent STOP Triggers" 加 forge preflight branch-check cross-ref + forge-eval stop-on-repeat-failure regex 收紧 + 判分锚点段补
- **P-5/P-6/P-7/P-8**:subagent-driven-discipline SKILL.md + forge-eval-integration.md 加 external verify / rubric 软度 vs 验证强度 / must_not_match 边界 / Task BLOCKED 修订决策树
- **P-3/P-9 延 v1.1**:fence-9.2 flaky timeout(性质本征,plan-9z verify 跑未复现)+ git utils 抽出(YAGNI)

### Added — CLI(plan-9a/9d/9h/9j)

- `forge ack` 三子命令(propose/confirm/reject)+ ack-log.jsonl schema(plan-9a)
- `/forge:verify` slash command + LLM-judge 路径 + verify-findings marker(plan-9d;经 `forge validate` + skill 组合实现,无独立 verify CLI)
- `forge preflight branch-check [<change-id>] [--allow-protected-branch]`(plan-9h)
- `forge upgrade --resign-markers <changeId>` option(plan-9j)
- `forge explore` slash 命令 + skill 入口(plan-9f)

### Added — Core(plan-9a/9b/9c/9d/9e/9f/9g/9h/9i/9j)

- `src/core/schemas/severity.ts`(9a Severity / Finding 接口 + JCS hash)
- `src/core/archive/three-level-fence.ts`(9e critical-硬墙 / warning-ack / suggestion-soft)
- `src/core/archive/handoff-to-backlog.ts`(9e 三类 input 聚合)
- `src/core/archive/legacy-exemption.ts`(9j 13 不变量精确豁免表)
- `src/core/archive/version-retrograde-fence.ts`(9j git history 检查)
- `src/core/process-evidence/*`(9g 14 不变量 + worktree 重跑 + reporter parsing)
- `src/core/markers/types.ts` 扩 4 marker(verify-findings / review-passed / pause-decisions / archive-summary)+ 加 `created_by_tool_version?` + `resigned_by_tool_version?` 字段(9j)
- `src/core/schema/types.ts` `ForgeConfig` 加 `protected_branches?: string[]` 字段(9h)

### Added — Skills + Templates(plan-9f/9h/9i)

- `.claude/skills/exploring/SKILL.md`(9f 新 skill)
- `skills/writing-skills/SKILL.md` + `forge-eval-integration.md`(9i 新 skill + 配套文件)
- `.claude/skills/subagent-driven-discipline/SKILL.md` §"Main Agent STOP Triggers" 5 触发表(9h)
- `.claude/skills/subagent-driven-development/SKILL.md` § "plan-9h 新增" 子段(9h 反向同步)
- `forge-eval/scenarios/subagent-driven-development.yaml`(9h Task 4 v1.2 选项 B merge 3 scenario 进现有 SDD yaml:branch-protection / critical-plan-review / stop-on-repeat-failure;plan-9z polish 修 P-1/P-2)+ `exploring.yaml`(9f)+ 其他 9i 落地 scenarios

### Added — Tests + Docs(plan-9a 到 plan-9j 累积)

- `tests/cli/preflight.test.ts`(9h)+ `tests/cli/ack.test.ts`(9a)+ `tests/cli/verify.test.ts`(9d)+ `tests/cli/upgrade.test.ts`(9j)
- `tests/integration/apply-md-sync.test.ts`(9h)+ archive-md-sync / explore-md-sync(9e/9f)
- 各 sub-plan 实施 + 测覆盖 ~100+ 新 vitest case 累积
- 10 sub-plan 文件(`docs/plans/2026-05-10-plan-9*.md` 到 `2026-05-14-plan-9h-sdd-discipline.md`)+ master plan + plan-9z
- design v3 `docs/specs/2026-05-10-v1.0-fusion-completion-design.md` 1892 行 5+ 轮 codex 审查修订

### Changed

- `src/cli/commands/init.ts:38` warning 文本 "v0.4" → "v1.2"(B-7 修订;实际 init removal 留 v1.2)
- `commands/apply.md` 加步骤 0(preflight 调用,9h)+ 步骤 3.5(Critical Plan Review 4 维,9h)+ §"Fluid Pause"(9c)+ §"禁止行为(9g)"(9g)+ §"禁止行为(9h)"(9h)
- `src/core/archive/archive.ts` 加 3.4 步(9j legacy + retrograde fence)+ 3.5 步(9e 三级 fence)
- `package.json` `version` "0.4.0" → "1.0.0"

### Fixed — codex 累计 5+ 轮 review 修订(跨 10 sub-plan 共 200+ 条问题全采纳)

- plan-9a v1→v4:横切层 BLOCKER + MAJOR 全修
- plan-9b v1→v2:三 skill 区分指引接口 + adapter 部署链
- plan-9c v1→v3:Fluid Pause Decision Point + pause_decisions marker schema
- plan-9d v1→v5:LLM-judge 集成 + verify-findings fence
- plan-9e1 v1→v12:archive 三级 fence + 选项 C cross-plan reflection(C 简码硬墙 → 9j --resign-markers 唯一合规出口)
- plan-9e2 v1→v3:process_evidence 集成 + 9g 依赖
- plan-9f v1→v3:exploring skill + forge-eval scenarios 双轨(沉淀 Pattern O/P/Q/R)
- plan-9g v1→v8:process_evidence 14 不变量(v6 brainstorm Codex BLOCKER #2 加 #14 green↞HEAD ancestor)
- plan-9h v1→v5:SDD 实施前置纪律(沉淀 Pattern S/T/U + Case 08)+ Task 4 DONE_WITH_CONCERNS(P-1/P-2 plan-9z polish 消化)
- plan-9i v1→v2:forge:writing-skills 协议 + bootstrap inject SKILL.md
- plan-9j v1→v9:marker version + deprecation(v9 codex 8 轮 review 0 BLOCKER + 2 MAJOR 部分采纳)

### Acknowledgments

设计经 codex 对抗性审查累计 5+ 轮(跨 10 sub-plan)+ Opus subagent 自检 multi-round + plan-9z 收尾 inline 实施(中间路线 B),共修 200+ 条问题。完整修订链:

- master plan v1 → v9(`docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md` §6 修订记录)
- design v3 commit `b823f6e`(`docs/specs/2026-05-10-v1.0-fusion-completion-design.md`)
- 各 sub-plan 文件含独立 vN → vN+1 修订段
- plan-9z polish(`docs/plans/2026-05-14-plan-9z-release.md`)消化 plan-9f / plan-9h 累积 retrospect 9 工作单

完整 spec:[`docs/specs/2026-05-10-v1.0-fusion-completion-design.md`](docs/specs/2026-05-10-v1.0-fusion-completion-design.md)。
完整 plan 链:[`docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md`](docs/plans/2026-05-10-plan-9-v1.0-fusion-completion-master.md) + plan-9a..9j + plan-9z。

## [0.4.0] - 2026-05-10

### Major changes — forge migrate(openspec / superpowers 项目搬运)

29. **`forge migrate <source>` 命令**:把外部框架的项目仓库一键搬到 forge 工作目录;两源默认 `--regenerate`(LLM 补缺件,会显示估价 + ack);`--no-regenerate` 走纯结构 + markdown-aware transformer + `[needs-fix]` 标记
30. **markdown-aware walker**(`src/core/migrate/markdown-aware.ts`):公共 4 层 bridge 的 Layer 1 — 逐行扫描 + fenced code state(` ``` ` / `~~~` 同种 token 收尾)+ table-row 跳过;不识 indented code(known limitation);自切 section 替代 parse/markdown.ts(后者不 fence-aware)
31. **MigrateSource 接口 + 两 adapter**(openspec / superpowers):统一契约 detect/scan/classify/prepareCopy/transform/listMissingArtifacts;新源接入只需加新 adapter
32. **archive 完整性约束(M13)**:推测 archive 但缺件 → 必须用户二次确认;`--no-interactive` 模式 abort exit 4(反静默状态变化)
33. **trace journal NDJSON + 原子 rename(M14)**:三步走 cp(journal pending → write .tmp → rename → committed)+ 末态 fs.rename `.ndjson`→`.json` + reader 优先级算法;crash 可基于 journal 反向 rollback
34. **facts 目标分桶(M15)**:`extractMotivationFacts(design)` 验 proposal、`extractBehaviorFacts(tasks)` 验 specs、`extractFacts(content)` 给 OpenSpec 已有件;facts < 5 / JSON parse fail / 重复去重;superpowers fidelity 阈值 0.6,OpenSpec 0.9
35. **bundled plugin 行为(M16)**:bundled + openspec 静默退化 `--no-regenerate`;bundled + superpowers 前置 prompt 让用户确认是否继续(必产 [needs-fix])
36. **不复用 legacy-bridge ack/budget/quality**:brownfield 硬编码不兼容;migrate 写专属;只复用 `redact.ts`(字符串处理无 brownfield 耦合)+ 扩 `archive/lock.ts:LockMode` union 加 'migrate'(LockHeldError 文案不动以保兼容)

### Added — CLI(P1 + P6)

- `forge migrate <openspec|superpowers>` 主命令 + 8 个选项(--no-regenerate / --dry-run / --force / --archive-list / --no-interactive / --redact-rules)
- LockHeldError CLI 入口友好 catch:"forge migrate is blocked by lock: ..."(避免用户以为 archive 命令占锁)

### Added — Core(P2-P5)

- `src/core/migrate/`:11 模块 + 全部 type;markdown-aware walker;archive-detect 推测引擎(checkbox + git keyword + word boundary + critical-task-pending);conflict.ts plan 阶段全锁定 + --imported-N 递增 + --force trash;report.ts journal NDJSON;ack/budget/quality 三套自实现;regenerate.ts 主流程 + AbortController + .partial 写入

### Added — Tests + Docs(P6 + P7)

- `tests/migrate/*`(11 个 test 模块)+ `tests/cli/migrate.test.ts` 端到端
- `tests/fixtures/migrate/{openspec-minimal,superpowers-minimal}/`(含 vitest globalSetup git init)
- README "从已有项目搬过来" 段
- `docs/migration/from-openspec.md` + `docs/migration/from-superpowers.md`

### Changed

- `src/core/archive/lock.ts:LockMode` union 加 'migrate'(LockHeldError 文案保持现状,保兼容现有 lock.test.ts)
- `package.json` dependencies `@anthropic-ai/sdk` 锁 ≥ 0.27.0(AbortSignal 支持;实际项目已用 ^0.93.0)

### Fixed — codex 二轮 + Opus 自检 60+ 条问题全采纳

- M9 复用边界收紧:不反向调 brownfield ack/budget/quality
- M10 transformer 升级 markdown-aware
- cp 三步走防孤儿文件
- LockHeldError 文案兼容现有断言
- bundled + superpowers 不静默退化
- archive 完整性不静默降级
- M14 v4 三步走 + crash 恢复 / M15 facts 目标分桶 / M16 bundled 边界

### Acknowledgments

设计经 codex 对抗性审查 2 轮 + opus subagent 自检 1 轮,共修 60+ 条问题。完整修订链:

- v1 commit 935fed8(初稿)
- v2 commit ef4187a(codex 一轮 40 + 内部代码核实)
- v3 commit 4ab68c1(opus 12 + 6 表面解决)
- v4 commit 5f748b0(codex 二轮 4 阻塞 + 5 关键 major)
- v4.1 commit 0fd2d8a(加 §1.1 Bridge 架构图)

完整 spec:[`docs/specs/2026-05-10-forge-migrate-design.md`](docs/specs/2026-05-10-forge-migrate-design.md)。
完整 plan 链:[`docs/plans/2026-05-10-plan-8-forge-migrate-master.md`](docs/plans/2026-05-10-plan-8-forge-migrate-master.md) + plan-8a..g。

## [0.3.0] - 2026-05-10

### Major changes — Plugin migration(7 决策叠加 fusion-design 21 条)

22. **v0.3 范围**:三 harness plugin 化 + P2/P3 模板修复 + v0.2→v0.3 升级路径
23. **分发渠道**:自建 git marketplace(forge 仓库根 `.claude-plugin/marketplace.json`)
24. **CLI 双轨**:主 plugin commands.md 调 `node ${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs` helper(spawn `npx -y --package @accelerator-mzq/forge@^0.3 -- forge ...`);bundled plugin 变体内 vendor `dist/`(air-gapped,仅 Claude Code)
25. **三 harness manifest**:Claude Code = `.claude-plugin/{plugin.json, marketplace.json}`;Codex = `.codex-plugin/plugin.json` + `~/.agents/skills/<plugin>` symlink;OpenCode = `.opencode/plugins/forge.js`(default export)
26. **skills/commands 重构**:skills/+ commands/ 提到根仓库;`scripts/copy-templates.mjs` 反向同步(根 → src/core/templates/ + dist/);Plan 1 frontmatter 去 `forge:` 前缀(plugin namespace 隐含)
27. **升级路径**:`forge upgrade` 命令 5 阶段事务(SCAN → SHOW DIFF → ASK → STASH → VERIFY → COMMIT)+ `--recover` 24h 内可还原 + `--gc` 清理过期
28. **Phase 0.5 两阶段重跑**:Plan 0a 协议 spike(throwaway plugin 验证三 harness 加载协议)+ Plan 0b full fixture spike(forge 真业务回归);三 harness 全 unblock,无 DEFER

### Added — Plugin scaffold(Plan 1)

- `.claude-plugin/{plugin.json, marketplace.json}` Claude Code plugin + 自建 marketplace
- `.codex-plugin/plugin.json` Codex plugin manifest
- `.opencode/plugins/forge.js` OpenCode plugin(default export,Plan 0a.3 实测 PASS)
- `hooks/{hooks.json, run-hook.cmd, session-start}` SessionStart hook(fork superpowers,纯 bash escape_for_json + printf,无 python3 依赖)
- `skills/<name>/SKILL.md` 12 个移到根(plugin source of truth)
- `commands/<name>.md` 6 个移到根

### Added — CLI(Plan 4)

- `forge upgrade` 命令 + 三 adapter `LegacyDetector` 接口
- 5 阶段事务化(`src/cli/commands/upgrade.ts`):ASK 阶段前完全只读;`forge/` 产物 100% 不动;STASH/VERIFY 失败原子回滚
- `--recover` 24h 内还原 + hash 校验 + 反向 mv;`--gc` 删 >24h 过期 stash
- 6 集成测全 PASS(`tests/cli/upgrade.test.ts`)

### Added — Helper + bundled(Plan 3 + 5)

- `scripts/run-forge.mjs` plugin helper(spawn npx + Windows `npx.cmd` 兼容 + error 事件 fallback)
- `scripts/build-bundled-plugin.mjs` bundled plugin build 脚本(仅 Claude Code 形态;patch run-forge.mjs 为离线变体;tar `--force-local` 兼容 Windows GNU tar)

### Fixed — v0.2 fixture 缺陷(P0/P1/P2/P3 全修)

- **P0 skill auto-trigger 完全失效**:plugin 路径下 skills 真进 auto-trigger 池(Plan 0a.1.4 + 0b.1 实测 PASS)
- **P1 forge CLI 不在全局 PATH**:plugin commands.md / skill 文本调 helper,helper 内 npx 拉 forge,无需全局装(Plan 3)
- **P2 brainstorming silent commit**:skill 加 git base preflight,空 repo / 无 `.gitignore` 主动询问(Plan 2 Task 2.1)
- **P3 tasks.md 过度生成(511/1378 行)**:writing-plans 加 scale-aware mode + `light_threshold` config(默认 200,允许 50-2000),trivial change 走 light mode 1-2 task ~80 行(Plan 2 Task 2.2)

### Changed

- `forge init` 标记 deprecated(stderr 警告,v0.4 移除)
- skills frontmatter `name:` 去 `forge:` 前缀(plugin namespace 隐含;reverse-sync 脚本写入 src/core/templates 时加回前缀给 legacy `forge init` 用)
- `using-forge` skill 红旗清单更新 — 加 v0.3 plugin 协议状态表(Tier 1 ENABLE / Tier 2/3 PARTIAL_SHIP)+ OpenCode/Codex 用户提示(skill auto-trigger 等价 `/forge:*` 入口)
- `commands/{verify,archive,propose}.md` 调 `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs`(避开 P1)
- `skills/{writing-plans,verification-before-completion,finishing-a-development-branch}/SKILL.md` 末尾加 fenced bash + must-execute 段(给 OpenCode + Codex 用,plugin commands 不可注册时的替代路径)
- `docs/release-gate-checklist.md` 加 §3 v0.3 段(§3.1-3.6,6 项验证)

### Acknowledgments

Plan 0a spike 经 Codex 5 轮 + opus subagent 1 轮独立 review,共修 64 条问题,11 条作为 known-issues 列在 plan 末尾(实测中无一触发)。

完整 spike 实测:[`spike/v0.3/0a-summary.md`](spike/v0.3/0a-summary.md)。

## [0.2.0] - 2026-05-XX

### Added(brownfield onboarding)

- **`forge legacy-bridge` 主命令** + 5 子命令(`map / regenerate / index / sync-check / resolve`)
- **三层能力**:
  - Layer 1 sync-check(每次 archive 自动跑,5 档差异报告)
  - Layer 2 index(每 anchor ~100 字摘要)
  - Layer 3a regenerate(one-shot 复写器,LLM 读老锚点 → 规范化 SRS/HLD/LLD/system-tests)
- **archive preflight + post-archive 双 hook**(根据 `legacy_bridge.enforce_sync` 选择走哪边)
- **二阶段 mapping**:`map --merge` / `--overwrite`,LLM 推测 role + 用户审改
- **双 LLM 抽样验证**:critical 全量必抽 + 各章节按比例抽,失败直报 `.partial`(无 retry)
- **12+ 类默认 redact 规则** + 自定义 + `--redact-report` 命中数 + `<<REDACTED-N>>` 占位
- **Excel(.xlsx)原生解析**(`exceljs`,sheet 字段精确指向)
- **共享 lock 设计**:`legacy-bridge.lock`(独立)+ archive.lock 复用 + 顺序固定避死锁
- **LLM opt-in 机制**(突破 v0.1 §2.3 边界):
  - `forge/config.yaml#legacy_bridge.allow_llm_calls` 默认 `false`
  - 一次性 ack 命令 `forge legacy-bridge --acknowledge-data-transfer`
  - GDPR 二次确认门 `--acknowledge-customer-data`
  - 每次 LLM 调用前 stdout 数据传输声明
- **复写产物 frontmatter** 含 `generated-by` / `generated-at` / `sources` / `fidelity-rate` / `critical-fact-rate` /
  `license` / `forge-version` + 顶部 disclaimer
- **跨 anchor 一致性默认入 diff**(major 档);`auto_resolve_cross_anchor: true` 才走 mtime > role 优先级
- **6 个 regeneration eval scenario** + `pnpm eval-regen` + CI weekly + paths trigger
- **完整用户文档**:`docs/legacy-bridge.md` + `getting-started.md` brownfield 段 + `cli-reference.md` 命令段 +
  `release-gate-checklist.md` 7 acceptance
- **依赖**:`exceljs@^4`(MIT,Apache 2.0 兼容)+ `chardet@^2`(devDep,可选)

### Changed

- `src/core/archive/lock.ts`:`LockMode` union 扩展支持 5 个 legacy-bridge mode
- `src/cli/commands/archive.ts`:集成 brownfield preflight + post-archive 双 hook
- `forge/config.yaml`:扩展 `legacy_bridge` 段(allow_llm_calls / enforce_sync /
  auto_resolve_cross_anchor / regen_license / provider)

### Deferred to v0.3.0(spec §6.6 同步修订主 spec §7)

- OpenCode adapter(原 spec §7 v0.2 → v0.3,plugin 路线)
- specs-sync delete operation(原 spec §7 v0.2 → v0.3)
- 反向 sync(改老锚点 → 提示新 change)
- 跨 anchor 一致性专门审计(`legacy-bridge audit-consistency`)
- 真 brownfield 代码逆向(无文档项目从代码推 SRS)

### Compatibility

- v0.1.x 项目升级到 v0.2 后,**未配 `legacy-anchors.yaml` 时 sync-check graceful skip**,archive 行为不变
- 已发布 v0.1 的 archive `delete` delta 错误信息保留(用户预期内,不破坏向后兼容)

## [0.1.0] — 2026-05-XX

首个公开版本。v0.1 实际范围 = Claude Code + Codex 两 harness(OpenCode 推 v0.2,需 plugin 实现自动注入)。

### Added

- **5 个公开 CLI 命令**:`forge init / update / config / validate / archive`(`specs-sync` 是内部模块,不公开)
- **2 个 harness adapter**:Claude Code(`.claude/skills/` + `.claude/commands/`)、Codex(`.agents/skills/` + `.agents/commands/`,共享 Claude Agent SDK 约定)
- **12 个 forge 命名空间 skill**(`forge-eval/scenarios/` 各对应一份 eval 场景;MIT 复制自 superpowers,调整产物路径与命名空间):
  - `using-forge`(bootstrap)
  - `brainstorming` / `writing-plans` / `subagent-driven-development` / `test-driven-development`
  - `requesting-code-review` / `receiving-code-review` / `verification-before-completion`
  - `systematic-debugging` / `dispatching-parallel-agents` / `using-git-worktrees`
  - `finishing-a-development-branch`
- **6 个 `/forge:*` slash 命令**:`/forge:brainstorm` → `/forge:propose` → `/forge:apply` → `/forge:review` → `/forge:verify` → `/forge:archive`
- **`forge archive` 严格门禁**:校验 `.verify-passed` + `.review-passed` marker 的 schema、tasks_hash、content_hash、evidence log_hash、git.head + git.diff_hash、review_outcomes resolved。任一不符 → 拒绝;`--force` 仅覆盖两类降级(human-override 标记 / 非 git 项目跳过 git 字段)
- **`forge archive --recover`**:从半完成归档恢复(case A/B/C/clean/corrupt 状态机;case C 交互式 [1] 完成归档 / [2] 撤销归档;含 backup/archive 完整性 check)
- **adapter 安装原子化**:Stage→Backup→Commit 三阶段 + 反向回滚;archive 内部 Move→Sync 顺序原子化
- **`--force` flag 真启用**:SHA256 hash 比对决定 init/update 是否覆盖被改 skill 文件
- **自动化 skill eval 框架**(`forge-eval/`):RED/GREEN 双跑(无 skill bootstrap vs 有,验证 skill 真起作用)+ 双轨 grading(模式匹配 must_match/must_not_match + LLM-as-judge 0-10 分,≥6 及格)+ delta 阈值(默认 1.5);12 个 skill 各 2-3 scenario 合计 29 scenario;CI 三 trigger(PR `--changed-only` / weekly Sunday / 手动);`ANTHROPIC_API_KEY` secret 缺失时优雅 skip
- **完整测试**:Linux + Windows runner CI,300+ tests,本地 5 命令(typecheck / lint / format:check / build / vitest)全 0
- **完整文档**:`getting-started.md`(5 分钟跑通)+ `harness-setup.md`(两 harness 安装/调试)+ `cli-reference.md`(5 命令完整参数 + 退出码)+ `release-gate-checklist.md`(maintainer 发版 checklist)+ 设计 spec(1273 行)+ Plan 1-6 实施记录

### License

MIT。复制 superpowers 12 个 skill 文本(MIT 许可),attribution 见 `LICENSE-THIRD-PARTY.md`。

### Known limitations(v0.1)

- **OpenCode 不支持**(spike 实测 skill 路径只注册工具不自动注入,需 plugin;v0.2 实施)
- **specs-sync delete 不支持**(spec 注明 v0.2 加,delete 需要 deletion marker 设计)
- **skill eval 锁 Sonnet 4.6**(v0.1 baseline,Sonnet 4.7 出来时 v0.2 重跑全量校准)
- **不支持 Web Dashboard / telemetry / i18n / 自定义 schema**(spec §7,v1 不做)
- **harness smoke 是 release gate manual checklist,不进 CI**(harness 是闭源 GUI,CI 跑不了)

[3.1.0]: https://github.com/Accelerator-mzq/forge/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/Accelerator-mzq/forge/compare/v2.0.0...v3.0.0
[0.1.0]: https://github.com/Accelerator-mzq/forge/releases/tag/v0.1.0
