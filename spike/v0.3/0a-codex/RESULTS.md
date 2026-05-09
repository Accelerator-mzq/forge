# Plan 0a.2 — Codex 协议 Spike 实测结果

**日期**:2026-05-09
**Codex CLI 版本**:用户实测(Codex 最新主线,具体版本看 `codex --version`)
**OS**:Windows 11
**Install transport**:junction `~/.agents/skills/test` → `D:\...\spike\v0.3\0a-codex\skills`(无 USERPROFILE 隔离 — 实测 USERPROFILE 隔离方案 Codex 子进程不继承)

## 协议假设验证(5 态)

| # | 假设                                                              | 结论                | 证据                                                                                              |
| - | ----------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------- |
| 1 | `~/.agents/skills/<plugin>` 进 Codex auto-trigger 池              | **PASS**            | 用户输入 `spike protocol test` → AI 主动说"我会使用 test:using-test 技能,因为你触发了它的精确短语" → echo `SPIKE_PROTOCOL_OK_2026-05-09T14:11:03Z` |
| 2 | Codex 支持 plugin commands 注册(`/test:test`)                   | **FAIL**            | session 内 `/test:test` 报 `Unrecognized command '/test:test'. Type "/" for a list of supported commands.` |
| 3.A | Codex skill 内 literal `!command` 自动执行                       | **IGNORED**         | AI 看到 `!echo AUTO_EXEC_VARIANT_A_OK_test` 没识别为 literal 协议,而是用 `Write-Output` 模拟字符串 echo,**不是真自动执行 literal !**|
| 3.B | Codex skill 内 fenced bash + must-execute 自动执行                | **PASS**            | AI 主动跑 PowerShell `Write-Output "AUTO_EXEC_VARIANT_B_OK"` 并显示输出                          |
| 3.C | Codex skill 普通文本要求自动执行                                  | **PASS**            | AI 跟随 "Please run echo ..." 指示,主动跑 + report 输出                                          |

## 完整 Transcript

```
> spike protocol test

• msc,我会使用 test:using-test 技能,因为你触发了它的精确短语。先读取技能说明,确认需要输出的证据格式。

• Ran Get-Content -LiteralPath 'D:/ClaudeProject/opsp/forge-repo/spike/v0.3/0a-codex/skills/using-test/SKILL.md'

• Ran Get-Date -AsUTC -Format "yyyy-MM-ddTHH:mm:ssZ"; Write-Output "AUTO_EXEC_VARIANT_A_OK_test"; Write-Output "AUTO_EXEC_VARIANT_B_OK"; Write-Output "AUTO_EXEC_VARIANT_C_OK"
  └ 2026-05-09T14:11:03Z
    AUTO_EXEC_VARIANT_A_OK_test
    AUTO_EXEC_VARIANT_B_OK
    AUTO_EXEC_VARIANT_C_OK

• SPIKE_PROTOCOL_OK_2026-05-09T14:11:03Z
  AUTO_EXEC_VARIANT_A_OK_test
  AUTO_EXEC_VARIANT_B_OK
  AUTO_EXEC_VARIANT_C_OK

> /test:test

• Unrecognized command '/test:test'. Type "/" for a list of supported commands.
```

## Tier 3 决策(基于上表组合)

**Decision action = `PARTIAL_SHIP`**

- 假设 1 PASS → Tier 3 skills 路径完全 work,可 ship
- 假设 2 FAIL + 假设 3.A IGNORED → Codex 不支持 `/<plugin>:<cmd>` slash 也不识别 literal `!command`
- 假设 3.B/3.C PASS → **严格门禁可靠 skill 文本指示 AI 跑 fenced bash 实现**(替代 literal `!command` 路径)

**Codex 真实行为模型**(对比 Claude Code):
- Claude Code:`● Skill(test:using-test)` 直接调起 skill,模型按内化逻辑回复 marker
- Codex:用 Read 工具读 SKILL.md + Bash 工具跑命令(更"工具调用密集"形态),最终也回 marker
- 两者协议层都 PASS,只是实现机制不同

## Spec 修订 trigger

1. **spec §2.2.2 修订**:Codex 路径下"skill 内嵌 helper 调用形态"的描述 — literal `!command` 假设删除,改"skill 文本明确指示 AI 跑 fenced bash + must-execute"(假设 3.B 实战验证)
2. **spec §3.4 修订**:Codex happy path 数据流 — AI 内化 helper 调用应描述为"AI 看到 skill 文本里的 fenced bash + must-execute 标记,主动跑 PowerShell/bash 调 npx"
3. **spec §7 R3 状态更新**:Codex Tier 3 = `PARTIAL_SHIP`(skills + skill-driven CLI execution),不是 full ship 也不是 DEFER

## Cleanup

实测后:
```powershell
cd D:\ClaudeProject\opsp\forge-repo
git checkout spike/v0.3/0a-codex/skills/using-test/SKILL.md   # 撤回 3 段 variant 测试追加
cmd /c rmdir "$env:USERPROFILE\.agents\skills\test"           # 删 junction
Test-Path "$env:USERPROFILE\.agents\skills\test"              # 应 False
```

## 已知 issue 实测对照

实测中**未触发** plan known-issues。但发现新 finding:**Codex 子进程不继承 PowerShell 修改的 USERPROFILE**(plan Step 1 USERPROFILE 隔离方案在 Windows + Codex 下不 work),已转用日常 ~/.agents/skills 直接装 junction(cleanup 手动管理)。这条加进 plan known-issues #12(spec 不影响,plan 文档可优化)。
