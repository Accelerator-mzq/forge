---
description: 派 review subagent 审 [proposal + specs + design + diff],主代理处理反馈,满足三条件打 review-passed YAML
argument-hint: "[--change-id <id>]"
---

You are about to handle `/forge:review $ARGUMENTS`.

解析:`--change-id <id>` 默认 `forge/changes/` 下唯一未归档 change。

## 步骤

1. **必须调用 `forge:requesting-code-review` skill**(主轨)。
2. **必须调用 `forge:receiving-code-review` skill**(收反馈环节)。
3. 打包 review 输入:
   - `forge/changes/<id>/proposal.md`
   - `forge/changes/<id>/specs/*.md`
   - `forge/changes/<id>/design.md`
   - `git diff <since-tasks-start>..HEAD`(`since-tasks-start` 取 tasks.md 末尾 `applied_commits` 的第一个 commit 的 parent)
4. 派 fresh review subagent,产出意见列表(每条带:[严重度:阻塞/关键/可改进/建议]、[文件路径]、[问题描述]、[期望修改])。
5. 主代理对每条意见 **逐条判断接受/拒绝**(参考 forge:receiving-code-review skill 的"用证据反驳"原则,不机械接受)。
6. 接受的意见 → append 到 `forge/changes/<id>/tasks.md` 末尾作为新 task 条目。
7. **仅当满足三条件,才打 `forge/changes/<id>/.review-passed`**:
   a. 无"已用证据反驳但未存档"的拒绝意见
   b. 接受的意见已**全部实现 + 测试通过**(本轮新接受的意见**不算本轮通过**,需下一轮 review)
   c. 满足 a+b 时,本轮 review 无新增 task
8. `.review-passed` YAML schema(spec §3.4):
   ```yaml
   schema: forge-review/v1
   tasks_hash: <sha256(tasks.md 已勾段)>
   content_hash: <sha256(proposal+specs+design)>
   reviewed_by: ai-agent  # 或 human-override(需 archive --force)
   git:
     is_git_repo: true
     head: <git rev-parse HEAD>
     diff_hash: <sha256(git diff against forge/config.yaml code_paths)>
   review_outcomes:
     - id: 1
       severity: blocking
       accepted: true
       resolved: true
       resolution_commit: <hash>
   ```

## 禁止行为

- 不允许跳过 review subagent 直接打 review-passed
- 不允许接受意见但不实现就打 review-passed(违反 b)
- 非 git 项目跳过 git 字段时,review-passed YAML 必须 `is_git_repo: false`(archive --force 才接受)
