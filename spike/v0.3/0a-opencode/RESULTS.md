# Plan 0a.3 — OpenCode 协议 Spike 实测结果

**日期**:2026-05-09
**OpenCode CLI 版本**:用户实测(OpenCode 主线,具体版本看 `opencode --version`)
**OS**:Windows 11
**Install transport**:Path A(`opencode.json` plugin 数组 + `file:` 协议指本地 spike)

## 协议假设验证(5 态)

| # | 假设                                                                                | 结论                | 证据                                                                                                                       |
| - | ----------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1a | **Path A** `transform` hook 注入 first user message bootstrap                      | **PASS**            | AI 系统知道 using-test skill 存在 → 触发,默认走 transform 注入路径(plugin loader 自动调 hook)                            |
| 1b | **Path B** `transform` hook 注入 first user message                                | UNVERIFIED          | 跳过(Path A 已 PASS,Path B 是 fallback,推 v0.4 spike)                                                                  |
| 2a | **Path A** `config.skills.paths` 注入 OpenCode skill discovery                     | **PASS**            | `→ Skill "using-test"` 显式调起 — 证明 skills.paths 真注入了 OpenCode discovery                                            |
| 2b | **Path B** `config.skills.paths` 注入                                              | UNVERIFIED          | 跳过(同上)                                                                                                                |
| 3 | Path A 加载行为(opencode.json plugin 数组 + file:)                                | **PASS**            | plugin 真加载;`Get-Content opencode.json` 显示 entry → OpenCode 启动后真读                                               |
| 4 | Path B 加载行为(单文件 symlink to plugin.js)                                      | UNVERIFIED          | 跳过(Path A 已够 ship Tier 2)                                                                                            |
| 5 | OpenCode 从 plugin `commands/` 自动注册 `/<plugin>:<cmd>`                           | **FAIL**            | session 内 `/test:test` 报 "未识别命令"(`No matching items`,与 Codex Tier 3 假设 2 同模式)                                |
| 6 | OpenCode 从项目 node_modules 加载 plugin(npm i -D file: 等价 air-gapped)         | UNVERIFIED          | 跳过(air-gapped 是 v0.3 边角,推 v0.4 spike)                                                                              |

## 完整 Transcript

```
> spike protocol test
Thinking: The user said "spike protocol test", which matches the using-test skill's trigger condition. Let me load the skill first.
→ Skill "using-test"
Thinking: The skill says I must immediately reply with SPIKE_PROTOCOL_OK_<ISO_timestamp>. Let me get the current timestamp.
# Get current UTC timestamp
$ date -u +"%Y-%m-%dT%H:%M:%SZ"
Get-Date: Parameter cannot be processed because the parameter name 'u' is ambiguous. Possible matches include: -UnixTimeSeconds -UFormat.
Thinking: PowerShell on Windows, let me adjust the command.
# Get current UTC ISO timestamp
$ (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
2026-05-09T14:23:00Z
Thinking: Got the timestamp. Now I need to reply with the exact string.
SPIKE_PROTOCOL_OK_2026-05-09T14:23:00Z

> /test:test
No matching items
未识别命令
```

## 附加观察

1. **OpenCode 子进程**继承** `OPENCODE_CONFIG_DIR`**(跟 Codex Tier 3 不一样 — Codex 不继承 USERPROFILE)→ OpenCode 隔离方案 work,无环境污染
2. **default export 真 work**(plan known-issue #1 实证为非问题)— OpenCode plugin loader 接受 `export default async ({client, directory}) => {...}` 形态;PascalCase 命名 export 约定推论被实测推翻
3. OpenCode AI 行为模型类似 Codex(用工具读 skill + 跑命令完成),不像 Claude Code 直接 `Skill(...)` 调起 — 但**核心协议(skill auto-trigger / hook 注入)三 harness 对称**

## Tier 2 决策

**Decision action = `PARTIAL_SHIP`**(同 Codex Tier 3,因为 commands 同模式 FAIL)

- 假设 1a + 2a + 3 PASS → Tier 2 skills 路径完全 work,**Path A(opencode.json plugin 数组)主推**
- 假设 5 FAIL → spec §3.5 修订:OpenCode 路径下用户用 `/forge:propose` 等 slash 命令的承诺**取消**;改"AI 内化 skill 文本指示 + 主动跑 forge CLI"(同 Codex Tier 3 路径)
- 假设 1b/2b/4/6 UNVERIFIED → v0.4 spike 时再测;不阻塞 v0.3 ship Tier 2

## Spec 修订 trigger

1. **spec §3.5 修订(critical)**:OpenCode happy path 数据流删除 `/forge:propose` 等 slash 命令使用,改 AI 内化 helper 调用形态(同 Codex)
2. **spec §2.4 修订**:commands.md 在 OpenCode 下不可注册;Tier 2 ship 时 commands.md 的内容应改写到 skill 文本里(同 Codex Tier 3 — skill 文本明确指示 AI 跑 fenced bash + must-execute 调 helper)
3. **spec §1.1 文件树**:OpenCode plugin 内的 `commands/` 目录在 Path A 下不被 OpenCode 读 — 是否保留作为 Claude Code 同源(monorepo 设计)还是 spec 删除,需用户决策
4. **plan known-issue #1**:default export 实证 PASS,可从 known-issues 删除

## Cleanup

```powershell
Remove-Item -Recurse -Force $testHome -ErrorAction SilentlyContinue
$env:OPENCODE_CONFIG_DIR = $oldOpenCode
Test-Path $testHome   # 应 False
```
