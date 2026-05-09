# Plan 0a — 三 harness Plugin 协议 Spike 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 按 task 实施。Steps 用 checkbox(`- [ ]`)语法跟踪。
>
> **重要 — 此 plan 是 spike 性质**:产物是 throwaway plugin + 实测 transcript + RESULTS.md 决策证据,**不是产品代码**。三 sub-spike 任一 fail / 未实证 → 触发 §7 R3 Tier 决策,可能修改 spec 或推 Tier 到 v0.4。

**Goal**:用最小 throwaway plugin 分别验证 Claude Code / Codex / OpenCode 三 harness 的 plugin 加载协议、skill auto-trigger 行为、commands 注册行为,产出 PASS/FAIL/未实证 决策证据,unblock Plan 1。

**Architecture**:每 sub-spike 在 `spike/v0.3/0a-<harness>/` 子目录建 throwaway plugin(单 skill `using-test` + 单 hook),装到对应 harness,起真交互式 session 验证协议假设。fork superpowers 既有 manifest + hook 文件改名即可,**不引入 forge 业务内容**(避免业务 bug 干扰协议测试)。

**Tech Stack**:Node 20+(Plugin manifest 解析 + OpenCode plugin 加载)+ bash 4+(hook 脚本,fork superpowers 用 parameter substitution + printf,**不依赖 python3**)+ Claude Code / Codex / OpenCode 各自 CLI(实测环境)。无 npm 包发布,纯仓库子目录;每个 sub-spike 隔离 HOME / `OPENCODE_CONFIG_DIR` 避免污染日常工作环境(每个 task 实测末尾有 cleanup checklist)。

