# Forge 安装(v3.1 plugin 路径)

forge v3.1 全部走 **plugin** 形态(`forge init` 仍可用但 deprecated,v1.2 移除)。三 harness 各自路径 + 状态(Plan 0a + Plan 0b.1 实测,2026-05-09):

| Tier | Harness     | `/forge:*` slash 命令注册                               | workflow bridge                          | 安装文档                                   |
| ---- | ----------- | ------------------------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| 1    | Claude Code | ✅ 全功能(18 skill + 10 slash 命令 + CLI helper)       | —                                        | [claude-install.md](claude-install.md)     |
| 2    | OpenCode    | ❌ 不注册                                               | ✅ best-effort(经命令文件桥接)          | [opencode-install.md](opencode-install.md) |
| 3    | Codex       | ❌ 不注册                                               | ✅ best-effort(经命令文件桥接)          | [codex-install.md](codex-install.md)       |

**Tier 区别**:

- Claude Code 全功能 — 18 skill auto-trigger + 10 个 `/forge:*` slash commands + plugin commands.md 调 `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs` helper
- OpenCode + Codex `/forge:*` slash 命令不注册(plugin commands 协议不支持,Plan 0a 实测确认)— Tier 2/3 通过 workflow bridge 以 best-effort 方式读取 `commands/<stage>.md` 文件运行完整工作流

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

## 升级到新版本

已装好 forge、要升级到更高版本(含跨 major)的项目,见 [migration/upgrading.md](migration/upgrading.md) —— 通用 plugin 版本升级指南(三 harness 升级步骤 + `forge upgrade` 命令辨析 + 跨 major BREAKING 核对 + 升级安全性)。

