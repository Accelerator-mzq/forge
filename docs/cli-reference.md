# Forge CLI Reference

> forge CLI 共 16 个子命令(`src/cli/index.ts` commander 注册)。下表按用途分组;`forge init` 已 deprecated(v0.4 移除),新项目改用 plugin install。

| 分组                 | 命令                                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| 产物校验与归档       | `validate` · `archive`                                                  |
| 初始化 / 迁移 / 升级 | `init`(deprecated) · `update` · `migrate` · `upgrade` · `legacy-bridge` |
| 工作流内部 helper    | `ack` · `evidence` · `finding` · `scope` · `preflight` · `backlog`      |
| 配置与诊断           | `config` · `monitor` · `stage-extensions`                               |

## `forge upgrade`(v0.3 新增)

清理 v0.2 legacy harness adapter 产物(`.claude/skills/forge-*/` + `.claude/commands/forge/` + `.agents/skills/forge-*/` + `.agents/commands/forge/`),5 阶段事务化(SCAN → SHOW DIFF → ASK → STASH → VERIFY → COMMIT)。**`forge/` 产物 100% 不动**(drafts/changes/specs/config 全保留)。

### 选项

- `--dry-run` — SHOW DIFF 列清单,不 STASH(预览模式)
- `--recover` — 24h 内还原最新 stash 到原位 + 删 stash + 验 hash
- `--gc` — 删除超过 24h 的过期 stash 目录

### 行为

不传 flag 时走主流程:

1. **SCAN**(纯只读):扫 v0.2 legacy 路径 + 算每文件 sha256
2. **SHOW DIFF**(纯只读):stdout 列清单 + hash + 提示 "forge/ 产物 100% 不动"
3. **ASK**:`Delete these legacy artifacts? [y/N]`(stdin 等用户输入)
4. **STASH**:`<project>/.forge-upgrade-stash-<ts>/` + `.manifest.json`(每 mv 失败立刻反向 mv 回原位)
5. **VERIFY**:重读 stash 内容验 hash 与 SCAN 一致(失败立刻反向回滚)
6. **COMMIT**:不删 stash 24h(给用户冷却期)+ 输出 plugin install 指引

### 退出码

- 0 = 成功(包括 ASK N 的 graceful exit)
- 1 = STASH 或 VERIFY 失败(自动反向回滚 + 报错)

### 例子

```bash
# 主流程
forge upgrade
# 预览模式
forge upgrade --dry-run
# 24h 内反悔
forge upgrade --recover
# 清理过期 stash
forge upgrade --gc
```

详见 [v0.2 → v0.3 升级 walkthrough](migration/v0.2-to-v0.3.md)。

---

## `forge migrate`(v0.4 新增)

把已有的 OpenSpec / superpowers 项目仓库搬运到 forge 工作目录(`forge/`)。**不属于主工作流**,是一次性 onboarding 命令,无对应 slash 命令。命令在当前工作目录探测源、把产物写进 cwd 下的 `forge/`,**默认不动源目录**。

```
forge migrate <source> [选项]
```

`<source>` 必填,只接受 `openspec` 或 `superpowers`(不自动猜)。

### 选项

| 选项                    | 说明                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `--no-regenerate`       | 不调 LLM 补缺件;缺件标 `[needs-fix]`,不阻塞 cp                                       |
| `--dry-run`             | 预演不写 `forge/`。**注意:当前实现仅打印扫描文件数,完整 plan 预览尚未落地**          |
| `--force`               | 冲突时旧目标 mv 到 `forge/.forge-trash/<ts>/`(留 24h)再覆盖;不加则冲突件加 `--imported-N` 后缀 |
| `--archive-list <file>` | 显式指定哪些 slug 进 archive,跳过自动推测                                             |
| `--no-interactive`      | 跳过 active/archive 交互确认,全用推测默认值                                           |
| `--redact-rules <file>` | `--regenerate` 时附加自定义 redact 规则                                               |

`--regenerate` 是默认行为(无对应 flag,用 `--no-regenerate` 关闭)。它调 LLM 补 proposal/specs,需要 `ANTHROPIC_API_KEY`;缺 key 会 warn 并退化为 `--no-regenerate`。预估成本 ≥ $5 时要求 ack。