**关联 spec**:`docs/specs/2026-05-09-v0.3-plugin-migration-design.md`(decision #28 + §5.1 Plan 0a + §5.5 末尾"必须验证的协议假设清单")

---

## File Structure

```
spike/v0.3/
├── 0a-claude-code/
│   ├── .claude-plugin/
│   │   ├── plugin.json
│   │   └── marketplace.json
│   ├── skills/
│   │   ├── using-test/
│   │   │   └── SKILL.md
│   │   └── brainstorming/         ← cross-plugin namespace 冲突测试 skill(同 superpowers 同名)
│   │       └── SKILL.md
│   ├── hooks/
│   │   ├── hooks.json
│   │   ├── run-hook.cmd            ← fork superpowers,内容无需改
│   │   └── session-start            ← fork superpowers,sed 替换 superpowers→test
│   ├── commands/
│   │   └── test.md                ← 验证 commands 是否注册 /test:test slash
│   ├── RESULTS-prelocal.md          ← Task 0a.1.2 本地 hook 输出验证
│   ├── RESULTS-install-transport.md ← Task 0a.1.3 install transport 矩阵
│   └── RESULTS-protocol.md          ← Task 0a.1.4 plugin 协议验证
├── 0a-codex/
│   ├── .codex-plugin/
│   │   └── plugin.json
│   ├── skills/
│   │   └── using-test/
│   │       └── SKILL.md
│   ├── commands/                   ← 验证 Codex 是否支持 plugin commands
│   │   └── test.md
│   ├── INSTALL.md
│   └── RESULTS.md
└── 0a-opencode/
    ├── .opencode/
    │   └── plugins/
    │       └── test.js              ← fork superpowers,export ForgePlugin → TestPlugin
    ├── skills/
    │   └── using-test/
    │       └── SKILL.md
    ├── commands/                   ← 验证 OpenCode 是否从 commands/ 自动注册 slash
    │   └── test.md
    ├── package.json                 ← {name, version, type: module, main: .opencode/plugins/test.js}
    ├── INSTALL.md                   ← 双路径 — opencode.json plugin 数组 + 单文件 symlink fallback
    └── RESULTS.md
```

每 sub-spike 的 throwaway plugin **完全自包含**,fork superpowers 同等文件改名 `superpowers` → `test`,`using-superpowers` → `using-test`,业务内容删空。

---

## Task 0a.1.1:Fork Claude Code throwaway plugin 文件

**Files:**

- Create: `spike/v0.3/0a-claude-code/.claude-plugin/plugin.json`
- Create: `spike/v0.3/0a-claude-code/.claude-plugin/marketplace.json`
- Create: `spike/v0.3/0a-claude-code/skills/using-test/SKILL.md`
- Create: `spike/v0.3/0a-claude-code/skills/brainstorming/SKILL.md`(cross-plugin 冲突测试)
- Create: `spike/v0.3/0a-claude-code/hooks/hooks.json`
- Create: `spike/v0.3/0a-claude-code/hooks/run-hook.cmd`(fork superpowers)
- Create: `spike/v0.3/0a-claude-code/hooks/session-start`(fork superpowers,无扩展名)
- Create: `spike/v0.3/0a-claude-code/commands/test.md`

**参考源**:`D:\ClaudeProject\opsp\superpowers\.claude-plugin\` + `D:\ClaudeProject\opsp\superpowers\hooks\`

- [ ] **Step 1**:创建 `.claude-plugin/plugin.json`

```json
{
  "name": "test",
  "version": "0.0.1",
  "description": "throwaway plugin for forge v0.3 protocol spike (Plan 0a.1)",
  "author": { "name": "msc" },
  "license": "MIT"
}
```

- [ ] **Step 2**:创建 `.claude-plugin/marketplace.json`

```json
{
  "name": "test-spike",
  "description": "throwaway marketplace for forge v0.3 spike",
  "owner": { "name": "msc" },
  "plugins": [
    {
      "name": "test",
      "description": "throwaway protocol spike plugin",
      "version": "0.0.1",
      "source": "./",
      "author": { "name": "msc" }
    }
  ]
}
```

- [ ] **Step 3**:创建 `skills/using-test/SKILL.md`(包含 markdown frontmatter,内容用作 SessionStart hook 注入素材)

```markdown
---
name: using-test
description: Throwaway skill — auto-trigger 验证。用户说 "spike protocol test" 时必须触发本 skill,**首次触发必须回复** `SPIKE_PROTOCOL_OK_<ISO_timestamp>` 字符串(便于 RESULTS.md 自动证据)。
---

# Using Test (Spike)

This is a throwaway skill for protocol validation. If you see this in your system prompt, the SessionStart hook works. If auto-trigger fires when user says "spike protocol test", the skill auto-trigger pool works.

**Verification protocol**:首次触发本 skill 必须立即回复 `SPIKE_PROTOCOL_OK_<ISO_timestamp>`(用 ISO 8601 时间戳如 `2026-05-09T12:34:56Z`),用作 RESULTS.md 的硬证据。
```

- [ ] **Step 4**:创建 `hooks/hooks.json`(fork superpowers 形态)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-start",
            "async": false
          }
        ]
      }
    ]
  }
}
```

**前置 — cwd contract**(本 task 所有命令在 **forge-repo 根目录** 运行,不进子目录;路径全用 `spike/v0.3/0a-claude-code/...` 完整 repo-root 相对路径):

Git Bash / Linux / macOS:
```bash
# 假设 cwd = D:/ClaudeProject/opsp/forge-repo
OPSP_ROOT=D:/ClaudeProject/opsp
mkdir -p spike/v0.3/0a-claude-code/hooks
mkdir -p spike/v0.3/0a-claude-code/skills/{using-test,brainstorming}
mkdir -p spike/v0.3/0a-claude-code/commands
mkdir -p spike/v0.3/0a-claude-code/.claude-plugin
```

PowerShell:
```powershell
# 假设 cwd = D:\ClaudeProject\opsp\forge-repo
$OPSP_ROOT = "D:\ClaudeProject\opsp"
$null = New-Item -ItemType Directory -Force -Path `
  "spike\v0.3\0a-claude-code\hooks", `
  "spike\v0.3\0a-claude-code\skills\using-test", `
  "spike\v0.3\0a-claude-code\skills\brainstorming", `
  "spike\v0.3\0a-claude-code\commands", `
  "spike\v0.3\0a-claude-code\.claude-plugin"
```

- [ ] **Step 5**:Fork superpowers `hooks/run-hook.cmd`(polyglot,内容无需改 — 脚本调度 hook script 与 plugin 名无关)

```bash
# Git Bash / Unix
cp "$OPSP_ROOT/superpowers/hooks/run-hook.cmd" \
   spike/v0.3/0a-claude-code/hooks/run-hook.cmd
```

```powershell
# PowerShell
Copy-Item -Path "$OPSP_ROOT\superpowers\hooks\run-hook.cmd" `
          -Destination "spike\v0.3\0a-claude-code\hooks\run-hook.cmd"
```

- [ ] **Step 6**:Fork superpowers `hooks/session-start`(纯 bash escape_for_json + printf,**不引入 python3**)

cp + 跨平台 sed/perl 替换 plugin 名:

```bash
# Git Bash / Linux(GNU sed -i 形态)
cp "$OPSP_ROOT/superpowers/hooks/session-start" \
   spike/v0.3/0a-claude-code/hooks/session-start
sed -i 's/superpowers/test/g; s/Superpowers/Test/g; s/using-superpowers/using-test/g' \
  spike/v0.3/0a-claude-code/hooks/session-start
```

**macOS portable 替代**(BSD sed -i 语法不同):
```bash
# 用 perl(macOS / Linux 通用)
perl -i -pe 's/superpowers/test/g; s/Superpowers/Test/g; s/using-superpowers/using-test/g' \
  spike/v0.3/0a-claude-code/hooks/session-start
```

PowerShell:
```powershell
$file = "spike\v0.3\0a-claude-code\hooks\session-start"
Copy-Item "$OPSP_ROOT\superpowers\hooks\session-start" $file
(Get-Content $file -Raw) `
  -replace 'superpowers','test' `
  -replace 'Superpowers','Test' `
  -replace 'using-superpowers','using-test' `
  | Set-Content $file -NoNewline
```

**额外修整 — 简化 legacy 警告分支**(set -euo pipefail 下三处必须**一起改**,否则 unbound `$warning_message` 崩):

打开 `spike/v0.3/0a-claude-code/hooks/session-start`,做以下三处改动:

1. **删除整个 `legacy_skills_dir` if 块**(superpowers 源 line 11-15 那段 `legacy_skills_dir="${HOME}/.config/superpowers/skills"; if [ -d ... ]; then warning_message="..."; fi`)
2. **保留 warning_message 变量初始化**(改成 `warning_message=""` 一行)— 让后续 `warning_escaped=$(escape_for_json "$warning_message")` 不会引用未定义变量
3. **删除 session_context 模板里的 `${warning_escaped}` 引用**(那是空字符串拼接,无意义)

最终该 hook 文件应只剩:`escape_for_json()` 函数 + `using_*_content` 读 SKILL.md + `escape_for_json` 调用 + 三平台分支 printf JSON。

预期 session-start 形态(fork 后):
- 用 `escape_for_json()` bash function(line 23-31 of source)代替 python3
- 输出 JSON 用 `printf` 模板(line 47-54),不用 heredoc
- 三平台分支(Cursor / Claude Code / Copilot CLI)都保留,plan 实测在 Claude Code 走 `CLAUDE_PLUGIN_ROOT` 分支

- [ ] **Step 7**:**Unix(Git Bash / Linux / macOS)** 设置可执行位(cwd = forge-repo)

```bash
chmod +x spike/v0.3/0a-claude-code/hooks/session-start \
         spike/v0.3/0a-claude-code/hooks/run-hook.cmd
```

**Windows(PowerShell)**:Windows 文件系统无 +x 概念;hook 可执行位由 git 在 Step 10 commit 时设(用已 staged 文件的 `git update-index --chmod=+x`)。Step 7 在 Windows 下**跳过**(no-op)。

- [ ] **Step 8**:创建 `commands/test.md`(验证 plugin commands 注册)

```markdown
---
description: Spike protocol test command — 验证 plugin 是否注册 /test:test slash 命令
---

# /test:test

如果你看到此 slash 命令出现在 `/` 自动补全列表里,说明 Claude Code 从 plugin 的 `commands/` 目录自动注册了 commands。

输出 marker:`COMMANDS_REGISTRY_OK_<random>`
```

- [ ] **Step 9**:**新增** `skills/brainstorming/SKILL.md`(用于 cross-plugin namespace 冲突测试 — 同 superpowers 同名)

```markdown
---
name: brainstorming
description: "Spike differentiator — forge spec-driven workflow brainstorming(test plugin 内同名 skill,目的是验证与 superpowers 同名 brainstorming 共存时的 lifecycle 行为)。模糊需求时触发,**首次触发必须回复** `BRAINSTORM_DIFFERENTIATOR_OK_<timestamp>` marker(便于 RESULTS.md 自动证据)。"
---

# Brainstorming (Spike Differentiator)

This is a spike-only skill named `brainstorming`. Its purpose is to validate cross-plugin namespace conflict behavior when both superpowers and this test plugin are installed simultaneously.

**Verification protocol**:首次触发本 skill,必须回复 `BRAINSTORM_DIFFERENTIATOR_OK_<timestamp>` marker(用 ISO 时间戳)。

If the user input is ambiguous (e.g., "我想做个 todo list"), the model should use description differentiator to choose between `superpowers:brainstorming` and `test:brainstorming`.
```

- [ ] **Step 10**:Commit scaffold(cwd = forge-repo,含 hook 可执行位 — 跨平台一致)

```bash
# 先 add 所有文件(默认权限)
git add spike/v0.3/0a-claude-code/

# 再给 hook 文件设可执行位(此时已 staged,git update-index 才生效;Windows 下也跑此命令,git 把可执行位写进 index)
git update-index --chmod=+x spike/v0.3/0a-claude-code/hooks/session-start
git update-index --chmod=+x spike/v0.3/0a-claude-code/hooks/run-hook.cmd

# 验证:输出应含 "100755 ..." 行(可执行)
git ls-files --stage spike/v0.3/0a-claude-code/hooks/ | grep -E "^100755" || \
  { echo "ERROR: hook 可执行位未设"; exit 1; }

git commit -m "spike(0a.1): scaffold Claude Code throwaway plugin (hook fork from superpowers, +brainstorming differentiator skill, exec bits via git update-index)"
```

PowerShell 等价(grep 改 Select-String):
```powershell
git add spike\v0.3\0a-claude-code\
git update-index --chmod=+x spike/v0.3/0a-claude-code/hooks/session-start
git update-index --chmod=+x spike/v0.3/0a-claude-code/hooks/run-hook.cmd
git ls-files --stage spike/v0.3/0a-claude-code/hooks/ | Select-String "^100755"
if ($LASTEXITCODE -ne 0) { throw "hook 可执行位未设" }
git commit -m "..."
```

---

## Task 0a.1.2:本地预验证 — Hook 脚本独立运行(off-session)

**Files:**

- Create: `spike/v0.3/0a-claude-code/RESULTS-prelocal.md`(本地 hook 输出 JSON 证据,不依赖 Claude Code)

**目的**:不进 Claude Code session,先在本地直接跑 `hooks/run-hook.cmd session-start`,验证 hook 脚本本身能产生合法 JSON。这步若失败说明 fork superpowers + sed 替换没成功,后续 install 步骤无意义。

- [ ] **Step 1**:本地直接跑 hook(Unix / Git Bash;**子 shell 跑,不污染当前 cwd**)

```bash
(
  cd spike/v0.3/0a-claude-code
  CLAUDE_PLUGIN_ROOT="$(pwd)" bash hooks/run-hook.cmd session-start
) > /tmp/hook-output.json
# 子 shell 退出,cwd 仍是 forge-repo
```

预期:`/tmp/hook-output.json` 是合法 JSON,含 `hookSpecificOutput.additionalContext` 字段,内容含 `using-test` skill 完整 SKILL.md(superpowers session-start:18 直接 `cat`,frontmatter 也会一起进 hook 输出,**不剥离**)。

```bash
# 验证 JSON 合法(用 Node + stdin pipe,避开 Windows Git Bash /tmp/ 路径解释不一致问题
# — 实测发现 bash 写 /tmp/hook-output.json 到 MSYS 路径,Node 解为 D:\tmp\... 找不到)
cat /tmp/hook-output.json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"

# 验证关键字段(三独立 grep + && 链;任一缺失即 ERROR 退出 — grep -o 不能保证全命中)
grep -q 'SPIKE_PROTOCOL_OK' /tmp/hook-output.json && \
grep -q 'using-test' /tmp/hook-output.json && \
grep -q 'EXTREMELY_IMPORTANT' /tmp/hook-output.json || \
  { echo "ERROR: hook 输出缺关键字段(SPIKE_PROTOCOL_OK / using-test / EXTREMELY_IMPORTANT 任一)"; exit 1; }
# 期望:
# - SPIKE_PROTOCOL_OK:using-test 的 verification marker
# - using-test:skill 名
# - EXTREMELY_IMPORTANT:fork superpowers 的包装外壳
```

- [ ] **Step 2**:本地直接跑 hook(PowerShell / cmd;**Push-Location 不污染当前 cwd**)

```powershell
Push-Location spike\v0.3\0a-claude-code
try {
  $env:CLAUDE_PLUGIN_ROOT = (Get-Location).Path
  cmd /c hooks\run-hook.cmd session-start > $env:TEMP\hook-output.json
} finally {
  Pop-Location   # 恢复 cwd 到 forge-repo,与 Unix 子 shell 等价
  Remove-Item Env:CLAUDE_PLUGIN_ROOT -ErrorAction SilentlyContinue
}

# 验证 JSON 合法(Node 路径,与 Unix 一致):
node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" $env:TEMP\hook-output.json

# 或 PowerShell 原生:
Get-Content $env:TEMP\hook-output.json -Raw | ConvertFrom-Json | Out-Null

# 关键字段:
Select-String -Path $env:TEMP\hook-output.json -Pattern "SPIKE_PROTOCOL_OK|using-test|EXTREMELY_IMPORTANT"
```

- [ ] **Step 3**:写 `RESULTS-prelocal.md`

```markdown
# Plan 0a.1.2 — Hook 本地预验证结果

**日期**:2026-05-XX
**OS**:<Windows 11 PowerShell / Linux / macOS / Git Bash>
**bash 版本**:`bash --version` 输出(若 Unix)

## Hook 输出 JSON(合法性 + 关键字段,只针对 using-test 内容,**不**测 brainstorming)

| 项                                                 | 结论 | 证据                                              |
| -------------------------------------------------- | ---- | ------------------------------------------------- |
| `hooks/run-hook.cmd session-start` 退出 0          | ?    | exit code                                         |
| 输出是合法 JSON                                     | ?    | `node -e "JSON.parse(...)"` 退出 0                |
| 含 `hookSpecificOutput.additionalContext` 字段     | ?    | `node -e "const j=JSON.parse(require('fs').readFileSync('/tmp/hook-output.json','utf8')); console.log(j.hookSpecificOutput?.additionalContext?.length ?? 'MISSING')"` 输出长度数字而非 MISSING |
| `additionalContext` 含 `SPIKE_PROTOCOL_OK` marker  | ?    | grep 输出                                         |
| `additionalContext` 含 `using-test` skill 名       | ?    | grep 输出                                         |
| `additionalContext` 含 `EXTREMELY_IMPORTANT` 包装  | ?    | grep 输出                                         |

## 失败时的 next step

- JSON 不合法 → fork superpowers session-start 时 sed 漏改 / bash 5.3+ 兼容问题 → 检查 line 25-30 的 `escape_for_json()` 是否完整保留
- 缺关键字段 → SKILL.md 内容路径不对 / frontmatter 提取失败
- 退出非零 → 文件权限 / `${CLAUDE_PLUGIN_ROOT}` 解析失败
```

- [ ] **Step 4**:Commit

```bash
git add spike/v0.3/0a-claude-code/RESULTS-prelocal.md
git commit -m "spike(0a.1.2): local hook output verification (off-session, fork integrity check)"
```

---

## Task 0a.1.3:验证 Claude Code install transport(本地 marketplace 路径未实证)

**Files:**

- Create: `spike/v0.3/0a-claude-code/RESULTS-install-transport.md`

**目的**:**关键风险 — Claude Code `/plugin marketplace add` 可能不支持本地路径**(superpowers README 只示范远程 git URL marketplace)。本任务**独立验证 install transport**,不混进 plugin 协议验证(避免"install 不支持本地路径"被误判为"plugin 协议失败")。

**前置**:本机已装 Claude Code,记录版本到 RESULTS。

- [ ] **Step 1**:Fixture 项目准备 + 隔离 HOME(避免污染日常环境)

```bash
mkdir -p /tmp/forge-spike-fixture-claude
cd /tmp/forge-spike-fixture-claude
git init -q

# 隔离 HOME(Unix):避免 spike plugin 装到用户日常 ~/.claude
oldHome="${HOME-}"
TEST_HOME=$(mktemp -d -t forge-spike-claude-XXXXXX)
export HOME="$TEST_HOME"

# trap 强制 cleanup(覆盖所有 Transport 临时产物 + env 恢复)
cleanup_claude() {
  rm -rf "$TEST_HOME" 2>/dev/null
  rm -rf /tmp/forge-spike-claude-git-source 2>/dev/null               # Transport C 临时 git src
  rm -f /tmp/forge-spike-claude-code.tgz                              # Transport D 临时 tarball
  rm -rf /tmp/forge-spike-fixture-claude 2>/dev/null                  # fixture 项目
  [ -n "$oldHome" ] && export HOME="$oldHome" || unset HOME
  unset TEST_HOME oldHome
}
trap cleanup_claude EXIT INT TERM
```

PowerShell(用 try/finally 包裹整个 task body 实现 trap EXIT 等价):
```powershell
$oldUserProfile = $env:USERPROFILE
$testHome = Join-Path $env:TEMP "forge-spike-claude-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $testHome
$env:USERPROFILE = $testHome

# 整个 task body 套 try/finally(在 plan 中,从此 Step 1 末尾到 Step 6 cleanup 全部
# 在 try { ... } finally { ... } 内执行;实施时实际命令依赖 spike 的脚本封装)
# Step 6 cleanup 段会显式跑 finally 内的恢复逻辑
```

- [ ] **Step 2**:**Transport A — 本地路径** `/plugin marketplace add <local-path>`(假设可疑)

session 内:
```
/plugin marketplace add D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-claude-code
```

记录:成功 / 失败 / 错误信息。

- [ ] **Step 3**:**Transport B — `--plugin-dir` CLI 参数**(superpowers test fixture 用过)

```bash
claude --plugin-dir D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-claude-code
```

记录:plugin 是否被加载(session 内能看到 `/test:*` slash 或 SessionStart hook 注入)。

- [ ] **Step 4**:**Transport C — 本地 git repo URL**(**先复制到 /tmp,避免 forge 主仓嵌套 .git 污染**)

```bash
# 不在 forge 主仓内 git init(防止嵌套 repo)
SPIKE_GIT_SRC=/tmp/forge-spike-claude-git-source
rm -rf "$SPIKE_GIT_SRC"
cp -r D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-claude-code "$SPIKE_GIT_SRC"
cd "$SPIKE_GIT_SRC"
git init -q && git add -A && git commit -q -m init

# 计算 file:/// URL(Windows Git Bash 下 /tmp/... 可能映射到 C:\Users\...\AppData\Local\Temp\...,
# 需 cygpath -m 转 Windows 风格;Linux/macOS 直接用 /tmp/... 即可)
if command -v cygpath > /dev/null 2>&1; then
  SPIKE_GIT_URL="file:///$(cygpath -m "$SPIKE_GIT_SRC")"
else
  SPIKE_GIT_URL="file://$SPIKE_GIT_SRC"
fi
echo "Transport C URL: $SPIKE_GIT_URL"

# session 内(用上面输出的 URL):
# /plugin marketplace add <SPIKE_GIT_URL 实际值>
```

记录:是 / 否 / 错误。Step 6 cleanup 时由 `cleanup_claude` 自动删 `$SPIKE_GIT_SRC`。

- [ ] **Step 5**:**Transport D — 本地 tarball**(tarball 放到 /tmp,不污染 forge-repo)

```bash
SPIKE_TARBALL=/tmp/forge-spike-claude-code.tgz
tar czf "$SPIKE_TARBALL" -C D:/ClaudeProject/opsp/forge-repo/spike/v0.3 0a-claude-code/

# session 内:
# /plugin install --from-tarball /tmp/forge-spike-claude-code.tgz
```

记录:是 / 否 / 错误。`SPIKE_TARBALL` 由 Step 1 trap cleanup 一并删。

- [ ] **Step 6**:写 `RESULTS-install-transport.md`

```markdown
# Plan 0a.1.3 — Claude Code Install Transport 验证

**日期**:2026-05-XX
**Claude Code 版本**:`claude --version` 输出
**OS**:<Windows 11 PowerShell / Linux / macOS / Git Bash>

## Transport 矩阵(统一 5 态)

| Transport                                    | 状态                                                              | 证据 / 错误信息       |
| -------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| A. 本地路径 marketplace add                  | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | session log           |
| B. `--plugin-dir` CLI 参数                   | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | session log           |
| C. 本地 git URL marketplace add              | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | session log           |
| D. 本地 tarball install                      | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | session log           |

**5 态语义**(Transport 维度):
- PASS — transport 装成功 + plugin 加载成功
- FAIL — transport 命令明确拒绝或报错
- UNVERIFIED — 命令未跑(机器无对应 CLI / 配置缺失)
- INSTALL_BLOCKED — 装成功但 plugin 协议层失败(应记入 0a.1.4 而非 transport 表)
- PARTIAL — 装成功但部分功能(如 commands)未注册

## 选定的 transport

(基于上表选一种 SUPPORTED 的,记入 RESULTS-protocol.md 用)

## 决策 hook

- 至少一种 transport SUPPORTED → Plan 0a.1.4 用该 transport 继续协议验证
- 全部 UNSUPPORTED → **0a.1.4 标 INSTALL_BLOCKED 不继续**(没 transport 装不了 plugin,无法验 protocol)。同时回 spec §3.1 修订:Claude Code Tier 1 install 路径需更新文档(可能新版 Claude Code 协议有变);Tier 1 BLOCKED → release v0.3 暂停,等 spec 修订完重跑 0a.1.3
```

- [ ] **Step 7**:Commit

```bash
git add spike/v0.3/0a-claude-code/RESULTS-install-transport.md
git commit -m "spike(0a.1.3): Claude Code install transport matrix (local marketplace/--plugin-dir/git URL/tarball)"
```

---

## Task 0a.1.4:验证 Claude Code plugin 协议(用 0a.1.3 选定的 transport)

**Files:**

- Create: `spike/v0.3/0a-claude-code/RESULTS-protocol.md`

**前置**:Task 0a.1.2 hook 本地预验证 PASS + Task 0a.1.3 选定一种 SUPPORTED transport。

- [ ] **Step 1**:用选定 transport 装 spike plugin(隔离 HOME 内)

(命令依赖 0a.1.3 选哪个 transport;假设是 Transport A 本地路径,使用)
```
/plugin marketplace add D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-claude-code
/plugin install test@test-spike
```

- [ ] **Step 2**:**单 plugin** 启用 — 验证 SessionStart hook + skill auto-trigger

退出重启 session(session 内 `/exit` + 重新跑 `claude`)。

输入:
```
spike protocol test
```

预期(因为 `using-test` skill description 含此触发短语):AI 自动 invoke `Skill(test:using-test)`,回复含 `SPIKE_PROTOCOL_OK_<timestamp>` marker(**using-test SKILL.md 定义此 marker,与 brainstorming SKILL.md 的 `BRAINSTORM_DIFFERENTIATOR_OK` 严格区分**)。

注意 marker 责任划分:
- using-test → SPIKE_PROTOCOL_OK(本 step 验证 hook + skill auto-trigger)
- brainstorming → BRAINSTORM_DIFFERENTIATOR_OK(Step 5 cross-plugin 测试时验证)

记录 transcript。

- [ ] **Step 3**:**单 plugin** 启用 — 验证 commands 注册

输入 `/`(自动补全),看是否含 `/test:test`。

输入 `/test:test`,看是否调起 commands/test.md(预期 AI 输出 `COMMANDS_REGISTRY_OK_<random>`)。

记录:是 / 否 / 路径(若部分注册)。

- [ ] **Step 4**:**装第二 plugin** — superpowers,验证 cross-plugin 同名 brainstorming 共存

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

(注意:用 superpowers 官方 marketplace `obra/superpowers-marketplace`,而不是 plan 第一稿写的 `obra/superpowers`/`superpowers-dev`,后者来源不准确)

退出重启 session。

- [ ] **Step 5**:Cross-plugin 同名冲突测试 — 输入**模糊 brainstorming 触发短语**(关键 fix:不再用 spike-specific `spike protocol test` 短语,因为那只触发 test plugin 一个 skill,不触发 superpowers brainstorming)

输入:
```
我想做个 todo list 应用
```

预期(若 namespace 冲突):AI 必须从 `superpowers:brainstorming` 与 `test:brainstorming` 中选一个调用,description differentiator(`test:brainstorming` 描述里有"forge spec-driven workflow")应起区分作用。

观察:
- AI invoke 哪个 skill?(看 Skill 调用日志)
- 是否同时 invoke 两个?
- AI 是否提示用户该选哪个?
- 是否完全忽略一个?

记录完整 transcript。

- [ ] **Step 6**:Cleanup(关键)

```
/plugin uninstall test@test-spike
/plugin uninstall superpowers@superpowers-marketplace
/plugin marketplace remove test-spike
/plugin marketplace remove superpowers-marketplace
```

(Unix)清理 + 恢复原 HOME:
```bash
rm -rf "$TEST_HOME" /tmp/forge-spike-fixture-claude
export HOME="$oldHome"
unset TEST_HOME oldHome
```

(PowerShell)恢复 USERPROFILE 到原值:
```powershell
Remove-Item -Recurse -Force $testHome
$env:USERPROFILE = $oldUserProfile
Remove-Variable testHome, oldUserProfile
```

- [ ] **Step 7**:写 `RESULTS-protocol.md`(用 5 态决策矩阵)

```markdown
# Plan 0a.1.4 — Claude Code 协议 Spike 实测结果

**日期**:2026-05-XX
**Claude Code 版本**:输出
**Install transport**:从 0a.1.3 选(A / B / C / D)
**OS**:输出

## 协议假设验证(5 态)

| # | 假设                                              | 结论                                | 证据                       |
| - | ------------------------------------------------- | ----------------------------------- | -------------------------- |
| 1 | SessionStart hook 注入 system prompt              | PASS/FAIL/UNVERIFIED/INSTALL_BLOCKED/PARTIAL | transcript + JSON      |
| 2 | Plugin skills 进 skill auto-trigger 池             | PASS/FAIL/UNVERIFIED/INSTALL_BLOCKED/PARTIAL | transcript            |
| 3 | Plugin `commands/` 自动注册 `/<plugin>:<cmd>`     | PASS/FAIL/UNVERIFIED/INSTALL_BLOCKED/PARTIAL | / 自动补全 + 调用结果 |
| 4 | Cross-plugin 同名 brainstorming + description diff 区分 | PASS/FAIL/UNVERIFIED/PARTIAL/IGNORED | transcript           |

## 完整 Transcript

(粘贴 install / single-plugin verify / install-second / cross-plugin verify 四段交互)

## Tier 1 决策(基于上表组合)

- 假设 1 + 2 PASS → Tier 1 hook + skill 路径 unblock,Plan 1 进
- 假设 3 PASS → spec §2.4 commands 注册路径有保障
- 假设 3 FAIL → spec §2.4 修订:Claude Code 也走 skill 内嵌 helper 调用(同 Codex 路径降级)
- 假设 4 FAIL → spec §2.6 description differentiator 不足以区分 → 改用 `forge-` 前缀(Plan 2 触发)
- 假设 1 OR 2 FAIL → spec §2.5 + §3.1 重审,Tier 1 BLOCKED → release v0.3 暂停
```

- [ ] **Step 8**:Commit

```bash
git add spike/v0.3/0a-claude-code/RESULTS-protocol.md
git commit -m "spike(0a.1.4): record Claude Code plugin protocol verification (single + cross-plugin namespace, 5-state decision matrix)"
```

---

## Task 0a.2.1:Fork Codex throwaway plugin 文件

**Files:**

- Create: `spike/v0.3/0a-codex/.codex-plugin/plugin.json`
- Create: `spike/v0.3/0a-codex/skills/using-test/SKILL.md`
- Create: `spike/v0.3/0a-codex/commands/test.md`(spike 验证用,看 Codex 是否能注册)
- Create: `spike/v0.3/0a-codex/INSTALL.md`(用户安装步骤)

**参考源**:`D:\ClaudeProject\opsp\superpowers\.codex-plugin\plugin.json` + `D:\ClaudeProject\opsp\superpowers\.codex\INSTALL.md`

- [ ] **Step 1**:创建 `.codex-plugin/plugin.json`

```json
{
  "name": "test",
  "version": "0.0.1",
  "description": "throwaway Codex plugin for forge v0.3 protocol spike (Plan 0a.2)",
  "author": { "name": "msc" },
  "license": "MIT",
  "skills": "./skills/",
  "interface": {
    "displayName": "Test Spike",
    "category": "Coding",
    "capabilities": ["Interactive", "Read", "Write"]
  }
}
```

- [ ] **Step 2**:复用 Plan 0a.1 Step 3 的 `skills/using-test/SKILL.md` 内容(直接 cp 过来)

```bash
cp spike/v0.3/0a-claude-code/skills/using-test/SKILL.md \
   spike/v0.3/0a-codex/skills/using-test/SKILL.md
```

- [ ] **Step 3**:创建 `commands/test.md`(同 Plan 0a.1 Step 8,试验 Codex 是否注册)

```bash
cp spike/v0.3/0a-claude-code/commands/test.md \
   spike/v0.3/0a-codex/commands/test.md
```

- [ ] **Step 4**:创建 `INSTALL.md`(fork superpowers `.codex/INSTALL.md` 改名)

```markdown
# Installing test spike plugin for Codex

## Prerequisites
- Git
- Codex CLI

## Installation

1. Clone the spike plugin to ~/.codex/test:
   ```bash
   # 在 spike 期用本地路径模拟,生产用真 git URL
   ln -s D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-codex ~/.codex/test
   ```

2. Create the skills symlink:

   **macOS/Linux:**
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/test/skills ~/.agents/skills/test
   ```

   **Windows (PowerShell):**
   ```powershell
   # 父目录都要先存在(不然 mklink /J fail)
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.codex"
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\test" "$env:USERPROFILE\.codex\test\skills"
   ```

3. Restart Codex.

## Spike 额外验证步骤

- 是否需另外 symlink commands 才能让 Codex 识别 `/test:test`?(Plan 0a.2 实测填空)
- 是否 Codex 的 plugin commands 注册依赖 `~/.agents/commands/` 路径?(实测填空)
```

- [ ] **Step 5**:Commit

```bash
git add spike/v0.3/0a-codex/
git commit -m "spike(0a.2): scaffold Codex throwaway plugin for protocol verification"
```

---

## Task 0a.2.2:实测 Codex plugin 协议

**Files:**

- Create: `spike/v0.3/0a-codex/RESULTS.md`

**前置**:本机已装 Codex CLI。

- [ ] **Step 1**:Fixture 隔离 + 装 throwaway plugin(保存原 env 值用于 cleanup)

Unix(**保存原 env + trap EXIT 强制 cleanup**;**Windows Git Bash 用户必须先验证 symlink 支持**,不然 ln -s 退化为 deep copy + 后续 rm -rf 会删 spike 源!):
```bash
# 危险:Windows Git Bash 默认 ln -s 退化为 file/directory copy(无 admin / Developer Mode / MSYS=winsymlinks 时),
# cleanup 阶段 rm -rf "$TEST_HOME" 会**真删 D:/.../0a-codex 源文件**!
# 检测并 abort:
if [[ "$OSTYPE" == msys* || "$OSTYPE" == cygwin* ]]; then
  if [ -z "${MSYS:-}" ] || [[ "$MSYS" != *winsymlinks* ]]; then
    echo "ERROR: Windows Git Bash 检测到,但 MSYS 未含 winsymlinks。"
    echo "请改用 PowerShell 段(下),或先 export MSYS=winsymlinks:nativestrict 再重跑。"
    exit 1
  fi
fi

oldHome="${HOME-}"
TEST_HOME=$(mktemp -d -t forge-spike-codex-XXXXXX)
export HOME="$TEST_HOME"
mkdir -p "$HOME/.codex" "$HOME/.agents/skills"
ln -s D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-codex "$HOME/.codex/test"
ln -s "$HOME/.codex/test/skills" "$HOME/.agents/skills/test"

# trap 强制 cleanup(spike 中途崩 / Ctrl+C 都恢复 env)
cleanup_codex() {
  rm -rf "$TEST_HOME" 2>/dev/null
  [ -n "$oldHome" ] && export HOME="$oldHome" || unset HOME
  unset TEST_HOME oldHome
}
trap cleanup_codex EXIT INT TERM
```

PowerShell(隔离 USERPROFILE,先保存原值,父目录确保存在):
```powershell
$oldUserProfile = $env:USERPROFILE   # 保存原值,Step 6 cleanup 用
$testHome = Join-Path $env:TEMP "forge-spike-codex-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $testHome
$env:USERPROFILE = $testHome
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.codex"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"

cmd /c mklink /J "$env:USERPROFILE\.codex\test" `
  "D:\ClaudeProject\opsp\forge-repo\spike\v0.3\0a-codex"
cmd /c mklink /J "$env:USERPROFILE\.agents\skills\test" `
  "$env:USERPROFILE\.codex\test\skills"
```

- [ ] **Step 2**:重启 Codex CLI,起 session

```bash
codex
```

输入 `spike protocol test` 看 skill 是否触发,记录 transcript。

- [ ] **Step 3**:验证 skill auto-trigger pool

输入:"列出当前 session 加载的所有 skills"(让 AI 自报)

预期:AI 列表含 `test:using-test`(若 Codex 加 plugin namespace 前缀)或 `using-test`(若不加)。

记录实际行为。

- [ ] **Step 4**:**关键假设验证 #1** — Codex 是否支持 plugin commands 注册

输入 `/`,观察自动补全是否含 `/test:test`。

如果**没有**(预期),输入 `/test:test`,看是否报"未识别命令"。

如果**有**,记录 Codex 是从哪个路径(symlink ~/.agents/commands/ ?或 plugin.json 的 commands 字段?)发现的。

- [ ] **Step 5a**:**关键假设验证 #2** — 准备 3 组 auto-execution test 变体(off-session 改 SKILL.md)

Codex `!command` 协议未实证,plan 必须独立验证 3 种机制:

修改 `~/.codex/test/skills/using-test/SKILL.md`,在底部追加 3 段:

```markdown
## Auto-execution test — Variant A (literal `!command` syntax)

!echo AUTO_EXEC_VARIANT_A_OK_<ISO_timestamp>

(单行,以 `!` 开头,这是 Codex / 部分 harness 的"自动执行 shell 命令"语法。若 Codex 支持,触发 skill 时会自动跑此命令并打印输出)

## Auto-execution test — Variant B (fenced bash + must-execute 指示)

When this skill is triggered, you **MUST automatically execute** the following command and include the output verbatim in your reply:

\`\`\`bash
echo "AUTO_EXEC_VARIANT_B_OK_$(date -u +%Y-%m-%dT%H:%M:%SZ)"
\`\`\`

## Auto-execution test — Variant C (普通文本要求,无强制语法)

When triggered, please run `echo AUTO_EXEC_VARIANT_C_OK_<ISO_timestamp>` and report the output.
```

- [ ] **Step 5b**:重启 Codex session

`/exit` + 重跑 `codex`(隔离 HOME 已设置)

- [ ] **Step 5c**:触发 skill,观察 3 个 variant 各自行为

输入触发短语(同 Step 2 / 3),让 skill 加载。逐一观察:

- Variant A 是否输出 `AUTO_EXEC_VARIANT_A_OK_<timestamp>`(自动跑) / 显示原文 `!echo ...`(literal,未执行) / 完全忽略
- Variant B 是否输出 `AUTO_EXEC_VARIANT_B_OK_<timestamp>`(AI 主动跑 fenced) / 提示用户手动跑 / 忽略
- Variant C 是否输出 `AUTO_EXEC_VARIANT_C_OK_<timestamp>` / 提示手动跑 / 忽略

- [ ] **Step 5d**:记录 transcript 到 RESULTS.md(标 "Step 5 auto-execution" 段),独立填 3 个 variant 结果

| Variant | 协议                    | 结论(PASS/FAIL/IGNORED/UNVERIFIED) | 证据                  |
| ------- | ----------------------- | ------------------------------------- | --------------------- |
| A       | literal `!command`      | ?                                     | transcript 摘录       |
| B       | fenced bash + must-exec | ?                                     | transcript 摘录       |
| C       | 普通文本要求            | ?                                     | transcript 摘录       |

**spec 影响**:Variant A PASS → spec §2.2.2 / §3.4 "skill 内 `!command` 自动执行"承诺成立;Variant A FAIL + Variant B PASS → spec 改写为 "skill 文本指示 AI 跑 fenced bash";全 FAIL → Codex 严格门禁退化为 "skill 提示用户手动跑命令"

- [ ] **Step 6**:Cleanup(Unix 已 trap 自动跑;PowerShell 在 finally 块跑;本 step 显式确认)

Unix:
```bash
cleanup_codex
trap - EXIT INT TERM
```

PowerShell(Step 1 已 try / finally 包裹,此处确认 finally 已跑):
```powershell
# 验证 USERPROFILE 已恢复
if ($env:USERPROFILE -ne $oldUserProfile) {
  Write-Warning "USERPROFILE 未恢复,手动跑: `$env:USERPROFILE = '$oldUserProfile'"
}
```

- [ ] **Step 7**:写 `RESULTS.md`(5 态决策矩阵)

```markdown
# Plan 0a.2 — Codex 协议 Spike 实测结果

