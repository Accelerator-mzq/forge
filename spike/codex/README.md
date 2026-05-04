# spike/codex/

## Codex 注入机制研究结论

**情况:A — dir-based 原生 skill 注入(~/.agents/skills/)**

Codex 有原生 skill 发现机制:启动时扫描 `~/.agents/skills/` 目录,读取每个子目录中的 `SKILL.md` 文件(YAML frontmatter + 正文)。这与 Claude Code 的 `~/.claude/skills/` 目录机制完全对称。

### 证据

1. `~/.codex/` 下存在 `skills/` 目录(当前为空,未安装任何项目级 skill)
2. 官方文档 `superpowers/.codex/INSTALL.md` 明确记载:`~/.agents/skills/` 是 Codex native skill discovery 路径
3. acceptance test 实际跑通:Codex 在 `response.txt` 中明确读取了 `~/.agents/skills/using-forge/SKILL.md` 和 `~/.agents/skills/forge-brainstorming/SKILL.md`

### 目录结构

```
spike/codex/
├── README.md                               # 本文件
├── .agents/
│   └── skills/
│       ├── using-forge/
│       │   └── SKILL.md                    # forge session-start bootstrap
│       └── forge-brainstorming/
│           └── SKILL.md                    # forge brainstorming 流程 skill
├── response.txt                            # codex exec 原始输出(acceptance test 产物)
└── ACCEPTANCE-TEST.md                      # acceptance test 报告
```

### SKILL.md 格式

```markdown
---
name: <skill-name>
description: <一句话,描述何时触发>
---

<skill 正文内容>
```

Codex 根据 `description` 字段决定是否激活 skill。触发后读取完整文件内容并注入到会话上下文。

## 测试方法

### 前提

把 forge 的 skill 安装到 `~/.agents/skills/`:

```bash
# Windows PowerShell
$skillsDir = "$env:USERPROFILE\.agents\skills"
New-Item -ItemType Directory -Force -Path "$skillsDir\using-forge"
New-Item -ItemType Directory -Force -Path "$skillsDir\forge-brainstorming"
Copy-Item "spike\codex\.agents\skills\using-forge\SKILL.md" "$skillsDir\using-forge\SKILL.md"
Copy-Item "spike\codex\.agents\skills\forge-brainstorming\SKILL.md" "$skillsDir\forge-brainstorming\SKILL.md"
```

### 跑 acceptance test

```bash
codex exec --full-auto "我想做个 todo list 应用" > response.txt 2>&1
echo "Exit: $?"
wc -l response.txt
head -50 response.txt
```

### 判定信号

**PASS 条件(任一)**:
- AI 明确说"先不写代码"或"触发 brainstorming"
- AI 提出 2-3 个方案对比(表格或列表)
- AI 提问而非直接输出代码

**FAIL 条件**:
- AI 直接输出代码(函数/类/完整文件)
- AI 绕过 brainstorming 给出实现

## 与 Claude Code 的对比

| 维度 | Claude Code | Codex |
|---|---|---|
| skill 目录 | `~/.claude/skills/<name>/SKILL.md` | `~/.agents/skills/<name>/SKILL.md` |
| 发现机制 | startup scan + Skill tool 触发 | startup scan + native skill match |
| forge 安装方式 | 复制到 `~/.claude/skills/` | 复制到 `~/.agents/skills/` |
| v0.1 支持可能性 | 确认可行 | 确认可行 |

## v0.1 结论

Codex **支持** forge bootstrap 自动注入。将 skill 文件安装到 `~/.agents/skills/` 后,用户每次 `codex exec` 会话均自动触发 forge 工作流约束,无需手动复制 bootstrap 文本。

forge v0.1 范围应包含 Codex adapter。
