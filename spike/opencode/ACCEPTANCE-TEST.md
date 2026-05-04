# Acceptance Test: OpenCode + forge bootstrap

**日期**: 2026-05-04  
**测试者**: msc  
**OpenCode 版本**: 1.14.31  
**模型**: opencode/gpt-5-nano  

---

## OpenCode 注入机制研究（Step 10.1）

### 研究结论：情况 B+C — skills 路径存在，但无 bootstrap 自动注入

| 检查项 | 结果 |
|---|---|
| `~/.config/opencode/skills/` 目录支持? | YES — OpenCode 原生 personal skills 路径 |
| `.opencode/skills/` 项目级目录支持? | YES — 优先级高于个人路径 |
| `~/.agents/skills/` 是否被 OpenCode 扫描? | **NO** — 只是 permission 白名单，非 skill 发现路径 |
| Skills 安装后 AI 是否自动加载? | **NO** — 需要 plugin 或手动调用 `skill` tool |
| `experimental.chat.messages.transform` hook 需要? | **YES** — 自动注入必须通过 plugin |
| 当前全局 `opencode.json` 有 plugin 配置? | **NO** |

**证据来源**：
1. `opencode agent list` 日志：`external_directory` 白名单包含 `~/.agents/skills/using-forge/*`（动态添加）
2. 启动日志：`service=skill count=2 init` — 发现 2 个 skills（forge-brainstorming, using-forge）
3. 启动日志 WARN：`duplicate skill name` — `~/.agents/skills/` 和 `~/.config/opencode/skills/` 都有同名 skill
4. **response.txt 第 2 行**：AI 第一句话是"我将先快速扫描代码库"，未调用 `skill` tool，未触发 brainstorming
5. `superpowers/.opencode/plugins/superpowers.js`：自动注入实现参考，必须配置 plugin

---

## 测试配置

### 安装步骤

```bash
# 把 forge skills 复制到 ~/.config/opencode/skills/
mkdir -p ~/.config/opencode/skills/using-forge
mkdir -p ~/.config/opencode/skills/forge-brainstorming
cp spike/opencode/.config/opencode/skills/using-forge/SKILL.md \
   ~/.config/opencode/skills/using-forge/SKILL.md
cp spike/opencode/.config/opencode/skills/forge-brainstorming/SKILL.md \
   ~/.config/opencode/skills/forge-brainstorming/SKILL.md
```

### 测试命令

```bash
timeout 120 opencode run \
  --model "opencode/gpt-5-nano" \
  --dangerously-skip-permissions \
  --format json \
  "我想做个 todo list 应用" \
  > spike/opencode/response.txt 2>&1
```

**Exit code**: 0  
**总行数**: 28 行（JSONL 格式）  
**模型**: opencode/gpt-5-nano  
**Tokens used**: ~11,764（包含 reasoning: 512）  

---

## AI 响应原文（最终输出，前 50 行）

> 注：response.txt 为 JSONL 格式，以下为提取出的文本消息和工具调用序列。

```
[STEP_START]
[TEXT] 我将先快速扫描代码库，看看当前项目结构和技术栈，以便为 Todo List 应用规划合适的实现路径（如 Web/CLI/移动端、前端框架、持久化方案等）。我会并行查询可能相关的文件。
[TOOL] glob: {"pattern":"src/**","path":"."}
[TOOL] glob: {"pattern":"package.json","path":"."}
[STEP_FINISH]
[STEP_START]
[TOOL] read: package.json (offset 1, limit 2000)
[TOOL] read: src/index.ts (offset 1, limit 2000)
[STEP_FINISH]
[STEP_START]
[TEXT] 将实现一个最小可用的命令行 Todo List 应用，放在 src/cli 下，使用 Commander 解析命令并对本地 JSON 文件进行持久化存储。新增文件包括存储处理、Todo 模型以及入口 CLI。随后可以执行构建和运行测试。
[TOOL] apply_patch: Add File: src/cli/storage.ts
[STEP_FINISH]
[STEP_START]
[TOOL] apply_patch: Add File: src/cli/todo.ts
[STEP_FINISH]
[STEP_START]
[TOOL] apply_patch: Add File: src/cli/index.ts
[STEP_FINISH]
[STEP_START]
[TEXT] 进展摘要
- 已在仓库中加入一个最小可用的命令行 Todo List 应用实现，基于 Commander，持久化存储在用户主目录的 ~/.forge/todos.json。
- 新增了三个文件，分别负责存储、业务逻辑和 CLI 入口。

证据文件（新增内容）
- src/cli/storage.ts
- src/cli/todo.ts
- src/cli/index.ts
[STEP_FINISH]
```