**日期**:2026-05-XX
**Codex CLI 版本**:`codex --version` 输出
**OS**:Windows 11 + PowerShell / Linux / macOS

## 协议假设验证(5 态)

| # | 假设                                                              | 结论                                                              | 证据                  |
| - | ----------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| 1 | `~/.agents/skills/<plugin>` 进 Codex auto-trigger 池              | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | transcript            |
| 2 | Codex 支持 plugin commands 注册(`/test:test`)                   | PASS / FAIL / UNVERIFIED / PARTIAL(需特定路径)                  | transcript + 路径详情 |
| 3 | Codex skill 内嵌 `!command` 自动执行                              | PASS(自动) / FAIL(只提示) / IGNORED / UNVERIFIED                | transcript            |

## 完整 Transcript

(粘贴 plugin install 到 protocol test 完整对话)

## Tier 3 决策

- 假设 1 PASS + 假设 2 PASS + 假设 3 PASS(自动) → Tier 3 全功能 ship
- 假设 1 PASS + 假设 2 FAIL + 假设 3 FAIL(只提示) → Tier 3 降级:仅 skill auto-trigger,/forge:* 不支持,严格门禁退化为 skill 提示用户手动跑(spec §2.2.2 修订)
- 假设 1 PASS + 任一 UNVERIFIED → 标记 Tier 3 PARTIAL,先 ship skill 路径,UNVERIFIED 项作为 v0.4 spike target
- 假设 1 FAIL → Codex Tier 3 推 v0.4(spec §7 R3 触发)
```

- [ ] **Step 8**:Commit

```bash
git add spike/v0.3/0a-codex/RESULTS.md
git commit -m "spike(0a.2): record Codex protocol verification (5-state matrix, with cleanup)"
```

---

## Task 0a.3.1:Fork OpenCode throwaway plugin 文件

**Files:**

- Create: `spike/v0.3/0a-opencode/.opencode/plugins/test.js`
- Create: `spike/v0.3/0a-opencode/skills/using-test/SKILL.md`
- Create: `spike/v0.3/0a-opencode/commands/test.md`(spike 验证用)
- Create: `spike/v0.3/0a-opencode/package.json`(npm i -D file: spike 必需,`type: module` + `main` 指向 plugin js)
- Create: `spike/v0.3/0a-opencode/INSTALL.md`

**参考源**:`D:\ClaudeProject\opsp\superpowers\.opencode\plugins\superpowers.js` + `superpowers/.opencode/INSTALL.md` + `superpowers/package.json`

- [ ] **Step 1**:创建 `.opencode/plugins/test.js`(fork superpowers,改名)

```js
// .opencode/plugins/test.js
// fork from superpowers/.opencode/plugins/superpowers.js,改名 superpowers → test

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  return match ? { body: match[2] } : { body: content };
};