### 退出码

| 码  | 含义                                                            |
| --- | --------------------------------------------------------------- |
| 0   | 成功                                                            |
| 1   | `forge/migrate.lock` 被另一进程占用                             |
| 2   | 源目录未找到 / 源为空 / `<source>` 参数非法                     |
| 4   | unsafe-slug 占比过高 / archive 完整性不可达 / cost 拒签 / 冲突后缀耗尽 |

### 产物

成功后写 `forge/migrate-report.md`(统计报告:ops / conflicts / downgrades 计数 + Plan 表 + cleanup 建议)与 `forge/migrate-trace.json`(机器可读 trace)。

完整流程、transformer 规则、archive 推测信号、FAQ 见 [`docs/migration/from-openspec.md`](migration/from-openspec.md) 与 [`docs/migration/from-superpowers.md`](migration/from-superpowers.md)。

## `forge init`(deprecated v0.3,v0.4 移除)

⚠️ **已 deprecated**:v0.3 stderr 打 warning。新项目改用 plugin install([安装文档](installation.md));老项目升级跑 [`forge upgrade`](#forge-upgrade)。

仍保留功能(legacy 兼容窗口):初始化 forge 到当前目录:检测 / 选择 harness、铺 skills + commands、创建 `forge/` 骨架。

```
forge init [--harness <list>] [--force]
```

### 选项

| 选项               | 说明                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--harness <list>` | 逗号分隔 harness id(`claude`、`codex`)。缺省自动检测项目里已有的 harness(扫 `.claude/`、`.agents/`、`AGENTS.md`)。指定值优先                  |
| `--force`          | 当 skill / command 文件已被用户修改(SHA256 hash 不匹配 shipped 内容)时,强制覆盖。缺省跳过 + warn                                              |

### 退出码

| 码  | 含义                                       |
| --- | ------------------------------------------ |
| 0   | 成功                                       |
| 1   | harness 无效 / 未检测到任何受支持的 harness |

### 例子

```bash
forge init                              # 自动检测
forge init --harness claude             # 仅 Claude Code
forge init --harness claude,codex       # 双 harness
forge init --harness claude --force     # 用户改过 skill 也强制覆盖
```

非 git 项目下会 warn(review 标记不绑代码 diff,archive 必须 --force 才接受)。

## `forge update`

重铺当前已配置 harness 的 skills + commands。`forge init` 之后跑(用户的 forge 升级了或本地手改了 skill 想还原)。

```
forge update [--harness <list>] [--force]
```

### 选项

| 选项               | 说明                                                     |
| ------------------ | -------------------------------------------------------- |
| `--harness <list>` | 覆盖 `forge/config.yaml` 的 harness 字段(主要给 CI 用) |
| `--force`          | hash 不匹配时强制覆盖                                    |

### 退出码

| 码  | 含义                                                                    |
| --- | ----------------------------------------------------------------------- |
| 0   | 成功                                                                    |
| 1   | `forge/config.yaml` 不存在(未 init);或 harness 字段空且无 `--harness` |

## `forge config`

读 / 写 `forge/config.yaml` 的字段。`<key>` 支持一层点分嵌套键(如 `model_tiers.haiku`)。

```
forge config get <key>
forge config set <key> <value>
forge config profile          # (v0.2)
```

### 例子

```bash
forge config get harness                   # 输出:claude,codex
forge config set harness codex              # 改为只用 Codex
forge config set model_tiers.haiku sonnet   # 把 haiku tier 重映射到 sonnet 模型
```

`model_tiers` 的完整用法、规则与按 harness 差异见 [`docs/model-tiers.md`](model-tiers.md)。`set` 对非法的 `model_tiers` 赋值(非法键 / 非法值 / 降级)会 fail-fast 拒写、不触碰 `config.yaml`。

## `forge validate`

校验产物完整性:proposal 含 why、specs 是 Given/When/Then、tasks 含 checkbox 等。被 `/forge:propose` / `/forge:verify` slash 命令模板调用。

```
forge validate <changeId>
```

### 退出码

| 码  | 含义                                                     |
| --- | -------------------------------------------------------- |
| 0   | 校验通过                                                 |
| 2   | 校验失败(stderr 含哪条规则、哪个文件、哪一行)           |

## `forge archive`

归档 change:严格校验 marker → Move 到 archive/<date>-<id>/ → Sync deltas 到 specs/。

```
forge archive <changeId>          # 正常归档
forge archive <changeId> --force  # 接受 human-override 标记 或 非 git 项目
forge archive --recover           # 从半完成归档状态恢复
```

### 选项

| 选项        | 说明                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--force`   | 仅覆盖两类降级:`verified_by`/`reviewed_by` = `human-override`;非 git 项目跳过 git 字段。**不**覆盖 hash 不一致 / evidence 损坏 / outcome 未 resolved |
| `--recover` | 检测半完成归档(crash 后)并尝试恢复:case A(Sync 半完成,重跑 Sync)/ B(backup 残留,删 backup)/ C(冲突,交互式 [1] 完成 / [2] 撤销)                  |

### 退出码

| 码  | 含义                                                                          |
| --- | ----------------------------------------------------------------------------- |
| 0   | 成功(含 --recover 的 clean / A / B / C 已恢复)                               |
| 1   | 一般错误 / 缺 changeId(非 --recover 时)                                       |
| 2   | marker 缺失 / hash 不匹配 / Sync 失败但反向回滚成功(可重试)                  |
| 3   | Sync 失败且反向回滚失败(需人工介入,backup 路径已打印)                        |
| 4   | --recover 检测到状态损坏 / case C 完整性 check 失败(需人工介入)               |
| 5   | archive.lock 被另一进程占用                                                   |

### 错误恢复

- 退出 2(可重试):修底层(disk / permission / git 状态)后再跑 `forge archive <id>`
- 退出 3(回滚失败):按打印的 backup 路径手动恢复 `forge/specs/`,然后 `forge archive --recover` 检查
- 退出 4(状态损坏):看 stderr 诊断,可能要手动 mv archive/ 回 changes/
- 退出 5(lock 占用):等另一进程结束,或检查 `forge/.cache/archive.lock` 内的 pid 是否真存活,stale lock 会被 forge 自动清

## forge legacy-bridge — Brownfield Onboarding(v0.2)

完整文档:[`docs/legacy-bridge.md`](./legacy-bridge.md)。

### `forge legacy-bridge --acknowledge-data-transfer [--acknowledge-customer-data]`

一次性 ack 数据传输到 Anthropic API(决策 #22 / §9 GDPR)。

| flag                          | 用途                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `--acknowledge-data-transfer` | 必选;ack 老文档 + 代码 + 测试用例发往 LLM provider   |
| `--acknowledge-customer-data` | 当 anchors.yaml 含 contains_customer_data=true 时必加 |

### `forge legacy-bridge map [--merge | --overwrite]`

LLM 扫 docs/+src/ 推测 role,产 anchors-draft.yaml + draft .md 概览。

| flag                   | 用途                                                   |
| ---------------------- | ------------------------------------------------------ |
| `--merge`(默认)       | 与已存在 anchors.yaml 合并新发现项,保留用户审过部分   |
| `--overwrite`          | 全量重生成(覆盖用户改动,需 TTY 确认)                |
| `--docs-paths <paths>` | 逗号分隔的额外 docs 目录(默认扫 docs/ doc/ document/) |
| `--redact-report`      | 输出每条 redact 规则的命中数                           |

### `forge legacy-bridge regenerate [--role <r>] [--dry-run] [--include-historical] [--yes]`

复写器:LLM 读 anchors → 规范 SRS/HLD/LLD/system-tests + 双 LLM 抽样验证。

| flag                   | 用途                                          |
| ---------------------- | --------------------------------------------- |
| `--role <role>`        | 仅复写指定 role(默认全 4 role)              |
| `--dry-run`            | 不调 LLM,只估算 cost + 列要扫的文件          |
| `--include-historical` | 把 authoritative=false 历史版作背景(默认关) |
| `--redact-report`      | 输出 redact 命中数                            |
| `--yes`                | 非 TTY 必须显式 ack 高 cost 才继续(M-4)      |

### `forge legacy-bridge index [--yes]`

为每个 authoritative anchor 生成 ~100 字 LLM 摘要 → `forge/docs/index.md`。

### `forge legacy-bridge sync-check [--change-id <id>]`

检测 change 影响的 anchor → 5 档差异报告 → `forge/legacy-sync-state/<id>.{md,yaml}`。

### `forge legacy-bridge resolve <change-id>`

校验 sync-state diffs 全部 ack 后标 resolved。

退出码补充(基础码沿用已有表):

| 码  | brownfield 上下文含义                                       |
| --- | ----------------------------------------------------------- |
| 0   | 成功(含 graceful skip:无 anchors / allow_llm_calls=false) |
| 1   | 配置错(opt-in 未做)/ 参数无效 / status 字段非法           |
| 2   | critical 未 resolve / 保真率不达标                          |
| 3   | 复写部分成功(.partial 文件)                               |
| 5   | archive.lock 或 legacy-bridge.lock 被另一进程持有           |

## `forge monitor`(unreleased)

低耦合旁路工作流监控观察者。开启后由 AI 层在每个 forge 阶段调 `forge monitor record` 写入 trace 事件;`forge monitor report` 汇总渲染 markdown 报告,与 OpenSpec/superpowers 静态差异映射表对比做回归探测。**永远 exit 0**(loose —— 监控关闭或记录失败都静默 no-op,不影响主流程)。

详见 [`docs/specs/2026-05-15-workflow-monitor-design.md`](specs/2026-05-15-workflow-monitor-design.md)。

### `forge monitor enable`

开启 workflow-monitor:写 `forge/config.yaml#monitor.enabled = true`。

```
forge monitor enable
```

### `forge monitor disable`

关闭 workflow-monitor:写 `forge/config.yaml#monitor.enabled = false`。

```
forge monitor disable
```

### `forge monitor status`

查看 workflow-monitor 开关状态;传 `--change` 时附带该 change 的 trace 事件数与损坏行数。

```
forge monitor status [--change <id>]
```

| 选项              | 说明                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `--change <id>`   | 可选;输出该 change 的 trace 事件总数 + 损坏行数(JSON 解析失败行) |

### `forge monitor record`

记录一条 AI 层 trace 事件(由 `hooks/workflow-monitor-injection.md` 注入内容指示 AI 调用)。监控关闭时静默 no-op。

```
forge monitor record --stage <stage> --event <event> [--change <id>] [--json <payload>]
```

| 选项               | 说明                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| `--stage <stage>`  | 必选;当前 forge 阶段名(如 `brainstorming` / `propose` / `apply` / `review` / `verify` / `archive`) |
| `--event <event>`  | 必选;事件标识符(如 `stage_start` / `action_selected` / `stage_end`)             |
| `--change <id>`    | 可选;关联的 change id                                                             |
| `--json <payload>` | 可选;附加 JSON payload(结构化事件数据)                                           |

### `forge monitor report`

渲染指定 change 的 markdown 监控报告。默认写入 `forge/.monitor/<change>/report.md`。

```
forge monitor report --change <id> [--out <path>]
```

| 选项            | 说明                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| `--change <id>` | 必选;要报告的 change id                                               |
| `--out <path>`  | 可选;覆盖默认输出路径(`forge/.monitor/<id>/report.md`)               |

### 退出码

| 码  | 含义                                                                      |
| --- | ------------------------------------------------------------------------- |
| 0   | 永远 0(loose 语义 —— 监控关闭 / 记录失败均静默 no-op;status / report 正常出错也 exit 0) |

### 例子

```
# 开启监控
forge monitor enable

# 查看状态
forge monitor status

# 查看某 change 的 trace 摘要
forge monitor status --change c1

# 记录一条事件(由 AI 按 workflow-monitor-injection.md 协议调用)
forge monitor record --stage review --event stage_start --change c1

# 渲染监控报告
forge monitor report --change c1

# 输出到自定义路径
forge monitor report --change c1 --out /tmp/c1-monitor.md

# 关闭监控
forge monitor disable
```

## `forge stage-extensions`(v1.2.0 新增)

codex review stage extension framework 的 runner。**纯机械单轮执行器** —— 多轮收敛 / 用户介入 / 派 subagent 由 AI 主代理读 `commands/*.md` 末尾段协议驱动(v7 CLI/AI 职责分层)。两个子命令都输出结构化 JSON 到 stdout,**永远 exit 0**(loose —— codex 集成任何失败都不阻塞 forge 主流程 fence)。

详见 [`docs/stage-extensions.md`](stage-extensions.md)(framework 协议)与 [`docs/codex-review.md`](codex-review.md)(用户指南)。

### `forge stage-extensions run`

跑一轮 codex review:spawn codex → 监控输出 → 解析 → 收敛判定,失败自动 retry。

```
forge stage-extensions run --stage <stage> --change-id <id> --extension <name> [--round <n>] [--thread-id <id>]
```

| 选项                 | 说明                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `--stage <stage>`    | 必选;stage 名:`brainstorming` / `propose` / `apply_critical_plan_review` / `review` / `verify`               |
| `--change-id <id>`   | 必选;change 目录名                                                                                           |
| `--extension <name>` | 必选;`forge/config.yaml#stage_extensions.<stage>` 数组里某 entry 的 `name`                                    |
| `--round <n>`        | 当前轮次(默认 `1`);用于 output 文件名 + thread-map 轮次记录                                                  |
| `--thread-id <id>`   | codex resume thread id(可选;首轮空)                                                                         |

stdout 输出结构化 JSON,`kind` 字段为以下之一:`converged`(收敛完成)/ `unconverged`(需再轮)/ `failed`(retry 耗尽)/ `config_error`(config 加载/校验失败)/ `no_extension`(该 stage 无此 enabled extension)。

### `forge stage-extensions analyze-trend`

分析多轮收敛历史的 block finding 数趋势;AI 主代理在 max_rounds 到顶时调用拿建议。

```
forge stage-extensions analyze-trend --history '<JSON array>'
```

| 选项               | 说明                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `--history <json>` | 必选;`[{"round":1,"block_count":5},{"round":2,"block_count":3}, ...]`       |

stdout 输出 `TrendAdvice` JSON(`trend` / `recommendation` / `recommended_option`)。

### 退出码

| 码  | 含义                                                                                       |
| --- | ------------------------------------------------------------------------------------------ |
| 0   | 永远 0(loose 语义 —— codex 集成失败不阻塞主流程;失败信息在 stdout JSON 的 `kind` 字段)    |

### 例子

```bash
# 跑一轮 review stage 的 codex-review extension
forge stage-extensions run --stage review --change-id c1 --extension codex-review

# resume 续接上一轮(带 thread-id)
forge stage-extensions run --stage review --change-id c1 --extension codex-review --round 2 --thread-id cdx-abc123

# 收敛趋势分析
forge stage-extensions analyze-trend --history '[{"round":1,"block_count":5},{"round":2,"block_count":3},{"round":3,"block_count":1}]'
```

## 工作流内部 helper 命令

以下 6 个命令主要由 slash 命令模板(`/forge:apply` / `/forge:verify` / `/forge:review` / `/forge:ack-confirm` 等)在工作流内部调用,一般不需手敲。列在此处供排障与理解协议。

### `forge ack`

ack 两步确认协议(反向加固):WARNING finding 必须走 AI propose + User confirm 两步,AI 不能自 ack。

```
forge ack propose <changeId> --finding <id> --action <type> [--rationale <text>] [--target-severity <sev>]
forge ack confirm <changeId> <findingId> [--target-severity <sev>]
forge ack reject  <changeId> <findingId> --rationale <text>
```

| 子命令    | 行为                                                                  | 退出码                                                          |
| --------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `propose` | AI 写 pending ack YAML(`--action` 如 `ack-warning` / `ack-critical` / `resign-c-simcode`) | **1 = 已写 pending(正常路径,提示 user 去 confirm)**;2 = CI 模式拒绝(`CI=true`) |
| `confirm` | User 确认,写入 `ack-log.jsonl` 并删 pending                          | 0 成功;2 = 无 pending / pending YAML 损坏 / `--target-severity` 非法 |
| `reject`  | User 拒绝,写 reject 日志并删 pending                                 | 0 成功;2 = 无 pending / YAML 损坏                              |

注意:`propose` 成功时 **exit 1** 是有意设计的信号(pending 已写、待 user 操作),不是错误。

### `forge evidence`

记录 TDD / verify / review 过程证据到 `ack-log.jsonl` + `.evidence/process-evidence.staging.yaml`,最后 `freeze` 凝固进 marker。由 apply / verify / review slash 模板调用。

```
forge evidence record-tdd    <changeId> --task <ref> [--red-commit <sha>] --green-commit <sha> [...]
forge evidence record-verify <changeId> --task-refs <list> --scope <per-task|change-level> --report <path> [...]
forge evidence record-review <changeId> --task <ref> --implementer-commit <sha> [...]
forge evidence freeze        <changeId> --kind <verify|review> [--marker <path>]
```

`record-*` 三个子命令各有大量可选证据字段(timestamp / log / report / hash / exit code 等),完整列表见 `forge evidence <sub> --help`。`freeze` 把 staging 凝固进 `.verify-passed` / `.review-passed` marker 并校验 `staging_hash`。

退出码:0 成功;1 = staging / marker 缺失、`staging_hash` 不匹配、CRITICAL 不变量失败;2 = 参数无效(JSON 解析失败 / `--scope` 或 `--kind` 取值非法)。

### `forge finding`

```
<FindingHashPayload JSON> | forge finding hash
```

从 stdin 读 8 字段 `FindingHashPayload` JSON(`content_hash` / `git_head` / `dimension` / `check_type` / `severity` / `automated` / `evidence` / `recommendation`),按 JCS 规范算 `finding_hash` 输出到 stdout(64-hex)。供 verify 阶段写 marker 用,避免 AI 自行实现 JCS 序列化。

退出码:0 成功;1 = stdin 非合法 JSON / 缺必填字段;2 = io 错误。

### `forge scope`

```
forge scope scan-archived-followups <changeId>
```

扫 `forge/changes/archive/` 里的 out-of-scope / future-work / non-goal YAML 块,把仍 active 的条目以 JSON 输出到 stdout(供新 change 的 propose 阶段参考)。`<changeId>` 仅用于日志显示,不参与扫描;坏块逐条 warn 到 stderr。

退出码:0 成功;2 = 扫描失败。

### `forge preflight`

```
forge preflight branch-check [changeId] [--allow-protected-branch]
```

检查当前 git 分支是否为保护分支(`forge/config.yaml#protected_branches`,缺省用内置默认),防在 main/master 上误改。

| 情况                                     | 结果                                              |
| ---------------------------------------- | ------------------------------------------------- |
| 非 git 项目                              | graceful skip,exit 0                             |
| 当前分支非保护分支                       | exit 0                                            |
| 保护分支 + `--allow-protected-branch`    | exit 0,stderr 留 warning                         |
| 保护分支(默认)                         | exit 2,stderr 建议 `git checkout -b feature/<changeId>` |
| `forge/config.yaml` 解析失败             | exit 2                                            |

### `forge backlog`

生成 / 查询 `forge/backlog/` 注册表(汇总各 change 的未决项)。

```
forge backlog [--check]
forge backlog list
```

| 形式                      | 行为                                  | 退出码                       |
| ------------------------- | ------------------------------------- | ---------------------------- |
| `forge backlog`           | 重生成 `forge/backlog/active.md`      | 0 成功;2 错误               |
| `forge backlog --check`   | 只比对磁盘与重生成结果,不写盘        | 0 一致;1 陈旧;2 错误       |
| `forge backlog list`      | 把当前未决 backlog 打到 stdout,不落盘 | 0 成功;2 错误               |

## 错误退出码(全命令通用)

| 码  | 含义                       |
| --- | -------------------------- |
| 0   | 成功                       |
| 1   | 一般错误 / 参数无效        |
| 2   | 业务规则失败(可重试)      |
| 3   | 原子化操作回滚失败(需人工) |
| 4   | 状态损坏 / 需人工          |
| 5   | 资源被占用(lock)           |

## 调试命令(非公开,但可用)

```bash
forge --version                  # 版本号
DEBUG=forge:* forge init         # (v0.2)详细日志
```