**总行数**：28 行 JSONL  
**文本消息**：3 条  
**工具调用**：9 次（2×glob, 2×read read error, 2×read, 3×apply_patch）  

---

## 判定信号分析

### Code signals（直接写代码的迹象）

| 信号类型 | 计数 | 说明 |
|---|---|---|
| apply_patch 写新文件 | **3** | 创建 src/cli/storage.ts, todo.ts, index.ts |
| skill tool 调用 | **0** | 未使用 skill tool |
| 提到 forge 规则 | **0** | 完全未提及 using-forge skill |

### Question signals（brainstorming 行为）

| 信号类型 | 计数 | 说明 |
|---|---|---|
| 明确拒绝写代码 | **0** | 无 |
| 提出方案对比 | **0** | 无方案表格 |
| 提出澄清问题 | **0** | 末尾有一些开放性问题，但已在写代码之后 |

**Code signals total: 3**  
**Question signals total: 0**

---

## 中间过程观察

OpenCode 在给出最终回复前的行为序列：

1. `skill count=2 init` — OpenCode 启动时发现了 2 个 skill 文件（forge-brainstorming, using-forge）
2. **未调用 skill tool** — AI 没有加载任何 skill
3. 直接调用 `glob` 扫描代码库
4. 读取 `package.json` 和 `src/index.ts` 了解上下文
5. **直接写了代码**（3 个 apply_patch）

---

## 判定结论

### 结论 1：bootstrap 文本驱动 AI 行为有效？

**N/A（未触发）**

Skills 文件存在于 `~/.config/opencode/skills/`，OpenCode 日志也确认发现了（`count=2`），但没有 bootstrap plugin 时，AI 不会在会话开始时自动加载 skill 内容。因此行为约束根本没有机会生效。

### 结论 2：OpenCode 支持 session-start bootstrap 自动注入？

**NO（需要 plugin）**

- OpenCode 的 skill 机制是"按需加载"，不是"session-start 自动注入"
- 自动注入需要在 `opencode.json` 中配置 plugin，实现 `experimental.chat.messages.transform` hook
- 当前全局 `~/.config/opencode/opencode.json` 无 plugin 配置

---

## 最终判定

**FAIL（情况 C — PARTIAL）**

- 安装 skill 文件到 `~/.config/opencode/skills/` 后，OpenCode **发现**了 skills，但不会自动注入
- AI 在收到"我想做个 todo list 应用"后**直接写了代码**（3 个 apply_patch），创建了 src/cli/ 下 3 个 TypeScript 文件
- forge 工作流约束完全未生效
- 原因：缺少 `experimental.chat.messages.transform` plugin 将 using-forge skill 注入到第一条用户消息前

---

## 注意事项与 concerns

1. **gemini 模型 SSL 错误**：`opencode/gemini-3-pro-preview-slb/gemini-2.5-flash` 模型返回 `unknown certificate verification error`，只有 `opencode/gpt-5-nano`（官方 OpenCode.ai 内置模型）可用
2. **默认格式输出问题**：`opencode run` 不加 `--format json` 时，stdout 只输出 3 行 ANSI 控制字符，AI 实际响应不出现在终端（内部通过 SSE 事件流处理）
3. **GBK 编码**：未遇到编码问题，AI 响应为 UTF-8
4. **AI 创建了垃圾文件**：测试过程中 AI 实际创建了 `src/cli/storage.ts`、`src/cli/todo.ts`、`src/cli/index.ts`，测试后需手动清理
5. **duplicate skill WARN**：`~/.agents/skills/` 和 `~/.config/opencode/skills/` 同时有 forge skills，OpenCode 日志报 WARN，最终使用 `~/.agents/skills/` 版本（先发现）

---

## v0.1 决策影响

**OpenCode 在 v0.1 不支持自动注入，建议从 v0.1 范围中移除**

- 自动注入必须开发一个 OpenCode JavaScript plugin
- 该 plugin 需实现 `experimental.chat.messages.transform`（OpenCode 实验性 API）
- 工作量超出 v0.1 scope
- **推荐 v0.1 只包含 Claude Code + Codex**（均已通过 acceptance test，PASS）
- **v0.2 再实现 OpenCode plugin**（参考 `superpowers/.opencode/plugins/superpowers.js`）

---

## 完整响应文件

`spike/opencode/response.txt` — 28 行 JSONL，包含完整的 OpenCode 事件流输出
