---
description: 跑 forge validate + verification-before-completion + 三维度分析,产 verify_findings 写入 .verify-passed marker
argument-hint: '[--change-id <id>]'
---

You are about to handle `/forge:verify $ARGUMENTS`.

解析:`--change-id <id>` 默认 `forge/changes/` 下唯一未归档的 change;若 >1,**报错并停止**列出选项。

## 步骤

1. **必须调用 `forge:verification-before-completion` skill**(证据先于声称的纪律)。

2. **跑 `forge validate <change-id>`**(plugin helper 走 `${CLAUDE_PLUGIN_ROOT}/scripts/run-forge.mjs validate`),拿到 validate 结果。validate 已产 `automated=true` CRITICAL `finding_hash`(沿 plan-9d Task 4)。

3. **若 validate 失败(exit 1 — CRITICAL findings 存在)**:
   - 根据失败项构造 verify-failed YAML(`forge/changes/<id>/.verify-failed`):
     ```yaml
     schema: forge-verify-failed/v1
     failed_at: <ISO 8601>
     reasons:
       - <每个 CRITICAL finding 的 message>
     fake_completions: []
     appended_tasks:
       - verify-fix-1
     verify_findings: # plan-9d 新增 — validate CLI 产的 automated CRITICAL finding 直接合并
       - id: 1
         dimension: completeness
         check_type: spec-files-missing
         severity: CRITICAL
         automated: true
         finding_hash: <validate 输出的 hash>
         evidence: <validate output>
         recommendation: <validate output>
         resolved: false
     ```
   - **append 修复 task 到 `forge/changes/<id>/tasks.md`**(沿 v0.4 协议)
   - **不要修改原已勾选 task**(维护 spec §3.3 不变量 2)