// 注意:用 default export 而非命名 export
// 原因:OpenCode plugin discovery 对命名 export 有 PascalCase(包名)约定
// (superpowers 包名 superpowers ↔ export SuperpowersPlugin)。本 spike 包名 forge-spike-test
// 若用命名 export 应是 ForgeSpikeTestPlugin,易拼错 → Path A 加载 FAIL 误判为协议失败
// default export 完全绕开命名约定,OpenCode 直接拿 default 就 work
export default async ({ client, directory }) => {
  const testSkillsDir = path.resolve(__dirname, '../../skills');

  const getBootstrapContent = () => {
    const skillPath = path.join(testSkillsDir, 'using-test', 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;
    const { body } = extractAndStripFrontmatter(
      fs.readFileSync(skillPath, 'utf8'),
    );
    return `<EXTREMELY_IMPORTANT>\nThis is spike protocol test.\n\n${body}\n</EXTREMELY_IMPORTANT>`;
  };

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(testSkillsDir)) {
        config.skills.paths.push(testSkillsDir);
      }
    },

    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find((m) => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;
      if (
        firstUser.parts.some(
          (p) => p.type === 'text' && p.text.includes('EXTREMELY_IMPORTANT'),
        )
      )
        return;
      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    },
  };
};
```

- [ ] **Step 2**:复用 0a.1 Step 3 的 SKILL.md 与 0a.1 Step 8 的 test.md

```bash
cp spike/v0.3/0a-claude-code/skills/using-test/SKILL.md \
   spike/v0.3/0a-opencode/skills/using-test/SKILL.md
