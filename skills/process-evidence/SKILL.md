---
name: process-evidence
description: 用于 v1.0 process_evidence 协议 — 写 marker 阶段必须走 helper / 不直写 marker / 不静默切 mode / 不跳 RED commit / staging append-only。当主代理在 task 实施时或写 .verify-passed marker 时,本 skill 强制 helper-only 写入路径,挡 5 大类伪造攻击。
---

# process-evidence skill

> v1.0 forge 反伪造架构关键 skill。**当 AI 实施 task / 写 marker 时强制本协议**。

## 何时调用

- 主代理在 `commands/apply.md` 步骤 4 dispatch subagent + 收到 DONE_REPORT
- 主代理在 `commands/verify.md` 步骤 4.3 写 .verify-passed YAML
- 主代理在 `commands/review.md` 写 .review-passed YAML

## 核心协议(brainstorm spec §2.7)

### 1. 走 helper,不直写 marker

✗ 禁止:

- 主代理直接 fs.writeFile .verify-passed 含 process_evidence 字段
- 主代理拼接 YAML 字面塞到 marker

✓ 必须:

- subagent 在 task 实施时跑测试 + 算 hash + 报 DONE 含 RED commit / GREEN commit / log paths / log hashes / report paths / report hashes / exit_codes / expected_failures
- 主代理调 `forge evidence record-tdd <changeId> --task <...> --red-commit <sha> --red-timestamp <iso> --red-log <path> --red-log-hash <sha256> --red-report <path> --red-report-hash <sha256> --red-exit <int> --green-commit <sha> ... --expected-failures <json>`(20 options)
- 主代理在 verify 完成时调 `forge evidence record-verify <changeId> --task-refs <list> --scope <type> --report <path> --report-hash <sha256> --log <path> --log-hash <sha256> --exit-code <int> --invoked-at <iso>`
- 主代理在 SDD 二段 review 完成时调 `forge evidence record-review <changeId> --task <...> --implementer-commit <sha> --spec-iterations <json> --quality-iterations <json> --main-check-off-at <iso>`
- 主代理在 commands/verify.md 步骤 4.3 写完 .verify-passed YAML 后**必须**调 `forge evidence freeze <changeId> --kind verify`

### 2. 不静默切 mode=hash-only

✗ 禁止:

- 主代理改 forge/config.yaml process_verification.mode 不跑 ack
- AI 自行决定走 sample / hash-only 模式

✓ 必须:

- 用户主动跑 `forge ack propose --action ack-mode --finding <id>`
- mode != full 必须 user CLI ack(不变量 12 strict)
- CI 模式(CI=true)强制 mode=full;ack-mode 在 CI 拒绝(brainstorm spec §6 ack.allow_ci_mode 默认 false)

### 3. RED commit 不可省略

✗ 禁止:

- subagent 同 commit 写测试 + 实现
- 主代理填 tdd_exemption 不跑 ack

✓ 必须:

- subagent 先建 RED commit(测试 fail + 实现未写 / 不通过)
- subagent 后建 GREEN commit(实现写 + 测试 pass)
- light mode trivial change(< writing_plans.light_threshold)允许 tdd_exemption,但**必须**跑 `forge ack propose --action ack-tdd-exemption`(不变量 11 strict)

### 4. Staging append-only,不绕过

✗ 禁止:

- 主代理直接编辑 .evidence/process-evidence.staging.yaml
- 主代理跳 staging,直接修改 marker.process_evidence

✓ 必须:

- helper(record-tdd / record-verify / record-review)是唯一 staging 写入路径
- staging 写入走文件锁 .evidence/.staging.lock(并发保护)
- freeze 子命令是唯一 marker 写入路径

### 5. 不绕过 freeze 子命令

✗ 禁止:

- 主代理直接写 .verify-passed.yaml 含完整 process_evidence(包括 staging_hash / ack_log_tail_hash / ack_log_entry_count)
- 主代理拼接 marker.verify_findings(WARNING 转 VerifyFinding 由 freeze 子命令做)

✓ 必须:

- 调 `forge evidence freeze --kind verify|review` 写 process_evidence + 三 hash 字段
- 接受 freeze 子命令 stderr 输出 WARNING(自动写 marker.verify_findings;archive 步骤 3.6 接 ack 流程)
- 若 freeze exit 1 → 先跑 `forge ack propose` 处理 CRITICAL 11/12 后 retry freeze

## 反伪造五源 cross-check

archive `crossCuttingFenceCheck()` 跑 14 不变量:

- 1-4: 字段关系(timestamp / ancestor / exit_code)
- 5-6: worktree 重跑实际 fail/pass + reporter parse expected_failures
- 7: verify_invocations 计数(WARNING)
- 8: subagent review chain commit 顺序
- 9: 五源 hash cross-check(marker / staging / ack-log content / ack-log chain / tail+count)
- 10: env_hash drift(WARNING)
- 11: tdd_exemption ack
- 12: mode != full ack + CI 拒签
- 13: rerun timeout severity 分级
- 14: green ↞ archive HEAD ancestor(挡旁支造链)

CRITICAL → archive 拒签 exit 1;WARNING → marker.verify_findings 走 9d ack 流程(或 ack-mode 隐含覆盖 rerun-time WARNING)

## 失败模式 + Recovery

| 失败模式           | 症状                                                 | Recovery                                                          |
| ------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| 直写 marker        | .verify-passed 含 process_evidence 但无 staging 条目 | archive fence 9 → CRITICAL 拒签;重跑 record-tdd + freeze          |
| 静默 hash-only     | config.yaml mode=hash-only 无 ack-log entry          | fence 12 → CRITICAL 拒签;跑 `forge ack propose --action ack-mode` |
| 跳 RED commit      | tdd_event_chain 无 red_exit_code!=0 条目             | fence 5 worktree 重跑 → CRITICAL;必须补 RED commit                |
| staging 被手动编辑 | staging_hash mismatch                                | fence 9 → CRITICAL 拒签;从 ack-log 重建 staging                   |
| freeze 绕过        | marker 有 process_evidence 但无 staging_hash 字段    | fence 9 → CRITICAL 拒签;重跑 freeze                               |

## 反例 / 正例

✗ 禁止(借口模式):

```
# 错误:主代理直接构造 process_evidence YAML
cat <<EOF > .verify-passed.yaml
process_evidence:
  tdd_event_chain:
    - red_commit: abc123
      red_exit_code: 1
      green_commit: def456
      green_exit_code: 0
EOF
```

✓ 必须(正确路径):

```bash
# subagent DONE_REPORT 后,主代理调 helper
forge evidence record-tdd <changeId> \
  --task task-1 \
  --red-commit abc123 --red-timestamp 2026-05-13T10:00:00Z \
  --red-log .evidence/task-1-red.log --red-log-hash sha256:... \
  --red-report .evidence/task-1-red-junit.xml --red-report-hash sha256:... \
  --red-exit 1 \
  --green-commit def456 --green-timestamp 2026-05-13T10:30:00Z \
  --green-log .evidence/task-1-green.log --green-log-hash sha256:... \
  --green-report .evidence/task-1-green-junit.xml --green-report-hash sha256:... \
  --green-exit 0 \
  --expected-failures '[{"test_file":"src/auth.test.ts","test_name":"should reject expired token","failure_type":"AssertionError"}]'

# verify 完成后写 marker,再 freeze
forge evidence freeze <changeId> --kind verify
```
