# Installing test spike plugin for Codex

## Prerequisites
- Git
- Codex CLI

## Installation

1. Clone(spike 期用 symlink/junction 模拟):

   **macOS/Linux:**
   ```bash
   ln -s D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-codex ~/.codex/test
   ```

   **Windows (PowerShell)**:
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.codex"
   cmd /c mklink /J "$env:USERPROFILE\.codex\test" "D:\ClaudeProject\opsp\forge-repo\spike\v0.3\0a-codex"
   ```

2. Create the skills symlink:

   **macOS/Linux:**
   ```bash
   mkdir -p ~/.agents/skills
   ln -s ~/.codex/test/skills ~/.agents/skills/test
   ```

   **Windows (PowerShell):**
   ```powershell
   New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
   cmd /c mklink /J "$env:USERPROFILE\.agents\skills\test" "$env:USERPROFILE\.codex\test\skills"
   ```

3. Restart Codex CLI.

## Spike 验证步骤

- 假设 1:`~/.agents/skills/test` symlink 进 Codex auto-trigger 池
- 假设 2:Codex 是否支持 plugin commands 注册(`/test:test`)— 协议未实证
- 假设 3:Codex skill 内 3 variant 自动执行(literal `!command` / fenced bash + must-execute / 普通文本)— 协议未实证

详见 Plan 0a.2.2 Step 4-5d。