cp spike/v0.3/0a-claude-code/commands/test.md \
   spike/v0.3/0a-opencode/commands/test.md
```

- [ ] **Step 3**:创建 `package.json`(npm i -D file: spike 必需,与 superpowers `package.json` 形态一致)

```json
{
  "name": "forge-spike-test",
  "version": "0.0.1",
  "type": "module",
  "main": ".opencode/plugins/test.js"
}
```

- [ ] **Step 4**:创建 `INSTALL.md`(fork superpowers `.opencode/INSTALL.md` 形态,**主推 opencode.json plugin 数组,而非目录 symlink**)

```markdown
# Installing test spike plugin for OpenCode

## Prerequisites
- OpenCode CLI(本机已装)

## Installation Path A — opencode.json plugin 数组(superpowers v5 主推)

在 `~/.config/opencode/opencode.json`(或项目级)的 `plugin` 数组加 entry。spike 期用 file: 协议指向本地路径:

\`\`\`json
{
  "plugin": [
    "forge-spike-test@file:D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode"
  ]
}
\`\`\`

或用 git URL(若 spike 期把 0a-opencode 做成独立 git repo):
\`\`\`json
{
  "plugin": [
    "forge-spike-test@git+file:///D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode"
  ]
}
\`\`\`

重启 OpenCode 即可。

## Installation Path B — 单文件 symlink(superpowers v4 老路径,迁移指南列出)

\`\`\`bash
mkdir -p ~/.config/opencode/plugins
ln -s D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode/.opencode/plugins/test.js \
      ~/.config/opencode/plugins/test.js
# **注意**:symlink 单文件,不 symlink 目录(superpowers INSTALL.md "Migrating from old symlink-based install" 段明确)
\`\`\`

## Spike 实测验证

- 0a.3.2 Step 3 验证 Path A 加载行为
- 0a.3.2 Step 4 验证 Path B 加载行为
- 0a.3.2 Step 5 验证 OpenCode 是否从 `commands/` 自动注册 slash
- 0a.3.2 Step 6 验证 OpenCode 是否能从项目 node_modules 加载 plugin
```

