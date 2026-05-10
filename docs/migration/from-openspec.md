# 从 OpenSpec 项目迁移到 forge

本文档讲 `forge migrate openspec` 的完整流程、决策点、常见问题。

## 1. 迁移前检查清单

- [ ] 备份你的 `openspec/` 目录(虽然 forge migrate 默认不动源,但建议先备份)
- [ ] 确认在 git 仓库内(便于 archive-detect 用 git log 信号,以及失败时回滚)
- [ ] 当前 cwd 没有正在跑的其他 forge 命令(锁占用会导致 exit 1)
- [ ] 检查 `forge/` 是否已有同名 change(避免触发 `--imported-N` 后缀冲突)
- [ ] 设置 `ANTHROPIC_API_KEY` 环境变量(若用 `--regenerate`)

## 2. 端到端流程

### 2.1 默认路径(`--regenerate`)

`forge migrate openspec`(默认即 `--regenerate`)会按以下顺序执行:

1. 探测 `openspec/` 目录;不存在 → exit 2
2. scan 全部 `specs/changes/explorations` 文件
3. classify:把 `changes/<n>/` 归 active,`changes/archive/<n>/` 归 archive
4. unsafe-slug 检查(`..` / 保留名 / 含分隔符):≥ 50% → exit 4
5. M13 archive 完整性检查:archive 缺 proposal/specs 且 regen 关闭 → 交互降级 / `--no-interactive` abort exit 4
6. dry-run 早出路径:打印 plan 不落盘
7. cp 三步走(journal pending → write `.tmp` → rename → committed):每件 transform 后写 `forge/...`
8. regenerate gate:估算 cost(>= $5 必须 ack);实例化 Anthropic client;调 LLM 补缺件;写 `.partial` 失败件
9. 末态 finalizeAndRename + writeReportMd → `forge/migrate-report.md` + `migrate-trace.json`
10. exit 0

跑完后查看 `forge/migrate-report.md`,里面有完整 plan 表(每件的 active/archive 分类、transform 结果、[needs-fix] 标记)和 cleanup 建议。

### 2.2 `--no-regenerate` 路径

跳过 LLM 调用,只搬结构 + 跑 transformer。缺件标 `[needs-fix]`;后续两种选择:

```bash
forge migrate openspec --no-regenerate

# 看报告
cat forge/migrate-report.md

# 选择一:手补 [needs-fix] 件
#   按 message 提示直接编辑 forge/changes/<slug>/<file>

# 选择二:重跑 LLM 补全
forge migrate openspec --regenerate
```

适用场景:不想花 LLM 钱、bundled plugin 路径(自动静默退化)、CI 静默检查。

### 2.3 `--dry-run`

只打印 plan,不写 `forge/`(只有 `.cache` 等 bootstrap 必要目录会创建)。

```bash
forge migrate openspec --dry-run
```

输出包含:scanned files 数、missing-preview 计数、cost estimate(若 `--regenerate`)。

适用场景:迁移前 sanity check、CI 检查目标件数量。

### 2.4 `--force`

强制覆盖已有的同名 forge change,冲突件移入 `forge/.forge-trash/<ts>/` 备份:

```bash
forge migrate openspec --force
```

不加 `--force` 时冲突件加 `--imported-N` 后缀(撞到 99 则 abort)。

## 3. transformer 规则速查

markdown-aware walker 在 cp 阶段对每个文件跑以下变换(代码块内跳过):

| 原文 | 转换后 | 说明 |
| --- | --- | --- |
| `### Requirement: <name>` | `## Requirement: <name>` | 改名不删除(保留 Description/Notes 等子节) |
| `#### Scenario: <id>` | `## Scenario: <id>` | H4 → H2 |
| `- **WHEN** <text>` | `**When** <text>` | 去 list 前缀 + 首字母大写 |
| `- **THEN** <text>` | `**Then** <text>` | 同上 |
| `- **GIVEN** <text>` | `**Given** <text>` | 同上 |
| `- **AND** <text>` | `**And** <text>` | 同上 |
| `- **BUT** <text>` | `**But** <text>` | 同上 |
| `- **WHEN** xxx\n  续行` | `**When** xxx 续行` | 多行合并(2+ 空格缩进续行) |
| `## Problem` | `## Why` | proposal.md |
| `## Proposed Solution` | `## What` | proposal.md |
| `- [ ] N. text` | `- [ ] task-N: text` | tasks.md(数字编号) |
| `- [ ] N.M.K. text` | `- [ ] task-N-M-K: text` | tasks.md(三层嵌套扁平化) |

完整规则见 `docs/specs/2026-05-10-forge-migrate-design.md` §2.5。

## 4. 常见问题

### 4.1 `[needs-fix]` 怎么处理?

