# 从 superpowers plugin 迁移到 forge

本文档讲 `forge migrate superpowers` 的完整流程、决策点、常见问题。

## 1. 迁移前检查清单

- [ ] 备份 `docs/superpowers/{specs,plans}/` 目录
- [ ] 确认在 git 仓库内(archive-detect 信号 2 需要 git log 检查)
- [ ] 文件名规范:`<YYYY-MM-DD>-<slug>-design.md` / `<YYYY-MM-DD>-<slug>-plan.md`(配对算法锚定 ISO 日期前缀)
- [ ] 当前 cwd 没有正在跑的其他 forge 命令(锁占用会导致 exit 1)
- [ ] 设置 `ANTHROPIC_API_KEY` 环境变量(superpowers 必缺 proposal/specs,强烈建议跑 `--regenerate`)

## 2. 配对算法

`forge migrate superpowers` 扫描两个目录:

- `docs/superpowers/specs/<date>-<slug>-design.md` → kind=design
- `docs/superpowers/plans/<date>-<slug>-plan.md` → kind=tasks(plan 改名为 tasks)

slug 抽取锚定 ISO 日期前缀:如 `2026-01-01-add-auth-design.md` → slug `add-auth`。同 slug 的 design + plan 配对成一个 forge change。

| 配对状态 | 处理 |
| --- | --- |
| design + plan 都有 | 配对成 PlannedChange.artifacts(design + tasks) |
| 只有 plan,无 design | orphan plan → active 路径(无法达到 archive 推测) |
| 只有 design,无 plan | spec-only → active 路径 |
| 文件名不规范(无 ISO 前缀 / 不以 `-design.md` 或 `-plan.md` 结尾) | unrecognized,skip + 在 migrate-report.md 列出 |
| slug 命中保留名(`..` / `.cache` / `archive` / 含分隔符) | unsafe-slug,skip;≥ 50% 触发 exit 4 |

## 3. archive 推测信号

archive-detect 用以下信号推测 active vs archive:

| 优先级 | 信号 | 描述 |
| --- | --- | --- |
| 最高 | 4. marker | plan 中含 `<!-- forge:archived -->` 注释 → 强制 archive |
| 次高 | 1. checkbox | 全 plan checkbox ≥ 95% 勾且 task 数 ≥ 3 → 推测 archive |
| 次高 | 2. git log | git log `--follow` plan.md 中含 close-keyword + slug 共同命中 → 推测 archive |
| 展示 | 3. mtime | 距今天数(仅展示给用户,不参与默认分类) |

**特殊 override**:plan 中含 `<!-- critical: task-N -->` 标记的 task 未勾 `[x]` → 即使达到 95% checkbox 阈值也不 archive(critical-task-pending)。

非 git 仓库:信号 2 失效,只用信号 1 + 4。

close-keyword 列表:close / complete / done / finish / archive / ship / closing / closed。

详见 spec §2.2。

## 4. 端到端流程

### 4.1 默认路径(`--regenerate`)

