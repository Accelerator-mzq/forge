# Forge Getting Started(v1.1 端到端工作流)

> 用 Claude Code + forge plugin 把"我想做个 todo list 应用"从模糊想法走到归档,**全流程跟着这一份跑通**。

> ⚠️ 适用 forge **v1.1.0** 及以后版本。装的是 v1.0.x 走 [v1.0 getting-started](https://github.com/Accelerator-mzq/forge/tree/v1.0.x/docs/getting-started.md);v0.3 / v0.2 升级指南待写(下一轮单独文档)。

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

在 Claude Code 会话里装 forge plugin,装完看到 16 个 `forge:*` skill auto-trigger + 9 个 `/forge:*` slash 命令。

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

> 注:legacy projects 仍可用 `pnpm dlx @accelerator-mzq/forge init --harness claude`,v1.2 移除(沿 `src/cli/commands/init.ts:28-38`)。

### 期望发生(✅ 表示 forge 工作正常)

- ✅ `/plugin marketplace add` 报 "Marketplace added: accelerator-mzq-forge"
- ✅ `/plugin install` 报 "Plugin installed: forge"
- ✅ 重启 session 后,任意位置打 `/forge:` 看到 9 个候选(brainstorm / propose / explore / apply / review / verify / archive / upgrade / ack-confirm)
- ✅ 任意位置打 `/skills` 看到 16 个 `forge:*` skill

> ❌ 如果 `/forge:` 没补全 → bootstrap 没生效,见 [§出问题怎么办 第 1 条](#出问题怎么办)

### 确认

```bash
# 在 my-todo-app 目录(此时 forge plugin 还没创建 forge/ 骨架 — 等 §1 brainstorm 触发)
ls -la  # 期望:.git/ + .gitignore 之外没别的
```

## 第 1 步 — Brainstorm 出 draft

### 你要做的

把"我想做 X"模糊想法,通过 AI 反问 2-3 轮后,落成 `forge/drafts/<date>-<topic>.md`。

### 准确操作

在 Claude Code 会话里发(字面 prompt):

```
我想做个 todo list 应用
```

AI 会**逐条**反问——每次只问一个问题,不会一口气甩出问卷。你回答之后,它可能再追问一轮。
典型问题集中在三类:

- **目的**:给自己用还是给团队用?Web / CLI / 其他?
- **约束**:技术栈偏好、需不需要持久化、有无部署限制?
- **成功标准**:什么情况下算"做完"?

2-3 轮问答后,AI 提出 2-3 个 approach 对比(含推荐),确认后分段展示 design,每段都等你 approve 再继续。

> 或者显式调 `/forge:brainstorm` 走专用入口,会绕开 `superpowers:brainstorming` 抢跑,见 [§与 superpowers plugin 共存](#与-superpowers-plugin-共存)。

### 期望发生(✅ 表示 forge 工作正常)

- ✅ AI invoke `forge:brainstorming` skill(会在响应开头声明)
- ✅ AI **不**直接写代码
- ✅ AI 一次只问一个澄清问题(目的 / 约束 / 成功标准)
- ✅ AI 提议写 draft 到 `forge/drafts/<YYYY-MM-DD>-todo-list.md`
- ✅ AI 询问是否 commit draft(brainstorming skill 末尾步骤)

> ❌ 如果 AI 直接开始写 .ts 代码 → bootstrap 没生效,见 [§出问题怎么办 第 1 条](#出问题怎么办)
> ❌ 如果 AI 调的是 `superpowers:brainstorming` 而非 `forge:brainstorming`(没写 forge/drafts/)→ 见 [§与 superpowers plugin 共存](#与-superpowers-plugin-共存)

### 确认

```bash
ls forge/drafts/        # 期望:1 个 .md 文件(<YYYY-MM-DD>-todo-list.md)
cat forge/drafts/*.md | head -30   # 期望:Why + What + 关键决策列表
```

draft 文件顶部应该能看到:你选了哪个 approach、核心约束、成功标准。如果看到的是空文件或者文件名
不符合 `<YYYY-MM-DD>-todo-list.md` 格式,说明 brainstorming skill 末尾步骤没有正常执行。

### 深读

- [`skills/brainstorming/SKILL.md`](../skills/brainstorming/SKILL.md) — brainstorming skill 完整协议(问题质量、approach 对比、design section 分段确认、spec self-review 4 项检查)

## 第 2 步 — Propose 出 4 件套

### 你要做的

把 draft 转 4 件套(`proposal.md` / `specs/<area>.md` / `design.md` / `tasks.md`)落到 `forge/changes/<change-id>/`。

### 准确操作

在 Claude Code 会话里发(替换 `add-todo` 为你的 change id,替换 draft 文件名为 §1 产出的实际名):

```
/forge:propose add-todo --from-draft 2026-05-14-todo-list
```

注:`--from-draft` 后跟 draft 文件名(去掉 `.md` 后缀);draft 文件必须在 `forge/drafts/<date-topic>.md`(沿 `commands/propose.md:11`)。

### 期望发生(✅ 表示 forge 工作正常)

- ✅ AI invoke `forge:writing-plans` skill
- ✅ AI 读 `forge/drafts/2026-05-14-todo-list.md`
- ✅ AI 按 scale-aware mode(proposal < 200 行 → light mode 1-2 task;否则 full mode 5+ task)产 4 件套到 `forge/changes/add-todo/`:
  - `proposal.md` — Why + What + Scope
  - `specs/<area>.md` — Given/When/Then 格式
  - `design.md` — 技术方案
  - `tasks.md` — checkbox 列表(每个 task 2-5 分钟粒度)
- ✅ draft 移到 `forge/drafts/.consumed/`

> ❌ 如果报 "draft 不存在: forge/drafts/<name>.md" → draft 路径写错,跑 `ls forge/drafts/` 确认实际文件名

### 嵌入 deep-dive

> 💡 **深入:不确定方案时先 `/forge:explore` 探路**
>
> 如果你的需求比较模糊,**直接 propose 容易得到错误 design**。可以先用 `/forge:explore` 让 AI 调研 codebase + 列 2-3 个可行 approach:
>
> ```
> /forge:explore --change add-todo
> ```
>
> AI invoke `forge:exploring` skill,产 `forge/changes/add-todo/explore-notes.md`(approach 对比 + 选定理由)。回头 propose 时,writing-plans skill 会读 explore-notes 作为 design 输入。

### 确认

```bash
ls forge/changes/add-todo/         # 期望:proposal.md / specs/ / design.md / tasks.md
ls forge/drafts/.consumed/         # 期望:原 draft 文件已移到这里
```

### 深读

- [`skills/writing-plans/SKILL.md`](../skills/writing-plans/SKILL.md) — writing-plans skill scale-aware mode 协议
- [`skills/exploring/SKILL.md`](../skills/exploring/SKILL.md) — exploring skill 调研协议
- [`commands/propose.md`](../commands/propose.md) — /forge:propose 命令完整参数 + 错误退出码