- [ ] **Step 5**:Commit

```bash
git add spike/v0.3/0a-opencode/
git commit -m "spike(0a.3): scaffold OpenCode throwaway plugin (+package.json, dual-path INSTALL.md, fork from superpowers v5 form)"
```

---

## Task 0a.3.2:实测 OpenCode plugin 协议

**Files:**

- Create: `spike/v0.3/0a-opencode/RESULTS.md`

**前置**:本机已装 OpenCode CLI;Task 0a.3.1 已 commit。

- [ ] **Step 1**:Fixture 项目准备 + **三件套环境隔离**(对齐 superpowers `tests/opencode/setup.sh:12-14`,避免污染用户真实 `~/.config/opencode`)

Unix(**先保存原 env,后续 cleanup 用 trap EXIT 强制恢复**):
```bash
mkdir -p /tmp/forge-spike-fixture-opencode
cd /tmp/forge-spike-fixture-opencode
git init -q

# 1. 保存原 env(若原本未设,${VAR-} 展开为空,不报 unbound)
oldHome="${HOME-}"
oldXdg="${XDG_CONFIG_HOME-}"
oldOpenCode="${OPENCODE_CONFIG_DIR-}"

# 2. 三件套隔离(同 superpowers 实战形态)
TEST_HOME=$(mktemp -d -t forge-spike-opencode-XXXXXX)
export HOME="$TEST_HOME"
export XDG_CONFIG_HOME="$TEST_HOME/.config"
export OPENCODE_CONFIG_DIR="$TEST_HOME/.config/opencode"
mkdir -p "$OPENCODE_CONFIG_DIR/plugins"

# 3. trap EXIT 强制 cleanup(无论 spike 是否中途崩 / 用户 Ctrl+C 都跑)
cleanup_opencode() {
  rm -rf "$TEST_HOME" /tmp/forge-spike-fixture-opencode /tmp/forge-spike-fixture-opencode-nm 2>/dev/null
  [ -n "$oldHome" ] && export HOME="$oldHome" || unset HOME
  [ -n "$oldXdg" ] && export XDG_CONFIG_HOME="$oldXdg" || unset XDG_CONFIG_HOME
  [ -n "$oldOpenCode" ] && export OPENCODE_CONFIG_DIR="$oldOpenCode" || unset OPENCODE_CONFIG_DIR
  unset TEST_HOME oldHome oldXdg oldOpenCode
}
trap cleanup_opencode EXIT INT TERM
```

PowerShell(保存原值用于 cleanup 恢复):
```powershell
$oldUserProfile = $env:USERPROFILE
$oldHome = $env:HOME
$oldXdg = $env:XDG_CONFIG_HOME
$oldOpenCode = $env:OPENCODE_CONFIG_DIR

$testHome = Join-Path $env:TEMP "forge-spike-opencode-$(Get-Random)"
New-Item -ItemType Directory -Force -Path $testHome
$env:USERPROFILE = $testHome
$env:HOME = $testHome
$env:XDG_CONFIG_HOME = "$testHome\.config"
$env:OPENCODE_CONFIG_DIR = "$testHome\.config\opencode"
New-Item -ItemType Directory -Force -Path "$env:OPENCODE_CONFIG_DIR\plugins"
```

- [ ] **Step 2**:**Path A — opencode.json plugin 数组**(superpowers v5 主推路径)

```bash
# 在隔离 config dir 写 opencode.json
cat > "$OPENCODE_CONFIG_DIR/opencode.json" <<'EOF'
{
  "plugin": [
    "forge-spike-test@file:D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode"
  ]
}
EOF

# 启动 OpenCode session
opencode
```

预期(基于 superpowers 实测):

- session first user message 注入 `<EXTREMELY_IMPORTANT>...spike protocol test...` bootstrap
- `config.skills.paths` 注入 OpenCode discovery,`using-test` 进 auto-trigger 池

输入 `spike protocol test`,看 skill 是否触发。记录 transcript 到 RESULTS.md(标 Path A 区段)。

- [ ] **Step 3**:**Path B — 单文件 symlink fallback**(superpowers v4 老路径)

清理 Path A:`rm "$OPENCODE_CONFIG_DIR/opencode.json"`,然后:

```bash
ln -s D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode/.opencode/plugins/test.js \
      "$OPENCODE_CONFIG_DIR/plugins/test.js"
opencode
```

PowerShell(Windows symlink 文件需 Developer Mode / Admin,**无 Copy-Item fallback** — Copy-Item 单文件破坏 plugin `__dirname` 相对路径定位 `../../skills` 行为,Path B 验证无意义):
```powershell
$pluginSrc = "D:\ClaudeProject\opsp\forge-repo\spike\v0.3\0a-opencode\.opencode\plugins\test.js"
$pluginDst = "$env:OPENCODE_CONFIG_DIR\plugins\test.js"

# 尝试 symlink
$result = cmd /c mklink "$pluginDst" "$pluginSrc" 2>&1

if ($LASTEXITCODE -ne 0) {
  Write-Warning "mklink 失败(无 Developer Mode / Admin)"
  Write-Warning "Path B 不能用 Copy-Item fallback —— 单文件复制后 plugin 内 path.resolve(__dirname, '../../skills') 指向 OPENCODE_CONFIG_DIR/skills/ 而非 plugin source 的 skills/,plugin 加载会失败"
  Write-Warning "RESULTS.md 标:Path B = INSTALL_BLOCKED(权限缺失,非协议失败)"

  # 完整 fallback 选项(若必须验 Path B):
  # Copy-Item -Recurse $pluginSrc/.. $env:OPENCODE_CONFIG_DIR/forge-spike-test/   # 全包结构
  # New-Item -ItemType SymbolicLink -Path "$env:OPENCODE_CONFIG_DIR/plugins/test.js" `
  #   -Target "$env:OPENCODE_CONFIG_DIR/forge-spike-test/.opencode/plugins/test.js" -ErrorAction Stop
  # 但 Copy-Item -Recurse 会破坏 0a.3.1 Step 5 的 npm i -D file: 假设(那是基于源目录 layout 的)
  # 推荐:Path B 在无 Developer Mode 时直接标 INSTALL_BLOCKED,Tier 2 决策按 Path A 走

  exit 1   # 让 Step 7 RESULTS 表自动记 INSTALL_BLOCKED
}

opencode
```

输入 `spike protocol test`,看是否触发(若 OpenCode 自动扫描 plugins 目录)。记录 transcript。

- [ ] **Step 4**:**关键假设验证 #1** — OpenCode 是否注册 `commands/` 内 slash

(基于 Path A 或 Path B 已加载状态)

session 内输入 `/`,看自动补全。或输入 `/test:test`,看是否调起。

记录:支持 / 不支持 / 路径(plugin manifest 是否需要 commands 字段?)。

- [ ] **Step 5**:**关键假设验证 #2** — OpenCode 能否从项目 `node_modules` 加载 plugin

```bash
mkdir -p /tmp/forge-spike-fixture-opencode-nm
cd /tmp/forge-spike-fixture-opencode-nm
npm init -y

# 关键:0a-opencode 必须含 package.json(0a.3.1 Step 3 已加),否则 npm i 失败
npm i -D file:D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-opencode

# 项目级 opencode.json 试 npm 引用形态
cat > opencode.json <<'EOF'
{
  "plugin": [
    "forge-spike-test"
  ]
}
EOF

