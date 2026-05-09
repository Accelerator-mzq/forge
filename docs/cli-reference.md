# Forge CLI Reference

> v0.3 共 7 个公开命令:`forge init / upgrade / validate / archive / config / update / legacy-bridge`。`forge init` 标记 deprecated(v0.4 移除),新项目改用 plugin install。

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


v0.3 共 7 个公开命令:`init`(**deprecated**)/ `upgrade` / `update` / `config` / `validate` / `archive` / `legacy-bridge`。新项目改用 plugin install,`forge init` v0.4 移除。

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

读 / 写 `forge/config.yaml` 的字段。

```
forge config get <key>
forge config set <key> <value>
forge config profile          # (v0.2)
```

### 例子

```bash
forge config get harness        # 输出:claude,codex
forge config set harness codex  # 改为只用 Codex
```

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
