---
description: 跑 forge validate + verification-before-completion;失败时自动 append fake_completions 到 tasks.md
argument-hint: "[--change-id <id>]"
---

You are about to handle `/forge:verify $ARGUMENTS`.

## 步骤

1. **必须调用 `forge:verification-before-completion` skill**(证据先于声称的纪律)。
2. 跑 `forge validate <change-id>`(CLI),拿到 validate 结果。
3. **若 validate 失败**:
   - 根据失败项构造 verify-failed YAML(`forge/changes/<id>/.verify-failed`)
   - YAML schema:
     ```yaml
     schema: forge-verify/v1
     verified_by: ai-agent
     pass: false
     fake_completions:           # 已勾选但代码未改/测试未过的 task id 列表
       - tasks.md#task-3
     appended_tasks:             # 自动追加的修复 task id 列表
       - verify-fix-1
     ```
   - **append 修复 task 到 `forge/changes/<id>/tasks.md`**:每个 fake_completion 一条 `- [ ] verify-fix-N: 修正 task-X 的实施(原声称完成但 verify 失败:<具体原因>)`
   - **不要修改原已勾选 task**(维护 spec §3.3 不变量 2:"task 一旦勾就不可改回")
4. **若 validate 通过**:
   - 跑用户项目的测试(读 `forge/config.yaml` 的 `context.test_command`,缺省 `pnpm test`),把 stdout 写到 `forge/changes/<id>/.evidence/test-output.log`
   - 计算 `log_hash = sha256(test-output.log)`
   - 写 `forge/changes/<id>/.verify-passed` YAML:
     ```yaml
     schema: forge-verify/v1
     tasks_hash: <sha256(tasks.md 已勾段)>
     content_hash: <sha256(proposal+specs+design)>
     verified_by: ai-agent
     pass: true
     evidence:
       - description: "项目测试套件通过"
         log_path: .evidence/test-output.log
         log_hash: <log_hash>
     ```

## 禁止行为

- 不允许在 verify 失败时回去把已勾 task 改回 `[ ]` (违反 spec §3.3 不变量 2)
- 不允许跳过证据 log 写入(verification-before-completion 要求证据先于声称)
- 不允许 pass=true 但 evidence 为空(archive 校验会拒绝)