opencode
```

输入 `spike protocol test`,看是否触发。

记录:加载 / 不加载 / 报错原因。

- [ ] **Step 6**:Cleanup(Unix 已由 Step 1 trap EXIT 强制跑,本 step 显式调用一次确认环境干净)

Unix:
```bash
# trap 已注册,正常退出时自动跑 cleanup_opencode;此处显式触发用于验证
cleanup_opencode
trap - EXIT INT TERM   # 解除 trap,后续命令不再触发
echo "cleanup 完成。当前 env:"
echo "  HOME=$HOME (期望: $oldHome 或 unset)"
echo "  OPENCODE_CONFIG_DIR=${OPENCODE_CONFIG_DIR-<unset>}"
```

PowerShell(用 try/finally 实现 Unix trap 等价,本 Step 应当作"Step 1 finally 已自动跑"的显式确认):
```powershell
# Step 1 PowerShell 已用 try { spike body } finally { restore env } 包裹整个 task,
# 本 Step 在 finally 块内自动执行;此处显式 verify:
Write-Host "cleanup 完成。当前 env:"
Write-Host "  USERPROFILE=$env:USERPROFILE (期望: $oldUserProfile)"
Write-Host "  OPENCODE_CONFIG_DIR=$env:OPENCODE_CONFIG_DIR"
```

- [ ] **Step 7**:写 `RESULTS.md`(5 态决策矩阵)

```markdown
# Plan 0a.3 — OpenCode 协议 Spike 实测结果

**日期**:2026-05-XX
**OpenCode CLI 版本**:`opencode --version` 输出
**OS**:Windows 11 / Linux / macOS

## 协议假设验证(5 态;hook/skills 必须按 Path A 与 Path B 各自独立记录)

| # | 假设                                                                                  | 结论                                                              | 证据                       |
| - | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| 1a | **Path A**(opencode.json plugin 数组 file:)`transform` hook 注入 first user message | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | Step 2 Path A transcript   |
| 1b | **Path B**(单文件 symlink to plugin.js)`transform` hook 注入 first user message    | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | Step 3 Path B transcript   |
| 2a | **Path A** `config.skills.paths` 注入 OpenCode skill discovery                       | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | Step 2 session skill list  |
| 2b | **Path B** `config.skills.paths` 注入 OpenCode skill discovery                       | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | Step 3 session skill list  |
| 3 | Path A 加载行为(install transport 层)                                              | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | Step 2 transcript          |
| 4 | Path B 加载行为(install transport 层)                                              | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL              | Step 3 transcript          |
| 5 | OpenCode 从 plugin `commands/` 自动注册 `/<plugin>:<cmd>`                             | PASS / FAIL / UNVERIFIED / PARTIAL(需 manifest commands 字段)    | / 自动补全 transcript      |
| 6 | OpenCode 从项目 node_modules 加载 plugin(npm i -D file: 等价 air-gapped)            | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED                        | Step 5 transcript          |

**Tier 2 启用条件**(不能假 1a/2a 不通过却用假 1b/2b 拿 Path A 证据):
- Tier 2 启用 Path A 主推:1a + 2a + 3 全 PASS
- Tier 2 启用 Path B fallback:1b + 2b + 4 全 PASS(且 1a 或 2a 任一 FAIL/UNVERIFIED)
- Tier 2 完全 DEFER:Path A + Path B 都没有完整(1a+2a 或 1b+2b)PASS

## 完整 Transcript

(每个假设各自独立 transcript,Path A / Path B / commands / node_modules 四段)

## Tier 2 spec 修订决策(基于上表 commands / node_modules 假设)

> **Tier 2 启用 / DEFER 判定见上表 "Tier 2 启用条件" 段(1a/1b/2a/2b/3/4),不在此重复。本段仅列 spec 修订 trigger。**

- 假设 5 PASS → spec §1.1 / §2.4 / §3.5 commands 调用对 OpenCode 可用,无需修订
- 假设 5 FAIL → spec §2.4 修订:OpenCode 路径 commands 不支持,降级到 skills + 内嵌 helper 调用(同 Codex)
- 假设 6 PASS → spec §3.5 air-gapped `npm i -D` 路径成立,文档可承诺
- 假设 6 FAIL → spec §3.5 air-gapped 改为"放 plugin tarball 到 `$OPENCODE_CONFIG_DIR/forge/`" 形态(详细路径由 spike 实测填空)
```

- [ ] **Step 8**:Commit

```bash
git add spike/v0.3/0a-opencode/RESULTS.md
git commit -m "spike(0a.3): record OpenCode protocol verification (Path A/B + commands + node_modules, 5-state matrix, with cleanup)"
```

---

## Task 0a.4:汇总三 sub-spike + 触发 Tier 决策

**Files:**

- Create: `spike/v0.3/0a-summary.md`(汇总决策证据 + 触发后续 plan 调整)

- [ ] **Step 1**:创建 `spike/v0.3/0a-summary.md`,汇总 **5 份 RESULTS 文件**的关键结论(Claude 3 份:RESULTS-prelocal / RESULTS-install-transport / RESULTS-protocol;Codex 1 份;OpenCode 1 份)

```markdown
# Plan 0a 五份 RESULTS 汇总决策

**日期**:2026-05-XX

## RESULTS 文件清单(5 份)

| 文件                                                          | 责任 sub-spike                | 状态(完成/进行中) |
| ------------------------------------------------------------- | ----------------------------- | -------------------- |
| `spike/v0.3/0a-claude-code/RESULTS-prelocal.md`               | 0a.1.2 hook 本地预验证        | ?                    |
| `spike/v0.3/0a-claude-code/RESULTS-install-transport.md`      | 0a.1.3 install transport 矩阵 | ?                    |
| `spike/v0.3/0a-claude-code/RESULTS-protocol.md`               | 0a.1.4 plugin 协议            | ?                    |
| `spike/v0.3/0a-codex/RESULTS.md`                              | 0a.2.2 Codex 协议             | ?                    |
| `spike/v0.3/0a-opencode/RESULTS.md`                           | 0a.3.2 OpenCode 协议          | ?                    |

## Tier 决策汇总(统一 5 态 + Decision action 列)

| Tier | Harness     | Status                                                   | Decision action                                                        |
| ---- | ----------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1    | Claude Code | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL     | ENABLE(release v0.3) / DEFER / SPEC_PATCH_REQUIRED                    |
| 2    | OpenCode    | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL     | ENABLE(主推 Path A 或 Path B,见 0a.3.2 表) / PARTIAL_SHIP / DEFER     |
| 3    | Codex       | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED / PARTIAL     | ENABLE(全功能 commands + !command) / PARTIAL_SHIP(仅 skills) / DEFER |

**Decision action 语义**:
- `ENABLE` — 该 Tier 进 v0.3 ship 范围
- `PARTIAL_SHIP` — 该 Tier 进 v0.3,但 spec 标记部分能力降级(如 Codex 无 `/forge:*` 仅 skills)
- `DEFER` — 该 Tier 推 v0.4(spec §7 R3 触发)
- `SPEC_PATCH_REQUIRED` — 该 Tier blocked,需先修 spec(typically Tier 1)再重跑 spike
- `INSTALL_BLOCKED` — install transport 层失败,与 protocol 解耦判定 — **触发 Decision = `SPEC_PATCH_REQUIRED`**(install 路径需重审,等 spec 文档更新后重跑 0a)

## Spec 修订 trigger 列表

(若 sub-spike 任一 FAIL/UNVERIFIED 触发 spec 修订,在此列出具体章节;Step 3 据此 Edit spec)

- [ ] spec §X.Y 修订:...
- [ ] spec decision #Z 修订:...

## 5 个未实证假设(5 态)

| # | 假设                                                              | 结论                                                              | spec 修订需要 |
| - | ----------------------------------------------------------------- | ----------------------------------------------------------------- | ------------- |
| 1 | OpenCode commands/ 注册 slash                                     | PASS / FAIL / UNVERIFIED / PARTIAL                                | 是 / 否        |
| 2 | Codex skill 内 `!command` / fenced bash + must-exec / 普通文本 3 variant 自动执行 | A=PASS/FAIL/IGNORED / B=PASS/FAIL / C=PASS/FAIL                   | 是 / 否     |
| 3 | OpenCode node_modules 加载(npm i -D file:)                       | PASS / FAIL / UNVERIFIED / INSTALL_BLOCKED                        | 是 / 否        |
| 4 | superpowers + test 同装,description differentiator               | PASS / FAIL / UNVERIFIED / IGNORED                                | 是 / 否        |
| 5 | (config schema,不属 spike,Plan 2 落地)                         | N/A                                                              | N/A           |

## Plan 1+ unblock 条件

- 必满足:Tier 1 Decision = `ENABLE`(任一其他状态 → Plan 1 阻塞)
- 可选:Tier 2 / Tier 3 状态影响 Plan 1 范围(若 ENABLE/PARTIAL_SHIP 则 Plan 1 含对应 manifest;DEFER 则跳过对应部分,等 v0.4)
```

- [ ] **Step 2**:逐项填上三 sub-spike 的真实结论(**不能 simulate,必须真跑过**)

- [ ] **Step 3**:若有 spec 需要修订,**当下** Edit `docs/specs/2026-05-09-v0.3-plugin-migration-design.md` 修(不留到 Plan 1+ 触发再返工)

- [ ] **Step 4**:Commit(包含 summary + 任何 spec 修订,缺一不可)

```bash
# 把 summary + spec(若有修订)同步入 stage
git add spike/v0.3/0a-summary.md docs/specs/2026-05-09-v0.3-plugin-migration-design.md

