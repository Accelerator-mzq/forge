# Forge

> **v1.1** Multi-harness **plugin** 把 OpenSpec 的产物驱动工作流和 superpowers 的行为塑造 skill 体系融合到一起。AI 在 Claude Code / OpenCode / Codex 三 harness 里按统一规范工作 — **skill auto-trigger** + **commands** + **forge CLI 严格门禁**。

```bash
# Tier 1 — Claude Code(全功能,推荐)
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
```

OpenCode + Codex 见 [`docs/installation.md`](docs/installation.md)。

## 它做什么

1. **16 个行为塑造 skill 自动触发**:`brainstorming`(模糊需求时强制提问)、`test-driven-development`(red→green→refactor)、`subagent-driven-development`(派 fresh 子代理实施每个 task)、`verification-before-completion`(声称完成必附证据)、`writing-plans` 等。**v0.3 plugin 路径下 skill 真进 auto-trigger 池**(v0.2 P0 真根因解,Plan 0a + 0b.1 实测 PASS)。
2. **9 个工作流 slash 命令**(Tier 1 Claude Code only):`/forge:brainstorm` → `/forge:propose` → `/forge:explore` → `/forge:apply` → `/forge:review` → `/forge:verify` → `/forge:archive` → `/forge:upgrade` → `/forge:ack-confirm`。OpenCode + Codex 路径用 skill 内嵌 fenced bash 让 AI 主动跑 helper(Plan 0a 实测 Variant B/C PASS)。
3. **CLI 严格门禁**:`forge validate / archive` 验证产物完整性、verify+review marker hash 不对就拒绝;**plugin 内通过 `scripts/run-forge.mjs` helper 调用,避开 v0.2 P1 全局 PATH 问题**。
4. **三 harness 全 unblock**(Plan 0a 实测):
   - Tier 1 Claude Code:**ENABLE**(全功能)
   - Tier 2 OpenCode:**PARTIAL_SHIP**(skills + skill-driven CLI;commands 推 v0.4)
   - Tier 3 Codex:**PARTIAL_SHIP**(同上)

## 5 分钟跑通(快速 reference)

```bash
# 1. 装 plugin(Tier 1 Claude Code)
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
/reload-plugins

# 2-7. v1.1 端到端工作流主线
我想做个 todo list 应用    # → §1 Brainstorm
/forge:propose ...          # → §2 Propose
/forge:apply                # → §3 Apply
/forge:review               # → §4 Review
/forge:verify               # → §5 Verify 三维
/forge:archive              # → §6 Archive 三级 fence
```

完整端到端工作流详解见 [`docs/getting-started.md`](docs/getting-started.md)。

## 安装(三 harness)

详见 [`docs/installation.md`](docs/installation.md):

- [Claude Code](docs/claude-install.md)(Tier 1 全功能)
- [OpenCode](docs/opencode-install.md)(Tier 2 PARTIAL_SHIP)
- [Codex](docs/codex-install.md)(Tier 3 PARTIAL_SHIP)

## 从已有项目搬过来(v0.4+)

