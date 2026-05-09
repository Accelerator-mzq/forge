# Plan 0a.1.2 — Hook 本地预验证结果

**日期**:2026-05-09
**OS**:Windows 11 Pro 10.0.26200,Git Bash(MSYS_NT-10.0-26200)
**bash 版本**:bash 5.2.x(Git for Windows)
**Node 版本**:v22.12.0

## Hook 输出 JSON(合法性 + 关键字段)

| 项                                                 | 结论 | 证据                                              |
| -------------------------------------------------- | ---- | ------------------------------------------------- |
| `hooks/run-hook.cmd session-start` 退出 0          | PASS | exit code 0(实测命令 `bash hooks/run-hook.cmd session-start; echo $?`)|
| 输出是合法 JSON                                     | PASS | `cat /tmp/hook-output.json \| node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"` 退出 0,输出 "JSON valid" |
| 含 `hookSpecificOutput.additionalContext` 字段     | PASS | Node 验证 `j.hookSpecificOutput.additionalContext.length = 770` 字节 |
| `additionalContext` 含 `SPIKE_PROTOCOL_OK` marker  | PASS | `grep -q 'SPIKE_PROTOCOL_OK' /tmp/hook-output.json` 退出 0 |
| `additionalContext` 含 `using-test` skill 名       | PASS | `grep -q 'using-test'` 退出 0                     |
| `additionalContext` 含 `EXTREMELY_IMPORTANT` 包装  | PASS | `grep -q 'EXTREMELY_IMPORTANT'` 退出 0            |

## 实测过程中发现的 plan patch

**Plan 行 322-323 已 patch**:`/tmp/hook-output.json` Windows Git Bash 路径解释不一致(bash 写 MSYS 路径,Node 解为 `D:\tmp\` 找不到)。改用 `cat ... | node -e "...readFileSync(0,'utf8')"` stdin pipe,跨平台一致。

## 失败时的 next step

- N/A(全部 PASS)

## 决策

- **0a.1.2 PASS** → unblock Task 0a.1.3(install transport 矩阵验证)
- hook 脚本 fork superpowers 形态在 Git Bash on Windows 下完整 work
- legacy_skills_dir 段已删除(set -u 兼容,虽然实测发现保留也不会崩 — line 11 默认 init "")
