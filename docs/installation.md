# Forge 安装(v0.3 plugin 路径)

forge v0.3 全部走 **plugin** 形态(v0.2 `forge init` 已标记 deprecated,v0.4 移除)。三 harness 各自路径 + 状态(Plan 0a + Plan 0b.1 实测,2026-05-09):

| Tier | Harness     | Status                        | 安装文档                           |
| ---- | ----------- | ----------------------------- | ---------------------------------- |
| 1    | Claude Code | **ENABLE**(全功能)           | [claude-install.md](claude-install.md) |
| 2    | OpenCode    | **PARTIAL_SHIP**(skills + skill-driven CLI;commands 推 v0.4) | [opencode-install.md](opencode-install.md) |
| 3    | Codex       | **PARTIAL_SHIP**(同上)       | [codex-install.md](codex-install.md) |

**Tier 区别**:

- Claude Code 全功能 — 12 skill auto-trigger + 6 个 `/forge:*` slash commands + plugin commands.md 调 `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs` helper
- OpenCode + Codex `/forge:*` 不可用(plugin commands 协议不支持,Plan 0a 实测确认)— 改为 skill 文本内嵌 fenced bash + must-execute,AI auto-trigger skill 后**主动**跑 helper(Plan 0a Variant B/C 实测 PASS)

## 共通需求

- Node 20+
- npm 7+(`npx -y --package` semver 解析,plugin helper 用)
- git(必备 — `forge upgrade` + `verify` review marker hash 都依赖 git diff)

## 跨 plugin 共存(superpowers + forge)

forge plugin 与 superpowers plugin **可以同装**。Plugin namespace 隔离(`forge:brainstorming` vs `superpowers:brainstorming`),你可以选哪个 plugin 主导 brainstorming 流程:

- Claude Code:plugin manager 项目级 enable / disable,`.claude/settings.local.json` 控制
- OpenCode:`opencode.json` plugin 数组顺序
- Codex:不支持 plugin 显式 disable,装两个会两个都 enabled(Plan 0a known-issue,推 v0.4 验证 namespace differentiator 是否够)

详见各 harness 安装文档对应段。

## v0.2 用户升级

跑 `forge upgrade`(Plan 4 落地):

```bash
npm i -g @accelerator-mzq/forge@0.3.0
cd <your v0.2 project>
forge upgrade
# y → STASH legacy adapter 产物(.claude/skills/forge-* + .agents/skills/forge-* 等)+
#     输出 plugin install 指引(三 harness 各一份)
# forge/ 产物 100% 不动(drafts/changes/specs/config 全保留)
# 24h 内可 forge upgrade --recover 还原
```

详见 [migration/v0.2-to-v0.3.md](migration/v0.2-to-v0.3.md)。

## bundled plugin(air-gapped 用,仅 Claude Code)

企业内网 / 无 npm registry 场景用 bundled plugin tarball(GitHub Release artifact):

```
/plugin install --from-tarball /path/to/forge-bundled-v0.3.0.tgz
```

bundled plugin 内 vendor 了 `dist/` + patched `scripts/run-forge.mjs`(spawn node + dist/cli/index.js,不依赖 npx + npm registry),完全离线可用。

仅 Claude Code 形态 — OpenCode + Codex air-gapped 路径推 v0.4。
