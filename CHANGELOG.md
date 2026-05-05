# Changelog

All notable changes to this project will be documented in this file.

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/),版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

(暂无)

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
