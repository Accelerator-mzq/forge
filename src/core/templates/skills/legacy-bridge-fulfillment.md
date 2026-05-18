---
name: forge:legacy-bridge-fulfillment
description: Use when a forge legacy-bridge or forge archive command emits a Task manifest (forge/.cache/legacy-bridge-task-<op>.json) that needs agent fulfillment - reads the manifest, performs the LLM op, writes results, runs --apply.
---

# Fulfilling legacy-bridge Task Manifests

当 `forge legacy-bridge <op>`(默认 agent 模式)或 `forge archive` emit 了一个 manifest,按此 skill fulfill。

## 流程

1. 读 `forge/.cache/legacy-bridge-task-<op>.json`。
2. 对 `tasks[]` 里每个 task:按 `task.prompt` 做判定 —— `sync-check` / `regenerate` 必须**真读对应代码 / 文档**做判断,不许凭空产出。
3. 产物必须匹配 `task.outputSchema`,写成 `{ "text": "<你的结果>" }` 到 `task.outputPath`。
4. 跑 `forge legacy-bridge <op> --apply`(archive 场景跑 `forge legacy-bridge sync-check --apply` 后 `forge archive --resume`)。

## 反偷懒约束(硬性)

- **不许伪造判定**:`sync-check` 的「无差异」、`quality-judge` 的「fact preserved」必须基于真实比对。空结果要有依据。
- **不许改 manifest**:只往 `outputPath` 写;manifest 被改 → `--apply` 的 `manifest_hash` 校验会失败。
- 高保证场景(CI / 合规)用 `--api` 模式 —— CLI 直连 API,不经 agent。