打开 `forge/migrate-report.md`,找 Plan 表的 `validate` 列。每条 `[needs-fix: <field> <message>]` 指明缺哪个字段、原因是什么。

两种处理方式:

- **手补**:按 message 提示直接编辑 `forge/changes/<slug>/<file>`
- **重跑**:运行 `forge migrate openspec --regenerate`(`.partial` 文件会被尝试 regenerate)

### 4.2 我有代码块内的 `#### Scenario` 示例,migrate 会改动吗?

不会。markdown-aware walker 跳过 fenced code block(` ``` ` 或 `~~~` 三字符 fence,同种 token 收尾)。代码块内的内容原样保留。

**注意**:必须用 fenced code block(三反引号或三波浪号),不能用 4 空格缩进代码块——见下条。

### 4.3 我用 4 空格缩进代码块包了 `#### Scenario` 示例,会被改动吗?

**会**。walker **不识别 indented code block(known limitation,见 spec §7.1)**。改用 fenced code block 即可。

### 4.4 表格里有 GWT step,为什么不被转换?

walker 跳过 table-row(`| ... |` 形式)。如果希望 GWT 步骤被 transformer 处理,改用 list 形式:

```md
- **WHEN** user submits
- **THEN** ok
```

### 4.5 三层 task 编号 `1.2.3` 的父子关系丢了

**是的**。forge tasks parser 实测不识别父子层级(spec §7.1 known limitation);migrate 把 `1.2.3` 转换为 `task-1-2-3` 扁平存储。父子结构需后续手工整理。

### 4.6 cost 超 $5 怎么办?

`forge migrate openspec --regenerate` 估算 cost ≥ $5 时,会写 `.forge-ack/migrate-<ts>.yaml` 并提示用户确认:

- 交互模式:显示估价,等待 ack(默认通过)
- `--no-interactive` 模式:直接 exit 4

如果嫌贵,可以:

- 用 `--no-regenerate` 跳过 LLM 后再手补
- 拆分 source 目录,分批 migrate
- 用 `--redact-rules` 压缩传给 SDK 的内容

### 4.7 archive 推测错了怎么办?

migrate-report.md 的 Plan 表会显示每件的 active/archive 推测结果。如果推测有误:

- **强制 archive**:在源 plan 加 `<!-- forge:archived -->` 注释(信号 4,优先级最高)
- **阻止 archive**:加 `<!-- critical: task-N -->` 标记一个未完成 task(critical-task-pending override)
- **取消 git log 命中**:修改 git commit message,不含 close-keyword + slug 组合

archive-detect 信号优先级:marker(`<!-- forge:archived -->`)> checkbox(≥95% 且 task ≥3)> git log(close-keyword + slug 共同命中)> mtime(仅展示)。

### 4.8 冲突(同名 change 已存在)怎么处理?

默认行为:冲突件加 `--imported-N` 后缀(如 `add-auth--imported-1`)。`-N` 撞到 99 则 abort。

`--force` 行为:冲突件移入 `forge/.forge-trash/<ts>/` 备份,然后覆盖。

### 4.9 bundled plugin 下 `--regenerate` 不可用

bundled plugin 路径中,openspec source **静默退化**为 `--no-regenerate`(openspec 多数产物已有,缺件较少,静默退化可接受)。退化不提示,跑完看 migrate-report.md 的 [needs-fix] 数量。

## 5. cleanup

migrate 成功后清理源目录:

```bash
# 先检查 forge/ 树和报告
cat forge/migrate-report.md
git status
git diff

# 看 [needs-fix] 残件
grep -r "needs-fix" forge/

# 满意后清源
git rm -r openspec/
git commit -m "chore: migrate openspec → forge"
```

## 6. rollback

本 spec 不实现 `forge migrate --rollback`。若需还原:

```bash
# 从 git 恢复 openspec/ 目录
git checkout HEAD~1 -- openspec/

# 如果 migrate 落地的全部要丢
rm -rf forge/
```

`--force` 路径的冲突件在 `forge/.forge-trash/<ts>/` 保留 24h,可手工恢复。

**cp 阶段中途 crash 的情况**:

- `forge/migrate-trace.json.ndjson` 存在但 `.json` 不存在 → 重跑 `forge migrate` 会检测 crash,清残留 `.tmp` + 反向 rm 已 committed 件
- `forge/migrate-trace.json` 已存在 → migrate 已成功完成,不需要 rollback

## 7. 参考

- spec: [`docs/specs/2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md)
- transformer 规则:spec §2.5
- archive-detect 信号:spec §2.2
- 错误矩阵(exit code):spec §3.1
- superpowers 迁移:[`docs/migration/from-superpowers.md`](from-superpowers.md)
