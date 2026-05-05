# Forge Harness 安装与配置

v0.1 支持 Claude Code 与 Codex 两个 harness(Phase 0.5 spike 结果,详 [spike/RESULTS.md](../spike/RESULTS.md))。OpenCode 推 v0.2(需要 plugin 实现自动注入)。

## Claude Code

### 安装

参考 [Anthropic 官方文档](https://docs.anthropic.com/claude/docs)。本节假设 `claude` 命令在 PATH 里。

### Forge bootstrap 注入路径

`forge init --harness claude` 在项目目录铺:

```
.claude/
├── skills/
│   ├── forge-using-forge/SKILL.md           # bootstrap,会话开始注入
│   ├── forge-brainstorming/SKILL.md
│   ├── forge-writing-plans/SKILL.md
│   ├── forge-subagent-driven-development/SKILL.md
│   ├── forge-test-driven-development/SKILL.md
│   ├── forge-requesting-code-review/SKILL.md
│   ├── forge-receiving-code-review/SKILL.md
│   ├── forge-verification-before-completion/SKILL.md
│   ├── forge-systematic-debugging/SKILL.md
│   ├── forge-dispatching-parallel-agents/SKILL.md
│   ├── forge-using-git-worktrees/SKILL.md
│   └── forge-finishing-a-development-branch/SKILL.md
└── commands/forge/
    ├── brainstorm.md
    ├── propose.md
    ├── apply.md
    ├── review.md
    ├── verify.md
    └── archive.md
```

`using-forge` SKILL.md 是 bootstrap — Claude Code 在每个会话开始把它加载到 system prompt,12 个 skill 的红旗清单按需触发。

### 验证 bootstrap 生效

参见 [`getting-started.md` 第 2 步](getting-started.md#2-起-claude-code-会话触发-brainstorming2-分钟)。简言之:发"我想做个 todo list",AI 应该问问题而非写代码。

### 调试

bootstrap 没生效(AI 直接给方案):

- 确认文件存在:`ls .claude/skills/forge-using-forge/SKILL.md`
- 确认 Claude Code 会话是新的(老会话不会重新加载 skills)
- 重铺:`forge update --force`(强制覆盖被改的 skill 文件)
- 终极手段:`rm -rf .claude/skills/forge-* .claude/commands/forge/ && forge update`

## Codex

### 安装

参考 [Codex 官方文档](https://github.com/anthropics/codex)。本节假设 codex 命令可用。

### Forge bootstrap 注入路径

`forge init --harness codex` 在项目目录铺:

```
.agents/
├── skills/
│   ├── forge-using-forge/SKILL.md           # bootstrap
│   ├── forge-brainstorming/SKILL.md
│   ├── ... (其余 11 个同上)
│   └── forge-finishing-a-development-branch/SKILL.md
└── commands/forge/
    ├── brainstorm.md
    └── ... (其余 5 个同上)
```

注:Codex 用 `.agents/` 目录(共享 Claude Agent SDK 约定),不是 `.codex/`。Phase 0.5 spike 实测确认。

### 验证

同 Claude Code:发"我想做个 todo list",期望 AI 问问题。

### 调试

同 Claude Code,把 `.claude/` 替换为 `.agents/`。

## 同时装多个 harness

```bash
forge init --harness claude,codex
```

会同时铺 `.claude/` 和 `.agents/`。`forge/config.yaml` 的 `harness` 字段记录 `[claude, codex]`。后续 `forge update` 重铺这两个 harness。

## OpenCode(v0.2 计划)

Phase 0.5 spike 实测 OpenCode 的 skill 路径(`~/.config/opencode/skills/` 与 `.opencode/skills/`)只把 SKILL.md 注册为可调用工具,**不**自动注入到 system prompt。要让 bootstrap 生效需要写 plugin 用 OpenCode 的 `experimental.chat.messages.transform` hook,这不在 v0.1 范围。

v0.1 用 OpenCode 的临时方案:用户每个会话开头手动复制粘贴 `using-forge` SKILL.md 内容,**强烈不推荐**(违反"自动触发"前提,体验差)。建议等 v0.2 plugin 完成。

## 安装跨用户(不推荐)

forge 当前只支持项目级安装(铺到当前目录的 `.claude/` 等)。不支持全局安装到 `~/.claude/skills/forge-*/`(那会污染所有项目)。如果要这么做,自己手动复制 `dist/core/templates/skills/*.md` 到对应路径,但 forge update 不会维护它们。