4. **若 validate 通过(exit 0)**:

   4.1 **跑用户项目测试** — 读 `forge/config.yaml` 的 `test.test_command`,缺省 `pnpm test`,把 stdout 写到 `forge/changes/<id>/.evidence/test-output.log`,计算 `log_hash = sha256(test-output.log)`。**测试 pass 是 Completeness/task-completion 子项**(plan-9d 三维度协议)。字段路径以代码事实为准(`src/core/schema/types.ts:83` + `src/core/archive/fence.ts:146`)。

   4.2 **三维度分析 — 必须调用 `forge:verifying-three-dimensions` skill**(plan-9d 落地):
   - **Completeness**:对 spec 每个 Requirement,grep codebase 找实施证据;完全无证据 → 产 CRITICAL `coverage_gap` finding(automated=true,工具可独立验证;沿 §11.1bis — `evidence_missing` 仅指 evidence.log_path 文件缺失,语义不同)
   - **Correctness**:对 spec 每个 Requirement 定位实施 file:line;WHEN/THEN scenario 覆盖检查 → WARNING/SUGGESTION findings(automated=false)
   - **Coherence**:design.md `## Decision:` 段比对 codebase;命名 / pattern 比对项目惯例 → WARNING/SUGGESTION findings(automated=false)
   - **每个 finding 必须填**:id / dimension / check_type / severity / automated / content_hash / git_head / evidence / recommendation / resolved + finding_hash(JCS SHA256 of 8 字段 payload,沿 9a)
   - **`automated=true` 的 finding 必须由工具或 CLI 计算 finding_hash**(直接 grep 命中数等机器判定);AI 不能伪造此类 finding
   - **`automated=false` 的 finding 由 AI 产**,需 `forge ack propose` 走两步流程才能降级或带未 ack archive(沿 9a)
   - **AI 计算 finding_hash 必须用 `forge finding hash` helper**(v6 M-1 修订 + v7 N-1 修订:沿 plan-9d Task 4 step 12-13)— 防止 AI 自实现 JCS 易出错。示例**用 heredoc 避免单引号 shell 破损**(JSON 内换行 / 单引号 / 中文均安全):

     ```bash
     # 把 8 字段 payload 写成 JSON pipe 给 helper,helper 输出 64-hex finding_hash
     cat <<'JSON' | forge finding hash
     {
       "content_hash": "sha256:abc123...",
       "git_head": "d4e5f6...",
       "dimension": "correctness",
       "check_type": "requirement-mapping",
       "severity": "WARNING",
       "automated": false,
       "evidence": "specs/auth/spec.md Requirement #2 在 src/auth/refresh.ts:42 实现 expiryHours=12,spec 默认 24h",
       "recommendation": "改 expiryHours=24 或修订 spec"
     }
     JSON
     # 输出:1234abcd5678ef90... (64-hex 裸 hex 沿 9a)
     ```

     **关键约束**:
     - **用 `<<'JSON'` heredoc(单引号 quoted)**:JSON 内部含单引号 / `$` / 反引号 / 中文均不会被 shell 解析(v7 N-1 修订:沿 bash heredoc quoted delimiter convention)
     - **不能多传 extra keys**(id / resolved / finding_hash 自身)— helper 内部已显式构造 8 字段,extra keys 会被丢弃,但 AI 应该传干净 payload 避免混淆
     - **JSON 内换行用真实换行**(不写 `\n`)— heredoc 保留原样换行;若 evidence/recommendation 内文要含 `\n` 字面值则写 `\\n` 双反斜杠(JSON 串 escape)

       4.3 **写 `forge/changes/<id>/.verify-passed` YAML**(沿 design §2.2.5 schema superset):

     ```yaml
     schema: forge-verify/v1
     verified_at: <ISO 8601>
     verified_by: ai-agent
     tasks_hash: <sha256(tasks.md 已勾段)>
     content_hash: <sha256(proposal+specs+design)>
     evidence:
       - scenario_id: project-tests
         test_command: <config.yaml 的 test_command>
         test_file: <实际跑的测试范围>
         log_path: ./.evidence/test-output.log
         log_hash: <log_hash>
         pass: true
     verify_findings: # plan-9d 新增 — validate CLI 自动 CRITICAL + skill 产 WARNING/SUGGESTION 合并数组
       - id: 1
         dimension: completeness
         check_type: spec-coverage
         severity: WARNING
         automated: false
         content_hash: <sha256>
         git_head: <40-hex>
         evidence: 'specs/auth/spec.md Requirement #2 在 src/auth/refresh.ts:42 实现 expiryHours=12,spec 默认 24h'
         recommendation: '改 expiryHours=24 或修订 spec'
         resolved: false
         finding_hash: <sha256>
         severity_acked_by: null # WARNING 必须 ack 才能 archive(在 archive 阶段走 ack)
         severity_acked_at: null
       # ... 其他 finding
     ```

     4.3a **(本 fix 补缺):调 forge evidence record-verify 记录 verify 事件证据到 staging**

     主代理在写完 .verify-passed YAML 后、freeze 之前,**必须**先调 record-verify 写 staging:

     ```bash
     forge evidence record-verify <changeId> --task-refs <list> --scope <type> --report <path>
     ```

     这一步把 verify 事件(测试 pass/fail + 三维 findings 总览)写入 `.evidence/process-evidence.staging.yaml`,**freeze 必须前置 staging 才有 source 可以凝固**(沿 `src/cli/commands/evidence.ts:348/639`;helper list 权威 `commands/apply.md:179-182`)。

     若漏调 record-verify 直接 freeze → exit 1 + 提示 "staging file not found ... 必须先调 forge evidence record-*"(代码事实 `evidence.ts:639`)。

     4.4 **(plan-9g 新增):调 forge evidence freeze 凝固 process_evidence**

     主代理在 4.3a record-verify 后,**必须**调:

     ```bash
     forge evidence freeze <changeId> --kind verify
     ```

     freeze 子命令做:
     1. 读 `.evidence/process-evidence.staging.yaml` + 校验 staging_hash
     2. 复制三数组(tdd_event_chain / verify_invocations / subagent_review_chain)到 marker.process_evidence
     3. 写 marker.process_evidence_staging_hash + ack_log_tail_hash + ack_log_entry_count(五源 cross-check 用)
     4. 算 freeze-time WARNING(不变量 7 + 10)→ 转 VerifyFinding 写 marker.verify_findings
     5. 若 CRITICAL 11/12(tdd_exemption 缺 ack / mode 缺 ack)→ exit 1 + 提示先跑 forge ack
     6. transaction(tmp + rename atomic)落 marker

     详细 process_evidence 协议见 `skills/process-evidence/SKILL.md`。

     4.5 **若产任何 WARNING + resolved=false**:提示用户 — archive 阶段必须先 `forge ack propose <finding-id>`(沿 9a 两步流程),否则 archive fence 拒签。

     4.6 **若产任何 automated=true CRITICAL + resolved=false**:**不能 archive**(沿 design §2.2.4 fence)— 必须先实际修复让 finding resolved=true(改 code + 重跑 verify),不允许 ack 降级。

## 禁止行为

- 不允许在 verify 失败时回去把已勾 task 改回 `[ ]`(违反 spec §3.3 不变量 2)
- 不允许跳过证据 log 写入(verification-before-completion 要求证据先于声称)
- 不允许 pass=true 但 evidence 为空(archive 校验会拒绝)
- **不允许跳维度**(沿 plan-9d skill 红旗清单)— Completeness + Correctness + Coherence 三维度必须全跑,即使测试 pass
- **不允许伪造 automated=true finding**(沿 design §2.3.3 critical_candidate 协议)— automated=true 的 finding 必须由工具/grep 机器判定,不能 AI 自决
- **不允许 vague recommendation**("consider reviewing X" 类)— 必须给 file:line 或 spec:Requirement-id 具体证据(沿 plan-9d skill `## forge-specific 反向加固` §2)
- **不允许在 .verify-passed 写 severity_acked_by = "ai-agent" 自 ack**(必须走 `forge ack propose` 两步流程,沿 9a)
