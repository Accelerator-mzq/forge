# spike/opencode/

## OpenCode 注入机制研究结论

**情况:B+C 混合 — skills 路径支持(情况 B),但无 bootstrap 自动注入(情况 C)**

OpenCode 有原生 skill 发现机制，但需要一个 JavaScript **插件**来实现 bootstrap 自动注入。

### 三条路径

| 路径 | 用途 | 是否自动注入 |
|---|---|---|
| `~/.agents/skills/<name>/SKILL.md` | OpenCode 内置 permission 白名单路径（与 Codex 共享） | **否** — 权限白名单，非 skill 发现路径 |
| `~/.config/opencode/skills/<name>/SKILL.md` | 个人 skills 注册（OpenCode 原生） | **否** — AI 需主动调用 `skill` tool |
| `.opencode/skills/<name>/SKILL.md` | 项目级 skills 注册（优先于个人） | **否** — 同上 |

### OpenCode skill 机制的本质

OpenCode 发现 skills 后，只是把它们加入可用工具列表（`skill` tool 可列出并加载）。  
**不会**在每次会话开始时自动将 skill 内容注入 AI 上下文。

### 自动注入需要的东西

如果要实现 Codex 那样的 session-start bootstrap 自动注入，必须在 `opencode.json` 中配置一个 JavaScript 插件：

```json
{
  "plugin": ["forge-bootstrap@./spike/opencode/plugin/bootstrap.js"]
}
```

该插件需要实现 `experimental.chat.messages.transform` hook，把 `using-forge` SKILL.md 内容
prepend 到每条会话的第一条用户消息前。superpowers 项目已有参考实现：
`.opencode/plugins/superpowers.js`。

### 证据

1. `opencode agent list` 输出：所有 agents 的 `external_directory` 白名单包含 `~/.agents/skills/using-forge/*` 和 `~/.config/opencode/skills/using-forge/*`（安装后动态追加）
2. 启动日志：`service=skill count=2 init` — OpenCode 发现了 2 个 skills，但未自动加载
3. acceptance test 响应：AI 未调用 `skill` tool，未遵循 forge 规则，直接写了代码

### 目录结构

```
spike/opencode/
├── README.md                                           # 本文件
├── .config/
│   └── opencode/
│       └── skills/
│           ├── using-forge/
│           │   └── SKILL.md                            # forge session-start bootstrap
│           └── forge-brainstorming/
│               └── SKILL.md                            # forge brainstorming 流程 skill
├── response.txt                                        # acceptance test 原始 JSON 输出
└── ACCEPTANCE-TEST.md                                  # acceptance test 报告
```

## 测试方法

### 安装 skills 到全局 OpenCode 路径

```bash
# Git-Bash / PowerShell
mkdir -p ~/.config/opencode/skills/using-forge
mkdir -p ~/.config/opencode/skills/forge-brainstorming
cp spike/opencode/.config/opencode/skills/using-forge/SKILL.md \
   ~/.config/opencode/skills/using-forge/SKILL.md
cp spike/opencode/.config/opencode/skills/forge-brainstorming/SKILL.md \
   ~/.config/opencode/skills/forge-brainstorming/SKILL.md
```

### 运行 acceptance test

```bash
timeout 120 opencode run \
  --model "opencode/gpt-5-nano" \
  --dangerously-skip-permissions \
  --format json \
  "我想做个 todo list 应用" \
  > spike/opencode/response.txt 2>&1
echo "exit: $?"
```

### 判定信号

**PASS 条件（任一）**：
- AI 明确说"先不写代码"或"触发 brainstorming"
- AI 提出 2-3 个方案对比（表格或列表）
- AI 提问而非直接输出代码

**FAIL 条件**：
- AI 直接输出代码（函数/类/完整文件）
- AI 绕过 brainstorming 给出实现

## v0.1 决策影响

**OpenCode 在 v0.1 不能自动注入 bootstrap**（情况 C，PARTIAL）。

当前 skills 路径机制只允许 AI 在知道 skill 名称时手动调用 `skill` tool。如果没有 plugin，AI 不会在新会话开始时自动读取 `using-forge` skill，也就不会遵循 forge 工作流约束。

**v0.1 范围决策**：
- **选项 1（排除）**：v0.1 不包含 OpenCode 支持，等 v0.2 实现 plugin
- **选项 2（PARTIAL）**：v0.1 提供 `forge init` 安装 skill 文件到 `~/.config/opencode/skills/`，文档标注"需手动在每次会话开始时执行 `skill load using-forge`"
- **选项 3（完整支持）**：v0.1 附带 `forge-bootstrap` OpenCode plugin，配置 `experimental.chat.messages.transform` hook

推荐选项 1 或 2（取决于 v0.1 范围决策）。

## 与 Codex / Claude Code 的对比

| 维度 | Claude Code | Codex | OpenCode |
|---|---|---|---|
| skill 目录 | `~/.claude/skills/` | `~/.agents/skills/` | `~/.config/opencode/skills/` |
| 自动注入 | YES（startup scan） | YES（startup scan） | **NO（需 plugin）** |
| bootstrap 方式 | 文件 → session start | 文件 → session start | plugin hook |
| acceptance test | PASS | PASS | **FAIL**（无 plugin） |
| v0.1 可行性 | 确认可行 | 确认可行 | 需 plugin，PARTIAL |