`forge migrate superpowers`(默认即 `--regenerate`)推荐路径,因为 superpowers 产物必然缺 proposal.md 和 specs/*.md。

整体流程与 OpenSpec 路径一致(见 [`docs/migration/from-openspec.md`](from-openspec.md) §2.1),主要差别:

- **missing artifacts 总是非空**:每个 change 都缺 proposal.md 和 specs/<area>.md
- **regenerate gate 必触发**:LLM 从 design.md + tasks.md 推导 proposal + specs
- **fidelity 阈值 0.6**(非 OpenSpec 的 0.9),见第 7 节

跑完查看 `forge/migrate-report.md`,里面有完整 plan 表和 cleanup 建议。

### 4.2 `--no-regenerate` 路径(及后果)

跳过 LLM:每个 change 落地 design.md + tasks.md,不补 proposal.md / specs/<area>.md。migrate-report.md 会列出大量 `[needs-fix]`。

```bash
forge migrate superpowers --no-regenerate

# 查看报告
cat forge/migrate-report.md
```

适用场景:bundled plugin、不想花 LLM 钱、计划后续手补所有 proposal + specs。

### 4.3 `--dry-run`

只打印 plan,不写 `forge/`。

```bash
forge migrate superpowers --dry-run
```

适用场景:迁移前 sanity check,确认配对结果(design + plan 匹配数、unrecognized 文件列表)。

## 5. transformer 规则速查

superpowers 路径只对 plan.md → tasks.md 跑 transformer(design.md 不做 transform,原样复制):

| 原文 | 转换后 | 说明 |
| --- | --- | --- |
| `- [ ] **Step N**: <text>` | `- [ ] task-N: <text>` | 英文冒号 |
| `- [ ] **Step N**：<text>` | `- [ ] task-N: <text>` | 中文冒号 → 英文(`：` 替换为 `:`) |
| `- [ ] **Step 1.1**: <text>` | `- [ ] task-1-1: <text>` | 嵌套(最多三层) |
| `- [ ] **STEP 1**: <text>` | `- [ ] task-1: <text>` | 大小写不敏感(STEP / step / Step) |

fenced code block 内不转换(walker 跳过)。design.md 不走 transformer,原样写入 forge change。

## 6. bundled 限制(M16)

bundled plugin(`forge-bundled` 路径)中 `--regenerate` 不可用:

- **openspec source**:静默 fallback `--no-regenerate`(openspec 多数产物已有,缺件少,可接受)
- **superpowers source**:**前置 prompt 让你确认**

为什么 superpowers 不静默退化?因为 superpowers 必缺 proposal/specs,静默退化会产生大量 `[needs-fix]`,用户不知情。所以 bundled + superpowers + regenerate 组合强制前置 prompt:

```
forge migrate superpowers 需要 LLM 补全 proposal/specs,但当前运行在 bundled plugin 路径(--regenerate 不可用)。
继续将以 --no-regenerate 跑,每个 change 缺 proposal.md + specs/。
输入 y 继续 / n 取消:
```

`--no-interactive` 模式:不提示,直接 abort exit 4。

## 7. fidelity 0.6 说明

superpowers 路径 LLM 生成产物的 fidelity 阈值默认 **0.6**,而非 OpenSpec 的 0.9。

**原因**:

- superpowers 缺 proposal/specs,LLM 从 design + tasks 推导,推导链路长
- design.md 经常含设计决策草稿,信号噪声多;严格阈值会触发大量 `.partial` 失败件
- 0.6 是 spec M15 v3 的折中:可接受 paraphrase + 少数 lost,但 critical 字段必须通过

**调高阈值**:暂不支持 CLI 参数,需改源码 `getFidelityThreshold`。后续若有需求会加 `--fidelity-threshold` 标志。

## 8. 常见问题

### 8.1 我的 plan 里有 "close add-auth: ship feature" 的 git commit,被推 archive 了

正常。这是 archive-detect 信号 2:git log 中 close-keyword(`close`)+ slug(`add-auth`)共同命中。

如果想阻止:

- 在 plan.md 加 `<!-- critical: task-N -->` 标记一个未勾的 task → critical-task-pending override 阻止 archive
- 或修改 git commit message,去掉 close-keyword

### 8.2 plan 里有 `[x]` checkbox 但全部 task < 3 条,没被推 archive

正常。信号 1 要求 task 数 ≥ 3 且 checkbox ≥ 95%。少 task 的 plan(如 1-task spike)即使 100% 完成也保留 active,避免误归档。

### 8.3 plan-only(只有 plan,无 design)怎么办?

orphan plan 走 active 路径,forge change 里只有 tasks.md(design.md 缺)。

如果用 `--regenerate`,LLM 不会自动生成 design.md;只补 proposal.md + specs/(从 plan 推 facts)。如需 design.md,后续手补。

### 8.4 plan.md 里用 `**Step 1**` 后面跟中文冒号 `：`,能正常转换吗?

可以。transformer 用 `[:：]` 字符类同时支持中英文冒号。生成的 task 格式统一用英文冒号:

```md
- [ ] **Step 1**：描述文字
# 转换为:
- [ ] task-1: 描述文字
```

### 8.5 为什么 design.md 不做 transform?

spec §2.6 定义:design.md 是用户手写的设计文档,migrate 不改动,原样写入 forge change。只有 plan.md → tasks.md 做规范化(任务编号格式)。

### 8.6 文件名里日期格式不对(如 `add-auth-design.md`,没有日期前缀),怎么办?

这类文件被标为 unrecognized,skip。migrate-report.md 会列出 unrecognized 文件清单。

处理方式:手动把文件改名为 `<YYYY-MM-DD>-<slug>-design.md` 或 `<YYYY-MM-DD>-<slug>-plan.md`,再重跑 migrate。

### 8.7 migrate 后 proposal.md 内容质量不够好

LLM 从 design + tasks 推导 proposal,fidelity 阈值 0.6 下允许一定程度的 paraphrase。如果推导结果不满意:

- 直接编辑 `forge/changes/<slug>/proposal.md`
- 或重跑 `forge migrate superpowers --regenerate`(会覆盖现有 proposal,带 --force 才覆盖已有 forge change)

## 9. cleanup + rollback

### 9.1 cleanup

```bash
# 检查 forge/ 树和报告
cat forge/migrate-report.md
git status
git diff

# 看 [needs-fix] 残件
grep -r "needs-fix" forge/

# 满意后清源
git rm -r docs/superpowers/{specs,plans}/
git commit -m "chore: migrate superpowers → forge"
```

### 9.2 rollback

同 OpenSpec 路径。本 spec 不实现 `forge migrate --rollback`;若需还原:

```bash
# 从 git 恢复 superpowers 目录
git checkout HEAD~1 -- docs/superpowers/

# 如果 migrate 落地的全部要丢
rm -rf forge/
```

`--force` 路径的冲突件在 `forge/.forge-trash/<ts>/` 保留 24h。

cp 阶段 crash 处理同 from-openspec.md §6。

## 10. 参考

- spec: [`docs/specs/2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md)
- archive-detect:spec §2.2
- transformer 规则:spec §2.6
- bundled 决策(M16):spec
- fidelity 0.6 决策(M15):spec
- OpenSpec 迁移:[`docs/migration/from-openspec.md`](from-openspec.md)
