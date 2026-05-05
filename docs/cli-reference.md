# Forge CLI Reference

5 个公开命令:`init` / `update` / `config` / `validate` / `archive`。

## `forge init`

初始化 forge 到当前目录:检测 / 选择 harness、铺 skills + commands、创建 `forge/` 骨架。

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
