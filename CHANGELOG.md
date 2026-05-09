# Changelog

All notable changes to this project will be documented in this file.

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

(暂无)

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

[Unreleased]: https://github.com/Accelerator-mzq/forge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Accelerator-mzq/forge/releases/tag/v0.1.0