如果项目已经在用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 或装过 [superpowers](https://github.com/obra/superpowers) plugin,跑 `forge migrate <source>` 一键搬到 forge 工作目录:

```bash
# OpenSpec 项目
forge migrate openspec       # 默认 --regenerate(LLM 补缺件,会显示估价 + ack)

# superpowers 用户产物(docs/superpowers/{specs,plans}/)
forge migrate superpowers    # 同上;design+plan 配对成 forge change
```

加 `--no-regenerate` 跳过 LLM,只搬结构 + 跑 markdown-aware transformer;失败件标 `[needs-fix]`(用户后续手补 / 重跑 `--regenerate`)。

详见 [`docs/migration/from-openspec.md`](docs/migration/from-openspec.md) 与 [`docs/migration/from-superpowers.md`](docs/migration/from-superpowers.md)。

注:

- bundled plugin 中 `--regenerate` 不可用 — openspec source **静默退化**为 `--no-regenerate`;
  superpowers source 因结构必缺 proposal/specs 会**前置 prompt 让你确认**(`--no-interactive` 直接 abort)。
- archive 落点强制完整(M13):推测 archive 但缺 proposal/specs 且 regen 关闭 → 必须用户二次确认是否降级 active(`--no-interactive` 直接 abort exit 4)。
- 默认 cp 不动源;migrate 跑完后用户手动 `git rm -r openspec/`(或 `docs/superpowers/{specs,plans}/`)清理。

## v0.2 → v0.3 升级

详见 [`docs/migration/v0.2-to-v0.3.md`](docs/migration/v0.2-to-v0.3.md)。

```bash
# 简版:升 npm CLI + 跑 upgrade 命令(5 阶段事务,forge/ 产物不动)
npm i -g @accelerator-mzq/forge@0.3.0
cd <your v0.2 project>
forge upgrade
# y → STASH legacy adapter 产物 + 输出 plugin install 指引
# 24h 内可 forge upgrade --recover 还原
```

## CLI 命令(7 个公开)

`forge init / upgrade / validate / archive / config / update / legacy-bridge`。详见 [`docs/cli-reference.md`](docs/cli-reference.md)。

注:`forge init` 在 v0.3 标记 deprecated(stderr 警告),v0.4 移除。新项目改用 plugin install 路径。

## 设计文档

- [v0.4 融合方案 spec](docs/specs/2026-05-04-forge-fusion-design.md)(1273 行,21 条决策)
- [v0.3 plugin migration spec](docs/specs/2026-05-09-v0.3-plugin-migration-design.md)(918 行,7 条新决策 #22-28)
- [Plan 0a-6 v0.3 实施计划](docs/plans/2026-05-09-plan-*.md)(8 份)
- [Phase 0.5 v0.3 spike 实测结果](spike/v0.3/0a-summary.md)(三 harness 协议假设全 PASS)

## 状态

**当前状态**:v1.1.0 released(2026-05-14 tag),v1.0 fusion completion + v1.1 polish 累计 10 sub-plan + plan-9z polish 工作单全消化。

- 本地 5 命令(typecheck / lint / format:check / build / test)全 0
- 测试 490 PASS + 16 schema/upgrade 单测,1 skipped
- 自动化 skill eval(`pnpm eval`)— Plan 2 加 P2/P3 fixture
- `npm publish` 工件待 release-gate(`scripts/release-gate.mjs` + `docs/release-gate-checklist.md` §3 v0.3 段)

**Plan 0a + 0b.1 实测验证(2026-05-09)**:

- Tier 1 Claude Code:`/plugin marketplace add` + `/plugin install` + brainstorming auto-trigger + `/test:test` commands 注册 全 PASS
- Tier 2 OpenCode:opencode.json plugin 数组 + `'experimental.chat.messages.transform'` hook + skills.paths discovery 全 PASS;`/test:test` FAIL(commands 不支持)
- Tier 3 Codex:`~/.agents/skills/<plugin>` skill auto-trigger PASS;literal `!command` IGNORED;fenced bash + must-execute Variant B/C PASS

> v0.2 fixture 测试发现的 4 项缺陷(P0/P1/P2/P3),v0.3 全部修(详见 [`docs/v0.2-known-limitations.md`](docs/v0.2-known-limitations.md) 末尾)。

## 许可

MIT。复制了 superpowers 的 12 个 skill 文本(MIT 许可),attribution 见 [`LICENSE-THIRD-PARTY.md`](LICENSE-THIRD-PARTY.md)。

## 致谢

- [OpenSpec](https://github.com/Fission-AI/OpenSpec) — 产物驱动工作流的设计灵感
- [superpowers](https://github.com/obra/superpowers) — 行为塑造 skill 体系的源头(skill 文本 + plugin 形态经 MIT 许可移植)
