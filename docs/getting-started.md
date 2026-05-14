# Forge Getting Started(v1.1 端到端工作流)

> 用 Claude Code + forge plugin 把"我想做个 todo list 应用"从模糊想法走到归档,**全流程跟着这一份跑通**。

> ⚠️ 适用 forge **v1.1.0** 及以后版本。装的是 v1.0.x 走 [v1.0 getting-started](https://github.com/Accelerator-mzq/forge/tree/v1.0.x/docs/getting-started.md);v0.3 / v0.2 见 [migration 文档](migration/v0.3-to-v1.1.md)(待写)。

## 在你开始前

- Node.js ≥ 20.19,pnpm ≥ 9
- 已装 [Claude Code](https://claude.ai/code)(本教程 Tier 1 全功能路径)
- 一个干净空目录,**最好 git init 过**(非 git 项目下 review marker 不绑代码 diff,archive 必须 `--force` 才接受)
- 心理预期:跟着跑一遍 **10-20 分钟**(AI 实施 + review + verify 子代理大约 5-10 分钟,你做决策约 5 分钟)

## 目录

- [第 0 步 — 安装](#第-0-步--安装)
- [第 1 步 — Brainstorm 出 draft](#第-1-步--brainstorm-出-draft)
- [第 2 步 — Propose 出 4 件套](#第-2-步--propose-出-4-件套)(含 `/forge:explore` 嵌入)
- [第 3 步 — Apply 实施](#第-3-步--apply-实施)(含 `forge preflight branch-check` + Fluid Pause 嵌入)
- [第 4 步 — Review](#第-4-步--review)(含 ack 两步协议嵌入)
- [第 5 步 — Verify 三维](#第-5-步--verify-三维)
- [第 6 步 — Archive 三级 fence](#第-6-步--archive-三级-fence)
- [出问题怎么办](#出问题怎么办)
- [与 superpowers plugin 共存](#与-superpowers-plugin-共存)
- [接下来](#接下来)

## 第 0 步 — 安装

### 你要做的

在 Claude Code 会话里装 forge plugin,装完看到 16 个 forge:\* skill auto-trigger + 9 个 `/forge:*` slash 命令。

### 准确操作

```bash
mkdir my-todo-app && cd my-todo-app
git init && touch .gitignore   # brainstorming skill preflight 要求 git base
claude                          # 启动 Claude Code 会话
```

在 Claude Code 会话里发:

```
/plugin marketplace add Accelerator-mzq/forge
/plugin install forge@accelerator-mzq-forge
/reload-plugins
```

完成后 `/exit` 退出会话,再 `claude` 重新启动一次(SessionStart hook 必须 fire 一次才注入 skill / slash 命令)。

### 期望发生(✅ 表示 forge 工作正常)

- ✅ `/plugin marketplace add` 报 "Marketplace added: accelerator-mzq-forge"
- ✅ `/plugin install` 报 "Plugin installed: forge"
- ✅ 重启 session 后,任意位置打 `/forge:` 看到 9 个候选(brainstorm / propose / explore / apply / review / verify / archive / upgrade / ack-confirm)
- ✅ 任意位置打 `/skills` 看到 16 个 `forge:*` skill

> ❌ 如果 `/forge:` 没补全 → bootstrap 没生效,见 [§出问题怎么办 第 1 条](#出问题怎么办)

### 嵌入 deep-dive

> 💡 **深入:legacy `forge init` 路径**
>
> forge v1.1 仍保留 `forge init` CLI 兜底 legacy 项目(`src/cli/commands/init.ts:28-38`),但:
> - **v1.2 将移除**(明确 deprecated)
> - 新项目**主推** plugin 路径(本章 §0 流程)
> - 仅在你的项目无法用 plugin(罕见 — 比如 Claude Code 版本太老不支持 plugin)时才退路用 `pnpm dlx @accelerator-mzq/forge init --harness claude`
>
> 完整 plugin install 详解见 [`installation.md`](installation.md) / [`claude-install.md`](claude-install.md)。

### 确认

```bash
# 在 my-todo-app 目录(此时 forge plugin 还没创建 forge/ 骨架 — 等 §1 brainstorm 触发)
ls -la  # 期望:.git/ + .gitignore 之外没别的
```
