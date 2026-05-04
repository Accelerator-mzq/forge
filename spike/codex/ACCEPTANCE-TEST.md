# Acceptance Test: Codex + forge bootstrap

**日期**: 2026-05-04  
**测试者**: msc  
**Codex 版本**: 0.125.0  
**模型**: gpt-5.5  

---

## Codex 注入机制研究(Step 9.1)

### 研究结论:情况 A — 原生 dir-based skill 注入

| 检查项 | 结果 |
|---|---|
| `~/.agents/skills/` 目录存在? | YES — 用户机器上已存在 |
| `~/.codex/skills/` 目录存在? | YES — 但为空(未用) |
| Codex 扫描 `~/.agents/skills/` 中的 SKILL.md? | YES — 官方文档 + 实际测试均验证 |
| 支持 `--system-prompt` 等命令行注入? | NO — `codex exec --help` 无此参数 |
| 是否需要拼接 prompt(情况 C)? | NO — skill 文件自动发现 |

**证据来源**:
1. `/d/ClaudeProject/opsp/superpowers/.codex/INSTALL.md` 和 `/d/ClaudeProject/opsp/superpowers/docs/README.codex.md` 明确记载 `~/.agents/skills/` 路径
2. `response.txt` 第 16-17 行:Codex 执行了 `Get-Content -Raw 'C:\Users\mzq\.agents\skills\using-forge\SKILL.md'` 和 `Get-Content -Raw 'C:\Users\mzq\.agents\skills\forge-brainstorming\SKILL.md'`

---

## 测试配置

### 安装步骤

```powershell
# 把 forge skills 复制到 ~/.agents/skills/
$src = "D:\ClaudeProject\opsp\forge-repo\spike\codex\.agents\skills"
$dst = "$env:USERPROFILE\.agents\skills"
Copy-Item -Recurse -Force "$src\using-forge" "$dst\"
Copy-Item -Recurse -Force "$src\forge-brainstorming" "$dst\"
```

### 测试命令

```bash
codex exec --full-auto "我想做个 todo list 应用" > spike/codex/response.txt 2>&1
```

**Exit code**: 0  
**总行数**: 275 行  
**模型**: gpt-5.5 (xhigh reasoning effort)  
**Tokens used**: 14,327

---

## AI 响应原文(最终输出)

> 注:Codex 将完整响应在末尾重复输出一次,以下为去重后的最终消息原文。

```
msc，我先不写代码：这个需求命中了 forge 的 brainstorming 规则，因为"todo list 应用"还没明确载体、用户和技术栈。

我调研到当前仓库是 `@accelerator-mzq/forge` 的 npm CLI/TypeScript 项目，不是现成前端应用。证据：[package.json:2]、[README.md:3]、[src/index.ts:1]。

| 方案 | 做什么 | 优点 | 缺点 | 推荐 |
|---|---|---|---|---|
| A | 在本仓库里做一个 CLI todo，比如 `forge todo add/list/done` | 贴合当前 CLI 仓库，改动小 | 不是图形界面 | 推荐 |
| B | 在本仓库新增一个独立 Web demo，比如 `apps/todo` | 有完整可视化应用 | 会改变仓库形态，引入前端依赖 | 次推荐 |
| C | 另起一个新的前端 todo 项目 | 最干净，适合做真正 app | 不太适合直接塞进当前 forge 仓库 | 视目标而定 |

最关键的问题：你想做的是 **CLI 版 todo**，还是 **浏览器网页 todo 应用**？
```

---

## 判定信号分析

### Code signals(直接写代码的迹象)

在最终 AI 消息中搜索代码输出(函数/类/文件):

| 信号类型 | 计数 | 说明 |
|---|---|---|
| 直接写的代码函数/类 | **0** | 无任何新代码生成 |
| 代码文件引用(读取已有文件) | 3 | 读取了 package.json, README.md, src/index.ts 以了解上下文 |

### Question signals(brainstorming 行为)

| 信号类型 | 计数 | 说明 |
|---|---|---|
| 明确拒绝写代码 | **1** | "我先不写代码" |
| 提出方案对比表格 | **1** | 3 个方案 A/B/C 含优劣对比 |
| 提出澄清问题 | **1** | "你想做的是 CLI 版 todo，还是浏览器网页 todo 应用？" |
| 引用 forge 规则 | **1** | "命中了 forge 的 brainstorming 规则" |

**Code signals total: 0**  
**Question signals total: 4**

---

## 中间过程观察

Codex 在给出最终回复前的行为序列:

1. 读取 `~/.agents/skills/using-forge/SKILL.md` — skill 自动发现成功
2. 读取 `~/.agents/skills/forge-brainstorming/SKILL.md` — skill 自动发现成功
3. 读取仓库结构(`Get-ChildItem`)、`package.json`、`README.md`、`src/index.ts` — 了解上下文
4. **明确说"我先不写代码"** — brainstorming 规则触发
5. 给出 3 个方案对比表格 — forge-brainstorming 流程遵循
6. 提出 1 个最关键澄清问题 — forge-brainstorming "一次只问 1 个"规则遵循

---

## 判定结论

### 结论 1:bootstrap 文本驱动 AI 行为有效?

**PASS**

- Codex 识别到"我想做个 todo list 应用"命中 using-forge 的"用户输入信号"红旗清单
- 未直接写代码,转而读取 skill 文件并执行 brainstorming 流程
- 给出方案对比表格(3 个方案),提 1 个澄清问题,行为完全符合 forge-brainstorming 规范

### 结论 2:Codex 支持 session-start bootstrap 自动注入?

**YES**

- 注入机制:文件复制到 `~/.agents/skills/<name>/SKILL.md` 后,Codex 在每次会话启动时自动发现并加载
- 用户无需手动复制 bootstrap 文本到 prompt
- 与 Claude Code `~/.claude/skills/` 机制完全对称

---

## 最终判定

**PASS**

- forge bootstrap 文本对 Codex 有效驱动 AI 行为
- Codex 原生支持 session-start skill 注入(`~/.agents/skills/`)
- forge v0.1 **应包含** Codex adapter

---

## 注意事项

1. **安装方式**:forge v0.1 的 `forge init` 命令需要将 skill 文件安装到 `~/.agents/skills/`,而非 `~/.codex/skills/`(后者当前为空且未被使用)
2. **ERROR 日志**:response.txt 中出现一行 `ERROR codex_core::session: failed to record rollout items: thread ... not found` — 这是 Codex 内部的遥测/日志错误,不影响 AI 响应功能
3. **响应重复**:Codex 在 JSONL 流输出后将最终消息重复了一次,response.txt 末尾有重复内容,属正常行为

---

## 完整响应文件

`spike/codex/response.txt` — 275 行,包含完整的 Codex JSONL 流输出