# 验证:若 Step 3 改了 spec,git diff --cached --stat 必须包含 specs/2026-05-09 行
git diff --cached --stat | tee /tmp/forge-spike-0a-stage.log

# 自检 — 实际可执行(不再是注释):若 0a-summary.md 标注"spec 修订:N 处"(N>0)
# 但 stage 内不含 spec 文件 → ERROR 立即退出,提示 Step 3 漏 Edit
expected_spec_revisions=$(grep -c "spec 修订" spike/v0.3/0a-summary.md || echo 0)
if [ "$expected_spec_revisions" -gt 0 ] && ! grep -q "specs/2026-05-09" /tmp/forge-spike-0a-stage.log; then
  echo "ERROR: 0a-summary.md 声明 $expected_spec_revisions 处 spec 修订,但 git stage 内不含 specs/2026-05-09 文件"
  echo "应当 Step 3 实际 Edit spec 文件后再 git add,然后重跑本 step"
  exit 1
fi

git commit -m "spike(0a): summary + Tier decision + spec revisions(if any)"
```

- [ ] **Step 5**:产出回报给上层 — Plan 0a 完成

向用户报告:

```
Plan 0a 三 sub-spike 完成。
Tier 1: <ENABLED/BLOCKED>(Claude Code)
Tier 2: <ENABLED/DEFERRED>(OpenCode)
Tier 3: <ENABLED/PARTIAL/DEFERRED>(Codex)

Spec 修订:N 处(具体见 spike/v0.3/0a-summary.md)
Plan 1 unblock 状态:<unblocked / spec 重审 / 范围调整>

下一步:转 Plan 0b(forge full fixture spike,Plan 1 产物落地后跑)
或:Tier 1 BLOCKED 时,回 spec brainstorming 重审 §2.5 hook / §3.1 路径
```

---

## Self-Review

**1. Spec coverage**:

- ✅ spec §5.1 阶段 1 三 sub-spike → 本 plan Task 0a.1 / 0a.2 / 0a.3 各对应
- ✅ spec §5.5 Plan 0a 范围 → 完整覆盖(throwaway plugin + 协议验证)
- ✅ spec §5.1 末尾"5 个未实证假设" → Task 0a.2 Step 5 + Task 0a.3 Step 4-5 + Task 0a.4 Step 1 表格全覆盖
- ✅ spec §7 R3 Tier 决策 → Task 0a.4 Step 1 触发输出

**2. Placeholder scan**:

- "实施时把 `<timestamp>` 替换"(Task 0a.1.1 Step 3)— 这是 spike 必要的运行时元数据,不算占位
- RESULTS.md 表格内 PASS/FAIL/未实证 选项是 spike 性质所需(实测填空),不是 plan 占位
- "(粘贴...)" 是 RESULTS.md 模板的填空指示,实施时由 spike 跑出 transcript 替换 — 不算 plan 占位

**3. Type consistency**:

- `using-test` skill 名 / `test` plugin name / `/test:test` slash 命令 三处一致
- `~/.codex/test` clone 路径 / `~/.agents/skills/test` symlink / `~/.config/opencode/plugins/test.js`(单文件,符合 superpowers v5 INSTALL.md `Migrating from old symlink-based install` 实战形态;Path A 主推 opencode.json plugin 数组,Path B 是单文件 symlink fallback)三 harness clone 路径命名一致
- `RESULTS.md` 文件名所有 sub-spike 一致

**4. 实操可行性**:

- 所有 throwaway plugin 都基于 superpowers 已实战源 fork,fork 路径在 spec / plan 内明确给绝对路径
- 实测命令(`claude` / `codex` / `opencode`)假设本地已装,Step 1 已加 prerequisite 标注
- Windows 路径专门给了 PowerShell mklink /J 等价命令(Codex 0a.2.1 INSTALL.md)

**Self-Review 状态(本 plan 经 Codex 1-5 审 + opus subagent 独立 review + 全量 fix)**:

| 轮次 | 发现 | 状态 |
|---|---|---|
| Codex 1 审 | 1 P0 + 7 P1 + 4 P2 = 12 条 | 全 fix |
| Codex 2 审 | 1 P0 + 7 P1 + 7 P2 = 15 条 | 全 fix |
| Codex 3 审 | 0 P0 + 7 P1 + 4 P2 = 11 条 | 全 fix |
| Codex 4 审 | 0 P0 + 7 P1 + 4 P2 = 11 条 | 全 fix |
| opus subagent | 2 P0 + 6 P1 + 1 P2 = 9 条(8 真 + 1 不算) | 8 真全 fix |
| Codex 5 审 | 1 P0 + 7 P1 + 3 P2 = 11 条 | **作为已知风险列在下方,实测时关注** |

**累计 fix:64 条**(6 轮 review 找出 75 条,扣 1 条过虑)。

**结论**:plan 已达 review 边际收益递减阶段(5 轮问题数稳定在 11-15)。继续 review-fix 循环不会让 plan 完美 — markdown 单文件本身有跨章节状态机散落问题。**转入实测**,把 Codex 5 审的 11 条作为 known-issues,实测时按下方清单核对。

---

## 已知风险 / 实测时关注(Codex 5 审,接受不修)

实测各 task 时,**优先核对**以下 11 项已知潜在问题。任一在实测中触发,按"实测处理"列指引现场 patch + 同步 fix plan。

| # | 问题                                                                                  | Plan 行号    | 实测处理                                                                                                      |
| - | ------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| 1 | OpenCode plugin default export(P0-1):未独立验证 OpenCode 接受 default export        | 981          | Task 0a.3.2 Step 2 装 plugin 时若 transform/config hook 未触发,**先**改回 named export `ForgeSpikeTestPlugin` 重试;两种都 FAIL 才判 Tier 2 协议失败 |
| 2 | 文件树注释 `export ForgePlugin → TestPlugin` 与代码 default export 矛盾               | 52           | 仅文档不一致,实测无影响;0a.3.1 落地代码时按 line 981 default export 实施                                       |
| 3 | PowerShell prelocal `Select-String` alternation 模式,任一命中即通过                   | 357          | PowerShell 用户改为三独立 Select-String + `if`:`if (-not (Select-String ...))` 三段                            |
| 4 | Task 0a.4 Step 4 `grep -c "spec 修订" summary.md` 会误命中 "## Spec 修订 trigger 列表" 标题 | 1394         | 改用更精确字段 grep,如 `grep -c "^- \[ \] spec §" summary.md`(只数 checklist 条目);或在 summary template 加机器可读字段 `spec_revisions: N` 让 grep 数 |
| 5 | Codex Step 1 trap 注册晚于 ln -s,ln -s 失败时 HOME 不恢复                              | 789-802      | export HOME 后**立即** `trap cleanup_codex EXIT INT TERM`,再跑 mkdir + ln -s                                  |
| 6 | INSTALL_BLOCKED 在 transport 表 vs Decision action 表语义相反                          | 518 / 1354   | 统一定义:**INSTALL_BLOCKED = install transport 装失败,与协议层解耦**(line 1354 正确,line 518 描述错改成"装失败,plugin 未加载"即可) |
| 7 | PowerShell `try/finally` 段实际只是注释,task body 未真正包裹                          | 430-440 / 1259-1262 | 实施时把 task body 主要命令真包进 `try { ... } finally { Pop-Location; $env:USERPROFILE = $old... }`           |
| 8 | Codex !command 三 variant 主 RESULTS 表未拆 A/B/C 行                                   | 884-888      | 0a.2.2 Step 7 RESULTS 主表手动拆 3A/3B/3C,Step 5d 子表已拆好,直接对应                                         |
| 9 | OpenCode RESULTS Path A/B 加载行为缺 PARTIAL 态                                        | 1287-1288    | 实测时若出现"hook 注入但 skill 未发现"等中间态,补 PARTIAL 行                                                  |
| 10| 文件树 named export 描述 vs default export 修复矛盾(同 #2)                          | 52           | 见 #2                                                                                                          |
| 11| Summary report 状态词 ENABLED/BLOCKED/DEFERRED 与 Decision action 列 ENABLE/PARTIAL_SHIP/DEFER 不一致 | 1409-1418    | 0a.4 写 summary 时用统一术语:Decision action(动词原形 ENABLE / PARTIAL_SHIP / DEFER / SPEC_PATCH_REQUIRED / INSTALL_BLOCKED),不用 ENABLED/BLOCKED 形容词态 |

**实测开工原则**:
1. 每 sub-spike 实测前,扫该 task 范围内的 known-issues(如 0a.2.x 看 #5 / #6 / #8;0a.3.x 看 #1 / #9 / #11)
2. 任一 known-issue 实测中触发 → **现场 patch plan 对应行 + 提交**(commit msg `spike(0a.X): patch known-issue #N from plan post-review`)
3. plan 5 审找出的细节大多是文档一致性,不是协议层错误。spike 主目的是协议假设验证,不是 plan 文档完美性

---

**Plan 完成,落地于** `docs/plans/2026-05-09-plan-0a-protocol-spike.md`。

下一步执行选择:

1. **Subagent-Driven(推荐)** — fresh subagent 跑每 task + 两阶段 review,适合 spike 因为多 sub-spike 可并行
2. **Inline 执行** — 在当前 session 跑,适合用户想全程跟进
3. **暂存 plan,先批量写 Plan 0b/1-6** — 8 plan 全产出后,实施时统一跑

请选择。
