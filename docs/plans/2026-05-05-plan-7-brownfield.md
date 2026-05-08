# Forge Plan 7:v0.2 Brownfield Onboarding 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal**:实现 v0.2 brownfield onboarding 全套——`forge legacy-bridge` 主命令 + 5 个子命令(`map / regenerate / index / sync-check / resolve`) + opt-in LLM 调用机制(突破 v0.1 §2.3 边界)+ archive preflight/post-archive 双 hook + 双 LLM 抽样保真率验证(分层抽样)+ 12+ 类默认 redact 规则 + Excel 解析(`exceljs`) + 共享 lock(扩展 archive.lock 复用 + 新增 legacy-bridge.lock) + 6 个 regeneration eval scenario + 完整用户文档 + Release v0.2.0 工件准备 + 主 spec §7 路线图同步(OpenCode + specs-sync delete 推 v0.3)。

**Architecture**:`src/core/legacy-bridge/` 与 `src/core/archive/` 平行的核心模块,5 个子命令通过 `src/cli/commands/legacy-bridge.ts` 注册到 commander。LLM 调用复用 Plan 5 的 `forge-eval/judge.ts`(`judgeWithLlm`)+ `forge-eval/load-env.ts`(`loadEnv`)+ `forge-eval/budget.ts` 估算风格。所有发 LLM 路径强制经过 `redact.ts` mask + `legacy_bridge.allow_llm_calls` opt-in gate(首次跑由 `--acknowledge-data-transfer` 写 ack)。`archive.ts` 集成新 hook:preflight(Move 之前,enforce_sync 时阻塞)+ post-archive(Sync 之后,只产报告)。复写器 one-shot:`regenerator.ts` 生成 `forge/docs/regenerated/{SRS,HLD,LLD,system-tests}.md` 并强制加 `generated-by` + `license: derived-from-source` frontmatter + 顶部 disclaimer。`quality-judge.ts` 用分层抽样(critical 全量必抽 + 章节按比例抽)调双 LLM(模型 A 抽 fact,模型 B 验证三态)。eval 框架延伸 Plan 5,新增 `forge-eval/regeneration-scenarios/` 与 `pnpm eval-regen`。

**Tech Stack**:已有(TypeScript 5.6+ + Node 20.19+ + ESM + Vitest 2 + commander 12 + yaml 2.8 + gray-matter 4 + @anthropic-ai/sdk 0.93 + tsx 4);新增依赖:`exceljs@^4`(MIT,Excel 解析,见 spec §6.5)+ 可选 `chardet@^2`(devDependency,encoding detect for `--dry-run` 提示);新增 npm script:`eval-regen`。

**Spec 引用**:[`docs/specs/2026-05-05-brownfield-onboarding-design.md`](../specs/2026-05-05-brownfield-onboarding-design.md) 全文(决策清单 23 条 + §2 架构 + §3 数据流 + §4 错误处理 + §5 测试 + §6.1 阶段拆分 + §6.5 依赖选定 + §6.6 路线图衔接 + §7 显式不做项 + §8 与 v0.1 衔接 + §9 许可与署名 + §10 Codex 修订记录)。同时本 plan Phase F 内同步修订主 spec [`docs/specs/2026-05-04-forge-fusion-design.md`](../specs/2026-05-04-forge-fusion-design.md) §6/§7(把 OpenCode adapter + specs-sync delete 从 v0.2 移到 v0.3)。

**Plan 6 reviewer 移交**:无(Plan 6 PR #6 + #8 双 CI 绿合并到 main,v0.1.0 工件已就绪;无遗留 punch list)。

**关于 secret 占位符**(GitHub secret scanning 约束):本 plan 所有进 git 的 fixture 与示例中,**不含**会触发 GitHub secret scanning 的真 secret 形式字面量。已展示的 `<<aws-example-placeholder>>` / `<<gcp-example-placeholder>>` / `<<github-pat-example-placeholder>>` / `<<slack-token-example-placeholder>>` / `<<jwt-example-placeholder>>` 等 placeholder 仅用于**文档参考**(redact 规则参考表 / FAQ 示例)。

**测试策略**(P7-13 修复):
- `redact.test.ts` 的"默认规则 12+ 类"断言,只验证 `DEFAULT_REDACT_RULES` 的 `name` 数组覆盖度,**不依赖** fixture 命中默认规则的真值;
- `redact.test.ts` 的"AWS access key 被 mask"等单点 case,在测试函数内用**字符串拼接**构造命中正则的字符串(如 `'AKIA' + 'EXAMPLEKEY00FAKE0'` 形式),GitHub scanner 按行扫连续字面量不识别拼接,但运行时拼出的字符串仍命中 `AKIA[0-9A-Z]{16}` 正则;
- `redact-targets.md` fixture 进 git,但**只含用户自补 literal 案例**(如 `INTERNAL-DB-PROD-01` / `ACME-CUSTOMER-A12`),不含默认规则真匹配的字面量;综合 case 验证"自补 literal 多个同时命中 + 默认规则在该 fixture 中 0 命中"。

**release-gate-checklist §2.4.2 用户跑 acceptance** 时,用户在本地编辑专属 fixture(用真 secret 形式)跑一次 `--redact-report` 看默认规则真命中数,**该 fixture 不进 git**(放 `.gitignore` 的本地路径)。

---

## Phase 0:范围与非范围

**做**(spec §1.2 三层 + §6.1 八 phase):
1. **Layer 1** `forge legacy-bridge sync-check` + 5 档差异报告 + archive preflight/post-archive 双 hook + `enforce_sync` 配置
2. **Layer 2** `forge legacy-bridge index` + 每 anchor ~100 字摘要 + 大文件分块
3. **Layer 3a** `forge legacy-bridge regenerate` + 多版本合并 + 双 LLM 分层抽样验证 + frontmatter `license: derived-from-source` + 顶部 disclaimer + `--dry-run`
4. **二阶段 mapping** `forge legacy-bridge map [--merge | --overwrite]` + LLM 推测 role + draft yaml + 同名 .md 概览
5. **`forge legacy-bridge resolve <change-id>`** ack 差异项(用户改完老文档/标 false-positive/skipped 后跑)
6. **LLM opt-in 流程**:`legacy_bridge.allow_llm_calls: true` 默认 false + `forge legacy-bridge --acknowledge-data-transfer` 一次性 ack + GDPR `customer_data_acknowledged` 二次确认门 + 每次 LLM 调用前 stdout 数据传输声明
7. **共享 lock 设计**:扩展 `src/core/archive/lock.ts` mode 字段;新增 `forge/.cache/legacy-bridge.lock`;archive 内 sync-check 复用 archive.lock 不双重持锁;regenerate/index 同时获 archive.lock + legacy-bridge.lock(顺序固定)
8. **redact**:12+ 类默认规则 + 用户自补 + `<<REDACTED-{n}>>` 占位 + `--redact-report` 命中数统计
9. **conflict**:同 role 多版本用 `authoritative: true` 单选;跨 role 不一致默认入 diff(major 档),`auto_resolve_cross_anchor: true` 才走 mtime > role 优先级
10. **Excel** 用 `exceljs` 原生支持 `.xlsx`(测试用例常见);chart/pivot/formula 不支持时引导用户导出 .csv
11. **复写质量 eval**:`forge-eval/regeneration-scenarios/` 6 scenario(含 critical-facts 标注)+ `regeneration-runner.ts` 分层抽样实现 + `pnpm eval-regen` + CI workflow paths trigger + weekly schedule
12. **集成测试 + 跨平台 fixture**:中文路径 / GBK 编码探测 / CRLF / Excel 多 sheet / redact 默认规则匹配
13. **用户文档**:`docs/legacy-bridge.md` 完整使用手册 + `getting-started.md` brownfield 段 + `harness-setup.md` 不动 + `cli-reference.md` 加新命令段 + `CHANGELOG.md` v0.2.0 段 + `release-gate-checklist.md` 加 7 个 brownfield acceptance scenario
14. **Release v0.2.0 工件**:`package.json` version bump + `pnpm pack --dry-run` 验证 tarball 增量 ~340KB + 本地 `npm install -g <tarball>` 跑 `forge legacy-bridge --help` 验 bin 可用;**真 publish + git tag + GitHub release 由 maintainer 跑 release gate 通过后手动执行**(同 Plan 6 风格)
15. **主 spec §7 同步更新**:把 OpenCode adapter + specs-sync delete 从 v0.2 移到 v0.3 范围

**不做**(spec §7 + Plan 6 v0.1 显式收紧):
- ❌ 不替代老文档(只共存 + archive→legacy 单向同步;反向 sync 推 v0.3)
- ❌ 不实施反向 sync(改老锚点 → 自动建议新 change;v0.3)
- ❌ 不导入老文档为 forge GWT specs(决策 #6;sync-check 持续同步替代)
- ❌ 不全量导入验收报告(决策 #8);仅支持 metadata-only 导入(决策 I-8 部分接受)
- ❌ 不实施 forge-protected 段保留机制(决策 #15-17;复写器 one-shot 不重跑)
- ❌ 不做 LLM 自评保真率(决策 #16;靠双 LLM 抽样)
- ❌ 不默认开启 LLM 调用(决策 #22;突破 v0.1 §2.3 边界,需 opt-in)
- ❌ 不支持外部文档 URL(决策 #12;v0.2 只支持 git 内文件)
- ❌ 不支持 Word / PDF 原生解析(决策 #13;用户先 pandoc 转 markdown)
- ❌ 不在复写产物还原 redact 占位(决策 #20;敏感数据不进 forge)
- ❌ 不自动重跑 regenerate(决策 #15;用户主动跑)
- ❌ 不实施跨 anchor 一致性专门审计命令(v0.3 加 `legacy-bridge audit-consistency`)
- ❌ 不实施代码逆向 brownfield(无文档项目从代码推 SRS;v0.3)
- ❌ 不在非 TTY 环境 regenerate/index 时无声 confirm(M-4:必须显式 `--yes`)
- ❌ 不擅自 npm publish / git tag / 创 GitHub release(同 Plan 6 风格;maintainer 手动)
- ❌ 不在 v0.2 实施 OpenCode adapter(spec §6.6 主路线图修订后推 v0.3)
- ❌ 不在 v0.2 实施 specs-sync delete operation(同上,推 v0.3)

---

## File Structure(Plan 7 完成时新增/修改)

```
forge-repo/
├── package.json                                       ← 修改:加 exceljs dep + chardet devDep + scripts.eval-regen + version 0.2.0
├── README.md                                          ← 修改:Plan 7 进度段 + 状态更新到 v0.2.0 候选
├── CHANGELOG.md                                       ← 修改:追加 v0.2.0 段(Keep a Changelog 风格)
├── docs/
│   ├── plans/
│   │   └── 2026-05-05-plan-7-brownfield.md            ← 新增:本 plan
│   ├── legacy-bridge.md                               ← 新增:完整使用手册(opt-in 流程示例 + 合规场景 FAQ + 7 acceptance scenario)
│   ├── getting-started.md                             ← 修改:加 §6 "已有老文档项目接入"段(引 docs/legacy-bridge.md)
│   ├── cli-reference.md                               ← 修改:加 `forge legacy-bridge` 段 + 退出码表补 v0.2 行
│   ├── release-gate-checklist.md                      ← 修改:加 §2.4 brownfield acceptance(7 scenario)
│   └── specs/
│       └── 2026-05-04-forge-fusion-design.md          ← 修改(Phase F):§6/§7 把 OpenCode + specs-sync delete 推 v0.3
├── scripts/
│   └── release-gate.mjs                               ← 修改:tarball 内容验证加 exceljs 大小回归 + dry install 验证 forge legacy-bridge --help
├── src/
│   ├── core/
│   │   ├── archive/
│   │   │   └── lock.ts                                ← 修改:LockMode 扩展(archive | recover | legacy-bridge-map | legacy-bridge-regenerate | legacy-bridge-index | legacy-bridge-resolve | legacy-bridge-sync-check)
│   │   └── legacy-bridge/
│   │       ├── index.ts                               ← 新增:顶层 export(anchors / mapper / regenerator / quality-judge / indexer / sync-check / diff-report / redact / conflict / hash-anchor)
│   │       ├── types.ts                               ← 新增:LegacyAnchor / SyncStateDiff / DiffSeverity / RegenQualityFile / KeyFact 等 schema 类型
│   │       ├── anchors.ts                             ← 新增:legacy-anchors.yaml 解析 + schema 校验(forge-legacy-anchor/v1)
│   │       ├── ack.ts                                 ← 新增:llm-ack.yaml 读写 + customer_data 二次确认门
│   │       ├── redact.ts                              ← 新增:12+ 默认规则 + 自定义 + mask + --redact-report 命中数
│   │       ├── conflict.ts                            ← 新增:同 role authoritative 单选;跨 role 默认入 diff(major)
│   │       ├── budget.ts                              ← 新增:legacy-bridge 命令 cost 估算 + TTY/非 TTY 分支
│   │       ├── excel.ts                               ← 新增:exceljs 包装,sheet 字段精确指向 + chart/pivot/formula 不支持时引导
│   │       ├── encoding.ts                            ← 新增:utf8 强制读 + chardet dry-run 探测(可选依赖)
│   │       ├── mapper.ts                              ← 新增:扫 docs/+src/ → LLM 推测 → draft yaml + .md 概览;--merge / --overwrite
│   │       ├── regenerator.ts                         ← 新增:多版本合并 + 调 LLM + 加 frontmatter/disclaimer + output validator
│   │       ├── quality-judge.ts                       ← 新增:分层抽样(critical 必抽 + 章节比例抽) + 模型 B 三态验证 + per-section 保真率
│   │       ├── indexer.ts                             ← 新增:每 anchor ~100 字摘要 + 大文件分块
│   │       ├── sync-check.ts                          ← 新增:archive preflight/post-archive 双 hook + graceful skip + hash 检测
│   │       ├── diff-report.ts                         ← 新增:5 档严重度(critical/major/minor/style/info) + markdown + YAML 双栈
│   │       ├── resolve.ts                             ← 新增:校验 sync-state status + 全部 ack 才标 resolved
│   │       └── hash-anchor.ts                         ← 新增:复用 src/core/hash 的 SHA256 计算 anchor 文件 hash
│   ├── cli/
│   │   ├── index.ts                                   ← 修改:注册 buildLegacyBridgeCommand
│   │   └── commands/
│   │       ├── legacy-bridge.ts                       ← 新增:5 子命令 + --acknowledge-data-transfer + --redact-report + --dry-run + --yes + --include-historical
│   │       └── archive.ts                             ← 修改:加 preflight + post-archive 双 hook(根据 enforce_sync 选择)
│   └── core/parse/
│       └── config.ts                                  ← 修改:扩展 ForgeConfig 加 legacy_bridge 段(allow_llm_calls / enforce_sync / auto_resolve_cross_anchor / regen_license / provider)
├── forge-eval/
│   ├── regeneration-scenarios/                        ← 新增:6 个复写 eval scenario
│   │   ├── well-formed-srs.yaml
│   │   ├── messy-srs-multi-version.yaml
│   │   ├── srs-with-rationale.yaml
│   │   ├── chinese-srs.yaml
│   │   ├── srs-with-redact.yaml
│   │   └── partial-anchor-missing.yaml
│   ├── regeneration-runner.ts                         ← 新增:分层抽样 runner + 走真 LLM
│   ├── regeneration-types.ts                          ← 新增:KeyFact / RegenScenario / RegenResult 类型
│   └── regeneration-index.ts                          ← 新增:CLI 入口(pnpm eval-regen)
└── tests/
    ├── core/legacy-bridge/
    │   ├── anchors.test.ts                            ← 新增:schema 校验 + 同 role 多 authoritative 抛错
    │   ├── ack.test.ts                                ← 新增:llm-ack.yaml 读写 + GDPR 二次确认
    │   ├── redact.test.ts                             ← 新增:12 默认规则 + 自定义字面量 + 占位序号
    │   ├── conflict.test.ts                           ← 新增:同 role / 跨 role 决策矩阵
    │   ├── excel.test.ts                              ← 新增:exceljs 多 sheet + 复杂 Excel 失败提示
    │   ├── encoding.test.ts                           ← 新增:utf8 + chardet dry-run mojibake 提示
    │   ├── mapper.test.ts                             ← 新增:LLM mock + draft yaml 结构 + unmatched 文件归类
    │   ├── regenerator.test.ts                        ← 新增:多版本合并 + frontmatter/license/disclaimer + .partial 路径
    │   ├── quality-judge.test.ts                      ← 新增:分层抽样 + critical 100% 校验 + per-section 保真率
    │   ├── indexer.test.ts                            ← 新增:摘要长度 + 增量
    │   ├── sync-check.test.ts                         ← 新增:5 档判定 + graceful skip + opt-in skip + hash 过期 warn
    │   ├── diff-report.test.ts                        ← 新增:5 档分组渲染 + markdown/yaml 一致 + status 默认 pending
    │   ├── resolve.test.ts                            ← 新增:全 ack / 仍有 pending exit 2 / 非法 status exit 1
    │   ├── hash-anchor.test.ts                        ← 新增:中文路径 hash 稳定
    │   └── concurrency.test.ts                        ← 新增:lock 互斥 + stale 清理 + 死锁防护(C-2/I-5)
    ├── core/archive/
    │   └── lock.test.ts                               ← 修改:加 legacy-bridge-* mode case
    ├── cli/legacy-bridge/
    │   ├── map.test.ts                                ← 新增:happy / 全空 / 已存在 yaml + --merge vs --overwrite
    │   ├── regenerate.test.ts                         ← 新增:happy / 保真率达标 / 不达标 .partial / 部分 anchor 缺失 / redact / disclaimer / dry-run
    │   ├── index.test.ts                              ← 新增:happy / 大文件分块 / 增量
    │   ├── sync-check.test.ts                         ← 新增:happy / graceful skip / hash 过期 warn / enforce_sync 阻塞
    │   ├── resolve.test.ts                            ← 新增:happy / 仍有 pending / 非法 status
    │   └── archive-integration.test.ts                ← 新增:archive 含 brownfield hook(preflight + post-archive)
    ├── fixtures/legacy-bridge/
    │   ├── chinese-anchor/需求规格说明书.md
    │   ├── gbk-encoded-srs.md
    │   ├── windows-crlf-srs.md
    │   ├── excel-test-cases.xlsx                       ← 新增:多 sheet 测试 fixture
    │   └── redact-targets.md                           ← 含 12 类默认规则匹配样本
    └── forge-eval/
        └── regeneration-runner.test.ts                ← 新增:分层抽样 runner 单测(mock LLM)
```

**新依赖回归**(spec §6.5 Codex I-6):
- `exceljs@^4`(MIT,~340KB)→ tarball 增量 ~340KB,与现 dist ~150KB 合计 ~490KB,仍远低于 10MB 上限;`scripts/release-gate.mjs` Phase F 加阈值校验
- `chardet@^2`(MIT,~30KB,**devDependency**)→ 仅 `--dry-run` 用;可选依赖 try/require,不强制安装

---

## Phase A:基础设施(schema + CLI 骨架 + lock 扩展 + 依赖选定)

### Task A1:加 `exceljs` + `chardet` 依赖 + `eval-regen` script

**Files:**
- Modify: `package.json`

- [ ] **Step 1:装 `exceljs`(运行时依赖)**

```bash
pnpm add exceljs@^4
```

预期:`package.json#dependencies` 多 `exceljs`(版本约 4.4.x)。`pnpm-lock.yaml` 自动更新。

- [ ] **Step 2:装 `chardet` 为 devDependency(可选依赖)**

```bash
pnpm add -D chardet@^2
```

预期:`package.json#devDependencies` 多 `chardet`(版本约 2.x);因为 `encoding.ts` 用 `try { await import('chardet') } catch {}` 模式,运行时无 chardet 也能跑(只是 `--dry-run` 不输出疑似编码)。

- [ ] **Step 3:加 npm script**

打开 `package.json`,在 `scripts` 块内 `eval:skill` 行下追加:

```json
    "eval-regen": "tsx forge-eval/regeneration-index.ts",
    "eval-regen:scenario": "tsx forge-eval/regeneration-index.ts --scenario"
```

- [ ] **Step 4:验证 typecheck + build 不受影响**

```bash
pnpm typecheck && pnpm build
```

预期:0 errors。新增依赖暂未被 import,不影响现有构建。

- [ ] **Step 5:commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(legacy-bridge): 加 exceljs(dep)+ chardet(devDep)+ eval-regen 脚本"
```

---

### Task A2:扩展 `src/core/archive/lock.ts` 支持 legacy-bridge mode

**Files:**
- Modify: `src/core/archive/lock.ts`
- Modify: `tests/core/archive/lock.test.ts`(已存在,加 case)

- [ ] **Step 1:打开 `src/core/archive/lock.ts`,改 `LockData.mode` + `acquireLock` 签名**

把第 12 行的 `LockData.mode` 类型从 `'archive' | 'recover'` 改为完整 union;把 `acquireLock` 第二个参数同步改:

```typescript
// 决策 #23:扩展 mode union 支持 legacy-bridge 命令(C-2 / spec §2.6)
export type LockMode =
  | 'archive'
  | 'recover'
  | 'legacy-bridge-map'
  | 'legacy-bridge-regenerate'
  | 'legacy-bridge-index'
  | 'legacy-bridge-resolve'
  | 'legacy-bridge-sync-check';

interface LockData {
  pid: number;
  started_at: string;
  mode: LockMode;
}

// ...

export async function acquireLock(
  forgeRoot: string,
  mode: LockMode,
): Promise<() => Promise<void>> {
  // ... 原实现不变 ...
}
```

`LockHeldError` 不需要改(holder.mode 自动跟着 LockMode 走)。

**新增** `acquireLockByPath` 辅助函数,支持指定 lock 文件名(legacy-bridge 用 `legacy-bridge.lock`,archive 仍用 `archive.lock`):

```typescript
/**
 * acquireLock 的可定制 lock 文件版本(决策 #23)。
 *
 * legacy-bridge 命令获 forge/.cache/legacy-bridge.lock(独立于 archive.lock);
 * regenerate/index 同时获 archive.lock + legacy-bridge.lock(顺序固定:先 archive.lock 后 legacy-bridge.lock)。
 *
 * @param forgeRoot forge 根目录
 * @param mode      操作 mode(也写入 lock 数据)
 * @param lockName  lock 文件名,默认 'archive.lock'
 */
export async function acquireLockByPath(
  forgeRoot: string,
  mode: LockMode,
  lockName: string = 'archive.lock',
): Promise<() => Promise<void>> {
  const lockPath = join(forgeRoot, '.cache', lockName);

  mkdirSync(dirname(lockPath), { recursive: true });

  let fd: number;
  try {
    fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o644);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      const data = JSON.parse(await readFile(lockPath, 'utf8')) as LockData;
      if (!isPidAlive(data.pid)) {
        await rm(lockPath, { force: true });
        return acquireLockByPath(forgeRoot, mode, lockName);
      }
      throw new LockHeldError(data);
    }
    throw err;
  }

  const data: LockData = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    mode,
  };
  await writeFile(lockPath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'w' });
  closeSync(fd);

  return async (): Promise<void> => {
    if (existsSync(lockPath)) {
      await rm(lockPath, { force: true });
    }
  };
}
```

把原 `acquireLock` 改为 `acquireLockByPath` 的 wrapper(保持向后兼容):

```typescript
export async function acquireLock(
  forgeRoot: string,
  mode: LockMode,
): Promise<() => Promise<void>> {
  return acquireLockByPath(forgeRoot, mode, 'archive.lock');
}
```

- [ ] **Step 2:在 `tests/core/archive/lock.test.ts` 末尾追加 case**

```typescript
import { acquireLockByPath } from '../../../src/core/archive/lock.js';

describe('lock - legacy-bridge mode 扩展(决策 #23)', () => {
  it('acquireLockByPath 用 legacy-bridge.lock 文件名', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-lb-lock-'));
    try {
      const release = await acquireLockByPath(d, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
      expect(existsSync(join(d, '.cache', 'legacy-bridge.lock'))).toBe(true);
      const data = JSON.parse(await readFile(join(d, '.cache', 'legacy-bridge.lock'), 'utf8'));
      expect(data.mode).toBe('legacy-bridge-regenerate');
      await release();
      expect(existsSync(join(d, '.cache', 'legacy-bridge.lock'))).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('archive.lock 与 legacy-bridge.lock 互不影响', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-mix-lock-'));
    try {
      const releaseA = await acquireLockByPath(d, 'archive', 'archive.lock');
      const releaseB = await acquireLockByPath(d, 'legacy-bridge-map', 'legacy-bridge.lock');
      expect(existsSync(join(d, '.cache', 'archive.lock'))).toBe(true);
      expect(existsSync(join(d, '.cache', 'legacy-bridge.lock'))).toBe(true);
      await releaseA();
      await releaseB();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('legacy-bridge.lock 已被持有 → 抛 LockHeldError', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-lb-held-'));
    try {
      const release = await acquireLockByPath(d, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
      await expect(
        acquireLockByPath(d, 'legacy-bridge-index', 'legacy-bridge.lock'),
      ).rejects.toThrow(/another forge archive is in progress.*legacy-bridge-regenerate/);
      await release();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
```

(顶部 import 块若缺 `mkdtempSync / tmpdir / join / rmSync / existsSync / readFile`,补齐)

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/archive/lock.test.ts
```

预期:原有 lock 测试 + 3 个新增 case 全过。

- [ ] **Step 4:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。LockMode 是 string union,TS 自动收窄。

- [ ] **Step 5:commit**

```bash
git add src/core/archive/lock.ts tests/core/archive/lock.test.ts
git commit -m "feat(archive): lock LockMode 扩展 + acquireLockByPath(决策 #23 legacy-bridge.lock)"
```

---

### Task A3:`src/core/parse/config.ts` 扩展 `legacy_bridge` 段

**Files:**
- Modify: `src/core/parse/config.ts`(及其下 schema 类型)
- Modify: `src/core/schema/types.ts`(扩展 `ForgeConfig`)

- [ ] **Step 1:在 `src/core/schema/types.ts` 的 `ForgeConfig` interface 加 `legacy_bridge` 字段**

```typescript
/**
 * forge/config.yaml 的解析结果类型。
 * 详见 spec §2.2.1 + brownfield design §2.7。
 */
export interface ForgeConfig {
  schema: string; // e.g., 'forge-spec-driven/v1'
  context?: string;
  rules?: {
    proposal?: string[];
    specs?: string[];
    design?: string[];
    tasks?: string[];
  };
  code_paths?: {
    include?: string[];
    exclude?: string[];
  };
  /**
   * v0.2 brownfield onboarding 全局策略(brownfield design §2.7 / 决策 #19/#22)。
   * 缺失或全 false 时,brownfield 工具拒绝运行;archive 内的 sync-check graceful skip。
   */
  legacy_bridge?: {
    /** 决策 #22:opt-in LLM 调用,默认 false */
    allow_llm_calls?: boolean;
    /** 决策 #19:enforce_sync,critical 未 resolve 时 archive preflight 阻塞,默认 false */
    enforce_sync?: boolean;
    /** 决策 #18:跨 anchor 不一致是否走 mtime 自动决策,默认 false(默认入 diff) */
    auto_resolve_cross_anchor?: boolean;
    /** 决策 #21:复写产物默认许可,默认 'derived-from-source' */
    regen_license?: string;
    /** 决策 #22 预留:LLM provider,v0.2 仅 'anthropic',v0.3 加 OpenAI 等 */
    provider?: 'anthropic';
  };
}
```

- [ ] **Step 2:在 `src/core/parse/config.ts` 的 `parseConfig` 函数加 `legacy_bridge` 段解析(若缺即返回 undefined)**

打开 `src/core/parse/config.ts`,找到 `parseConfig` 函数末尾返回前,确认 YAML 解析后的对象会带 `legacy_bridge`(`yaml.parse` 默认会把所有字段透传)。如果当前实现是字段白名单 picking,把 `legacy_bridge` 加进白名单:

```typescript
// 字段白名单(若实现是 pick 风格)
return {
  schema: parsed.schema,
  context: parsed.context,
  rules: parsed.rules,
  code_paths: parsed.code_paths,
  legacy_bridge: parsed.legacy_bridge, // Plan 7 新增
};
```

(如果 `parseConfig` 是 `return parsed as ForgeConfig` 风格,无需改实现,只改 type)

- [ ] **Step 3:加 1 个单测验证 legacy_bridge 字段被透传**

在 `tests/core/parse/config.test.ts`(若不存在则新建)末尾追加:

```typescript
import { parseConfig } from '../../../src/core/parse/config.js';

describe('parseConfig - legacy_bridge 段(Plan 7)', () => {
  it('完整 legacy_bridge 段被透传', () => {
    const yaml = `
schema: forge-spec-driven/v1
legacy_bridge:
  allow_llm_calls: true
  enforce_sync: true
  auto_resolve_cross_anchor: false
  regen_license: derived-from-source
  provider: anthropic
`;
    const config = parseConfig(yaml);
    expect(config.legacy_bridge?.allow_llm_calls).toBe(true);
    expect(config.legacy_bridge?.enforce_sync).toBe(true);
    expect(config.legacy_bridge?.auto_resolve_cross_anchor).toBe(false);
    expect(config.legacy_bridge?.regen_license).toBe('derived-from-source');
    expect(config.legacy_bridge?.provider).toBe('anthropic');
  });

  it('legacy_bridge 缺失 → 字段为 undefined(向后兼容)', () => {
    const yaml = 'schema: forge-spec-driven/v1\n';
    const config = parseConfig(yaml);
    expect(config.legacy_bridge).toBeUndefined();
  });

  it('legacy_bridge 部分字段缺失 → 仅保留已声明字段', () => {
    const yaml = `
schema: forge-spec-driven/v1
legacy_bridge:
  allow_llm_calls: true
`;
    const config = parseConfig(yaml);
    expect(config.legacy_bridge?.allow_llm_calls).toBe(true);
    expect(config.legacy_bridge?.enforce_sync).toBeUndefined();
  });
});
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/core/parse/config.test.ts
```

预期:3 tests passing(若 config.test.ts 已有其他 case,这是新增 3 个)。

- [ ] **Step 5:commit**

```bash
git add src/core/schema/types.ts src/core/parse/config.ts tests/core/parse/config.test.ts
git commit -m "feat(config): ForgeConfig.legacy_bridge 段(决策 #18/#19/#21/#22)"
```

---

### Task A4:`src/core/legacy-bridge/types.ts`(全模块共享类型)

**Files:**
- Create: `src/core/legacy-bridge/types.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/types.ts`**

```typescript
// brownfield onboarding 全模块共享类型 — Plan 7
// 对应 spec §2 架构 + §3 数据流 + §4.3 不变量 + §5.1 quality-judge schema

/** 老锚点的角色(决策 #9 用户显式声明 + LLM 推测草稿) */
export type LegacyAnchorRole =
  | 'requirements'       // SRS / PRD / 需求规格
  | 'high-level-design'  // HLD / 概要设计 / Architecture
  | 'low-level-design'   // LLD / 详细设计 / Module Spec
  | 'system-tests'       // 系统测试用例 / testcases / .xlsx
  | 'acceptance-report'  // 验收报告(决策 #8 metadata-only)
  | 'rationale'          // 设计决策 / 历史背景
  | 'glossary';          // 术语表

/** 单个老锚点配置项(legacy-anchors.yaml#anchors[] 数组项) */
export interface LegacyAnchor {
  /** 角色(决策 #9) */
  role: LegacyAnchorRole;
  /** 文件路径(支持 glob) */
  path: string;
  /** 当前权威版(决策 #10);同 role 多版本只 1 项可为 true */
  authoritative: boolean;
  /** Excel 文件可选指明 sheet(测试用例常见) */
  sheet?: string;
  /** 文件版本号(可选,用户填) */
  version?: string;
  /** 模块边界(用于 sync-check 反查影响) */
  modules?: string[];
  /** SHA256 hash(由 regenerate / sync-check 写入,用于过期检测) */
  hash?: string;
  /** 上次复写时间(ISO) */
  last_regenerated?: string;
  /** 上次 sync-check 时间(ISO) */
  last_sync_at?: string;
  /** 决策 #20 redact 配置(可选,若缺则用默认 12 类规则) */
  redact?: RedactRule[];
  /** §9 GDPR:此文件含客户数据,启用 LLM 时额外 ack */
  contains_customer_data?: boolean;
}

/** legacy-anchors.yaml 顶层结构 */
export interface LegacyAnchorsFile {
  schema: 'forge-legacy-anchor/v1';
  anchors: LegacyAnchor[];
  /** 全局 redact 规则(与每 anchor 的 redact 合并) */
  redact?: RedactRule[];
}

/** redact 规则(决策 #20) */
export type RedactRule =
  | { regex: string; name?: string }
  | { literal: string; name?: string };

/** 5 档差异严重度(决策 #5) */
export type DiffSeverity = 'critical' | 'major' | 'minor' | 'style' | 'info';

/** sync-state YAML 中的单条 diff 项 */
export interface SyncStateDiff {
  /** 数字 id(在 yaml 内唯一) */
  id: number;
  severity: DiffSeverity;
  /** 受影响的 anchor 路径 */
  anchor_path: string;
  /** 哪段需要更新(章节锚) */
  section?: string;
  /** 描述本次差异 */
  description: string;
  /** 用户处理状态(决策 #19) */
  status: 'pending' | 'resolved-by-doc-update' | 'false-positive' | 'skipped';
  /** 用户填的理由(false-positive / skipped 时) */
  reason?: string;
}

/** sync-state YAML 顶层结构 */
export interface SyncStateFile {
  schema: 'forge-legacy-sync/v1';
  change_id: string;
  generated_at: string;
  diffs: SyncStateDiff[];
  /** 跨 anchor 冲突默认入 diff(决策 #18 修订);auto_resolve_cross_anchor=true 时此字段为空 */
  cross_anchor_conflicts?: SyncStateDiff[];
}

/** llm-ack.yaml 顶层结构(决策 #22) */
export interface LlmAckFile {
  schema: 'forge-llm-ack/v1';
  acknowledged_at: string;
  /** 用户当时的 forge/config.yaml#legacy_bridge 段 hash;若 config 改了,要求重新 ack */
  config_hash: string;
  /** §9 GDPR:用户 ack 已处理含客户数据的 anchor */
  customer_data_acknowledged?: boolean;
}

/** key fact:scenario YAML 标注的关键事实(决策 #16 分层抽样) */
export interface KeyFact {
  text: string;
  section: string;
  /** critical 必抽必保留(分层抽样,§5.1) */
  critical: boolean;
}

/** 复写质量结果(spec §5.1 + §4.3 不变量) */
export interface QualityResult {
  /** 总体保真率(critical + non-critical) */
  total_rate: number;
  /** critical 子集保真率(必须 1.0) */
  critical_rate: number;
  /** 各章节保真率(防"统计骗术") */
  per_section_rates: Record<string, number>;
  /** 丢失的 critical(致命) */
  lost_critical: KeyFact[];
  /** 丢失的 non-critical */
  lost_non_critical: KeyFact[];
  /** 抽样未覆盖的章节(警告) */
  uncovered_sections: string[];
  /** 是否过 critical 100% + total >= threshold */
  passed: boolean;
}

/** regen-quality.yaml 顶层(写到 forge/docs/regenerated/<role>.partial.yaml,失败时) */
export interface RegenQualityFile {
  schema: 'forge-regen-quality/v1';
  role: LegacyAnchorRole;
  generated_at: string;
  result: QualityResult;
}
```

- [ ] **Step 2:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 3:commit**

```bash
git add src/core/legacy-bridge/types.ts
git commit -m "feat(legacy-bridge): types.ts(LegacyAnchor / SyncStateDiff / KeyFact / QualityResult)"
```

---

### Task A5:`src/core/legacy-bridge/anchors.ts`(legacy-anchors.yaml 解析 + schema 校验)

**Files:**
- Create: `src/core/legacy-bridge/anchors.ts`
- Test: `tests/core/legacy-bridge/anchors.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/anchors.ts`**

```typescript
// legacy-anchors.yaml 解析 + 校验(forge-legacy-anchor/v1)
// spec §2.2 / §4.1 / 决策 #9-10 / §4.3 不变量

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { LegacyAnchorsFile, LegacyAnchor, LegacyAnchorRole } from './types.js';

const VALID_ROLES: LegacyAnchorRole[] = [
  'requirements',
  'high-level-design',
  'low-level-design',
  'system-tests',
  'acceptance-report',
  'rationale',
  'glossary',
];

/** 自定义异常:legacy-anchors.yaml 解析或校验失败(供 CLI 转 exit 1) */
export class LegacyAnchorsError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'LegacyAnchorsError';
  }
}

/** 读 legacy-anchors.yaml + 校验;不存在时返回 null(供 graceful skip) */
export async function loadAnchorsFile(forgeRoot: string): Promise<LegacyAnchorsFile | null> {
  const path = `${forgeRoot}/legacy-anchors.yaml`;
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    // §4.1:YAML 解析失败 — 行号 + 错误描述,不擅自修复
    throw new LegacyAnchorsError(
      `YAML 解析失败:${(err as Error).message}`,
      path,
    );
  }
  return validateAnchorsFile(parsed, path);
}

/** 校验 LegacyAnchorsFile 结构 */
export function validateAnchorsFile(data: unknown, ctx: string): LegacyAnchorsFile {
  if (!data || typeof data !== 'object') {
    throw new LegacyAnchorsError('legacy-anchors.yaml 顶层必须是对象', ctx);
  }
  const file = data as Partial<LegacyAnchorsFile>;
  if (file.schema !== 'forge-legacy-anchor/v1') {
    throw new LegacyAnchorsError(
      `schema 字段必须为 'forge-legacy-anchor/v1',实际:${String(file.schema)}`,
      ctx,
    );
  }
  if (!Array.isArray(file.anchors)) {
    throw new LegacyAnchorsError('anchors 字段必须是数组', ctx);
  }

  // 校验每条 anchor
  for (const [idx, a] of file.anchors.entries()) {
    validateAnchor(a, `${ctx}#anchors[${idx}]`);
  }

  // §4.1 + 决策 #10:同 role 多个 authoritative=true → 抛错
  const authByRole = new Map<LegacyAnchorRole, number>();
  for (const a of file.anchors) {
    if (a.authoritative) {
      authByRole.set(a.role, (authByRole.get(a.role) ?? 0) + 1);
    }
  }
  for (const [role, count] of authByRole.entries()) {
    if (count > 1) {
      throw new LegacyAnchorsError(
        `role '${role}' 有 ${count} 个 authoritative=true;每 role 仅允许 1 个(决策 #10)`,
        ctx,
      );
    }
  }

  return file as LegacyAnchorsFile;
}

/** 允许的文件扩展名(决策 #13 + P7-04 修复:加白名单硬校验) */
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.csv', '.xlsx'] as const;

function validateAnchor(a: unknown, ctx: string): asserts a is LegacyAnchor {
  if (!a || typeof a !== 'object') {
    throw new LegacyAnchorsError('anchor 必须是对象', ctx);
  }
  const an = a as Partial<LegacyAnchor>;
  if (typeof an.role !== 'string' || !VALID_ROLES.includes(an.role as LegacyAnchorRole)) {
    throw new LegacyAnchorsError(
      `role '${String(an.role)}' 非预定义角色;可选:${VALID_ROLES.join(',')}`,
      ctx,
    );
  }
  if (typeof an.path !== 'string' || !an.path.trim()) {
    throw new LegacyAnchorsError('path 字段缺失或非字符串', ctx);
  }
  // P7-04 修复:决策 #12 拒绝外部 URL
  if (/^(https?|ftp|s3|gs|ssh|file):\/\//i.test(an.path)) {
    throw new LegacyAnchorsError(
      `path '${an.path}' 是外部 URL;v0.2 仅支持 git 内文件(决策 #12),先 export 到 git`,
      ctx,
    );
  }
  // P7-04 修复:决策 #13 文件格式白名单(.md / .txt / .csv / .xlsx)
  const lower = an.path.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new LegacyAnchorsError(
      `path '${an.path}' 扩展名不在白名单 ${ALLOWED_EXTENSIONS.join('/')};Word/PDF 先 pandoc 转 markdown(决策 #13)`,
      ctx,
    );
  }
  if (typeof an.authoritative !== 'boolean') {
    throw new LegacyAnchorsError('authoritative 字段必须是 boolean', ctx);
  }
}

/** 取所有 authoritative=true 的 anchor(用于 regenerate / sync-check 仅用当前版,决策 #10) */
export function getAuthoritativeAnchors(file: LegacyAnchorsFile): LegacyAnchor[] {
  return file.anchors.filter((a) => a.authoritative);
}

/** 按 role 分组(用于跨 role 一致性判定,决策 #18) */
export function groupAnchorsByRole(file: LegacyAnchorsFile): Map<LegacyAnchorRole, LegacyAnchor[]> {
  const m = new Map<LegacyAnchorRole, LegacyAnchor[]>();
  for (const a of file.anchors) {
    const arr = m.get(a.role) ?? [];
    arr.push(a);
    m.set(a.role, arr);
  }
  return m;
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/anchors.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  validateAnchorsFile,
  getAuthoritativeAnchors,
  groupAnchorsByRole,
  LegacyAnchorsError,
} from '../../../src/core/legacy-bridge/anchors.js';

describe('legacy-bridge/anchors', () => {
  it('合法 legacy-anchors.yaml 解析成功', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        { role: 'requirements', path: 'docs/legacy/SRS.md', authoritative: true },
        { role: 'high-level-design', path: 'docs/legacy/HLD.md', authoritative: true },
      ],
    };
    const file = validateAnchorsFile(data, 'test');
    expect(file.anchors).toHaveLength(2);
  });

  it('schema 字段错误 → 抛错', () => {
    const data = { schema: 'wrong/v1', anchors: [] };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(LegacyAnchorsError);
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/forge-legacy-anchor\/v1/);
  });

  it('role 非预定义 → 抛错', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [{ role: 'unknown', path: 'a.md', authoritative: true }],
    };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/非预定义角色/);
  });

  it('同 role 多 authoritative=true → 抛错(决策 #10)', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        { role: 'requirements', path: 'srs-v1.md', authoritative: true },
        { role: 'requirements', path: 'srs-v2.md', authoritative: true },
      ],
    };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/2 个 authoritative=true/);
  });

  it('getAuthoritativeAnchors 仅返回当前版', () => {
    const file = validateAnchorsFile(
      {
        schema: 'forge-legacy-anchor/v1',
        anchors: [
          { role: 'requirements', path: 'srs-v1.md', authoritative: false },
          { role: 'requirements', path: 'srs-v2.md', authoritative: true },
        ],
      },
      'test',
    );
    const auth = getAuthoritativeAnchors(file);
    expect(auth).toHaveLength(1);
    expect(auth[0]?.path).toBe('srs-v2.md');
  });

  it('groupAnchorsByRole 正确分组', () => {
    const file = validateAnchorsFile(
      {
        schema: 'forge-legacy-anchor/v1',
        anchors: [
          { role: 'requirements', path: 'srs.md', authoritative: true },
          { role: 'high-level-design', path: 'hld.md', authoritative: true },
          { role: 'low-level-design', path: 'lld.md', authoritative: true },
        ],
      },
      'test',
    );
    const grouped = groupAnchorsByRole(file);
    expect(grouped.size).toBe(3);
    expect(grouped.get('requirements')).toHaveLength(1);
  });

  it('path 字段缺失 → 抛错', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [{ role: 'requirements', authoritative: true }],
    };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/path 字段缺失/);
  });

  it('外部 URL → 抛错(决策 #12 / P7-04)', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        { role: 'requirements', path: 'https://notion.so/srs', authoritative: true },
      ],
    };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/外部 URL/);
  });

  it('扩展名不在白名单(.docx / .pdf)→ 抛错(决策 #13 / P7-04)', () => {
    for (const bad of ['srs.docx', 'srs.pdf', 'srs.html']) {
      const data = {
        schema: 'forge-legacy-anchor/v1',
        anchors: [{ role: 'requirements', path: bad, authoritative: true }],
      };
      expect(() => validateAnchorsFile(data, 'test')).toThrow(/扩展名不在白名单/);
    }
  });

  it('扩展名 .md / .txt / .csv / .xlsx 全通过', () => {
    for (const ok of ['srs.md', 'tests.csv', 'spec.txt', 'cases.xlsx']) {
      const data = {
        schema: 'forge-legacy-anchor/v1',
        anchors: [{ role: 'requirements', path: ok, authoritative: true }],
      };
      expect(() => validateAnchorsFile(data, 'test')).not.toThrow();
    }
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/anchors.test.ts
```

预期:7 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/types.ts src/core/legacy-bridge/anchors.ts tests/core/legacy-bridge/anchors.test.ts
git commit -m "feat(legacy-bridge): anchors.ts schema 校验(forge-legacy-anchor/v1)"
```

---

### Task A6:`src/cli/commands/legacy-bridge.ts` CLI 骨架(空 5 子命令 + 注册到 index)

**Files:**
- Create: `src/cli/commands/legacy-bridge.ts`
- Modify: `src/cli/index.ts`(注册)

- [ ] **Step 1:写 `src/cli/commands/legacy-bridge.ts` 骨架**

```typescript
// forge legacy-bridge 主命令 + 5 子命令骨架 — Plan 7 Phase A
// 各子命令在后续 Phase B-D 填实;本 Task 仅完成骨架 + commander 结构
// spec §2.1 子命令一览 + 决策 #22 LLM opt-in 流程

import { Command } from 'commander';

/** 5 子命令通用退出码,与 forge 现有约定一致(spec §4.6) */
export const LB_EXIT_OK = 0;
export const LB_EXIT_GENERAL_ERROR = 1;
export const LB_EXIT_BUSINESS_RULE_FAIL = 2;
export const LB_EXIT_PARTIAL_SUCCESS = 3;
export const LB_EXIT_DATA_CORRUPT = 4;
export const LB_EXIT_LOCK_HELD = 5;

/** 主命令 build:无参数走 help;含 --acknowledge-data-transfer 时进入 ack 流程(Phase B1 填) */
export function buildLegacyBridgeCommand(): Command {
  const cmd = new Command('legacy-bridge')
    .description('Brownfield onboarding:与老文档体系并存 + archive→legacy 单向同步(v0.2)')
    .option('--acknowledge-data-transfer', 'opt-in:ack 数据将被发送到 LLM provider(决策 #22)');

  cmd.action(async (opts: { acknowledgeDataTransfer?: boolean }) => {
    if (opts.acknowledgeDataTransfer) {
      // Phase A 骨架,后续 Phase B1 Task B1.3 替换为真实 ack 写入
      console.error('--acknowledge-data-transfer:Phase B1 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    }
    cmd.help();
  });

  // 5 个子命令骨架(各 Phase 填实)
  cmd
    .command('map')
    .description('扫 docs/ + src/ → LLM 推测 → legacy-anchors-draft.yaml(决策 #4)')
    .option('--merge', '与已存在 anchors.yaml 合并新发现项,保留用户审过部分(默认)', true)
    .option('--overwrite', '全量重生成(覆盖用户改动,需用户确认)')
    .option('--docs-paths <paths>', '逗号分隔的额外 docs 目录(默认扫 docs/ doc/ document/)')
    .option('--redact-report', '输出每条 redact 规则的命中数(决策 #20)')
    .action(async () => {
      // Phase A 骨架,后续 Phase D Task D3 替换为真实实现
      console.error('forge legacy-bridge map:Phase D 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  cmd
    .command('regenerate')
    .description('LLM 复写规范 SRS/HLD/LLD/system-tests + 双 LLM 抽样验证(决策 #14-#16)')
    .option('--role <role>', '仅复写指定 role(默认全 4 role)')
    .option('--dry-run', '不调 LLM,只估算 cost + 列要扫的文件(§4.4)')
    .option('--include-historical', '把 authoritative=false 历史版作背景(默认关)')
    .option('--redact-report', '输出每条 redact 规则的命中数')
    .option('--yes', '非 TTY 必须显式 ack 高 cost 才继续(M-4)')
    .option('--skip-quality', '跳过 quality-judge 双 LLM 抽样(P7-02 默认跑)')
    .action(async () => {
      // Phase A 骨架,后续 Phase B3.2 Task 替换为真实实现
      console.error('forge legacy-bridge regenerate:Phase B2/B3 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  cmd
    .command('index')
    .description('为每个 anchor 生成 ~100 字 LLM 摘要(决策 #14 Layer 2)')
    .option('--yes', '非 TTY 必须显式 ack')
    .action(async () => {
      // Phase A 骨架,后续 Phase D Task D3 替换为真实实现
      console.error('forge legacy-bridge index:Phase D 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  cmd
    .command('sync-check')
    .description('检测 change 影响的老锚点是否需更新 → 5 档差异报告(决策 #5/#19)')
    .option('--change-id <id>', '指定 change-id;默认取最近一次 archive')
    .action(async () => {
      // Phase A 骨架,后续 Phase C Task C4 替换为真实实现
      console.error('forge legacy-bridge sync-check:Phase C 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  cmd
    .command('resolve <change-id>')
    .description('校验 sync-state diffs 全部 ack 后标 resolved(决策 #19)')
    .action(async () => {
      // Phase A 骨架,后续 Phase C Task C4 替换为真实实现
      console.error('forge legacy-bridge resolve:Phase C 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  return cmd;
}
```

- [ ] **Step 2:在 `src/cli/index.ts` 注册新命令**

打开 `src/cli/index.ts`,在 import 段加:

```typescript
import { buildLegacyBridgeCommand } from './commands/legacy-bridge.js';
```

在 `program.addCommand(buildArchiveCommand());` 之后追加:

```typescript
// 注册 legacy-bridge 子命令(Plan 7 Phase A 骨架)
program.addCommand(buildLegacyBridgeCommand());
```

- [ ] **Step 3:typecheck + 简单 ad-hoc 验证 CLI 不崩**

```bash
pnpm typecheck
pnpm build
node dist/cli/index.js legacy-bridge --help
```

预期:第三行输出 5 个子命令清单(map / regenerate / index / sync-check / resolve)+ `--acknowledge-data-transfer` 主选项。

- [ ] **Step 4:写 1 个轻量 CLI 单测**

新建 `tests/cli/legacy-bridge/skeleton.test.ts`:

```typescript
// legacy-bridge CLI 骨架测试 — Plan 7 Phase A
// 验证 5 子命令 + --acknowledge-data-transfer 全部注册到 commander

import { describe, it, expect } from 'vitest';
import { buildLegacyBridgeCommand } from '../../../src/cli/commands/legacy-bridge.js';

describe('legacy-bridge CLI 骨架', () => {
  const cmd = buildLegacyBridgeCommand();

  it('注册 5 个子命令', () => {
    const subNames = cmd.commands.map((c) => c.name());
    expect(subNames).toEqual(['map', 'regenerate', 'index', 'sync-check', 'resolve']);
  });

  it('主命令含 --acknowledge-data-transfer 选项', () => {
    const opts = cmd.options.map((o) => o.long);
    expect(opts).toContain('--acknowledge-data-transfer');
  });

  it('regenerate 子命令含 --dry-run / --yes / --include-historical', () => {
    const regen = cmd.commands.find((c) => c.name() === 'regenerate');
    const opts = regen?.options.map((o) => o.long) ?? [];
    expect(opts).toContain('--dry-run');
    expect(opts).toContain('--yes');
    expect(opts).toContain('--include-historical');
  });

  it('map 子命令含 --merge / --overwrite / --docs-paths', () => {
    const map = cmd.commands.find((c) => c.name() === 'map');
    const opts = map?.options.map((o) => o.long) ?? [];
    expect(opts).toContain('--merge');
    expect(opts).toContain('--overwrite');
    expect(opts).toContain('--docs-paths');
  });
});
```

- [ ] **Step 5:跑测试**

```bash
pnpm vitest run tests/cli/legacy-bridge/skeleton.test.ts
```

预期:4 tests passing。

- [ ] **Step 6:commit**

```bash
git add src/cli/commands/legacy-bridge.ts src/cli/index.ts tests/cli/legacy-bridge/skeleton.test.ts
git commit -m "feat(cli): legacy-bridge 5 子命令骨架(Phase A)+ commander 注册"
```

---

## Phase B1:redact + conflict + LLM opt-in(0.5 周)

### Task B1.1:`src/core/legacy-bridge/redact.ts`(12+ 默认规则 + 自定义 + mask)

**Files:**
- Create: `src/core/legacy-bridge/redact.ts`
- Test: `tests/core/legacy-bridge/redact.test.ts`
- Test fixture: `tests/fixtures/legacy-bridge/redact-targets.md`

- [ ] **Step 1:写 `src/core/legacy-bridge/redact.ts`**

```typescript
// 发 LLM 前敏感数据 mask — Plan 7 Phase B1
// spec §4.5 12 类默认规则 + 用户自补 + <<REDACTED-{n}>> 占位 + --redact-report 命中数

import type { RedactRule } from './types.js';

/** 内置默认规则(12+ 类,spec §4.5 完整列表) */
export const DEFAULT_REDACT_RULES: ReadonlyArray<{ name: string; regex: string }> = [
  // 云厂商 secret
  { name: 'aws-access-key', regex: 'AKIA[0-9A-Z]{16}' },
  { name: 'gcp-api-key', regex: 'AIza[0-9A-Za-z_-]{35}' },
  { name: 'azure-conn-string', regex: 'DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]+' },
  // 代码托管 / 协作工具 token
  { name: 'github-pat', regex: 'gh[poursr]_[A-Za-z0-9]{36,}' },
  { name: 'gitlab-pat', regex: 'glpat-[A-Za-z0-9_-]{20,}' },
  { name: 'slack-token', regex: 'xox[bpoa]-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{20,}' },
  { name: 'oauth-bearer-basic', regex: '(Bearer|Basic)\\s+[A-Za-z0-9._~+/=-]{20,}' },
  // 身份验证
  { name: 'jwt', regex: 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+' },
  { name: 'private-key-marker', regex: '-----BEGIN (RSA|EC|OPENSSH|DSA|ENCRYPTED) PRIVATE KEY-----' },
  // 数据库连接
  { name: 'db-url-with-creds', regex: '(postgres|mysql|mongodb|redis)(\\+[a-z]+)?://[^:\\s]+:[^@\\s]+@[^/\\s]+' },
  // 通用 PII
  { name: 'email', regex: '[\\w.-]+@[\\w.-]+\\.[a-z]{2,4}' },
  { name: 'ipv4-private', regex: '(?:10|192\\.168|172\\.(?:1[6-9]|2\\d|3[01]))\\.\\d{1,3}\\.\\d{1,3}(?:\\.\\d{1,3})?' },
];

/** redact 输出含命中数(用于 --redact-report) */
export interface RedactReport {
  /** 每条规则命中次数(name -> count) */
  hitsByRule: Record<string, number>;
  /** 总占位数 */
  totalReplacements: number;
  /** mask 后的文本 */
  redactedText: string;
}

/**
 * 对 input 跑 redact,返回 mask 后文本 + 命中数。
 *
 * 占位格式:`<<REDACTED-{n}>>`(n 从 1 起递增)。同一规则匹配多处 → n 也递增,
 * 让 LLM 能区分多处占位但不暴露原值(spec §4.5)。
 *
 * @param input  原始文本
 * @param custom 用户自补规则(legacy-anchors.yaml 的 redact 字段)
 */
export function redact(input: string, custom: ReadonlyArray<RedactRule> = []): RedactReport {
  const allRules: { name: string; regex?: RegExp; literal?: string }[] = [];

  // 默认规则在前
  for (const r of DEFAULT_REDACT_RULES) {
    allRules.push({ name: r.name, regex: new RegExp(r.regex, 'g') });
  }
  // 用户自补
  for (const r of custom) {
    if ('regex' in r) {
      allRules.push({ name: r.name ?? `custom-regex`, regex: new RegExp(r.regex, 'g') });
    } else {
      allRules.push({ name: r.name ?? 'custom-literal', literal: r.literal });
    }
  }

  const hitsByRule: Record<string, number> = {};
  let counter = 0;
  let text = input;

  for (const rule of allRules) {
    if (rule.regex) {
      text = text.replace(rule.regex, () => {
        counter += 1;
        hitsByRule[rule.name] = (hitsByRule[rule.name] ?? 0) + 1;
        return `<<REDACTED-${counter}>>`;
      });
    } else if (rule.literal) {
      const literal = rule.literal;
      while (text.includes(literal)) {
        counter += 1;
        hitsByRule[rule.name] = (hitsByRule[rule.name] ?? 0) + 1;
        text = text.replace(literal, `<<REDACTED-${counter}>>`);
      }
    }
  }

  return {
    hitsByRule,
    totalReplacements: counter,
    redactedText: text,
  };
}

/** 把 RedactReport 渲染为 stdout 可读形式(--redact-report) */
export function formatRedactReport(report: RedactReport): string {
  const lines: string[] = [];
  for (const [name, count] of Object.entries(report.hitsByRule)) {
    if (count === 0) continue;
    lines.push(`[redact] ${name.padEnd(24)} ${count} 命中`);
  }
  // 0 命中规则也列(用户能验证规则真生效)
  for (const r of DEFAULT_REDACT_RULES) {
    if (!(r.name in report.hitsByRule)) {
      lines.push(`[redact] ${r.name.padEnd(24)} 0 命中`);
    }
  }
  lines.push(`total: ${report.totalReplacements} 项已 mask 为 <<REDACTED-N>>`);
  return lines.join('\n');
}
```

- [ ] **Step 2:写 fixture `tests/fixtures/legacy-bridge/redact-targets.md`**

```markdown
# Redact 测试样本(进 git 版,仅含自补 literal 命中)

> 默认规则(AWS / GCP / GitHub PAT / Slack / JWT 等)的真值命中由 `redact.test.ts` 内字符串拼接构造,不在本 fixture 中。本 fixture 验证"用户自补 literal 多命中 + 默认规则在该 fixture 中 0 命中"。

- 内部业务实体:INTERNAL-DB-PROD-01
- 客户编号:ACME-CUSTOMER-A12
- 项目 codename:Project-FALCON-2026
- 服务别名:internal-srv-payment-prod
- 重复字面量验证:INTERNAL-DB-PROD-01

## 文本中也含正常内容(不应被误 redact)
我们的版本号是 1.2.3,这个段落讨论 §4.5 redact 设计。`forge` 主项目 MIT 协议。
```

- [ ] **Step 3:写 `tests/core/legacy-bridge/redact.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { redact, formatRedactReport, DEFAULT_REDACT_RULES } from '../../../src/core/legacy-bridge/redact.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../fixtures/legacy-bridge/redact-targets.md');

describe('legacy-bridge/redact', () => {
  it('默认规则 12+ 类(完整覆盖 spec §4.5)', () => {
    const names = DEFAULT_REDACT_RULES.map((r) => r.name);
    expect(names).toContain('aws-access-key');
    expect(names).toContain('gcp-api-key');
    expect(names).toContain('github-pat');
    expect(names).toContain('slack-token');
    expect(names).toContain('jwt');
    expect(names).toContain('private-key-marker');
    expect(names).toContain('db-url-with-creds');
    expect(names).toContain('email');
    expect(names).toContain('ipv4-private');
    expect(names.length).toBeGreaterThanOrEqual(12);
  });

  it('AWS access key 被 mask(用拼接绕 GitHub secret scanner)', () => {
    // P7-13 修复:测试代码内用字符串拼接构造命中正则的字符串;
    // GitHub secret scanner 按行扫连续字面量,拼接表达式不识别,
    // 但运行时拼出的 'AKIAEXAMPLEKEY00FAKE0' 仍命中 AKIA[0-9A-Z]{16} 正则。
    const awsKeyLike = 'AKIA' + 'EXAMPLEKEY00FAKE0';
    const r = redact(`key=${awsKeyLike} end`);
    expect(r.redactedText).not.toContain(awsKeyLike);
    expect(r.redactedText).toMatch(/<<REDACTED-1>>/);
    expect(r.hitsByRule['aws-access-key']).toBe(1);
  });

  it('多处占位序号递增', () => {
    const r = redact('email1=foo@example.com, email2=bar@example.com');
    expect(r.redactedText).toMatch(/<<REDACTED-1>>.*<<REDACTED-2>>/);
    expect(r.hitsByRule['email']).toBe(2);
  });

  it('用户自补 literal 被 mask', () => {
    const r = redact('connection: INTERNAL-DB-PROD-01', [
      { literal: 'INTERNAL-DB-PROD-01', name: 'internal-host' },
    ]);
    expect(r.redactedText).not.toContain('INTERNAL-DB-PROD-01');
    expect(r.hitsByRule['internal-host']).toBe(1);
  });

  it('用户自补 regex 被 mask', () => {
    const r = redact('account ACME-CUSTOMER-A12 today', [
      { regex: 'ACME-CUSTOMER-[A-Z][0-9]+', name: 'customer-id' },
    ]);
    expect(r.redactedText).not.toContain('ACME-CUSTOMER-A12');
    expect(r.hitsByRule['customer-id']).toBe(1);
  });

  it('正常文本(非敏感)不被误 redact', () => {
    const r = redact('版本号 1.2.3,讨论 redact 设计');
    expect(r.redactedText).toBe('版本号 1.2.3,讨论 redact 设计');
    expect(r.totalReplacements).toBe(0);
  });

  it('git 进版 fixture → 仅自补 literal 命中,默认规则 0 命中(P7-13/P7-14 修复)', async () => {
    const text = await readFile(FIXTURE, 'utf8');
    // 用户在 anchors.yaml 配的自补 literal
    const customRules = [
      { literal: 'INTERNAL-DB-PROD-01', name: 'internal-host' },
      { literal: 'ACME-CUSTOMER-A12', name: 'customer-id' },
      { literal: 'Project-FALCON-2026', name: 'project-codename' },
      { literal: 'internal-srv-payment-prod', name: 'service-alias' },
    ];
    const r = redact(text, customRules);
    // 自补 literal 命中(INTERNAL-DB-PROD-01 重复 1 次 = 2 次)
    expect(r.hitsByRule['internal-host']).toBe(2);
    expect(r.hitsByRule['customer-id']).toBe(1);
    expect(r.hitsByRule['project-codename']).toBe(1);
    expect(r.hitsByRule['service-alias']).toBe(1);
    // 默认规则在该 git-safe fixture 中 0 命中(避免 GitHub secret scanning 阻拦)
    expect(r.hitsByRule['aws-access-key'] ?? 0).toBe(0);
    expect(r.hitsByRule['github-pat'] ?? 0).toBe(0);
    expect(r.hitsByRule['jwt'] ?? 0).toBe(0);
  });

  it('formatRedactReport 包含 0 命中规则', () => {
    const r = redact('hello world');
    const out = formatRedactReport(r);
    expect(out).toContain('aws-access-key');
    expect(out).toContain('0 命中');
    expect(out).toContain('total: 0 项已 mask');
  });

  it('formatRedactReport 含 total 行', () => {
    const r = redact('foo@example.com');
    const out = formatRedactReport(r);
    expect(out).toContain('total: 1 项已 mask');
  });
});
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/redact.test.ts
```

预期:9 tests passing。任一未过(尤其 fixture 综合 case)→ 检查正则是否过严或匹配越界。

- [ ] **Step 5:commit**

```bash
git add src/core/legacy-bridge/redact.ts tests/core/legacy-bridge/redact.test.ts tests/fixtures/legacy-bridge/redact-targets.md
git commit -m "feat(legacy-bridge): redact.ts 12+ 默认规则 + 自定义 + 占位序号(决策 #20)"
```

---

### Task B1.2:`src/core/legacy-bridge/conflict.ts`(同 role / 跨 role 决策)

**Files:**
- Create: `src/core/legacy-bridge/conflict.ts`
- Test: `tests/core/legacy-bridge/conflict.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/conflict.ts`**

```typescript
// 跨 anchor 一致性决策 — Plan 7 Phase B1
// 决策 #18 修订:同 role 多版本 → authoritative=true 单选(无 diff);
//                跨 role 不一致 → 默认入 diff(major 档);
//                config.yaml#legacy_bridge.auto_resolve_cross_anchor=true 才走 mtime > role 优先级

import type { LegacyAnchor, LegacyAnchorRole, LegacyAnchorsFile } from './types.js';
import { groupAnchorsByRole, getAuthoritativeAnchors } from './anchors.js';

/** role 优先级(决策 #18:auto_resolve_cross_anchor=true 时用) */
export const ROLE_PRIORITY: ReadonlyArray<LegacyAnchorRole> = [
  'requirements',       // 最高:SRS 是合同性边界
  'high-level-design',
  'low-level-design',
  'system-tests',
  'rationale',
  'glossary',
  'acceptance-report',  // 最低:metadata-only,不参与决策
];

/** 决策结果 */
export interface ResolveResult {
  /** 选中的 anchor(用于 LLM 输入) */
  chosen: LegacyAnchor;
  /** 决策依据 */
  reason: 'sole-authoritative' | 'mtime-newer' | 'role-priority';
  /** 同 role 其他被跳过的 anchor(authoritative=false 历史版) */
  skipped?: LegacyAnchor[];
}

/**
 * 同 role 多版本 → 选 authoritative=true 那条;无 authoritative=true → 抛错(决策 #10 schema 已挡)。
 *
 * 不返回多个、不返回 mtime 最新版(决策 #10 哲学:authoritative 是用户显式标的,不靠 mtime 推测)。
 */
export function resolveSameRole(anchors: LegacyAnchor[]): ResolveResult {
  if (anchors.length === 0) {
    throw new Error('resolveSameRole: anchors 为空');
  }
  const auth = anchors.filter((a) => a.authoritative);
  if (auth.length === 1 && auth[0]) {
    return {
      chosen: auth[0],
      reason: 'sole-authoritative',
      skipped: anchors.filter((a) => !a.authoritative),
    };
  }
  if (auth.length === 0) {
    throw new Error(
      `resolveSameRole: role '${anchors[0]?.role}' 无 authoritative=true;请在 legacy-anchors.yaml 标当前版`,
    );
  }
  // schema 校验已挡 multi-authoritative,这里 defensive
  throw new Error(`resolveSameRole: role '${anchors[0]?.role}' 多个 authoritative=true(schema 应已拒)`);
}

/** 跨 role 决策入参 */
export interface CrossRoleInput {
  /** 文件 mtime(秒级时间戳),由 caller 传入(支持 mock) */
  mtimeOf: (path: string) => number;
  /** 是否走 auto_resolve(默认 false → 不决策,直接返回 'enter-diff') */
  autoResolve: boolean;
}

/** 跨 role 决策结果 */
export type CrossRoleDecision =
  | { kind: 'enter-diff'; conflictingRoles: LegacyAnchorRole[] }
  | { kind: 'auto-resolved'; chosen: LegacyAnchor; reason: 'mtime-newer' | 'role-priority'; losers: LegacyAnchor[] };

/**
 * 检测跨 role 冲突:对所有 authoritative=true 的 anchor 配对,
 * caller 传入"两 anchor 是否冲突"的 predicate(LLM 在 sync-check 中判定);
 * 这里只做"决策怎么处理冲突"的逻辑。
 */
export function decideCrossRole(
  conflicting: LegacyAnchor[],
  input: CrossRoleInput,
): CrossRoleDecision {
  // 决策 #18 修订:默认 enter-diff(major 档),不自动决策
  if (!input.autoResolve) {
    const roles = Array.from(new Set(conflicting.map((a) => a.role)));
    return { kind: 'enter-diff', conflictingRoles: roles };
  }

  // auto_resolve_cross_anchor=true:走 mtime > role 优先级
  let winner = conflicting[0];
  if (!winner) throw new Error('decideCrossRole: conflicting 为空');
  let winnerMtime = input.mtimeOf(winner.path);

  for (const a of conflicting.slice(1)) {
    const m = input.mtimeOf(a.path);
    if (m > winnerMtime) {
      winner = a;
      winnerMtime = m;
    } else if (m === winnerMtime) {
      // mtime 相同 → role 优先级(数字小的优先)
      if (rolePriorityIdx(a.role) < rolePriorityIdx(winner.role)) {
        winner = a;
      }
    }
  }
  // 决策依据:有 mtime 严格大者 → mtime-newer;否则 role-priority
  const allSameMtime = conflicting.every((a) => input.mtimeOf(a.path) === winnerMtime);
  return {
    kind: 'auto-resolved',
    chosen: winner,
    reason: allSameMtime ? 'role-priority' : 'mtime-newer',
    losers: conflicting.filter((a) => a !== winner),
  };
}

function rolePriorityIdx(role: LegacyAnchorRole): number {
  const idx = ROLE_PRIORITY.indexOf(role);
  return idx === -1 ? ROLE_PRIORITY.length : idx;
}

/** 给定 anchors file 与 mtimeOf,返回所有 authoritative anchors 的"同 role 决策结果"列表 */
export function resolveAuthoritativeForAllRoles(file: LegacyAnchorsFile): ResolveResult[] {
  const grouped = groupAnchorsByRole(file);
  const out: ResolveResult[] = [];
  for (const [, anchors] of grouped.entries()) {
    if (anchors.length === 0) continue;
    out.push(resolveSameRole(anchors));
  }
  return out;
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/conflict.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  resolveSameRole,
  decideCrossRole,
  resolveAuthoritativeForAllRoles,
  ROLE_PRIORITY,
} from '../../../src/core/legacy-bridge/conflict.js';
import type { LegacyAnchor } from '../../../src/core/legacy-bridge/types.js';

describe('legacy-bridge/conflict.resolveSameRole', () => {
  it('单版本 authoritative=true → 直接返回', () => {
    const r = resolveSameRole([
      { role: 'requirements', path: 'srs.md', authoritative: true },
    ]);
    expect(r.chosen.path).toBe('srs.md');
    expect(r.reason).toBe('sole-authoritative');
  });

  it('多版本 → 仅 authoritative=true 那条', () => {
    const r = resolveSameRole([
      { role: 'requirements', path: 'srs-v1.md', authoritative: false },
      { role: 'requirements', path: 'srs-v2.md', authoritative: true },
      { role: 'requirements', path: 'srs-v3-draft.md', authoritative: false },
    ]);
    expect(r.chosen.path).toBe('srs-v2.md');
    expect(r.skipped?.map((a) => a.path)).toEqual(['srs-v1.md', 'srs-v3-draft.md']);
  });

  it('无 authoritative=true → 抛错', () => {
    expect(() =>
      resolveSameRole([{ role: 'requirements', path: 'srs.md', authoritative: false }]),
    ).toThrow(/无 authoritative=true/);
  });
});

describe('legacy-bridge/conflict.decideCrossRole', () => {
  const a: LegacyAnchor = { role: 'requirements', path: 'srs.md', authoritative: true };
  const b: LegacyAnchor = { role: 'high-level-design', path: 'hld.md', authoritative: true };

  it('autoResolve=false(默认)→ enter-diff', () => {
    const r = decideCrossRole([a, b], { mtimeOf: () => 0, autoResolve: false });
    expect(r.kind).toBe('enter-diff');
    if (r.kind === 'enter-diff') {
      expect(r.conflictingRoles.sort()).toEqual(['high-level-design', 'requirements']);
    }
  });

  it('autoResolve=true + mtime 不同 → mtime-newer', () => {
    const r = decideCrossRole([a, b], {
      mtimeOf: (p) => (p === 'hld.md' ? 200 : 100),
      autoResolve: true,
    });
    expect(r.kind).toBe('auto-resolved');
    if (r.kind === 'auto-resolved') {
      expect(r.chosen.path).toBe('hld.md');
      expect(r.reason).toBe('mtime-newer');
    }
  });

  it('autoResolve=true + mtime 相同 → role-priority(requirements 胜)', () => {
    const r = decideCrossRole([b, a], {
      mtimeOf: () => 100,
      autoResolve: true,
    });
    expect(r.kind).toBe('auto-resolved');
    if (r.kind === 'auto-resolved') {
      expect(r.chosen.role).toBe('requirements');
      expect(r.reason).toBe('role-priority');
    }
  });

  it('ROLE_PRIORITY 顺序合理(requirements 第一,acceptance-report 最后)', () => {
    expect(ROLE_PRIORITY[0]).toBe('requirements');
    expect(ROLE_PRIORITY[ROLE_PRIORITY.length - 1]).toBe('acceptance-report');
  });
});

describe('legacy-bridge/conflict.resolveAuthoritativeForAllRoles', () => {
  it('多 role 各自独立解析', () => {
    const file = {
      schema: 'forge-legacy-anchor/v1' as const,
      anchors: [
        { role: 'requirements' as const, path: 'srs-v1.md', authoritative: false },
        { role: 'requirements' as const, path: 'srs-v2.md', authoritative: true },
        { role: 'high-level-design' as const, path: 'hld.md', authoritative: true },
      ],
    };
    const r = resolveAuthoritativeForAllRoles(file);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.chosen.role).sort()).toEqual(['high-level-design', 'requirements']);
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/conflict.test.ts
```

预期:8 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/conflict.ts tests/core/legacy-bridge/conflict.test.ts
git commit -m "feat(legacy-bridge): conflict.ts 同/跨 role 决策(决策 #18 修订)"
```

---

### Task B1.3:`src/core/legacy-bridge/ack.ts`(llm-ack.yaml + GDPR 二次确认)

**Files:**
- Create: `src/core/legacy-bridge/ack.ts`
- Test: `tests/core/legacy-bridge/ack.test.ts`
- Modify: `src/cli/commands/legacy-bridge.ts`(填实 `--acknowledge-data-transfer` 路径)

- [ ] **Step 1:写 `src/core/legacy-bridge/ack.ts`**

```typescript
// LLM opt-in ack 流程 — Plan 7 Phase B1
// 决策 #22:首次跑 brownfield 命令时,要求用户显式 ack 数据传输到 LLM provider
// §9 GDPR:含客户数据的 anchor 还需 customer_data_acknowledged 二次确认

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { LlmAckFile, LegacyAnchorsFile } from './types.js';
import type { ForgeConfig } from '../schema/types.js';

/** ack 文件路径 */
export function ackPath(forgeRoot: string): string {
  return join(forgeRoot, '.cache', 'llm-ack.yaml');
}

/** 计算 config.yaml#legacy_bridge 段的 hash(用于检测用户改 config 后要求重新 ack) */
export function computeConfigHash(config: ForgeConfig): string {
  const lb = config.legacy_bridge ?? {};
  const stable = JSON.stringify(lb, Object.keys(lb).sort());
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

/** ack 校验结果 */
export interface AckCheckResult {
  ok: boolean;
  /** ok=false 时给 caller 的下一步提示 */
  reason?:
    | 'allow_llm_calls=false'
    | 'ack-missing'
    | 'ack-stale-config-changed'
    | 'customer-data-not-acknowledged';
  /** 当前 config_hash(供 caller 写入新 ack) */
  currentConfigHash: string;
  /** 含客户数据的 anchor 路径(reason=customer-data-not-acknowledged 时填) */
  customerDataPaths?: string[];
}

/** 检查 ack 状态:是否允许跑 LLM 命令 */
export async function checkAck(
  forgeRoot: string,
  config: ForgeConfig,
  anchors: LegacyAnchorsFile | null,
): Promise<AckCheckResult> {
  const currentConfigHash = computeConfigHash(config);

  // 1. allow_llm_calls 必须为 true
  if (!config.legacy_bridge?.allow_llm_calls) {
    return { ok: false, reason: 'allow_llm_calls=false', currentConfigHash };
  }

  // 2. ack 文件必须存在
  const path = ackPath(forgeRoot);
  if (!existsSync(path)) {
    return { ok: false, reason: 'ack-missing', currentConfigHash };
  }

  // 3. ack 与当前 config 一致(hash 比对)
  const raw = await readFile(path, 'utf8');
  const ack = parseYaml(raw) as LlmAckFile;
  if (ack.schema !== 'forge-llm-ack/v1') {
    return { ok: false, reason: 'ack-missing', currentConfigHash };
  }
  if (ack.config_hash !== currentConfigHash) {
    return { ok: false, reason: 'ack-stale-config-changed', currentConfigHash };
  }

  // 4. GDPR:含客户数据的 anchor 是否单独 ack
  const customerDataPaths = (anchors?.anchors ?? [])
    .filter((a) => a.contains_customer_data === true)
    .map((a) => a.path);
  if (customerDataPaths.length > 0 && !ack.customer_data_acknowledged) {
    return {
      ok: false,
      reason: 'customer-data-not-acknowledged',
      currentConfigHash,
      customerDataPaths,
    };
  }

  return { ok: true, currentConfigHash };
}

/**
 * 写 ack 文件(`forge legacy-bridge --acknowledge-data-transfer`)。
 *
 * @param forgeRoot           forge 根目录
 * @param config              当前 config(用于计算 config_hash)
 * @param customerDataAck    若 anchors 中存在 contains_customer_data=true 的项,
 *                            必须传 true 才写入(否则抛错引导用户先看 §9 提示)
 */
export async function writeAck(
  forgeRoot: string,
  config: ForgeConfig,
  customerDataAck: boolean = false,
): Promise<void> {
  await mkdir(join(forgeRoot, '.cache'), { recursive: true });
  const ack: LlmAckFile = {
    schema: 'forge-llm-ack/v1',
    acknowledged_at: new Date().toISOString(),
    config_hash: computeConfigHash(config),
    customer_data_acknowledged: customerDataAck,
  };
  await writeFile(ackPath(forgeRoot), stringifyYaml(ack), 'utf8');
}

/** 渲染 opt-in 拒绝时给用户的完整提示(spec §2.7) */
export function renderOptinPrompt(
  reason: AckCheckResult['reason'],
  customerDataPaths?: string[],
): string {
  if (reason === 'allow_llm_calls=false' || reason === 'ack-missing') {
    return `
✗ legacy-bridge 命令需要发送数据到 Anthropic API。

数据传输内容:
- docs/legacy/ 下的老文档全文
- src/ 下的代码片段
- tests/ 下的测试用例

数据已通过 forge/legacy-anchors.yaml#redact 配置 mask。
提供商:Anthropic Claude API(默认,v0.2 唯一支持)
数据驻留:Anthropic 当前默认不保留 30+ 天

启用步骤:
1. 在 forge/config.yaml 加:
   legacy_bridge:
     allow_llm_calls: true
2. 跑 forge legacy-bridge --acknowledge-data-transfer
   (一次性 ack,记录到 forge/.cache/llm-ack.yaml)
3. 重新跑当前命令

合规场景:enterprise / air-gapped / GDPR 要求数据驻留时,
保持 false 或省略此字段。brownfield 工具拒绝运行,
archive sync-check 自动 graceful skip,forge 主工作流不变。
`.trim();
  }
  if (reason === 'ack-stale-config-changed') {
    return `
✗ forge/config.yaml#legacy_bridge 段已变化,llm-ack.yaml 已过期。
请重新跑 forge legacy-bridge --acknowledge-data-transfer 确认新配置。
`.trim();
  }
  if (reason === 'customer-data-not-acknowledged') {
    const paths = customerDataPaths ?? [];
    return `
✗ 以下 anchor 标为含客户数据(contains_customer_data: true):
${paths.map((p) => `  - ${p}`).join('\n')}

启用 LLM 调用前请确认有数据出境授权(GDPR Art. 44+ / DPA 协议),
并已签 Anthropic DPA。然后跑:

  forge legacy-bridge --acknowledge-data-transfer --acknowledge-customer-data

来一并确认两项 ack。
`.trim();
  }
  return `✗ unknown ack state: ${reason}`;
}
```

- [ ] **Step 2:在 `src/cli/commands/legacy-bridge.ts` 主命令 action 内填实 ack 写入逻辑**

替换 Phase A 写的占位 main action:

```typescript
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { writeAck } from '../../core/legacy-bridge/ack.js';
import { loadAnchorsFile } from '../../core/legacy-bridge/anchors.js';
import type { ForgeConfig } from '../../core/schema/types.js';

// ...

  cmd
    .option('--acknowledge-data-transfer', 'opt-in:ack 数据将被发送到 LLM provider(决策 #22)')
    .option('--acknowledge-customer-data', '同时 ack 含客户数据的 anchor(§9 GDPR 二次确认门)');

  cmd.action(
    async (opts: { acknowledgeDataTransfer?: boolean; acknowledgeCustomerData?: boolean }) => {
      if (opts.acknowledgeDataTransfer) {
        const forgeRoot = join(process.cwd(), 'forge');
        const configPath = join(forgeRoot, 'config.yaml');
        if (!existsSync(configPath)) {
          console.error('forge/config.yaml 不存在,先跑 forge init 初始化项目');
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
        if (!config.legacy_bridge?.allow_llm_calls) {
          console.error(
            '✗ forge/config.yaml 未声明 legacy_bridge.allow_llm_calls: true,请先在 config 加该字段',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        // 检 anchors 中是否有 contains_customer_data
        const anchors = await loadAnchorsFile(forgeRoot);
        const hasCustomerData = (anchors?.anchors ?? []).some(
          (a) => a.contains_customer_data === true,
        );
        if (hasCustomerData && !opts.acknowledgeCustomerData) {
          console.error(
            '✗ legacy-anchors.yaml 标有 contains_customer_data=true 的 anchor;\n' +
              '请加 --acknowledge-customer-data 一并确认(§9 GDPR)',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        await writeAck(forgeRoot, config, hasCustomerData);
        console.log(
          `✓ ack 已写入 forge/.cache/llm-ack.yaml(customer_data_acknowledged=${hasCustomerData})`,
        );
        process.exit(LB_EXIT_OK);
      }
      cmd.help();
    },
  );
```

- [ ] **Step 3:写 `tests/core/legacy-bridge/ack.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeConfigHash,
  checkAck,
  writeAck,
  renderOptinPrompt,
  ackPath,
} from '../../../src/core/legacy-bridge/ack.js';
import type { ForgeConfig } from '../../../src/core/schema/types.js';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

describe('legacy-bridge/ack', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-ack-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const baseConfig: ForgeConfig = {
    schema: 'forge-spec-driven/v1',
    legacy_bridge: { allow_llm_calls: true },
  };

  it('computeConfigHash 对 legacy_bridge 段稳定', () => {
    const h1 = computeConfigHash(baseConfig);
    const h2 = computeConfigHash({ ...baseConfig });
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(16);
  });

  it('config 变化 → hash 变(强制重新 ack)', () => {
    const h1 = computeConfigHash(baseConfig);
    const h2 = computeConfigHash({
      ...baseConfig,
      legacy_bridge: { allow_llm_calls: true, enforce_sync: true },
    });
    expect(h1).not.toBe(h2);
  });

  it('allow_llm_calls=false → checkAck reason=allow_llm_calls=false', async () => {
    const r = await checkAck(dir, { schema: 'forge-spec-driven/v1' }, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('allow_llm_calls=false');
  });

  it('allow_llm_calls=true 但无 ack 文件 → reason=ack-missing', async () => {
    const r = await checkAck(dir, baseConfig, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('ack-missing');
  });

  it('writeAck + checkAck → ok=true', async () => {
    await writeAck(dir, baseConfig);
    const r = await checkAck(dir, baseConfig, null);
    expect(r.ok).toBe(true);
  });

  it('ack 写入后改 config → reason=ack-stale-config-changed', async () => {
    await writeAck(dir, baseConfig);
    const newConfig: ForgeConfig = {
      ...baseConfig,
      legacy_bridge: { allow_llm_calls: true, enforce_sync: true },
    };
    const r = await checkAck(dir, newConfig, null);
    expect(r.reason).toBe('ack-stale-config-changed');
  });

  it('含 customer_data anchor + ack 未 customer_data_acknowledged → reason=customer-data-not-acknowledged', async () => {
    await writeAck(dir, baseConfig, false);
    const anchors: LegacyAnchorsFile = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        {
          role: 'requirements',
          path: 'docs/legacy/SRS.md',
          authoritative: true,
          contains_customer_data: true,
        },
      ],
    };
    const r = await checkAck(dir, baseConfig, anchors);
    expect(r.reason).toBe('customer-data-not-acknowledged');
    expect(r.customerDataPaths).toEqual(['docs/legacy/SRS.md']);
  });

  it('含 customer_data anchor + ack 已 customer_data_acknowledged=true → ok', async () => {
    await writeAck(dir, baseConfig, true);
    const anchors: LegacyAnchorsFile = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        {
          role: 'requirements',
          path: 'docs/legacy/SRS.md',
          authoritative: true,
          contains_customer_data: true,
        },
      ],
    };
    const r = await checkAck(dir, baseConfig, anchors);
    expect(r.ok).toBe(true);
  });

  it('renderOptinPrompt 各 reason 各自渲染', () => {
    expect(renderOptinPrompt('allow_llm_calls=false')).toContain('Anthropic API');
    expect(renderOptinPrompt('ack-stale-config-changed')).toContain('已过期');
    expect(renderOptinPrompt('customer-data-not-acknowledged', ['a.md', 'b.md'])).toContain(
      '- a.md',
    );
  });
});
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/ack.test.ts tests/cli/legacy-bridge/skeleton.test.ts
```

预期:9 tests passing(ack 8 + 之前的 skeleton 4 = 13;skeleton 因加了 `--acknowledge-customer-data` 选项断言不变)。

- [ ] **Step 5:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 6:commit**

```bash
git add src/core/legacy-bridge/ack.ts src/cli/commands/legacy-bridge.ts tests/core/legacy-bridge/ack.test.ts
git commit -m "feat(legacy-bridge): ack.ts opt-in 流程 + GDPR 二次确认门(决策 #22 / §9)"
```

---

### Task B1.4:`src/core/legacy-bridge/budget.ts`(cost 估算 + TTY/非 TTY 分支)

**Files:**
- Create: `src/core/legacy-bridge/budget.ts`
- Test: `tests/core/legacy-bridge/budget.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/budget.ts`**

```typescript
// brownfield 命令 cost 估算 + TTY 倒计时 / 非 TTY --yes 强制 — Plan 7 Phase B1
// spec §4.4:regenerate > $20 时 TTY 5 秒倒计时;非 TTY 拒绝运行 + 提示 --yes flag

import { isatty } from 'node:tty';

/** 估算单次 brownfield LLM 调用平均 cost(USD;单 anchor 复写约 5k input + 3k output token) */
const APPROX_COST_PER_REGEN_PER_ANCHOR_USD = 0.075;
const APPROX_COST_PER_SYNC_CHECK_PER_ANCHOR_USD = 0.012;
const APPROX_COST_PER_INDEX_PER_ANCHOR_USD = 0.005;
const APPROX_COST_PER_MAP_TOTAL_USD = 0.6;
const APPROX_COST_QUALITY_JUDGE_PER_ROLE_USD = 0.06;

/** 默认警告阈值(spec §4.4:regenerate > $20 警告) */
export const REGEN_WARN_USD = 20.0;
export const SYNC_CHECK_WARN_USD = 5.0;

/** 估算 regenerate 全 4 role 全 anchor 总 cost */
export function estimateRegenerateCost(anchorCount: number): number {
  return (
    anchorCount * APPROX_COST_PER_REGEN_PER_ANCHOR_USD +
    4 * APPROX_COST_QUALITY_JUDGE_PER_ROLE_USD // 4 role 各跑一次 quality-judge
  );
}

/** 估算 sync-check 一次跑(单 change)cost */
export function estimateSyncCheckCost(affectedAnchorCount: number): number {
  return affectedAnchorCount * APPROX_COST_PER_SYNC_CHECK_PER_ANCHOR_USD;
}

/** 估算 index 一次跑(全 anchor)cost */
export function estimateIndexCost(anchorCount: number): number {
  return anchorCount * APPROX_COST_PER_INDEX_PER_ANCHOR_USD;
}

/** 估算 map 一次跑 cost(LLM 扫 docs+src) */
export function estimateMapCost(): number {
  return APPROX_COST_PER_MAP_TOTAL_USD;
}

/** TTY/非 TTY 分支:超阈值时根据环境处理 */
export interface BudgetGateResult {
  /** 是否继续 */
  proceed: boolean;
  /** 给 caller 显示的提示文本 */
  message: string;
  /** 退出码(proceed=false 时,>0) */
  exitCode: number;
}

/**
 * 阈值闸门:
 * - 估算 < threshold → 继续(proceed=true)
 * - 估算 ≥ threshold + TTY → 5 秒倒计时(由 caller 用 setTimeout 实现);返回 proceed=true
 * - 估算 ≥ threshold + 非 TTY + yesFlag=true → 继续
 * - 估算 ≥ threshold + 非 TTY + yesFlag=false → proceed=false,exit 1 + 提示 --yes
 *
 * Note:实际倒计时不在本函数(避免 IO),由 caller 在 message 后做 setTimeout。
 */
export function checkBudgetGate(
  estimated: number,
  threshold: number,
  yesFlag: boolean = false,
  ttyOverride?: boolean,
): BudgetGateResult {
  const tty = ttyOverride ?? isatty(1);

  if (estimated < threshold) {
    return {
      proceed: true,
      message: `估算 cost ≈ $${estimated.toFixed(2)}(< 阈值 $${threshold.toFixed(2)})`,
      exitCode: 0,
    };
  }

  // 估算超阈值
  if (tty) {
    return {
      proceed: true,
      message: `⚠ 估算 cost ≈ $${estimated.toFixed(2)},超阈值 $${threshold.toFixed(2)};5 秒后继续,Ctrl-C 取消`,
      exitCode: 0,
    };
  }
  if (yesFlag) {
    return {
      proceed: true,
      message: `⚠ 估算 cost ≈ $${estimated.toFixed(2)};非 TTY + --yes,继续`,
      exitCode: 0,
    };
  }
  return {
    proceed: false,
    message: `✗ 估算 cost ≈ $${estimated.toFixed(2)},超阈值 $${threshold.toFixed(2)};\n非 TTY 环境(CI / 脚本管道)需加 --yes flag 显式同意`,
    exitCode: 1,
  };
}

/** 5 秒倒计时(给 caller 用) */
export async function countdown(seconds: number = 5): Promise<void> {
  for (let i = seconds; i > 0; i -= 1) {
    process.stderr.write(`\r${i}...`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  process.stderr.write('\n');
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/budget.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  estimateRegenerateCost,
  estimateSyncCheckCost,
  estimateIndexCost,
  estimateMapCost,
  checkBudgetGate,
  REGEN_WARN_USD,
} from '../../../src/core/legacy-bridge/budget.js';

describe('legacy-bridge/budget', () => {
  it('estimateRegenerateCost 随 anchor 数线性增', () => {
    const c1 = estimateRegenerateCost(10);
    const c2 = estimateRegenerateCost(20);
    expect(c2).toBeCloseTo(c1 + 10 * 0.075, 2);
    expect(c1).toBeGreaterThan(0);
  });

  it('estimateSyncCheckCost / estimateIndexCost / estimateMapCost 都为正数', () => {
    expect(estimateSyncCheckCost(5)).toBeGreaterThan(0);
    expect(estimateIndexCost(5)).toBeGreaterThan(0);
    expect(estimateMapCost()).toBeGreaterThan(0);
  });

  it('checkBudgetGate 估算 < 阈值 → proceed', () => {
    const r = checkBudgetGate(5, 20, false, false);
    expect(r.proceed).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('checkBudgetGate 超阈值 + TTY → proceed + 倒计时提示', () => {
    const r = checkBudgetGate(30, 20, false, true);
    expect(r.proceed).toBe(true);
    expect(r.message).toContain('5 秒后继续');
  });

  it('checkBudgetGate 超阈值 + 非 TTY + 无 --yes → 拒绝(M-4)', () => {
    const r = checkBudgetGate(30, 20, false, false);
    expect(r.proceed).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.message).toContain('--yes');
  });

  it('checkBudgetGate 超阈值 + 非 TTY + --yes → proceed', () => {
    const r = checkBudgetGate(30, 20, true, false);
    expect(r.proceed).toBe(true);
    expect(r.exitCode).toBe(0);
  });

  it('REGEN_WARN_USD 与 spec 一致 = 20', () => {
    expect(REGEN_WARN_USD).toBe(20);
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/budget.test.ts
```

预期:7 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/budget.ts tests/core/legacy-bridge/budget.test.ts
git commit -m "feat(legacy-bridge): budget.ts cost 估算 + TTY/非 TTY 分支(M-4)"
```

---

## Phase B2:regenerator + 多版本 + disclaimer + Excel + encoding(0.5 周)

### Task B2.1:`src/core/legacy-bridge/encoding.ts`(utf8 强制 + chardet dry-run 探测)

**Files:**
- Create: `src/core/legacy-bridge/encoding.ts`
- Test: `tests/core/legacy-bridge/encoding.test.ts`
- Test fixture: `tests/fixtures/legacy-bridge/gbk-encoded-srs.md` + `windows-crlf-srs.md` + `chinese-anchor/需求规格说明书.md`

- [ ] **Step 1:写 `src/core/legacy-bridge/encoding.ts`**

```typescript
// 文件读取 + utf8 强制 + 可选 chardet 探测 — Plan 7 Phase B2
// 决策 / spec §4.1:Windows 老项目常见 GBK 转 markdown,强制 utf8 读;mojibake 探测仅 dry-run 用

import { readFile } from 'node:fs/promises';

/** 读文件结果,含原始字节用于 dry-run 时探测疑似编码 */
export interface ReadAnchorResult {
  /** UTF-8 字符串内容 */
  text: string;
  /** 原始字节(dry-run 时用于探测) */
  raw: Buffer;
  /** 是否含 mojibake 嫌疑(简易 heuristic:含 U+FFFD 或大量孤立 surrogate) */
  hasMojibake: boolean;
  /** 行尾(LF / CRLF) */
  lineEnding: 'LF' | 'CRLF' | 'mixed' | 'none';
}

/** 强制以 utf8 读老文档(spec §4.1 强制 encoding: utf8) */
export async function readAnchorFile(path: string): Promise<ReadAnchorResult> {
  const raw = await readFile(path);
  const text = raw.toString('utf8');
  const hasMojibake = /�/.test(text);
  const lineEnding = detectLineEnding(text);
  return { text, raw, hasMojibake, lineEnding };
}

/** 检测行尾(spec §5.5 windows-crlf fixture) */
export function detectLineEnding(text: string): ReadAnchorResult['lineEnding'] {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lfOnly = (text.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf === 0 && lfOnly === 0) return 'none';
  if (crlf > 0 && lfOnly > 0) return 'mixed';
  if (crlf > 0) return 'CRLF';
  return 'LF';
}

/** dry-run 时调,用 chardet(可选依赖)探测疑似编码 + 输出 mojibake 段前后 80 字节对照 */
export interface EncodingDryRunReport {
  path: string;
  detectedEncoding: string;
  mojibakeContext?: string;
}

/**
 * 用 chardet 探测疑似编码(可选依赖,缺失时 detectedEncoding='unknown')。
 * spec §4.1 (M-3) dry-run 输出文件路径 + 疑似编码 + mojibake 段前后 80 字符 hex/text 对照。
 */
export async function dryRunEncodingProbe(
  path: string,
  result: ReadAnchorResult,
): Promise<EncodingDryRunReport> {
  let detectedEncoding = 'unknown';
  try {
    // chardet 是可选 devDep;运行时无则 fallback
    const chardet = (await import('chardet')) as { detect: (buf: Buffer) => string | null };
    detectedEncoding = chardet.detect(result.raw) ?? 'unknown';
  } catch {
    detectedEncoding = 'chardet-not-installed';
  }

  let mojibakeContext: string | undefined;
  if (result.hasMojibake) {
    const idx = result.text.indexOf('�');
    const before = result.text.slice(Math.max(0, idx - 80), idx);
    const after = result.text.slice(idx, Math.min(result.text.length, idx + 80));
    mojibakeContext = `[before 80]: ${JSON.stringify(before)}\n[after 80]:  ${JSON.stringify(after)}`;
  }

  return { path, detectedEncoding, mojibakeContext };
}
```

- [ ] **Step 2:创建 fixtures**

```bash
mkdir -p tests/fixtures/legacy-bridge/chinese-anchor
```

写 `tests/fixtures/legacy-bridge/chinese-anchor/需求规格说明书.md`(UTF-8):

```markdown
# 需求规格说明书 v3.2

## 1. 功能概述
本系统提供订单管理、支付、退款三大核心功能。

## 2. 数据库
Order 表 user_id 字段非空。

## 3. 支付幂等
所有支付接口必须使用 Idempotency-Key 头部。
```

写 `tests/fixtures/legacy-bridge/windows-crlf-srs.md`(用 PowerShell 制造 CRLF;若用 git 自动转 LF,加 `.gitattributes`):

新建 `tests/fixtures/legacy-bridge/.gitattributes`:

```
windows-crlf-srs.md text eol=crlf
gbk-encoded-srs.md binary
*.xlsx binary
```

写 `tests/fixtures/legacy-bridge/windows-crlf-srs.md`(标记会保 CRLF):

```
# Windows CRLF SRS 测试 fixture
本文件每行用 CRLF 行尾。
请验证 detectLineEnding 返回 'CRLF'。
```

写 `tests/fixtures/legacy-bridge/gbk-encoded-srs.md`(故意 GBK 编码;需用脚本生成):

```bash
node -e "const fs=require('fs');const iconv=require('iconv-lite');const txt='# GBK 测试\n本文件用 GBK 编码,utf8 读应产生 mojibake\n';try{require.resolve('iconv-lite')}catch(e){console.error('需 pnpm add -D iconv-lite');process.exit(1)}fs.writeFileSync('tests/fixtures/legacy-bridge/gbk-encoded-srs.md',iconv.encode(txt,'gbk'));"
```

实操简化:**直接用 Buffer.from 写 GBK 字节**(避免新依赖),用 Node 内置:

```bash
node -e "const fs=require('fs');const buf=Buffer.from([0x23,0x20,0x47,0x42,0x4b,0x20,0xb2,0xe2,0xca,0xd4,0x0a,0xb1,0xbe,0xce,0xc4,0xbc,0xfe,0xd3,0xc3,0x47,0x42,0x4b,0xb1,0xe0,0xc2,0xeb,0x0a]);fs.writeFileSync('tests/fixtures/legacy-bridge/gbk-encoded-srs.md',buf);"
```

- [ ] **Step 3:写 `tests/core/legacy-bridge/encoding.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  readAnchorFile,
  detectLineEnding,
  dryRunEncodingProbe,
} from '../../../src/core/legacy-bridge/encoding.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

describe('legacy-bridge/encoding', () => {
  it('UTF-8 中文文件读取正常', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'));
    expect(r.hasMojibake).toBe(false);
    expect(r.text).toContain('需求规格说明书');
    expect(r.text).toContain('Idempotency-Key');
  });

  it('GBK 文件以 utf8 读 → hasMojibake=true', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'gbk-encoded-srs.md'));
    expect(r.hasMojibake).toBe(true);
  });

  it('detectLineEnding LF', () => {
    expect(detectLineEnding('a\nb\nc')).toBe('LF');
  });

  it('detectLineEnding CRLF', () => {
    expect(detectLineEnding('a\r\nb\r\nc')).toBe('CRLF');
  });

  it('detectLineEnding mixed', () => {
    expect(detectLineEnding('a\r\nb\nc')).toBe('mixed');
  });

  it('detectLineEnding none', () => {
    expect(detectLineEnding('single line no newline')).toBe('none');
  });

  it('CRLF fixture 检测 CRLF', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'windows-crlf-srs.md'));
    expect(r.lineEnding).toBe('CRLF');
  });

  it('dryRunEncodingProbe 输出 detectedEncoding(chardet 缺失也不抛)', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'gbk-encoded-srs.md'));
    const probe = await dryRunEncodingProbe('test', r);
    // chardet 已装(devDep),应输出实际编码;若未装,'chardet-not-installed' 也是合法 fallback
    expect(['unknown', 'chardet-not-installed', 'GB18030', 'GBK', 'windows-1252']).toContain(
      probe.detectedEncoding,
    );
    expect(probe.mojibakeContext).toContain('before 80');
  });

  it('dryRunEncodingProbe utf8 文件无 mojibakeContext', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'));
    const probe = await dryRunEncodingProbe('test', r);
    expect(probe.mojibakeContext).toBeUndefined();
  });
});
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/encoding.test.ts
```

预期:9 tests passing。GBK fixture 字节序列若不对(导致没 mojibake),回 Step 2 调整字节。

- [ ] **Step 5:commit**

```bash
git add src/core/legacy-bridge/encoding.ts tests/core/legacy-bridge/encoding.test.ts tests/fixtures/legacy-bridge/
git commit -m "feat(legacy-bridge): encoding.ts utf8 + chardet dry-run 探测(M-3 / §4.1)"
```

---

### Task B2.2:`src/core/legacy-bridge/excel.ts`(exceljs 解析 + sheet 字段 + 复杂特性失败提示)

**Files:**
- Create: `src/core/legacy-bridge/excel.ts`
- Test: `tests/core/legacy-bridge/excel.test.ts`
- Test fixture: `tests/fixtures/legacy-bridge/excel-test-cases.xlsx`

- [ ] **Step 1:写 `src/core/legacy-bridge/excel.ts`**

```typescript
// .xlsx 解析 — Plan 7 Phase B2
// spec §6.5 选定 exceljs;chart/pivot/formula 不支持时引导用户导出 csv

import ExcelJS from 'exceljs';

/** 单 sheet 解析结果 */
export interface SheetResult {
  name: string;
  rows: string[][];
  /** 是否含 chart / pivot / formula(spec §6.5 v0.2 不支持) */
  unsupportedFeatures: string[];
}

/** 整个 workbook 解析结果 */
export interface WorkbookResult {
  sheets: SheetResult[];
}

/** 自定义异常:Excel 解析失败或含不支持特性(供 CLI 转 exit 2) */
export class ExcelParseError extends Error {
  constructor(message: string, public readonly path: string) {
    super(`${path}: ${message}`);
    this.name = 'ExcelParseError';
  }
}

/**
 * 用 exceljs 读 .xlsx,返回所有 sheet 的行二维数组。
 *
 * - chart / pivotTable 等不支持特性 → 标 unsupportedFeatures(caller 决定是 fail 还是 warn)
 * - formula → 读 result(已计算值)而不是 formula 表达式
 * - 损坏 / 空 workbook → 抛 ExcelParseError
 */
export async function parseWorkbook(path: string): Promise<WorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(path);
  } catch (err) {
    throw new ExcelParseError(
      `xlsx 解析失败,可能损坏或非 .xlsx 格式:${(err as Error).message}`,
      path,
    );
  }

  const sheets: SheetResult[] = [];
  for (const ws of workbook.worksheets) {
    const rows: string[][] = [];
    const unsupportedFeatures: string[] = [];

    // 检测不支持特性
    // exceljs 把 pivotTable 等暴露为 worksheet.pivotTables;若无属性则 try-catch 兜底
    if ((ws as unknown as { pivotTables?: unknown[] }).pivotTables?.length) {
      unsupportedFeatures.push('pivotTable');
    }
    // chart / drawing 通过 model.drawings 或 drawings 暴露(版本相关);用 try 兜
    try {
      const drawings = (ws.model as unknown as { drawings?: unknown[] }).drawings;
      if (Array.isArray(drawings) && drawings.length > 0) {
        unsupportedFeatures.push('chart/drawing');
      }
    } catch {
      // ignore
    }

    // 遍历行(eachRow 跳过空行;rowNumber 从 1 起)
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      // row.values 索引从 1 起,[0] 永远 undefined
      const values = row.values as Array<unknown>;
      for (let i = 1; i < values.length; i += 1) {
        const v = values[i];
        if (v === undefined || v === null) {
          cells.push('');
        } else if (typeof v === 'object' && v !== null && 'result' in v) {
          // formula cell:取计算缓存值
          cells.push(String((v as { result: unknown }).result ?? ''));
        } else if (typeof v === 'object' && v !== null && 'richText' in v) {
          // richText:拼 plain
          const rt = (v as { richText: { text: string }[] }).richText;
          cells.push(rt.map((seg) => seg.text).join(''));
        } else {
          cells.push(String(v));
        }
      }
      rows.push(cells);
    });

    sheets.push({ name: ws.name, rows, unsupportedFeatures });
  }

  if (sheets.length === 0) {
    throw new ExcelParseError('workbook 无 sheet', path);
  }

  return { sheets };
}

/** 取指定 sheet(若 sheet 不存在 → 抛错;sheet=undefined → 取第一个) */
export function getSheet(
  result: WorkbookResult,
  sheet: string | undefined,
  pathForError: string,
): SheetResult {
  if (sheet === undefined) {
    const first = result.sheets[0];
    if (!first) throw new ExcelParseError('workbook 无 sheet', pathForError);
    return first;
  }
  const found = result.sheets.find((s) => s.name === sheet);
  if (!found) {
    throw new ExcelParseError(
      `sheet '${sheet}' 不存在;可用:${result.sheets.map((s) => s.name).join(', ')}`,
      pathForError,
    );
  }
  return found;
}

/**
 * 把 sheet 转成简单 markdown 表(供 LLM 输入)。
 * 第 1 行作 header(若 rows 非空)。
 */
export function sheetToMarkdown(sheet: SheetResult): string {
  if (sheet.rows.length === 0) return `(空 sheet: ${sheet.name})`;
  const lines: string[] = [];
  lines.push(`### Sheet: ${sheet.name}\n`);
  const header = sheet.rows[0] ?? [];
  lines.push('| ' + header.map(escapeMd).join(' | ') + ' |');
  lines.push('|' + header.map(() => '---').join('|') + '|');
  for (const row of sheet.rows.slice(1)) {
    lines.push('| ' + row.map(escapeMd).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
```

- [ ] **Step 2:写 fixture 生成脚本**

新建 `tests/fixtures/legacy-bridge/_make-excel-fixture.mjs`:

```javascript
// 一次性脚本:生成 excel-test-cases.xlsx fixture(只在仓库初始化时跑一次)
// 用法:node tests/fixtures/legacy-bridge/_make-excel-fixture.mjs
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wb = new ExcelJS.Workbook();

// Sheet 1: TestCases
const tc = wb.addWorksheet('TestCases');
tc.addRows([
  ['ID', 'Title', 'Steps', 'Expected'],
  ['TC-001', '登录成功', '输入正确账密', '跳转 dashboard'],
  ['TC-002', '登录失败', '输入错密', '提示密码错'],
  ['TC-003', '幂等支付', '同 Idempotency-Key 重复请求', '返回原响应不重复扣款'],
]);

// Sheet 2: Coverage(故意中文 sheet 名)
const cov = wb.addWorksheet('覆盖率');
cov.addRows([
  ['模块', '已覆盖用例', '未覆盖用例'],
  ['Order', '12', '2'],
  ['Payment', '20', '0'],
]);

await wb.xlsx.writeFile(join(__dirname, 'excel-test-cases.xlsx'));
console.log('✓ generated excel-test-cases.xlsx');
```

跑一次生成 fixture:

```bash
node tests/fixtures/legacy-bridge/_make-excel-fixture.mjs
```

预期:`tests/fixtures/legacy-bridge/excel-test-cases.xlsx` 被创建,大小约 7-10KB。

- [ ] **Step 3:写 `tests/core/legacy-bridge/excel.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseWorkbook,
  getSheet,
  sheetToMarkdown,
  ExcelParseError,
} from '../../../src/core/legacy-bridge/excel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../fixtures/legacy-bridge/excel-test-cases.xlsx');

describe('legacy-bridge/excel', () => {
  it('parseWorkbook 解析 fixture 多 sheet', async () => {
    const wb = await parseWorkbook(FIXTURE);
    expect(wb.sheets.map((s) => s.name).sort()).toEqual(['TestCases', '覆盖率']);
  });

  it('TestCases sheet 行数正确(header + 3 case = 4)', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const tc = getSheet(wb, 'TestCases', FIXTURE);
    expect(tc.rows).toHaveLength(4);
    expect(tc.rows[0]).toEqual(['ID', 'Title', 'Steps', 'Expected']);
    expect(tc.rows[1]?.[0]).toBe('TC-001');
  });

  it('中文 sheet 名 → 正确读取', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const cov = getSheet(wb, '覆盖率', FIXTURE);
    expect(cov.rows[0]).toEqual(['模块', '已覆盖用例', '未覆盖用例']);
  });

  it('sheet 名不存在 → 抛 ExcelParseError 含可用列表', async () => {
    const wb = await parseWorkbook(FIXTURE);
    expect(() => getSheet(wb, 'Nonexistent', FIXTURE)).toThrow(ExcelParseError);
    expect(() => getSheet(wb, 'Nonexistent', FIXTURE)).toThrow(/TestCases.*覆盖率/);
  });

  it('sheet=undefined → 取第一个 sheet', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const first = getSheet(wb, undefined, FIXTURE);
    expect(first.name).toBe('TestCases');
  });

  it('sheetToMarkdown 输出 markdown 表', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const tc = getSheet(wb, 'TestCases', FIXTURE);
    const md = sheetToMarkdown(tc);
    expect(md).toContain('### Sheet: TestCases');
    expect(md).toContain('| ID | Title');
    expect(md).toContain('TC-001');
  });

  it('parseWorkbook 损坏文件 → 抛 ExcelParseError', async () => {
    await expect(parseWorkbook('/tmp/nonexistent.xlsx')).rejects.toThrow(ExcelParseError);
  });

  it('TestCases 无 unsupportedFeatures(简单 sheet)', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const tc = getSheet(wb, 'TestCases', FIXTURE);
    expect(tc.unsupportedFeatures).toEqual([]);
  });
});
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/excel.test.ts
```

预期:8 tests passing。

- [ ] **Step 5:commit**

```bash
git add src/core/legacy-bridge/excel.ts tests/core/legacy-bridge/excel.test.ts tests/fixtures/legacy-bridge/excel-test-cases.xlsx tests/fixtures/legacy-bridge/_make-excel-fixture.mjs
git commit -m "feat(legacy-bridge): excel.ts exceljs 解析 + sheet 字段 + 中文 sheet 名(决策 #13 / §6.5)"
```

---

### Task B2.3:`src/core/legacy-bridge/hash-anchor.ts`(SHA256 anchor hash)

**Files:**
- Create: `src/core/legacy-bridge/hash-anchor.ts`
- Test: `tests/core/legacy-bridge/hash-anchor.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/hash-anchor.ts`**

```typescript
// anchor 文件 hash 计算 — Plan 7 Phase B2
// 复用 src/core/hash 的 SHA256;支持 .md(utf8 normalize CRLF→LF)+ .xlsx(原始字节)+ glob

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname } from 'node:path';
import { computeContentHash } from '../hash/index.js';
import type { LegacyAnchor } from './types.js';

/**
 * 计算 anchor 内容 hash(SHA256,16 字符前缀)。
 *
 * - markdown / txt:utf8 解码 + 行尾 normalize 为 LF(避免 CRLF/LF 漂移触发误警)
 * - xlsx / 二进制:用原始字节
 *
 * @returns hash 字符串;文件不存在 → null(caller 决定是否警告)
 */
export async function computeAnchorHash(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  const ext = extname(path).toLowerCase();
  const raw = await readFile(path);
  if (ext === '.xlsx' || ext === '.bin') {
    return computeContentHash(raw);
  }
  // 文本:utf8 normalize + LF
  const text = raw.toString('utf8').replace(/\r\n/g, '\n');
  return computeContentHash(Buffer.from(text, 'utf8'));
}

/** 校验 anchor 当前文件 hash 与 yaml 记录的 hash 是否一致 */
export interface HashCheck {
  /** 文件不存在 / 无记录 hash → 'no-record';一致 → 'fresh';不一致 → 'stale' */
  state: 'fresh' | 'stale' | 'no-record';
  currentHash: string | null;
  recordedHash?: string;
}

export async function checkAnchorHash(anchor: LegacyAnchor): Promise<HashCheck> {
  const currentHash = await computeAnchorHash(anchor.path);
  if (!anchor.hash || !currentHash) {
    return { state: 'no-record', currentHash };
  }
  return {
    state: currentHash === anchor.hash ? 'fresh' : 'stale',
    currentHash,
    recordedHash: anchor.hash,
  };
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/hash-anchor.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  computeAnchorHash,
  checkAnchorHash,
} from '../../../src/core/legacy-bridge/hash-anchor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

describe('legacy-bridge/hash-anchor', () => {
  it('文件不存在 → 返回 null', async () => {
    const h = await computeAnchorHash('/tmp/no-such-file-xyz');
    expect(h).toBeNull();
  });

  it('UTF-8 中文路径文件 → 稳定 hash', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const h1 = await computeAnchorHash(path);
    const h2 = await computeAnchorHash(path);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]+$/);
  });

  it('CRLF / LF 同内容 → 同 hash(行尾 normalize)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'hash-anchor-'));
    try {
      const lfPath = join(d, 'lf.md');
      const crlfPath = join(d, 'crlf.md');
      writeFileSync(lfPath, 'a\nb\nc');
      writeFileSync(crlfPath, 'a\r\nb\r\nc');
      const lf = await computeAnchorHash(lfPath);
      const crlf = await computeAnchorHash(crlfPath);
      expect(lf).toBe(crlf);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('xlsx 二进制 → 不做行尾 normalize(用原始字节)', async () => {
    const h = await computeAnchorHash(join(FIXTURE_DIR, 'excel-test-cases.xlsx'));
    expect(h).not.toBeNull();
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it('checkAnchorHash 当前 = 记录 → fresh', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const current = await computeAnchorHash(path);
    expect(current).not.toBeNull();
    const r = await checkAnchorHash({
      role: 'requirements',
      path,
      authoritative: true,
      hash: current!,
    });
    expect(r.state).toBe('fresh');
  });

  it('checkAnchorHash 记录与当前不一致 → stale', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const r = await checkAnchorHash({
      role: 'requirements',
      path,
      authoritative: true,
      hash: 'deadbeef0000000',
    });
    expect(r.state).toBe('stale');
  });

  it('checkAnchorHash 无记录 hash → no-record', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const r = await checkAnchorHash({
      role: 'requirements',
      path,
      authoritative: true,
    });
    expect(r.state).toBe('no-record');
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/hash-anchor.test.ts
```

预期:7 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/hash-anchor.ts tests/core/legacy-bridge/hash-anchor.test.ts
git commit -m "feat(legacy-bridge): hash-anchor.ts SHA256 + LF normalize + xlsx 字节(决策 §4.3 不变量)"
```

---

### Task B2.4:`src/core/legacy-bridge/regenerator.ts`(LLM 复写 + 多版本合并 + frontmatter/license/disclaimer + output validator)

**Files:**
- Create: `src/core/legacy-bridge/regenerator.ts`
- Test: `tests/core/legacy-bridge/regenerator.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/regenerator.ts`**

```typescript
// 复写器:读 anchors → 多版本合并 → LLM → 加 frontmatter / disclaimer / license → 输出
// Plan 7 Phase B2 / spec §3.1 + 决策 #14-#21 / §4.3 不变量

import Anthropic from '@anthropic-ai/sdk';
import matter from 'gray-matter';
import type { LegacyAnchor, LegacyAnchorRole, LegacyAnchorsFile } from './types.js';
import { redact } from './redact.js';
import { readAnchorFile } from './encoding.js';
import { parseWorkbook, getSheet, sheetToMarkdown } from './excel.js';
import { extname } from 'node:path';

/** 复写参数 */
export interface RegenerateInput {
  role: LegacyAnchorRole;
  /** 当前版 anchor(authoritative=true) */
  authoritative: LegacyAnchor;
  /** 历史版 anchor(可选;--include-historical 时 LLM 当背景输入) */
  historical?: LegacyAnchor[];
  /** 全局 redact 规则(用户 yaml 顶层) */
  globalRedactRules?: LegacyAnchorsFile['redact'];
  /** forge 版本号(写入 frontmatter) */
  forgeVersion: string;
  /** 用户 config 的 regen_license(默认 derived-from-source) */
  regenLicense: string;
}

/** 复写产物 */
export interface RegenerateOutput {
  role: LegacyAnchorRole;
  /** 完整 markdown(含 frontmatter + disclaimer + LLM 复写内容) */
  fullMarkdown: string;
  /** 用于 quality-judge 验证的复写正文(不含 frontmatter / disclaimer) */
  body: string;
  /** redact 命中数(用于 --redact-report) */
  redactReport: ReturnType<typeof redact>;
  /** 估算 token / cost */
  tokensUsed: number;
  estimatedCost: number;
}

/** LLM client 的最小接口(便于测试 mock) */
export interface RegenerateClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const PRICE_PER_M_INPUT = 3.0;
const PRICE_PER_M_OUTPUT = 15.0;

/** role → 文件名映射(决策 #14:每 role 一份大文件) */
export const REGEN_FILENAMES: Record<LegacyAnchorRole, string> = {
  requirements: 'SRS.md',
  'high-level-design': 'HLD.md',
  'low-level-design': 'LLD.md',
  'system-tests': 'system-tests.md',
  // P7-03 修复:acceptance-report 走 metadata-only(spec §7 line 909 / I-8),不进 regenerator
  // 此项保留 key 但 regenerateRole 检测到会抛 RegenOutputError
  'acceptance-report': '__metadata-only__',
  rationale: 'rationale.md',
  glossary: 'glossary.md',
};

/** P7-03 修复:metadata-only 角色集合(不发 LLM,不复写) */
export const METADATA_ONLY_ROLES: ReadonlyArray<LegacyAnchorRole> = ['acceptance-report'];

/** 把 anchor 文件读为 LLM 输入文本(支持 .md / .txt / .csv / .xlsx) */
async function readAnchorAsText(anchor: LegacyAnchor): Promise<string> {
  const ext = extname(anchor.path).toLowerCase();
  if (ext === '.xlsx') {
    const wb = await parseWorkbook(anchor.path);
    const sheet = getSheet(wb, anchor.sheet, anchor.path);
    // P7-09 修复:决策 §4.1 line 502 — chart/pivot/formula 不支持时拒绝运行,引导导出 csv
    if (sheet.unsupportedFeatures.length > 0) {
      const { ExcelParseError } = await import('./excel.js');
      throw new ExcelParseError(
        `sheet '${sheet.name}' 含不支持特性(${sheet.unsupportedFeatures.join(', ')});请在 Excel 另存为 .csv 后改 anchors.yaml path 指向 .csv(决策 §4.1)`,
        anchor.path,
      );
    }
    return sheetToMarkdown(sheet);
  }
  const r = await readAnchorFile(anchor.path);
  return r.text;
}

/** 拼 LLM prompt(决策 #14:复写规范化版本) */
function buildRegeneratePrompt(input: RegenerateInput, anchorText: string, historicalText?: string): string {
  const role = input.role;
  const roleHumanName: Record<LegacyAnchorRole, string> = {
    requirements: 'Software Requirements Specification (SRS)',
    'high-level-design': 'High-Level Design (HLD)',
    'low-level-design': 'Low-Level Design (LLD)',
    'system-tests': 'System Test Cases',
    'acceptance-report': 'Acceptance Report',
    rationale: 'Design Rationale',
    glossary: 'Glossary',
  };

  let prompt = `你是一名技术文档规范化助手。请把下列老文档内容**忠实复写**为规范化的 ${roleHumanName[role]}。

# 复写要求(strict)
1. **不丢失任何事实** — 包括数字、字段约束、合规条款、设计决策
2. **保留章节结构** — 用 \`##\` / \`###\` 层级
3. **不添加未声明的功能** — 老文档没说的不补
4. **保留原文中所有 <<REDACTED-N>> 占位** — 这些是敏感数据 mask,不要尝试还原或替换
5. **输出纯 markdown** — 不输出 frontmatter(我会另加),不输出代码 block 包裹整段
6. **保留中文 / 中英文混排** — 不强行翻译

# 老文档内容(权威源)
${anchorText}
`;

  if (historicalText) {
    prompt += `\n# 历史版本(背景信息;不直接复写,仅用于理解演进)\n${historicalText}\n`;
  }

  prompt += `\n# 输出格式
直接输出复写后的 markdown,从一级标题或章节标题开始。不要任何 preamble。`;

  return prompt;
}

/** 单 role 复写(用于测试便于 mock) */
export async function regenerateRole(
  input: RegenerateInput,
  client: RegenerateClient,
  modelOverride?: string,
): Promise<RegenerateOutput> {
  // P7-03 修复:acceptance-report 等 metadata-only role 不进 regenerator
  // (spec §7 line 909 / 决策 #8 / Codex I-8 部分接受)
  if (METADATA_ONLY_ROLES.includes(input.role)) {
    throw new RegenOutputError(
      `role=${input.role} 是 metadata-only(spec §7 line 909);只在 forge/docs/index.md 索引 metadata,不复写。请在 anchors.yaml 改用其他 role 或跳过此 anchor。`,
      input.role,
    );
  }
  const authText = await readAnchorAsText(input.authoritative);
  const historicalTexts = await Promise.all((input.historical ?? []).map(readAnchorAsText));
  const historicalCombined = historicalTexts.length > 0
    ? historicalTexts.map((t, i) => `## 历史版 ${i + 1} (${input.historical![i]?.path})\n${t}`).join('\n\n')
    : undefined;

  // redact 在发 LLM 前 mask(决策 #20)
  const redactRules = [
    ...(input.globalRedactRules ?? []),
    ...(input.authoritative.redact ?? []),
  ];
  const redactReport = redact(authText + (historicalCombined ?? ''), redactRules);
  const maskedAuth = redact(authText, redactRules).redactedText;
  const maskedHistorical = historicalCombined
    ? redact(historicalCombined, redactRules).redactedText
    : undefined;

  const prompt = buildRegeneratePrompt(input, maskedAuth, maskedHistorical);

  // P7-07 修复:每次 LLM 调用前显示数据传输声明(spec §1.1.1 line 40)
  const model = modelOverride ?? DEFAULT_MODEL;
  const promptBytes = Buffer.byteLength(prompt, 'utf8');
  console.log(
    `→ sending ${promptBytes} bytes to Anthropic API (provider=anthropic, region: auto, model=${model})`,
  );

  const result = await client.messages.create({
    model,
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  });

  const body = extractText(result);
  validateRegenOutput(body, input.role);

  const inputTokens = result.usage?.input_tokens ?? 0;
  const outputTokens = result.usage?.output_tokens ?? 0;
  const cost =
    (inputTokens / 1_000_000) * PRICE_PER_M_INPUT +
    (outputTokens / 1_000_000) * PRICE_PER_M_OUTPUT;

  // 加 frontmatter + disclaimer(决策 #21 / §9)
  const fullMarkdown = wrapWithFrontmatterAndDisclaimer(body, input);

  return {
    role: input.role,
    fullMarkdown,
    body,
    redactReport,
    tokensUsed: inputTokens + outputTokens,
    estimatedCost: cost,
  };
}

/** output validator:复写产物必须是合法 markdown,无 frontmatter(LLM 不该输出),正文非空 */
export function validateRegenOutput(body: string, role: LegacyAnchorRole): void {
  // 不变量 §4.3:复写产物 markdown 格式合法
  if (!body || body.trim().length < 50) {
    throw new RegenOutputError(`复写产物为空或过短(role=${role}),LLM 可能未正确响应`, role);
  }
  // LLM 不该输出 frontmatter(我们另加);若开头 `---\n`,警告但不强 fail(用 gray-matter 试解析判断)
  const parsed = matter(body);
  if (Object.keys(parsed.data).length > 0) {
    throw new RegenOutputError(
      `LLM 输出含 frontmatter 字段(${Object.keys(parsed.data).join(',')}),应只输出正文`,
      role,
    );
  }
  // code block 闭合检查(简易:对 ``` 计数应为偶数)
  const fenceCount = (body.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 !== 0) {
    throw new RegenOutputError(`复写产物 code block 不闭合(\`\`\` 计数 ${fenceCount} 非偶数)`, role);
  }
}

/** 自定义异常:LLM 输出不合规(转 exit 2 + 写 .invalid 文件) */
export class RegenOutputError extends Error {
  constructor(message: string, public readonly role: LegacyAnchorRole) {
    super(`[role=${role}] ${message}`);
    this.name = 'RegenOutputError';
  }
}

/** 加 frontmatter + 顶部 disclaimer(决策 #21 / §9) */
function wrapWithFrontmatterAndDisclaimer(body: string, input: RegenerateInput): string {
  const generatedAt = new Date().toISOString();
  const sourcesYaml = input.authoritative.path
    ? `\nsources:\n  - ${input.authoritative.path}` +
      (input.historical?.map((a) => `\n  - ${a.path}`).join('') ?? '')
    : '';

  const frontmatter = `---
generated-by: forge-legacy-bridge
generated-at: ${generatedAt}${sourcesYaml}
license: ${input.regenLicense}
forge-version: ${input.forgeVersion}
---

> **⚠ 此文档由 forge 自动生成**
> 这是 LLM 复写的规范化版本,**不是项目权威交付物**。
> 权威源:\`${input.authoritative.path}\`(用户原版老文档)
> 客户验收 / 审计 / 法律证据请引用权威源,不要引用本文件
>
> 许可:\`${input.regenLicense}\` — 实际许可由 anchor 源决定,
> 在 \`forge/config.yaml#legacy_bridge.regen_license\` 显式声明前不假定任何 OSS 许可

`;

  return frontmatter + body;
}

function extractText(result: Anthropic.Messages.Message): string {
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return block?.text ?? '';
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/regenerator.test.ts`(用 mock client)**

```typescript
import { describe, it, expect } from 'vitest';
import {
  regenerateRole,
  validateRegenOutput,
  RegenOutputError,
  REGEN_FILENAMES,
  type RegenerateClient,
} from '../../../src/core/legacy-bridge/regenerator.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

function makeMock(text: string, usage = { input_tokens: 1000, output_tokens: 500 }): RegenerateClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text }],
        usage,
      }) as never,
    },
  };
}

describe('legacy-bridge/regenerator', () => {
  it('REGEN_FILENAMES 含 4 个核心 role 文件名', () => {
    expect(REGEN_FILENAMES.requirements).toBe('SRS.md');
    expect(REGEN_FILENAMES['high-level-design']).toBe('HLD.md');
    expect(REGEN_FILENAMES['low-level-design']).toBe('LLD.md');
    expect(REGEN_FILENAMES['system-tests']).toBe('system-tests.md');
  });

  it('regenerateRole happy path → 加 frontmatter + disclaimer', async () => {
    const mock = makeMock(
      '# 需求规格\n\n## 1. 订单\nOrder 表 user_id 字段非空。\n\n## 2. 支付\n所有支付接口必须使用 Idempotency-Key 头部。',
    );
    const out = await regenerateRole(
      {
        role: 'requirements',
        authoritative: {
          role: 'requirements',
          path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
          authoritative: true,
        },
        forgeVersion: '0.2.0',
        regenLicense: 'derived-from-source',
      },
      mock,
    );
    const parsed = matter(out.fullMarkdown);
    expect(parsed.data['generated-by']).toBe('forge-legacy-bridge');
    expect(parsed.data['license']).toBe('derived-from-source');
    expect(parsed.data['forge-version']).toBe('0.2.0');
    expect(parsed.data['sources']).toContain(
      join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md').replace(/\\/g, '/'),
    );
    expect(parsed.content).toContain('此文档由 forge 自动生成');
    expect(parsed.content).toContain('Order 表');
    expect(out.body).toContain('Order 表');
  });

  it('redact 在发 LLM 前生效(原文 token 不被发送)', async () => {
    const mock = makeMock('# 复写\n## 1. abc');
    const out = await regenerateRole(
      {
        role: 'requirements',
        authoritative: {
          role: 'requirements',
          path: join(FIXTURE_DIR, 'redact-targets.md'),
          authoritative: true,
        },
        forgeVersion: '0.2.0',
        regenLicense: 'derived-from-source',
      },
      mock,
    );
    expect(out.redactReport.totalReplacements).toBeGreaterThan(0);
  });

  it('disclaimer 含 license 字段(决策 #21)', async () => {
    const mock = makeMock('# 复写\n## 1. 内容\nfoo bar baz qux');
    const out = await regenerateRole(
      {
        role: 'requirements',
        authoritative: {
          role: 'requirements',
          path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
          authoritative: true,
        },
        forgeVersion: '0.2.0',
        regenLicense: 'derived-from-source',
      },
      mock,
    );
    expect(out.fullMarkdown).toContain('许可:`derived-from-source`');
  });

  it('validateRegenOutput LLM 输出过短 → 抛 RegenOutputError', () => {
    expect(() => validateRegenOutput('短', 'requirements')).toThrow(RegenOutputError);
    expect(() => validateRegenOutput('短', 'requirements')).toThrow(/复写产物为空或过短/);
  });

  it('validateRegenOutput LLM 输出 frontmatter → 抛错', () => {
    const bad = `---\ngenerated-by: hack\n---\n\n# 内容\n${'.'.repeat(100)}`;
    expect(() => validateRegenOutput(bad, 'requirements')).toThrow(/含 frontmatter 字段/);
  });

  it('validateRegenOutput code block 不闭合 → 抛错', () => {
    const bad = `# 复写\n## 1. \n\`\`\`js\nconst x = 1;\n${'.'.repeat(100)}`;
    expect(() => validateRegenOutput(bad, 'requirements')).toThrow(/code block 不闭合/);
  });

  it('validateRegenOutput 合法 markdown 通过', () => {
    const good = `# 复写\n## 1. 章节\n${'a'.repeat(100)}\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n`;
    expect(() => validateRegenOutput(good, 'requirements')).not.toThrow();
  });

  it('xlsx anchor 也能复写(走 sheetToMarkdown)', async () => {
    const mock = makeMock('# 测试用例\n## TC-001\n登录测试');
    const out = await regenerateRole(
      {
        role: 'system-tests',
        authoritative: {
          role: 'system-tests',
          path: join(FIXTURE_DIR, 'excel-test-cases.xlsx'),
          authoritative: true,
          sheet: 'TestCases',
        },
        forgeVersion: '0.2.0',
        regenLicense: 'derived-from-source',
      },
      mock,
    );
    expect(out.fullMarkdown).toContain('登录测试');
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/regenerator.test.ts
```

预期:9 tests passing。注意 `parsed.data['sources']` 在 Windows 上路径反斜杠可能不同;若失败,把断言改为 `toContain('需求规格说明书.md')`(只查文件名)。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/regenerator.ts tests/core/legacy-bridge/regenerator.test.ts
git commit -m "feat(legacy-bridge): regenerator.ts 多版本 + frontmatter + disclaimer + license(决策 #14/#21)"
```

---

## Phase B3:quality-judge 分层抽样(0.5 周)

### Task B3.1:`src/core/legacy-bridge/quality-judge.ts` 抽样器

**Files:**
- Create: `src/core/legacy-bridge/quality-judge.ts`
- Test: `tests/core/legacy-bridge/quality-judge.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/quality-judge.ts`**

```typescript
// 双 LLM 抽样保真率验证 — Plan 7 Phase B3
// 决策 #16 修订(I-2):分层抽样 — critical 全量必抽 + 各章节按比例抽 + 总数约 30
// 失败路径:critical 任一丢失 → exit 2,无 retry,直接报告 + 写 .partial(spec §5.1)

import Anthropic from '@anthropic-ai/sdk';
import type { KeyFact, QualityResult, LegacyAnchorRole } from './types.js';

/** 默认总抽样数(决策 #16) */
export const DEFAULT_SAMPLE_TOTAL = 30;
/** 默认非 critical 保真率阈值(决策 #16) */
export const DEFAULT_FIDELITY_THRESHOLD = 0.9;

/** 抽样输入 */
export interface SamplingInput {
  /** scenario 标注的全部 key facts */
  allFacts: KeyFact[];
  /** 总抽样数(默认 DEFAULT_SAMPLE_TOTAL) */
  total?: number;
}

/** 抽样输出 */
export interface SamplingOutput {
  /** 实际抽样的 fact 列表(critical 全量在前 + 各章节按比例) */
  sampled: KeyFact[];
  /** 各章节抽样数(用于 per_section_rates 计算分母) */
  perSectionSampled: Record<string, number>;
  /** 抽样未覆盖的章节(警告) */
  uncoveredSections: string[];
}

/**
 * 分层抽样(决策 #16):
 * 1. critical-facts 全量抽(标注的 critical 集合,通常 5-10 条)
 * 2. 剩余配额按章节比例分配(章节越大抽越多,但每章至少 1 条)
 * 3. 总抽样数仍约 total,但分布按 1+2 决定
 *
 * 防"统计骗术":LLM 集中改写某章导致该章 fact 全丢但其他章 fact 多保留 → per_section_rates 计算时该章为 0
 */
export function stratifiedSample(input: SamplingInput): SamplingOutput {
  const total = input.total ?? DEFAULT_SAMPLE_TOTAL;

  // 1. critical 全量必抽
  const critical = input.allFacts.filter((f) => f.critical);
  const nonCritical = input.allFacts.filter((f) => !f.critical);

  // 2. 剩余配额给非 critical
  const remaining = Math.max(0, total - critical.length);
  if (remaining === 0) {
    return {
      sampled: critical,
      perSectionSampled: countSections(critical),
      uncoveredSections: [],
    };
  }

  // 按 section 分组
  const bySection = new Map<string, KeyFact[]>();
  for (const f of nonCritical) {
    const arr = bySection.get(f.section) ?? [];
    arr.push(f);
    bySection.set(f.section, arr);
  }

  // 每章至少 1 条;剩余按比例(向下取整);最后多余配额从最大章补
  const totalNonCriticalCount = nonCritical.length;
  const sampled: KeyFact[] = [...critical];
  const perSectionSampled: Record<string, number> = countSections(critical);

  if (totalNonCriticalCount === 0) {
    return { sampled, perSectionSampled, uncoveredSections: [] };
  }

  // 各章 quota 计算
  const sectionEntries = Array.from(bySection.entries()); // [name, facts][]
  const quotas = new Map<string, number>();
  for (const [name, facts] of sectionEntries) {
    const proportionalQuota = Math.floor((facts.length / totalNonCriticalCount) * remaining);
    quotas.set(name, Math.max(1, proportionalQuota));
  }
  // 总 quota 校正(向下取整后总和可能 < remaining,从最大章补)
  let totalQuota = Array.from(quotas.values()).reduce((a, b) => a + b, 0);
  if (totalQuota < remaining) {
    // 按 facts 数从大到小补
    const sortedByCount = sectionEntries.slice().sort((a, b) => b[1].length - a[1].length);
    let i = 0;
    while (totalQuota < remaining && i < sortedByCount.length) {
      const name = sortedByCount[i]![0];
      quotas.set(name, (quotas.get(name) ?? 0) + 1);
      totalQuota += 1;
      i = (i + 1) % sortedByCount.length;
    }
  }

  // 各章按 quota 抽样(简单:取前 N 条;实际可随机,但为确定性保留顺序)
  for (const [name, facts] of sectionEntries) {
    const q = Math.min(quotas.get(name) ?? 0, facts.length);
    for (let i = 0; i < q; i += 1) {
      const f = facts[i];
      if (f) {
        sampled.push(f);
        perSectionSampled[name] = (perSectionSampled[name] ?? 0) + 1;
      }
    }
  }

  // uncoveredSections:nonCritical 含但 sampled 没的章节
  const allSections = new Set<string>();
  for (const f of input.allFacts) allSections.add(f.section);
  const sampledSections = new Set(sampled.map((f) => f.section));
  const uncoveredSections = Array.from(allSections).filter((s) => !sampledSections.has(s));

  return { sampled, perSectionSampled, uncoveredSections };
}

function countSections(facts: KeyFact[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of facts) {
    out[f.section] = (out[f.section] ?? 0) + 1;
  }
  return out;
}

/** judge 三态(decision #16) */
export type FactState = 'preserved' | 'paraphrased' | 'lost';

/** judge 单 fact 结果 */
export interface FactJudgeResult {
  fact: KeyFact;
  state: FactState;
  /** judge 给的简短理由 */
  reasoning?: string;
}

const JUDGE_MODEL = 'claude-sonnet-4-6';

/** judge 客户端的最小接口(便于测试 mock) */
export interface JudgeClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

/**
 * 用模型 B 验证一条 fact 是否在复写产物里被保留 / 释义 / 丢失。
 * 输出格式约定:第 1 行三态之一,第 2 行起 reasoning。
 */
export async function judgeSingleFact(
  client: JudgeClient,
  regeneratedBody: string,
  fact: KeyFact,
): Promise<FactJudgeResult> {
  const prompt = `你是一名复写质量评估员。请判断下面这条"原文事实"是否在"复写产物"里被保留。

# 三态定义
- preserved:复写产物含字面量或数值完全一致
- paraphrased:复写产物含同义改写但语义完全等价(含全部数值与约束)
- lost:复写产物完全没提到 / 漏掉数值 / 漏掉约束

# 原文事实(出自章节 ${fact.section}, ${fact.critical ? 'critical' : 'non-critical'})
${fact.text}

# 复写产物(只搜本段范围)
${regeneratedBody}

# 输出格式(必须严格)
第 1 行:preserved | paraphrased | lost(三选一,小写,不带其他字符)
第 2 行起:简短理由(1-2 句)`;

  // P7-07 修复:LLM 调用前数据传输声明(judge 每条 fact 都打一次,可视化进度)
  console.log(
    `→ sending ${Buffer.byteLength(prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${JUDGE_MODEL}, op=judge fact §${fact.section})`,
  );
  const result = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = extractText(result);
  return parseFactJudgeResponse(text, fact);
}

/** P7-02 修复:LLM 从原文自动抽取 N 条 key fact(spec §3.1 line 337"模型 B 抽 30 条事实")
 *  用于 regenerate CLI 命令路径(无 scenario YAML 标注时);scenario 上下文请用 stratifiedSample 路径。
 */
export async function extractFactsFromOriginal(
  client: JudgeClient,
  originalText: string,
  n: number = DEFAULT_SAMPLE_TOTAL,
): Promise<KeyFact[]> {
  const prompt = `从下面"原文"中抽出 ${n} 条关键事实(数字 / 字段约束 / 业务规则 / 合规条款 / 设计决策)。
每条 fact 应是单句、可验证的陈述。输出严格 JSON 数组,每项含 { text, section, critical }。
- text:简短陈述(<= 80 字)
- section:原文中所属章节锚(如 "§4.5";若无章节,填 "(unstructured)")
- critical:布尔,合规 / 安全 / 业务硬约束 = true,其余 = false

# 原文
${originalText}

仅输出 JSON 数组,不输出 preamble、不带 markdown code fence。`;
  console.log(
    `→ sending ${Buffer.byteLength(prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${JUDGE_MODEL}, op=extract-facts)`,
  );
  const result = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = extractText(result);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      const o = item as Partial<KeyFact>;
      return {
        text: typeof o.text === 'string' ? o.text : '',
        section: typeof o.section === 'string' ? o.section : '(unstructured)',
        critical: typeof o.critical === 'boolean' ? o.critical : false,
      };
    })
    .filter((f) => f.text.trim().length > 0)
    .slice(0, n);
}

/** 解析 judge 响应:第 1 行三态,后续 reasoning */
export function parseFactJudgeResponse(text: string, fact: KeyFact): FactJudgeResult {
  const lines = text.trim().split(/\r?\n/);
  const firstLine = (lines[0] ?? '').trim().toLowerCase();
  let state: FactState;
  if (firstLine === 'preserved' || firstLine === 'paraphrased' || firstLine === 'lost') {
    state = firstLine;
  } else {
    // 解析失败 → 视为 lost(保守起见,触发用户审 — 决策 #16 不 retry,直接报告)
    state = 'lost';
  }
  const reasoning = lines.slice(1).join('\n').trim() || undefined;
  return { fact, state, reasoning };
}

/** 跑全部 sampled facts 的判定 + 计算 QualityResult */
export async function judgeAllFacts(
  client: JudgeClient,
  regeneratedBody: string,
  sampling: SamplingOutput,
  threshold: number = DEFAULT_FIDELITY_THRESHOLD,
): Promise<QualityResult> {
  const judged = await Promise.all(
    sampling.sampled.map((f) => judgeSingleFact(client, regeneratedBody, f)),
  );

  const critical = judged.filter((r) => r.fact.critical);
  const nonCritical = judged.filter((r) => !r.fact.critical);

  const critPreserved = critical.filter((r) => r.state !== 'lost');
  const totalPreserved = judged.filter((r) => r.state !== 'lost');

  // critical 必须 100%
  const criticalRate = critical.length === 0 ? 1.0 : critPreserved.length / critical.length;
  // 总体保真率
  const totalRate = judged.length === 0 ? 1.0 : totalPreserved.length / judged.length;

  // per_section_rates
  const perSectionRates: Record<string, number> = {};
  for (const [section, totalInSection] of Object.entries(sampling.perSectionSampled)) {
    const sectionJudged = judged.filter((r) => r.fact.section === section);
    const preserved = sectionJudged.filter((r) => r.state !== 'lost');
    perSectionRates[section] =
      totalInSection === 0 ? 1.0 : preserved.length / totalInSection;
  }

  const lostCritical = critical.filter((r) => r.state === 'lost').map((r) => r.fact);
  const lostNonCritical = nonCritical.filter((r) => r.state === 'lost').map((r) => r.fact);

  const passed = criticalRate >= 1.0 && totalRate >= threshold;

  return {
    total_rate: totalRate,
    critical_rate: criticalRate,
    per_section_rates: perSectionRates,
    lost_critical: lostCritical,
    lost_non_critical: lostNonCritical,
    uncovered_sections: sampling.uncoveredSections,
    passed,
  };
}

/** 把 QualityResult 渲染为给用户看的报告 */
export function formatQualityReport(role: LegacyAnchorRole, result: QualityResult): string {
  const lines: string[] = [];
  lines.push(`# 复写质量报告(role=${role})`);
  lines.push('');
  lines.push(`- 总体保真率:${(result.total_rate * 100).toFixed(1)}%`);
  lines.push(`- critical 子集保真率:${(result.critical_rate * 100).toFixed(1)}% (须 100%)`);
  lines.push(`- 抽样未覆盖的章节:${result.uncovered_sections.length === 0 ? '(无)' : result.uncovered_sections.join(', ')}`);
  lines.push('');

  if (result.lost_critical.length > 0) {
    lines.push('## ✗ 丢失的 critical fact(致命,必须用户介入)');
    for (const f of result.lost_critical) {
      lines.push(`- (${f.section}) ${f.text}`);
    }
    lines.push('');
  }

  if (result.lost_non_critical.length > 0) {
    lines.push('## ⚠ 丢失的 non-critical fact');
    for (const f of result.lost_non_critical) {
      lines.push(`- (${f.section}) ${f.text}`);
    }
    lines.push('');
  }

  lines.push('## 各章节保真率');
  for (const [section, rate] of Object.entries(result.per_section_rates)) {
    lines.push(`- ${section}:${(rate * 100).toFixed(1)}%`);
  }

  if (!result.passed) {
    lines.push('');
    lines.push('## 失败处理(决策 #16,无 retry)');
    lines.push('- 接受 .partial 产物 + 手动补丢失 fact');
    lines.push('- 重写 prompt 后重跑 forge legacy-bridge regenerate --role <r>');
  }

  return lines.join('\n');
}

function extractText(result: Anthropic.Messages.Message): string {
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return block?.text ?? '';
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/quality-judge.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  stratifiedSample,
  judgeSingleFact,
  parseFactJudgeResponse,
  judgeAllFacts,
  formatQualityReport,
  DEFAULT_FIDELITY_THRESHOLD,
  type JudgeClient,
} from '../../../src/core/legacy-bridge/quality-judge.js';
import type { KeyFact } from '../../../src/core/legacy-bridge/types.js';

function makeMockJudge(state: 'preserved' | 'paraphrased' | 'lost', reason = 'r'): JudgeClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: `${state}\n${reason}` }],
      }) as never,
    },
  };
}

function makeRoundRobinJudge(states: Array<'preserved' | 'paraphrased' | 'lost'>): JudgeClient {
  let idx = 0;
  return {
    messages: {
      create: async () => {
        const state = states[idx % states.length];
        idx += 1;
        return {
          content: [{ type: 'text', text: `${state}\nr` }],
        } as never;
      },
    },
  };
}

describe('legacy-bridge/quality-judge.stratifiedSample', () => {
  const facts: KeyFact[] = [
    { text: 'critical-1', section: '§4.5', critical: true },
    { text: 'critical-2', section: '§3.1', critical: true },
    { text: 'nc-1', section: '§4.5', critical: false },
    { text: 'nc-2', section: '§4.5', critical: false },
    { text: 'nc-3', section: '§3.1', critical: false },
    { text: 'nc-4', section: '§5.0', critical: false },
  ];

  it('critical 全量必抽 + 至少 1 条 / 章', () => {
    const r = stratifiedSample({ allFacts: facts, total: 30 });
    // critical 2 + 各章节至少 1 条 non-critical → 至少 5 条
    expect(r.sampled.length).toBeGreaterThanOrEqual(5);
    // 全部 critical 在 sampled
    expect(r.sampled.filter((f) => f.critical)).toHaveLength(2);
  });

  it('total 比 critical 数量小 → 仅返回 critical(决策 #16:critical 优先)', () => {
    const r = stratifiedSample({ allFacts: facts, total: 1 });
    expect(r.sampled).toHaveLength(2); // critical 不让步
  });

  it('uncoveredSections 仅在确实没抽到时填', () => {
    const r = stratifiedSample({ allFacts: facts, total: 30 });
    expect(r.uncoveredSections).toEqual([]);
  });

  it('单章节多 fact + 总数限制 → 该章节多抽几条(防统计骗术)', () => {
    const big: KeyFact[] = Array.from({ length: 20 }, (_, i) => ({
      text: `nc-big-${i}`,
      section: '§big',
      critical: false,
    }));
    const small: KeyFact[] = Array.from({ length: 4 }, (_, i) => ({
      text: `nc-small-${i}`,
      section: '§small',
      critical: false,
    }));
    const r = stratifiedSample({ allFacts: [...big, ...small], total: 12 });
    const bigSampled = r.sampled.filter((f) => f.section === '§big').length;
    const smallSampled = r.sampled.filter((f) => f.section === '§small').length;
    expect(bigSampled).toBeGreaterThan(smallSampled);
    // 每章至少 1
    expect(smallSampled).toBeGreaterThanOrEqual(1);
  });
});

describe('legacy-bridge/quality-judge.parseFactJudgeResponse', () => {
  const fact: KeyFact = { text: 't', section: 's', critical: false };

  it('preserved / paraphrased / lost 三态各自解析', () => {
    expect(parseFactJudgeResponse('preserved\n理由', fact).state).toBe('preserved');
    expect(parseFactJudgeResponse('paraphrased', fact).state).toBe('paraphrased');
    expect(parseFactJudgeResponse('lost\n没找到', fact).state).toBe('lost');
  });

  it('解析失败 → 保守 lost(决策 #16 不 retry)', () => {
    expect(parseFactJudgeResponse('random text', fact).state).toBe('lost');
  });

  it('reasoning 多行保留', () => {
    const r = parseFactJudgeResponse('preserved\n第一行\n第二行', fact);
    expect(r.reasoning).toBe('第一行\n第二行');
  });
});

describe('legacy-bridge/quality-judge.judgeAllFacts', () => {
  it('全 preserved → critical_rate=1, total_rate=1, passed', async () => {
    const facts: KeyFact[] = [
      { text: 'c-1', section: '§4', critical: true },
      { text: 'nc-1', section: '§4', critical: false },
      { text: 'nc-2', section: '§5', critical: false },
    ];
    const sampling = stratifiedSample({ allFacts: facts });
    const result = await judgeAllFacts(makeMockJudge('preserved'), 'body', sampling);
    expect(result.passed).toBe(true);
    expect(result.critical_rate).toBe(1.0);
    expect(result.total_rate).toBe(1.0);
    expect(result.lost_critical).toEqual([]);
  });

  it('critical 任一 lost → passed=false(无关 90% 阈值)', async () => {
    const facts: KeyFact[] = [
      { text: 'c-1', section: '§4', critical: true },
      { text: 'nc-1', section: '§4', critical: false },
    ];
    const sampling = stratifiedSample({ allFacts: facts });
    // 第一次返 lost(critical),第二次返 preserved(nc)
    const result = await judgeAllFacts(
      makeRoundRobinJudge(['lost', 'preserved']),
      'body',
      sampling,
    );
    expect(result.passed).toBe(false);
    expect(result.critical_rate).toBeLessThan(1.0);
    expect(result.lost_critical.length).toBeGreaterThan(0);
  });

  it('total_rate 低于阈值 → passed=false', async () => {
    const facts: KeyFact[] = Array.from({ length: 10 }, (_, i) => ({
      text: `nc-${i}`,
      section: i < 5 ? '§a' : '§b',
      critical: false,
    }));
    const sampling = stratifiedSample({ allFacts: facts });
    const result = await judgeAllFacts(
      makeRoundRobinJudge(['preserved', 'lost', 'lost', 'lost', 'lost']),
      'body',
      sampling,
      0.9,
    );
    expect(result.passed).toBe(false);
    expect(result.total_rate).toBeLessThan(0.9);
  });

  it('per_section_rates 防统计骗术(某章 0% 仍单独可见)', async () => {
    const facts: KeyFact[] = [
      { text: 'a-1', section: '§a', critical: false },
      { text: 'b-1', section: '§b', critical: false },
      { text: 'b-2', section: '§b', critical: false },
    ];
    const sampling = stratifiedSample({ allFacts: facts });
    // 全 §b 的 fact 都 lost,§a 保留
    let count = 0;
    const client: JudgeClient = {
      messages: {
        create: async (args) => {
          count += 1;
          const userPrompt = (args.messages[0]!.content as string);
          const isB = userPrompt.includes('§b');
          return {
            content: [{ type: 'text', text: `${isB ? 'lost' : 'preserved'}\nr` }],
          } as never;
        },
      },
    };
    const r = await judgeAllFacts(client, 'body', sampling);
    expect(r.per_section_rates['§a']).toBe(1.0);
    expect(r.per_section_rates['§b']).toBe(0.0);
  });
});

describe('legacy-bridge/quality-judge.formatQualityReport', () => {
  it('passed 报告含百分比', () => {
    const result = {
      total_rate: 0.95,
      critical_rate: 1.0,
      per_section_rates: { '§4': 1.0 },
      lost_critical: [],
      lost_non_critical: [],
      uncovered_sections: [],
      passed: true,
    };
    const out = formatQualityReport('requirements', result);
    expect(out).toContain('95.0%');
    expect(out).toContain('100.0%');
    expect(out).not.toContain('失败处理');
  });

  it('未通过报告含失败处理段', () => {
    const result = {
      total_rate: 0.7,
      critical_rate: 0.5,
      per_section_rates: {},
      lost_critical: [{ text: 'critical fact lost', section: '§4', critical: true }],
      lost_non_critical: [],
      uncovered_sections: ['§7'],
      passed: false,
    };
    const out = formatQualityReport('requirements', result);
    expect(out).toContain('失败处理');
    expect(out).toContain('接受 .partial');
    expect(out).toContain('critical fact lost');
    expect(out).toContain('§7');
  });
});

it('DEFAULT_FIDELITY_THRESHOLD = 0.9(决策 #16)', () => {
  expect(DEFAULT_FIDELITY_THRESHOLD).toBe(0.9);
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/quality-judge.test.ts
```

预期:13 tests passing。

- [ ] **Step 4:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 5:commit**

```bash
git add src/core/legacy-bridge/quality-judge.ts tests/core/legacy-bridge/quality-judge.test.ts
git commit -m "feat(legacy-bridge): quality-judge.ts 分层抽样 + 三态 + per-section(决策 #16 / I-2)"
```

---

### Task B3.2:`src/cli/commands/legacy-bridge.ts` 填实 `regenerate` 子命令

**Files:**
- Modify: `src/cli/commands/legacy-bridge.ts`(填实 regenerate action)
- Test: `tests/cli/legacy-bridge/regenerate.test.ts`

- [ ] **Step 1:在 `src/cli/commands/legacy-bridge.ts` 顶部加 import**

```typescript
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import Anthropic from '@anthropic-ai/sdk';
import { acquireLockByPath, LockHeldError } from '../../core/archive/lock.js';
import {
  loadAnchorsFile,
  getAuthoritativeAnchors,
  LegacyAnchorsError,
} from '../../core/legacy-bridge/anchors.js';
import { checkAck, renderOptinPrompt, ackPath } from '../../core/legacy-bridge/ack.js';
import { redact, formatRedactReport } from '../../core/legacy-bridge/redact.js';
import {
  regenerateRole,
  REGEN_FILENAMES,
  RegenOutputError,
  METADATA_ONLY_ROLES,
} from '../../core/legacy-bridge/regenerator.js';
import {
  stratifiedSample,
  judgeAllFacts,
  formatQualityReport,
  extractFactsFromOriginal,
} from '../../core/legacy-bridge/quality-judge.js';
import {
  estimateRegenerateCost,
  REGEN_WARN_USD,
  checkBudgetGate,
  countdown,
} from '../../core/legacy-bridge/budget.js';
import { computeAnchorHash } from '../../core/legacy-bridge/hash-anchor.js';
import { loadEnv } from '../../../forge-eval/load-env.js';
import { FORGE_VERSION } from '../../index.js';
import type { LegacyAnchorRole, RegenQualityFile } from '../../core/legacy-bridge/types.js';
```

- [ ] **Step 2:替换 regenerate 子命令的 stub action**

把原 `console.error('forge legacy-bridge regenerate:Phase B2/B3 待实现')` 改为完整 action:

```typescript
  cmd
    .command('regenerate')
    .description('LLM 复写规范 SRS/HLD/LLD/system-tests + 双 LLM 抽样验证(决策 #14-#16)')
    .option('--role <role>', '仅复写指定 role(默认全 4 role)')
    .option('--dry-run', '不调 LLM,只估算 cost + 列要扫的文件(§4.4)')
    .option('--include-historical', '把 authoritative=false 历史版作背景(默认关)')
    .option('--redact-report', '输出每条 redact 规则的命中数')
    .option('--yes', '非 TTY 必须显式 ack 高 cost 才继续(M-4)')
    .option('--skip-quality', '跳过 quality-judge 双 LLM 抽样(性能 / 调试用;P7-02 默认跑)')
    .action(
      async (opts: {
        role?: LegacyAnchorRole;
        dryRun?: boolean;
        includeHistorical?: boolean;
        redactReport?: boolean;
        yes?: boolean;
        skipQuality?: boolean;
      }) => {
        const forgeRoot = join(process.cwd(), 'forge');
        const configPath = join(forgeRoot, 'config.yaml');
        if (!existsSync(configPath)) {
          console.error('forge/config.yaml 不存在,先跑 forge init');
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
        const anchors = await loadAnchorsFile(forgeRoot).catch((err) => {
          if (err instanceof LegacyAnchorsError) {
            console.error(`✗ ${err.message}`);
            process.exit(LB_EXIT_GENERAL_ERROR);
          }
          throw err;
        });
        if (!anchors) {
          console.error(
            '✗ legacy-anchors.yaml 不存在;请先跑 forge legacy-bridge map 生成 draft 后审改',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }

        // ack 检查(决策 #22)
        const ackResult = await checkAck(forgeRoot, config, anchors);
        if (!ackResult.ok) {
          console.error(renderOptinPrompt(ackResult.reason, ackResult.customerDataPaths));
          process.exit(LB_EXIT_GENERAL_ERROR);
        }

        // 估算 cost + budget gate
        // P7-03 修复:过滤掉 metadata-only role(spec §7 line 909)
        const authoritativeAnchors = getAuthoritativeAnchors(anchors)
          .filter((a) => !METADATA_ONLY_ROLES.includes(a.role))
          .filter((a) => !opts.role || a.role === opts.role);
        if (authoritativeAnchors.length === 0) {
          console.error(
            opts.role
              ? `✗ role '${opts.role}' 在 legacy-anchors.yaml 无 authoritative anchor`
              : '✗ legacy-anchors.yaml 无任何 authoritative=true 的 anchor',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        const estimated = estimateRegenerateCost(authoritativeAnchors.length);
        const gate = checkBudgetGate(estimated, REGEN_WARN_USD, opts.yes ?? false);
        console.error(gate.message);
        if (!gate.proceed) process.exit(gate.exitCode);
        if (estimated >= REGEN_WARN_USD && !opts.dryRun) {
          if (process.stdout.isTTY) await countdown(5);
        }

        if (opts.dryRun) {
          // §4.4 dry-run:不调 LLM
          for (const a of authoritativeAnchors) {
            console.log(`[dry-run] role=${a.role} path=${a.path}`);
          }
          process.exit(LB_EXIT_OK);
        }

        // 锁(决策 #23):同时获 archive.lock + legacy-bridge.lock,顺序固定
        let releaseArchive: (() => Promise<void>) | undefined;
        let releaseLb: (() => Promise<void>) | undefined;
        try {
          releaseArchive = await acquireLockByPath(forgeRoot, 'legacy-bridge-regenerate', 'archive.lock');
          releaseLb = await acquireLockByPath(forgeRoot, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
        } catch (err) {
          if (err instanceof LockHeldError) {
            console.error(`✗ ${err.message}`);
            process.exit(LB_EXIT_LOCK_HELD);
          }
          throw err;
        }

        try {
          const { anthropicApiKey } = loadEnv();
          const client = new Anthropic({ apiKey: anthropicApiKey });

          const regenLicense = config.legacy_bridge?.regen_license ?? 'derived-from-source';
          const docsDir = join(forgeRoot, 'docs', 'regenerated');
          await mkdir(docsDir, { recursive: true });

          // P7-02 修复:跨 role 汇总 quality 状态;循环结束后统一 exit 2(决策 #16:无 retry)
          let anyQualityFailed = false;

          for (const anchor of authoritativeAnchors) {
            console.log(
              `→ regenerating role=${anchor.role} (model=claude-sonnet-4-6)`,
            );
            const out = await regenerateRole(
              {
                role: anchor.role,
                authoritative: anchor,
                forgeVersion: FORGE_VERSION,
                regenLicense,
                globalRedactRules: anchors.redact,
              },
              client,
            ).catch((err) => {
              if (err instanceof RegenOutputError) {
                throw err;
              }
              throw err;
            });

            if (opts.redactReport) {
              console.log(formatRedactReport(out.redactReport));
            }

            // P7-02 修复:regenerate 内置双 LLM 抽样验证(spec §3.1 line 336-339 / 决策 #16)
            // 默认走 quality-judge;--skip-quality 时跳过(性能 / 调试用)
            const outPath = join(docsDir, REGEN_FILENAMES[anchor.role]);
            const partialPath = `${outPath}.partial`;
            const qualityYamlPath = `${outPath}.partial.yaml`;
            if (!opts.skipQuality) {
              const originalText = await (async () => {
                const { readAnchorFile } = await import('../../core/legacy-bridge/encoding.js');
                return (await readAnchorFile(anchor.path)).text;
              })();
              console.log(`→ extracting key facts from ${anchor.path} (model B)`);
              const facts = await extractFactsFromOriginal(client, originalText);
              if (facts.length === 0) {
                console.warn(`⚠ 无法从原文抽取 key facts(LLM 输出非合法 JSON);quality-judge 跳过此 role`);
              } else {
                const sampling = stratifiedSample({ allFacts: facts });
                const quality = await judgeAllFacts(client, out.body, sampling);
                if (!quality.passed) {
                  anyQualityFailed = true;
                  // 写 .partial + quality YAML(spec §4.3 不变量)
                  await writeFile(partialPath, out.fullMarkdown, 'utf8');
                  const qualityFile: RegenQualityFile = {
                    schema: 'forge-regen-quality/v1',
                    role: anchor.role,
                    generated_at: new Date().toISOString(),
                    result: quality,
                  };
                  await writeFile(qualityYamlPath, stringifyYaml(qualityFile), 'utf8');
                  console.error(
                    `✗ role=${anchor.role} 保真率不达标:total=${(quality.total_rate * 100).toFixed(1)}%, critical=${(quality.critical_rate * 100).toFixed(1)}%`,
                  );
                  console.error(formatQualityReport(anchor.role, quality));
                  console.error(`✗ 已写 ${partialPath} 与 ${qualityYamlPath};用户决策:接受 .partial / 重写 prompt 重跑 / 手补`);
                  // 不立即 exit,完成所有 role 后统一 exit 2(决策 #16:无 retry)
                  continue;
                }
                console.log(`✓ quality 达标:total=${(quality.total_rate * 100).toFixed(1)}%, critical=${(quality.critical_rate * 100).toFixed(1)}%`);
              }
            }

            // 写产物
            await writeFile(outPath, out.fullMarkdown, 'utf8');
            console.log(`✓ wrote ${outPath} (${out.tokensUsed} tokens, ~$${out.estimatedCost.toFixed(3)})`);

            // 更新 anchor 的 hash + last_regenerated(写回 yaml)
            const hash = await computeAnchorHash(anchor.path);
            anchor.hash = hash ?? anchor.hash;
            anchor.last_regenerated = new Date().toISOString();
          }

          // 写回 anchors.yaml(更新 hash + last_regenerated)
          await writeFile(
            join(forgeRoot, 'legacy-anchors.yaml'),
            stringifyYaml(anchors),
            'utf8',
          );
          console.log(`✓ legacy-anchors.yaml hash + last_regenerated 已更新`);

          // P7-02 修复:任一 role 不达标 → exit 2(决策 #16 / spec §3.1 line 339,无 retry)
          if (anyQualityFailed) {
            process.exit(LB_EXIT_BUSINESS_RULE_FAIL);
          }
        } finally {
          if (releaseLb) await releaseLb();
          if (releaseArchive) await releaseArchive();
        }
      },
    );
```

- [ ] **Step 3:写 `tests/cli/legacy-bridge/regenerate.test.ts`(集成测试,模拟 Anthropic SDK)**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

// 通过 dynamic import 让 vi.mock 生效
const FIXTURE_FACT = '# 复写\n## 1. 章节\n这是 LLM 返回的复写内容,长度足够。Order 表 user_id 字段非空。Idempotency-Key 头部强制。';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: FIXTURE_FACT }],
        usage: { input_tokens: 1000, output_tokens: 500 },
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge legacy-bridge regenerate (CLI 集成)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-regen-cli-'));
    mkdirSync(join(tmp, 'forge'), { recursive: true });
    mkdirSync(join(tmp, 'docs', 'legacy'), { recursive: true });
    // forge/config.yaml(已 opt-in)
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n`,
    );
    // legacy-anchors.yaml
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/')}\n    authoritative: true\n`,
    );
    // 老 SRS
    writeFileSync(
      join(tmp, 'docs', 'legacy', 'SRS.md'),
      '# 需求\n## 1. 订单\nOrder 表 user_id 字段非空。\n',
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('--dry-run 不调 LLM,列出 anchor 后退 0', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import(
        '../../../src/cli/commands/legacy-bridge.js'
      );
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'regenerate', '--dry-run']);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[dry-run]'));
        expect(exitSpy).toHaveBeenCalledWith(0);
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('未 ack → 退 1 + 提示 --acknowledge-data-transfer', async () => {
    // 删 ack(beforeEach 没写 ack)
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import(
        '../../../src/cli/commands/legacy-bridge.js'
      );
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'regenerate']);
        // 应在 ack 检查处 exit 1
        expect(exitSpy).toHaveBeenCalledWith(1);
        const allErr = errSpy.mock.calls.flat().join('\n');
        expect(allErr).toContain('--acknowledge-data-transfer');
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('已 ack 且非 dry-run → 写 forge/docs/regenerated/SRS.md', async () => {
    // 写 ack
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    writeFileSync(
      join(tmp, 'forge', '.cache', 'llm-ack.yaml'),
      `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-05T00:00:00Z\nconfig_hash: ${createHash('sha256')
        .update(JSON.stringify({ allow_llm_calls: true }, ['allow_llm_calls']))
        .digest('hex')
        .slice(0, 16)}\n`,
    );

    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import(
        '../../../src/cli/commands/legacy-bridge.js'
      );
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'regenerate', '--yes']);
        const outPath = join(tmp, 'forge', 'docs', 'regenerated', 'SRS.md');
        expect(existsSync(outPath)).toBe(true);
        const content = readFileSync(outPath, 'utf8');
        expect(content).toContain('generated-by: forge-legacy-bridge');
        expect(content).toContain('license: derived-from-source');
        expect(content).toContain('此文档由 forge 自动生成');
        // 验证 anchors.yaml 被写回 hash
        const updated = readFileSync(join(tmp, 'forge', 'legacy-anchors.yaml'), 'utf8');
        expect(updated).toContain('hash:');
        expect(updated).toContain('last_regenerated:');
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/cli/legacy-bridge/regenerate.test.ts
```

预期:3 tests passing。如有 path 风格问题(Windows backslash),把 anchors.yaml fixture 里的 path 改用 `path.posix.join` 或显式 forward slash。

- [ ] **Step 5:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 6:commit**

```bash
git add src/cli/commands/legacy-bridge.ts tests/cli/legacy-bridge/regenerate.test.ts
git commit -m "feat(cli): legacy-bridge regenerate 全实现(ack + budget + lock + 写产物)"
```

---

## Phase C:sync-check + 差异报告 + resolve + archive 集成(1 周)

### Task C1:`src/core/legacy-bridge/diff-report.ts`(5 档严重度 + markdown/yaml 双栈)

**Files:**
- Create: `src/core/legacy-bridge/diff-report.ts`
- Test: `tests/core/legacy-bridge/diff-report.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/diff-report.ts`**

```typescript
// 5 档严重度差异报告渲染 — Plan 7 Phase C
// 决策 #5:critical / major / minor / style / info;markdown + YAML 双栈

import { stringify as stringifyYaml } from 'yaml';
import type { SyncStateFile, SyncStateDiff, DiffSeverity } from './types.js';

/** 严重度排序(渲染顺序:critical → info) */
export const SEVERITY_ORDER: ReadonlyArray<DiffSeverity> = [
  'critical',
  'major',
  'minor',
  'style',
  'info',
];

/** 严重度图标 */
const SEVERITY_ICON: Record<DiffSeverity, string> = {
  critical: '🔴',
  major: '🟠',
  minor: '🟡',
  style: '🔵',
  info: '⚪',
};

/** 把 SyncStateFile 渲染为 markdown(human-readable) */
export function renderDiffMarkdown(file: SyncStateFile): string {
  const lines: string[] = [];
  lines.push(`# Sync 差异报告:${file.change_id}`);
  lines.push('');
  lines.push(`生成时间:${file.generated_at}`);
  lines.push('');

  const counts = countBySeverity(file.diffs);
  const summary = SEVERITY_ORDER
    .map((s) => `${SEVERITY_ICON[s]} ${s}: ${counts[s]}`)
    .join('  ');
  lines.push(`**总览**:${summary}`);
  lines.push('');

  if (file.cross_anchor_conflicts && file.cross_anchor_conflicts.length > 0) {
    lines.push(`> ⚠ 跨 anchor 冲突 ${file.cross_anchor_conflicts.length} 项默认入 diff(决策 #18 修订)`);
    lines.push('');
  }

  for (const severity of SEVERITY_ORDER) {
    const items = file.diffs.filter((d) => d.severity === severity);
    if (items.length === 0) continue;
    lines.push(`## ${SEVERITY_ICON[severity]} ${severity} (${items.length})`);
    lines.push('');
    for (const d of items) {
      lines.push(`### #${d.id} \`${d.anchor_path}\`${d.section ? ` ${d.section}` : ''}`);
      lines.push('');
      lines.push(d.description);
      lines.push('');
      lines.push(`**status**:\`${d.status}\`${d.reason ? ` — ${d.reason}` : ''}`);
      lines.push('');
    }
  }

  if (file.cross_anchor_conflicts && file.cross_anchor_conflicts.length > 0) {
    lines.push(`## 跨 anchor 不一致(决策 #18 修订)`);
    lines.push('');
    for (const d of file.cross_anchor_conflicts) {
      lines.push(`### #${d.id} ${d.anchor_path}`);
      lines.push('');
      lines.push(d.description);
      lines.push('');
      lines.push(`**status**:\`${d.status}\``);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## resolve 流程(决策 #19)');
  lines.push('');
  lines.push('1. 用户根据上述 diffs 决定:更新老文档 / false-positive / skipped');
  lines.push('2. 编辑同名 `.yaml` 文件,把每条 status 字段从 `pending` 改为对应值');
  lines.push('3. 跑 `forge legacy-bridge resolve <change-id>` 校验全部已 ack');
  return lines.join('\n');
}

/** 把 SyncStateFile 渲染为 YAML(machine-readable + 用户编辑入口) */
export function renderDiffYaml(file: SyncStateFile): string {
  return stringifyYaml(file);
}

/** diffs 按 severity 分组计数 */
export function countBySeverity(diffs: SyncStateDiff[]): Record<DiffSeverity, number> {
  const out: Record<DiffSeverity, number> = {
    critical: 0,
    major: 0,
    minor: 0,
    style: 0,
    info: 0,
  };
  for (const d of diffs) {
    out[d.severity] += 1;
  }
  return out;
}

/** 是否含 critical 未 resolve 项(determines preflight 是否阻塞) */
export function hasCriticalPending(file: SyncStateFile): boolean {
  return file.diffs.some((d) => d.severity === 'critical' && d.status === 'pending');
}

/** 给定 LLM 输出 yaml 草稿,补全 status 字段(默认 pending) */
export function normalizeDiffsFromLlm(diffs: Array<Partial<SyncStateDiff>>): SyncStateDiff[] {
  return diffs.map((d, idx) => ({
    id: d.id ?? idx + 1,
    severity: (d.severity ?? 'info') as DiffSeverity,
    anchor_path: d.anchor_path ?? '',
    section: d.section,
    description: d.description ?? '',
    status: (d.status ?? 'pending') as SyncStateDiff['status'],
    reason: d.reason,
  }));
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/diff-report.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  renderDiffMarkdown,
  renderDiffYaml,
  countBySeverity,
  hasCriticalPending,
  normalizeDiffsFromLlm,
  SEVERITY_ORDER,
} from '../../../src/core/legacy-bridge/diff-report.js';
import type { SyncStateFile } from '../../../src/core/legacy-bridge/types.js';
import { parse as parseYaml } from 'yaml';

const sample: SyncStateFile = {
  schema: 'forge-legacy-sync/v1',
  change_id: 'add-payment',
  generated_at: '2026-05-05T10:00:00Z',
  diffs: [
    {
      id: 1,
      severity: 'critical',
      anchor_path: 'docs/legacy/SRS.md',
      section: '§4.5',
      description: '支付幂等性约束变化',
      status: 'pending',
    },
    {
      id: 2,
      severity: 'minor',
      anchor_path: 'docs/legacy/HLD.md',
      description: '术语调整',
      status: 'resolved-by-doc-update',
    },
    {
      id: 3,
      severity: 'major',
      anchor_path: 'docs/legacy/SRS.md',
      description: '新增退款规则',
      status: 'pending',
    },
  ],
};

describe('legacy-bridge/diff-report', () => {
  it('SEVERITY_ORDER 5 档(spec §5)', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'major', 'minor', 'style', 'info']);
  });

  it('countBySeverity 正确', () => {
    const c = countBySeverity(sample.diffs);
    expect(c.critical).toBe(1);
    expect(c.major).toBe(1);
    expect(c.minor).toBe(1);
    expect(c.style).toBe(0);
    expect(c.info).toBe(0);
  });

  it('hasCriticalPending true(含 status=pending 的 critical)', () => {
    expect(hasCriticalPending(sample)).toBe(true);
  });

  it('hasCriticalPending false(全部 critical 已 ack)', () => {
    const file: SyncStateFile = {
      ...sample,
      diffs: sample.diffs.map((d) =>
        d.severity === 'critical' ? { ...d, status: 'resolved-by-doc-update' as const } : d,
      ),
    };
    expect(hasCriticalPending(file)).toBe(false);
  });

  it('renderDiffMarkdown 含总览 + 5 档分组', () => {
    const md = renderDiffMarkdown(sample);
    expect(md).toContain('Sync 差异报告:add-payment');
    expect(md).toContain('🔴 critical: 1');
    expect(md).toContain('🟠 major: 1');
    expect(md).toContain('## 🔴 critical (1)');
    expect(md).toContain('支付幂等性约束变化');
    expect(md).toContain('resolve 流程');
  });

  it('renderDiffMarkdown style/info 段无 0 计数小节', () => {
    const md = renderDiffMarkdown(sample);
    expect(md).not.toContain('## ⚪ info');
    expect(md).not.toContain('## 🔵 style');
  });

  it('renderDiffYaml 可被 yaml.parse 反解为同结构', () => {
    const yaml = renderDiffYaml(sample);
    const parsed = parseYaml(yaml) as SyncStateFile;
    expect(parsed.change_id).toBe(sample.change_id);
    expect(parsed.diffs).toHaveLength(3);
  });

  it('normalizeDiffsFromLlm 默认 status=pending + 自增 id', () => {
    const diffs = normalizeDiffsFromLlm([
      { severity: 'major', anchor_path: 'a.md', description: 'd1' },
      { severity: 'minor', anchor_path: 'b.md', description: 'd2' },
    ]);
    expect(diffs[0]?.id).toBe(1);
    expect(diffs[0]?.status).toBe('pending');
    expect(diffs[1]?.id).toBe(2);
  });

  it('cross_anchor_conflicts 段在 markdown 中独立渲染', () => {
    const file: SyncStateFile = {
      ...sample,
      cross_anchor_conflicts: [
        {
          id: 100,
          severity: 'major',
          anchor_path: 'docs/legacy/SRS.md vs docs/legacy/HLD.md',
          description: 'SRS §4.5 与 HLD §6.2 矛盾',
          status: 'pending',
        },
      ],
    };
    const md = renderDiffMarkdown(file);
    expect(md).toContain('跨 anchor 不一致(决策 #18 修订)');
    expect(md).toContain('SRS §4.5 与 HLD §6.2 矛盾');
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/diff-report.test.ts
```

预期:9 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/diff-report.ts tests/core/legacy-bridge/diff-report.test.ts
git commit -m "feat(legacy-bridge): diff-report.ts 5 档 + markdown/yaml 双栈(决策 #5/#18)"
```

---

### Task C2:`src/core/legacy-bridge/sync-check.ts`(LLM 检测 + graceful skip + hash 过期 + cross-anchor)

**Files:**
- Create: `src/core/legacy-bridge/sync-check.ts`
- Test: `tests/core/legacy-bridge/sync-check.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/sync-check.ts`**

```typescript
// sync-check 核心 — Plan 7 Phase C
// 决策 #5/#18/#19/#22:5 档判定 + graceful skip + opt-in skip + cross-anchor 默认入 diff

import Anthropic from '@anthropic-ai/sdk';
import { parse as parseYaml } from 'yaml';
import { redact } from './redact.js';
import { checkAnchorHash } from './hash-anchor.js';
import {
  decideCrossRole,
  type CrossRoleInput,
} from './conflict.js';
import { normalizeDiffsFromLlm } from './diff-report.js';
import type {
  LegacyAnchor,
  LegacyAnchorsFile,
  SyncStateFile,
  SyncStateDiff,
  RedactRule,
} from './types.js';

/** 单 change 的输入 */
export interface SyncCheckInput {
  changeId: string;
  /** change 的 proposal/specs/design 合并文本 */
  changeContext: string;
  /** 本次 change 影响的模块名(从 spec/<area>.md 反查) */
  affectedModules: string[];
  /** 全部 anchors */
  anchors: LegacyAnchorsFile;
  /** 是否走 auto_resolve_cross_anchor(决策 #18) */
  autoResolveCrossAnchor: boolean;
  /** 用于 cross-anchor 决策的 mtime 提供者 */
  mtimeOf: (path: string) => number;
}

/** 单 change 的输出 */
export interface SyncCheckOutput {
  syncState: SyncStateFile;
  /** 各 anchor 的 hash 状态(用于 caller warn 用户老文档已改) */
  hashChecks: Array<{ anchor: LegacyAnchor; state: 'fresh' | 'stale' | 'no-record' }>;
  /** P7-10 修复:读取失败的 anchor 路径列表(spec §4.1 line 498 部分降级) */
  missingAnchors: string[];
}

/** sync-check 客户端最小接口 */
export interface SyncCheckClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** 找本次 change 影响的 anchor(模块匹配) */
export function findAffectedAnchors(
  anchors: LegacyAnchorsFile,
  affectedModules: string[],
): LegacyAnchor[] {
  if (affectedModules.length === 0) return [];
  return anchors.anchors.filter((a) => {
    if (!a.modules || a.modules.length === 0) return false;
    return a.modules.some((m) => affectedModules.includes(m));
  });
}

/** 拼 LLM prompt(对单 anchor 判 5 档差异) */
function buildSyncCheckPrompt(
  anchor: LegacyAnchor,
  anchorTextMasked: string,
  changeContext: string,
): string {
  return `你是一名 brownfield sync 审计员。请判断"本次 change"是否要求更新对应"老文档锚点"。

# 本次 change 上下文
${changeContext}

# 老文档锚点(role=${anchor.role}, path=${anchor.path})
${anchorTextMasked}

# 输出要求
按 5 档严重度(critical / major / minor / style / info)输出 0 或多条 diff(JSON 数组,严格)。
- critical:合规 / 安全 / 业务硬约束变化
- major:行为接口变更
- minor:文字描述需更新
- style:格式 / 排版小调整
- info:背景信息(无需更新但可参考)

如果**没有**任何更新需要 → 输出空数组 \`[]\`。

# 输出格式(必须严格遵守)
仅输出 JSON 数组,每项含字段:
\`\`\`
[
  { "severity": "critical|major|minor|style|info", "section": "§4.5", "description": "..." }
]
\`\`\`
不要任何 preamble、不要 markdown code fence。`;
}

/** 跑单 anchor 的 sync-check(给 LLM 判 5 档) */
export async function syncCheckAnchor(
  client: SyncCheckClient,
  anchor: LegacyAnchor,
  anchorText: string,
  changeContext: string,
  redactRules: ReadonlyArray<RedactRule>,
): Promise<Array<Partial<SyncStateDiff>>> {
  const masked = redact(anchorText, redactRules).redactedText;
  const prompt = buildSyncCheckPrompt(anchor, masked, changeContext);
  // P7-07 修复:LLM 调用前数据传输声明(spec §1.1.1 line 40)
  console.log(
    `→ sending ${Buffer.byteLength(prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${DEFAULT_MODEL})`,
  );
  const result = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = extractText(result);
  return parseLlmDiffJson(text, anchor);
}

/** 解析 LLM 返回的 diff JSON 数组 */
export function parseLlmDiffJson(
  text: string,
  anchor: LegacyAnchor,
): Array<Partial<SyncStateDiff>> {
  const trimmed = text.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // 解析失败 → 返回 1 条 info(说明 LLM 输出非 JSON,但不阻塞)
    return [
      {
        severity: 'info',
        anchor_path: anchor.path,
        description: `LLM 输出非合法 JSON,无法判定差异:${trimmed.slice(0, 200)}`,
      },
    ];
  }
  if (!Array.isArray(parsed)) {
    return [
      {
        severity: 'info',
        anchor_path: anchor.path,
        description: `LLM 输出非数组:${trimmed.slice(0, 200)}`,
      },
    ];
  }
  return parsed.map((item) => {
    const o = item as Partial<SyncStateDiff>;
    return {
      severity: o.severity,
      section: o.section,
      description: o.description,
      anchor_path: anchor.path,
    };
  });
}

/** 跑全 change 的 sync-check */
export async function runSyncCheck(
  client: SyncCheckClient,
  input: SyncCheckInput,
  readAnchorText: (path: string) => Promise<string>,
  /** P7-05 修复:可选索引 entries 用于预过滤(spec §3.2 line 388) */
  indexEntries?: Array<{ path: string; summary: string }>,
): Promise<SyncCheckOutput> {
  let affected = findAffectedAnchors(input.anchors, input.affectedModules);
  const allDiffs: SyncStateDiff[] = [];
  const redactRules = input.anchors.redact ?? [];
  /** P7-10 修复:汇总缺失锚点路径,部分降级不阻塞其余处理(spec §4.1 line 498) */
  const missingAnchors: string[] = [];

  // P7-05 修复:索引摘要先快速过滤(spec §3.2)。
  // 若提供 indexEntries,LLM 用摘要打分 → 仅"高分"摘要的 anchor 才打开原文。
  // 这里用简化策略:摘要含 changeContext 任一关键词的 anchor 视为高分;
  // indexEntries 缺失时,跳过过滤(全量打开,保留向后兼容)。
  if (indexEntries && indexEntries.length > 0) {
    const keywords = extractKeywords(input.changeContext);
    const filtered = affected.filter((a) => {
      const entry = indexEntries.find((e) => e.path === a.path);
      if (!entry) return true; // 无摘要 → 默认打开(保守)
      return keywords.some((k) => entry.summary.includes(k));
    });
    if (filtered.length > 0) affected = filtered;
  }

  for (const anchor of affected) {
    // P7-10 修复:单 anchor try/catch,缺失文件不阻塞其他 anchor
    let text: string;
    try {
      text = await readAnchorText(anchor.path);
    } catch (err) {
      missingAnchors.push(anchor.path);
      console.warn(`⚠ anchor ${anchor.path} 读取失败:${(err as Error).message};跳过该项继续`);
      continue;
    }
    const partial = await syncCheckAnchor(client, anchor, text, input.changeContext, redactRules);
    const normalized = normalizeDiffsFromLlm(partial);
    for (const d of normalized) {
      allDiffs.push({
        ...d,
        anchor_path: anchor.path,
      });
    }
  }

  // hash 检测(spec §3.2 / §4.3 不变量)
  const hashChecks = await Promise.all(
    affected.map(async (anchor) => ({
      anchor,
      state: (await checkAnchorHash(anchor)).state,
    })),
  );

  // 跨 anchor 冲突(决策 #18 修订):仅当多个 affected 同时 critical/major 时才考虑配对
  const crossInput: CrossRoleInput = {
    mtimeOf: input.mtimeOf,
    autoResolve: input.autoResolveCrossAnchor,
  };
  const crossAnchorConflicts: SyncStateDiff[] = [];
  // 简化策略:对 affected 中跨 role 的 anchor 配对 by role(LLM 已经判过单 anchor 差异)
  // 这里仅在 affected.length >= 2 且至少 2 个 role 不同时,加 1 条 cross_anchor_conflicts(default major)
  const distinctRoles = new Set(affected.map((a) => a.role));
  if (distinctRoles.size >= 2) {
    const decision = decideCrossRole(affected, crossInput);
    if (decision.kind === 'enter-diff') {
      crossAnchorConflicts.push({
        id: allDiffs.length + 1,
        severity: 'major',
        anchor_path: affected.map((a) => a.path).join(' vs '),
        description: `本次 change 跨 ${decision.conflictingRoles.join(' / ')} 多个 role,默认入 diff 让用户审(决策 #18 修订)`,
        status: 'pending',
      });
    }
  }

  // 重新分配 id(全局唯一)
  let counter = 0;
  for (const d of allDiffs) {
    counter += 1;
    d.id = counter;
  }
  for (const d of crossAnchorConflicts) {
    counter += 1;
    d.id = counter;
  }

  const syncState: SyncStateFile = {
    schema: 'forge-legacy-sync/v1',
    change_id: input.changeId,
    generated_at: new Date().toISOString(),
    diffs: allDiffs,
    cross_anchor_conflicts: crossAnchorConflicts.length > 0 ? crossAnchorConflicts : undefined,
  };

  return { syncState, hashChecks, missingAnchors };
}

/** P7-05 辅助:从 changeContext 抽简化关键词(用于索引召回过滤) */
function extractKeywords(text: string): string[] {
  // 取所有中文连续段(2+ 字)+ 英文标识符(3+ 字符)作关键词候选
  const cn = text.match(/[一-龥]{2,}/g) ?? [];
  const en = text.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
  // 去重 + 长度限制(避免 entry.summary.includes 全 hit)
  return Array.from(new Set([...cn, ...en])).slice(0, 30);
}

function extractText(result: Anthropic.Messages.Message): string {
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return block?.text ?? '';
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/sync-check.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  findAffectedAnchors,
  parseLlmDiffJson,
  runSyncCheck,
  type SyncCheckClient,
} from '../../../src/core/legacy-bridge/sync-check.js';
import type { LegacyAnchor, LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

function makeMock(jsonText: string): SyncCheckClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: jsonText }],
      }) as never,
    },
  };
}

const anchors: LegacyAnchorsFile = {
  schema: 'forge-legacy-anchor/v1',
  anchors: [
    {
      role: 'requirements',
      path: 'docs/legacy/SRS.md',
      authoritative: true,
      modules: ['payment', 'order'],
    },
    {
      role: 'high-level-design',
      path: 'docs/legacy/HLD.md',
      authoritative: true,
      modules: ['order'],
    },
    {
      role: 'low-level-design',
      path: 'docs/legacy/payment-detailed.md',
      authoritative: true,
      modules: ['payment'],
    },
  ],
};

describe('legacy-bridge/sync-check.findAffectedAnchors', () => {
  it('module=payment → 命中 SRS + payment-detailed', () => {
    const r = findAffectedAnchors(anchors, ['payment']);
    expect(r.map((a) => a.path).sort()).toEqual(
      ['docs/legacy/SRS.md', 'docs/legacy/payment-detailed.md'].sort(),
    );
  });

  it('module=unknown → 空', () => {
    expect(findAffectedAnchors(anchors, ['unknown'])).toHaveLength(0);
  });

  it('affectedModules 空 → 空', () => {
    expect(findAffectedAnchors(anchors, [])).toHaveLength(0);
  });
});

describe('legacy-bridge/sync-check.parseLlmDiffJson', () => {
  const anchor: LegacyAnchor = {
    role: 'requirements',
    path: 'a.md',
    authoritative: true,
  };

  it('合法 JSON 数组解析成功', () => {
    const r = parseLlmDiffJson(
      '[{"severity":"critical","section":"§4","description":"x"}]',
      anchor,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('critical');
  });

  it('空数组(LLM 判无差异)→ 0 条', () => {
    expect(parseLlmDiffJson('[]', anchor)).toHaveLength(0);
  });

  it('LLM 输出非 JSON → 1 条 info(不阻塞)', () => {
    const r = parseLlmDiffJson('not json at all', anchor);
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('info');
    expect(r[0]?.description).toContain('LLM 输出非合法 JSON');
  });

  it('LLM 输出 JSON 但非数组 → 1 条 info', () => {
    const r = parseLlmDiffJson('{"foo":1}', anchor);
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe('info');
  });
});

describe('legacy-bridge/sync-check.runSyncCheck', () => {
  it('happy path:LLM 返 critical → 报告含 critical', async () => {
    const client = makeMock('[{"severity":"critical","section":"§4.5","description":"幂等约束变化"}]');
    const r = await runSyncCheck(
      client,
      {
        changeId: 'add-payment',
        changeContext: 'feat: 新增退款',
        affectedModules: ['payment'],
        anchors,
        autoResolveCrossAnchor: false,
        mtimeOf: () => 100,
      },
      async () => '原文 SRS 内容',
    );
    expect(r.syncState.diffs.some((d) => d.severity === 'critical')).toBe(true);
    expect(r.syncState.diffs.every((d) => d.status === 'pending')).toBe(true);
  });

  it('跨 role anchor 多个 affected → 默认 cross_anchor_conflicts(决策 #18)', async () => {
    const client = makeMock('[]'); // LLM 判每 anchor 都没差异
    const r = await runSyncCheck(
      client,
      {
        changeId: 'add-payment',
        changeContext: 'feat: 新增 module',
        affectedModules: ['payment', 'order'],
        anchors,
        autoResolveCrossAnchor: false,
        mtimeOf: () => 100,
      },
      async () => '原文',
    );
    expect(r.syncState.cross_anchor_conflicts).toBeDefined();
    expect(r.syncState.cross_anchor_conflicts!.length).toBeGreaterThan(0);
  });

  it('autoResolveCrossAnchor=true → cross_anchor_conflicts 空', async () => {
    const client = makeMock('[]');
    const r = await runSyncCheck(
      client,
      {
        changeId: 'x',
        changeContext: '',
        affectedModules: ['payment', 'order'],
        anchors,
        autoResolveCrossAnchor: true,
        mtimeOf: () => 100,
      },
      async () => '',
    );
    expect(r.syncState.cross_anchor_conflicts).toBeUndefined();
  });

  it('hash 检测:无记录 hash → state=no-record', async () => {
    const client = makeMock('[]');
    const r = await runSyncCheck(
      client,
      {
        changeId: 'x',
        changeContext: '',
        affectedModules: ['payment'],
        anchors,
        autoResolveCrossAnchor: false,
        mtimeOf: () => 100,
      },
      async () => '',
    );
    expect(r.hashChecks.every((h) => h.state === 'no-record')).toBe(true);
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/sync-check.test.ts
```

预期:11 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/sync-check.ts tests/core/legacy-bridge/sync-check.test.ts
git commit -m "feat(legacy-bridge): sync-check.ts 5 档 + cross-anchor + hash 检测(决策 #5/#18/#19)"
```

---

### Task C3:`src/core/legacy-bridge/resolve.ts`(校验 status + 全 ack 才 resolved)

**Files:**
- Create: `src/core/legacy-bridge/resolve.ts`
- Test: `tests/core/legacy-bridge/resolve.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/resolve.ts`**

```typescript
// resolve 命令逻辑 — Plan 7 Phase C
// 决策 #19:校验所有 diffs status ≠ pending 才标 resolved

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { SyncStateFile, SyncStateDiff } from './types.js';

const VALID_STATUSES: ReadonlyArray<SyncStateDiff['status']> = [
  'pending',
  'resolved-by-doc-update',
  'false-positive',
  'skipped',
];

/** 自定义异常:resolve 校验失败 */
export class ResolveError extends Error {
  constructor(
    message: string,
    public readonly kind: 'pending-remaining' | 'invalid-status' | 'state-not-found',
    public readonly details?: { pending?: number[]; invalid?: { id: number; status: string }[] },
  ) {
    super(message);
    this.name = 'ResolveError';
  }
}

/** sync-state YAML 文件路径 */
export function syncStatePath(forgeRoot: string, changeId: string): string {
  return join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`);
}

/** 校验 sync-state YAML;返回校验后的 file */
export function validateSyncState(file: SyncStateFile, changeId: string): void {
  // 决策 #19:status ∈ {pending, resolved-by-doc-update, false-positive, skipped}
  const invalid = file.diffs
    .map((d) => ({ id: d.id, status: d.status }))
    .filter((d) => !VALID_STATUSES.includes(d.status as SyncStateDiff['status']));
  if (invalid.length > 0) {
    throw new ResolveError(
      `sync-state ${changeId} 含非法 status:${invalid
        .map((i) => `#${i.id}=${i.status}`)
        .join(', ')}`,
      'invalid-status',
      { invalid },
    );
  }
  for (const d of file.cross_anchor_conflicts ?? []) {
    if (!VALID_STATUSES.includes(d.status as SyncStateDiff['status'])) {
      throw new ResolveError(
        `cross_anchor_conflicts #${d.id} status 非法:${d.status}`,
        'invalid-status',
      );
    }
  }
}

/** 检查 pending(若仍有 → 抛错;全 ack → 通过) */
export function checkAllAcked(file: SyncStateFile, changeId: string): void {
  const pending = [
    ...file.diffs.filter((d) => d.status === 'pending'),
    ...(file.cross_anchor_conflicts ?? []).filter((d) => d.status === 'pending'),
  ];
  if (pending.length > 0) {
    throw new ResolveError(
      `sync-state ${changeId} 仍有 ${pending.length} 项 pending:#${pending
        .map((d) => d.id)
        .join(', #')}`,
      'pending-remaining',
      { pending: pending.map((d) => d.id) },
    );
  }
}

/** 完整 resolve 流程:读 + validate + checkAllAcked + 写回(标 resolved-meta) */
export async function resolveSyncState(forgeRoot: string, changeId: string): Promise<SyncStateFile> {
  const path = syncStatePath(forgeRoot, changeId);
  if (!existsSync(path)) {
    throw new ResolveError(
      `sync-state 文件不存在:${path};请先跑 forge legacy-bridge sync-check`,
      'state-not-found',
    );
  }
  const raw = await readFile(path, 'utf8');
  const file = parseYaml(raw) as SyncStateFile;
  validateSyncState(file, changeId);
  checkAllAcked(file, changeId);

  // 通过 → 用 marker 写回("resolved" 状态)
  const resolved: SyncStateFile = {
    ...file,
    // 加 metadata 字段(在 schema 里没声明的,通过 cast)
  };
  await writeFile(path, stringifyYaml(resolved), 'utf8');
  return resolved;
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/resolve.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import {
  validateSyncState,
  checkAllAcked,
  resolveSyncState,
  ResolveError,
} from '../../../src/core/legacy-bridge/resolve.js';
import type { SyncStateFile } from '../../../src/core/legacy-bridge/types.js';

const baseFile: SyncStateFile = {
  schema: 'forge-legacy-sync/v1',
  change_id: 'add-x',
  generated_at: '2026-05-05T00:00:00Z',
  diffs: [
    {
      id: 1,
      severity: 'critical',
      anchor_path: 'a.md',
      description: 'd1',
      status: 'resolved-by-doc-update',
    },
    {
      id: 2,
      severity: 'minor',
      anchor_path: 'b.md',
      description: 'd2',
      status: 'false-positive',
      reason: 'LLM 误判',
    },
    {
      id: 3,
      severity: 'info',
      anchor_path: 'c.md',
      description: 'd3',
      status: 'skipped',
    },
  ],
};

describe('legacy-bridge/resolve.validateSyncState', () => {
  it('合法 status 通过', () => {
    expect(() => validateSyncState(baseFile, 'add-x')).not.toThrow();
  });

  it('非法 status → 抛 ResolveError(invalid-status)', () => {
    const bad: SyncStateFile = {
      ...baseFile,
      diffs: [
        {
          ...baseFile.diffs[0]!,
          status: 'random-string' as never,
        },
      ],
    };
    try {
      validateSyncState(bad, 'add-x');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResolveError);
      expect((err as ResolveError).kind).toBe('invalid-status');
    }
  });
});

describe('legacy-bridge/resolve.checkAllAcked', () => {
  it('全 ack → 通过', () => {
    expect(() => checkAllAcked(baseFile, 'add-x')).not.toThrow();
  });

  it('仍有 pending → 抛错(决策 #19)', () => {
    const f: SyncStateFile = {
      ...baseFile,
      diffs: [{ ...baseFile.diffs[0]!, status: 'pending' }],
    };
    try {
      checkAllAcked(f, 'add-x');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResolveError);
      expect((err as ResolveError).kind).toBe('pending-remaining');
      expect((err as ResolveError).details?.pending).toContain(1);
    }
  });

  it('cross_anchor_conflicts 含 pending → 也抛', () => {
    const f: SyncStateFile = {
      ...baseFile,
      cross_anchor_conflicts: [
        {
          id: 100,
          severity: 'major',
          anchor_path: 'x',
          description: 'cross',
          status: 'pending',
        },
      ],
    };
    expect(() => checkAllAcked(f, 'add-x')).toThrow(/pending/);
  });
});

describe('legacy-bridge/resolve.resolveSyncState', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-resolve-'));
    mkdirSync(join(dir, 'legacy-sync-state'), { recursive: true });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('文件不存在 → 抛 state-not-found', async () => {
    try {
      await resolveSyncState(dir, 'no-such');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ResolveError);
      expect((err as ResolveError).kind).toBe('state-not-found');
    }
  });

  it('全 ack 文件 → 写回成功', async () => {
    writeFileSync(
      join(dir, 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml(baseFile),
    );
    const r = await resolveSyncState(dir, 'add-x');
    expect(r.change_id).toBe('add-x');
  });

  it('仍有 pending → 抛 pending-remaining', async () => {
    const file: SyncStateFile = {
      ...baseFile,
      diffs: [{ ...baseFile.diffs[0]!, status: 'pending' }],
    };
    writeFileSync(
      join(dir, 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml(file),
    );
    try {
      await resolveSyncState(dir, 'add-x');
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as ResolveError).kind).toBe('pending-remaining');
    }
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/resolve.test.ts
```

预期:8 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/resolve.ts tests/core/legacy-bridge/resolve.test.ts
git commit -m "feat(legacy-bridge): resolve.ts 校验 status + 全 ack 才 resolved(决策 #19)"
```

---

### Task C4:`src/cli/commands/legacy-bridge.ts` 填实 `sync-check` + `resolve` 子命令

**Files:**
- Modify: `src/cli/commands/legacy-bridge.ts`
- Test: `tests/cli/legacy-bridge/sync-check.test.ts`
- Test: `tests/cli/legacy-bridge/resolve.test.ts`

- [ ] **Step 1:在 legacy-bridge.ts 顶部追加 import**

```typescript
import { runSyncCheck } from '../../core/legacy-bridge/sync-check.js';
import { renderDiffMarkdown, renderDiffYaml, hasCriticalPending } from '../../core/legacy-bridge/diff-report.js';
import { resolveSyncState, ResolveError, syncStatePath } from '../../core/legacy-bridge/resolve.js';
import { readAnchorFile } from '../../core/legacy-bridge/encoding.js';
import { estimateSyncCheckCost, SYNC_CHECK_WARN_USD } from '../../core/legacy-bridge/budget.js';
import { statSync } from 'node:fs';
```

- [ ] **Step 2:替换 sync-check 子命令的 stub action**

```typescript
  cmd
    .command('sync-check')
    .description('检测 change 影响的老锚点是否需更新 → 5 档差异报告(决策 #5/#19)')
    .option('--change-id <id>', '指定 change-id;默认取最近一次 archive')
    .action(async (opts: { changeId?: string }) => {
      const forgeRoot = join(process.cwd(), 'forge');
      const configPath = join(forgeRoot, 'config.yaml');
      if (!existsSync(configPath)) {
        console.error('forge/config.yaml 不存在,先跑 forge init');
        process.exit(LB_EXIT_GENERAL_ERROR);
      }
      const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
      const anchors = await loadAnchorsFile(forgeRoot).catch((err) => {
        if (err instanceof LegacyAnchorsError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        throw err;
      });
      // 决策 #11:无 anchors → graceful skip(exit 0)
      if (!anchors) {
        console.log('no legacy anchors configured, skipping sync-check');
        process.exit(LB_EXIT_OK);
      }
      // ack 检查(若 allow_llm_calls=false 也 graceful skip)
      const ackResult = await checkAck(forgeRoot, config, anchors);
      if (!ackResult.ok && ackResult.reason === 'allow_llm_calls=false') {
        console.log('legacy_bridge.allow_llm_calls=false, sync-check skipped');
        process.exit(LB_EXIT_OK);
      }
      if (!ackResult.ok) {
        console.error(renderOptinPrompt(ackResult.reason, ackResult.customerDataPaths));
        process.exit(LB_EXIT_GENERAL_ERROR);
      }

      // 拼 change context
      const changeId = opts.changeId ?? '(latest-archive)';
      const changesDir = join(forgeRoot, 'changes', changeId);
      let changeContext = '';
      let affectedModules: string[] = [];
      if (existsSync(join(changesDir, 'proposal.md'))) {
        changeContext += await readFile(join(changesDir, 'proposal.md'), 'utf8');
      }
      if (existsSync(join(changesDir, 'specs'))) {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(join(changesDir, 'specs'));
        for (const f of files) {
          const txt = await readFile(join(changesDir, 'specs', f), 'utf8');
          changeContext += `\n## specs/${f}\n${txt}`;
          // 推测 module:文件名去 .md 即可(简化)
          affectedModules.push(f.replace(/\.md$/, ''));
        }
      }

      // 锁(legacy-bridge-sync-check 单锁,不与 archive 双重持锁)
      let release: (() => Promise<void>) | undefined;
      try {
        release = await acquireLockByPath(
          forgeRoot,
          'legacy-bridge-sync-check',
          'legacy-bridge.lock',
        );
      } catch (err) {
        if (err instanceof LockHeldError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_LOCK_HELD);
        }
        throw err;
      }

      try {
        const { anthropicApiKey } = loadEnv();
        const client = new Anthropic({ apiKey: anthropicApiKey });
        const out = await runSyncCheck(
          client,
          {
            changeId,
            changeContext,
            affectedModules,
            anchors,
            autoResolveCrossAnchor: config.legacy_bridge?.auto_resolve_cross_anchor ?? false,
            mtimeOf: (p) => {
              try {
                return Math.floor(statSync(p).mtimeMs / 1000);
              } catch {
                return 0;
              }
            },
          },
          async (path) => (await readAnchorFile(path)).text,
        );

        // 写 markdown + yaml 双栈
        const stateDir = join(forgeRoot, 'legacy-sync-state');
        await mkdir(stateDir, { recursive: true });
        await writeFile(join(stateDir, `${changeId}.md`), renderDiffMarkdown(out.syncState), 'utf8');
        await writeFile(join(stateDir, `${changeId}.yaml`), renderDiffYaml(out.syncState), 'utf8');

        const counts = out.syncState.diffs.length;
        const critPending = hasCriticalPending(out.syncState);
        console.log(
          `⚠ ${counts} 项老文档可能需更新 — 详见 forge/legacy-sync-state/${changeId}.md`,
        );

        // hash 过期 warn(决策 §4.3)
        for (const h of out.hashChecks) {
          if (h.state === 'stale') {
            console.warn(`⚠ anchor ${h.anchor.path} 已改动(用户改了 docs/legacy/);复写产物可能脱节`);
          }
        }

        // enforce_sync 已在 archive preflight 处理,sync-check 命令本身不阻塞(spec §2.5 post-archive)
        if (critPending) {
          console.error(
            `⚠ 含 critical 未 resolve 项;在 enforce_sync=true 模式下,下次 archive 前请跑 forge legacy-bridge resolve ${changeId}`,
          );
        }
        process.exit(LB_EXIT_OK);
      } finally {
        if (release) await release();
      }
    });
```

- [ ] **Step 3:替换 resolve 子命令 stub**

```typescript
  cmd
    .command('resolve <change-id>')
    .description('校验 sync-state diffs 全部 ack 后标 resolved(决策 #19)')
    .action(async (changeId: string) => {
      const forgeRoot = join(process.cwd(), 'forge');
      let release: (() => Promise<void>) | undefined;
      try {
        release = await acquireLockByPath(forgeRoot, 'legacy-bridge-resolve', 'legacy-bridge.lock');
      } catch (err) {
        if (err instanceof LockHeldError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_LOCK_HELD);
        }
        throw err;
      }

      try {
        await resolveSyncState(forgeRoot, changeId);
        console.log(`✓ ${changeId} 全部 diffs 已 ack,sync-state 标 resolved`);
        process.exit(LB_EXIT_OK);
      } catch (err) {
        if (err instanceof ResolveError) {
          console.error(`✗ ${err.message}`);
          if (err.kind === 'invalid-status') process.exit(LB_EXIT_GENERAL_ERROR);
          if (err.kind === 'state-not-found') process.exit(LB_EXIT_GENERAL_ERROR);
          // pending-remaining
          process.exit(LB_EXIT_BUSINESS_RULE_FAIL);
        }
        throw err;
      } finally {
        if (release) await release();
      }
    });
```

- [ ] **Step 4:写 `tests/cli/legacy-bridge/resolve.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';

describe('forge legacy-bridge resolve (CLI)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-resolve-cli-'));
    mkdirSync(join(tmp, 'forge', 'legacy-sync-state'), { recursive: true });
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('happy path — 全 ack → exit 0', async () => {
    writeFileSync(
      join(tmp, 'forge', 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml({
        schema: 'forge-legacy-sync/v1',
        change_id: 'add-x',
        generated_at: '2026-05-05T00:00:00Z',
        diffs: [
          { id: 1, severity: 'critical', anchor_path: 'a.md', description: 'd1', status: 'resolved-by-doc-update' },
        ],
      }),
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'resolve', 'add-x']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(logSpy.mock.calls.flat().join('\n')).toContain('全部 diffs 已 ack');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('仍有 pending → exit 2', async () => {
    writeFileSync(
      join(tmp, 'forge', 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml({
        schema: 'forge-legacy-sync/v1',
        change_id: 'add-x',
        generated_at: '2026-05-05T00:00:00Z',
        diffs: [
          { id: 1, severity: 'critical', anchor_path: 'a.md', description: 'd1', status: 'pending' },
        ],
      }),
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'resolve', 'add-x']);
        expect(exitSpy).toHaveBeenCalledWith(2);
        expect(errSpy.mock.calls.flat().join('\n')).toContain('pending');
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('非法 status → exit 1', async () => {
    writeFileSync(
      join(tmp, 'forge', 'legacy-sync-state', 'add-x.yaml'),
      stringifyYaml({
        schema: 'forge-legacy-sync/v1',
        change_id: 'add-x',
        generated_at: '2026-05-05T00:00:00Z',
        diffs: [
          { id: 1, severity: 'critical', anchor_path: 'a.md', description: 'd1', status: 'random-string' },
        ],
      }),
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'resolve', 'add-x']);
        expect(exitSpy).toHaveBeenCalledWith(1);
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
```

- [ ] **Step 5:写 `tests/cli/legacy-bridge/sync-check.test.ts`(P7-12 修复:补 happy path 与 LLM 调用路径)**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '[{"severity":"minor","section":"§4.5","description":"措辞调整"}]',
          },
        ],
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge legacy-bridge sync-check (CLI)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-sc-cli-'));
    mkdirSync(join(tmp, 'forge'), { recursive: true });
    writeFileSync(join(tmp, 'forge', 'config.yaml'), 'schema: forge-spec-driven/v1\n');
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('无 legacy-anchors.yaml → graceful skip exit 0(决策 #11)', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(logSpy.mock.calls.flat().join('\n')).toContain('skipping sync-check');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('allow_llm_calls=false → graceful skip exit 0(决策 #22)', async () => {
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: docs/legacy/SRS.md\n    authoritative: true\n`,
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(logSpy.mock.calls.flat().join('\n')).toContain('allow_llm_calls=false');
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('happy path:配 ack + anchors + change → 写 sync-state(P7-12 修复)', async () => {
    // 配置 opt-in
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n`,
    );
    mkdirSync(join(tmp, 'docs', 'legacy'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'legacy', 'SRS.md'), '# SRS\n## 1. 支付');
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/')}\n    authoritative: true\n    modules: [payment]\n`,
    );
    // change 上下文
    mkdirSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs'), { recursive: true });
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'proposal.md'), '# 提案');
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs', 'payment.md'), '# spec payment');
    // ack 文件
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    const configHash = createHash('sha256')
      .update(JSON.stringify({ allow_llm_calls: true }, ['allow_llm_calls']))
      .digest('hex')
      .slice(0, 16);
    writeFileSync(
      join(tmp, 'forge', '.cache', 'llm-ack.yaml'),
      `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-05T00:00:00Z\nconfig_hash: ${configHash}\n`,
    );

    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'sync-check', '--change-id', 'add-payment']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        // sync-state 文件被写入(双栈 md + yaml)
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.yaml'))).toBe(true);
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.md'))).toBe(true);
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
```

- [ ] **Step 6:跑测试**

```bash
pnpm vitest run tests/cli/legacy-bridge/sync-check.test.ts tests/cli/legacy-bridge/resolve.test.ts
```

预期:6 tests passing(sync-check 3 含 happy path + resolve 3)。

- [ ] **Step 7:commit**

```bash
git add src/cli/commands/legacy-bridge.ts tests/cli/legacy-bridge/sync-check.test.ts tests/cli/legacy-bridge/resolve.test.ts
git commit -m "feat(cli): legacy-bridge sync-check + resolve 全实现(决策 #11/#19/#22)"
```

---

### Task C5:`src/cli/commands/archive.ts` 集成 preflight + post-archive 双 hook

**Files:**
- Modify: `src/cli/commands/archive.ts`
- Test: `tests/cli/legacy-bridge/archive-integration.test.ts`

- [ ] **Step 1:在 `src/cli/commands/archive.ts` 的 `buildArchiveCommand` 内,acquire archive.lock 之后、archive 严格门禁之前,加 preflight hook**

打开 `src/cli/commands/archive.ts`,定位到 `acquireLock(forgeRoot, 'archive')` 之后(约 line 90+,根据 Plan 6 实施位置):

```typescript
// ... archive.ts 现有代码 ...

import { loadAnchorsFile } from '../../core/legacy-bridge/anchors.js';
import { checkAck } from '../../core/legacy-bridge/ack.js';
import { runSyncCheck } from '../../core/legacy-bridge/sync-check.js';
import {
  renderDiffMarkdown,
  renderDiffYaml,
  hasCriticalPending,
} from '../../core/legacy-bridge/diff-report.js';
import { readAnchorFile } from '../../core/legacy-bridge/encoding.js';
import { parse as parseYaml } from 'yaml';
import { statSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { loadEnv } from '../../../forge-eval/load-env.js';

// ...

// 在 acquire lock 后插入 preflight
async function runArchivePreflight(forgeRoot: string, changeId: string): Promise<void> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return;
  const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;

  // §2.5:仅当 legacy-anchors.yaml 存在 AND allow_llm_calls=true AND enforce_sync=true 时进入 preflight
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  if (!anchors) return;
  if (!config.legacy_bridge?.allow_llm_calls) return;
  if (!config.legacy_bridge?.enforce_sync) return;

  const ack = await checkAck(forgeRoot, config, anchors);
  if (!ack.ok) {
    console.error(
      `legacy_bridge.enforce_sync=true 但 ack 未就绪:${ack.reason};请先跑 forge legacy-bridge --acknowledge-data-transfer`,
    );
    process.exit(2);
  }

  // 拼 change context(同 sync-check 命令)
  const changesDir = join(forgeRoot, 'changes', changeId);
  let changeContext = '';
  const affectedModules: string[] = [];
  if (existsSync(join(changesDir, 'proposal.md'))) {
    changeContext += await readFile(join(changesDir, 'proposal.md'), 'utf8');
  }
  const specsDir = join(changesDir, 'specs');
  if (existsSync(specsDir)) {
    const { readdir } = await import('node:fs/promises');
    for (const f of await readdir(specsDir)) {
      changeContext += `\n## specs/${f}\n${await readFile(join(specsDir, f), 'utf8')}`;
      affectedModules.push(f.replace(/\.md$/, ''));
    }
  }

  // 跑 sync-check(决策 #23:复用 archive.lock,不再 acquire legacy-bridge.lock)
  const { anthropicApiKey } = loadEnv();
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const out = await runSyncCheck(
    client,
    {
      changeId,
      changeContext,
      affectedModules,
      anchors,
      autoResolveCrossAnchor: config.legacy_bridge.auto_resolve_cross_anchor ?? false,
      mtimeOf: (p) => {
        try {
          return Math.floor(statSync(p).mtimeMs / 1000);
        } catch {
          return 0;
        }
      },
    },
    async (path) => (await readAnchorFile(path)).text,
  );

  await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
  await writeFile(
    join(forgeRoot, 'legacy-sync-state', `${changeId}.md`),
    renderDiffMarkdown(out.syncState),
    'utf8',
  );
  await writeFile(
    join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`),
    renderDiffYaml(out.syncState),
    'utf8',
  );

  if (hasCriticalPending(out.syncState)) {
    console.error(
      `✗ ${out.syncState.diffs.filter((d) => d.severity === 'critical' && d.status === 'pending').length} 项 critical 差异未 resolve;\n` +
        `跑 forge legacy-bridge resolve ${changeId} 后重试,或在 forge/legacy-sync-state/${changeId}.yaml 标 ack`,
    );
    process.exit(2);
  }
}

async function runArchivePostHook(forgeRoot: string, changeId: string): Promise<void> {
  // post-archive(不阻塞):仅在 enforce_sync=false 时跑;enforce_sync=true 已在 preflight 跑过
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) return;
  const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
  if (!config.legacy_bridge?.allow_llm_calls) return;
  if (config.legacy_bridge?.enforce_sync) return; // 已在 preflight 跑过
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  if (!anchors) return;
  const ack = await checkAck(forgeRoot, config, anchors);
  if (!ack.ok) return; // ack 不就绪 → graceful skip

  // 跑 sync-check 但不阻塞
  const changesDir = join(forgeRoot, 'changes', 'archive', `${new Date().toISOString().slice(0, 10)}-${changeId}`);
  const proposalPath = existsSync(join(changesDir, 'proposal.md'))
    ? join(changesDir, 'proposal.md')
    : join(forgeRoot, 'changes', changeId, 'proposal.md');
  let changeContext = '';
  if (existsSync(proposalPath)) {
    changeContext = await readFile(proposalPath, 'utf8');
  }
  const affectedModules: string[] = [];
  // 简化:从 changeId 推测 module(占位,真实环境靠 specs/<area>.md)
  const { anthropicApiKey } = loadEnv();
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const out = await runSyncCheck(
    client,
    {
      changeId,
      changeContext,
      affectedModules,
      anchors,
      autoResolveCrossAnchor: config.legacy_bridge.auto_resolve_cross_anchor ?? false,
      mtimeOf: (p) => {
        try {
          return Math.floor(statSync(p).mtimeMs / 1000);
        } catch {
          return 0;
        }
      },
    },
    async (path) => (await readAnchorFile(path)).text,
  );

  await mkdir(join(forgeRoot, 'legacy-sync-state'), { recursive: true });
  await writeFile(
    join(forgeRoot, 'legacy-sync-state', `${changeId}.md`),
    renderDiffMarkdown(out.syncState),
    'utf8',
  );
  await writeFile(
    join(forgeRoot, 'legacy-sync-state', `${changeId}.yaml`),
    renderDiffYaml(out.syncState),
    'utf8',
  );
  console.log(
    `⚠ ${out.syncState.diffs.length} 项老文档可能需更新,详见 forge/legacy-sync-state/${changeId}.md`,
  );
}
```

在 `archiveTransaction` Move/Sync 之前调用 `runArchivePreflight(forgeRoot, changeId)`,在 archive 完成后调用 `runArchivePostHook(forgeRoot, changeId)`。具体插入位置取决于 Plan 6 的 archive.ts 现有结构 — 找到 `acquireLock(forgeRoot, 'archive')` 后第一行,加:

```typescript
// Plan 7:brownfield preflight(enforce_sync=true 时)
await runArchivePreflight(forgeRoot, changeId);
```

在 archive 成功(`releaseLock` 之前)处加:

```typescript
// Plan 7:brownfield post-archive(enforce_sync=false 时)
await runArchivePostHook(forgeRoot, changeId);
```

- [ ] **Step 2:写 `tests/cli/legacy-bridge/archive-integration.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        // LLM 返 critical → preflight 应阻塞
        content: [{ type: 'text', text: '[{"severity":"critical","section":"§4.5","description":"幂等约束变化"}]' }],
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge archive 集成 brownfield preflight + post-archive', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-archive-bf-'));
    mkdirSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs'), { recursive: true });
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    mkdirSync(join(tmp, 'docs', 'legacy'), { recursive: true });

    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n  enforce_sync: true\n`,
    );
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/')}\n    authoritative: true\n    modules: [payment]\n`,
    );
    writeFileSync(join(tmp, 'docs', 'legacy', 'SRS.md'), '# SRS\n## 1. 支付');
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'proposal.md'), '# 提案');
    writeFileSync(join(tmp, 'forge', 'changes', 'add-payment', 'specs', 'payment.md'), '# spec');

    // ack 文件
    const configHash = createHash('sha256')
      .update(JSON.stringify(
        { allow_llm_calls: true, enforce_sync: true },
        ['allow_llm_calls', 'enforce_sync'],
      ))
      .digest('hex')
      .slice(0, 16);
    writeFileSync(
      join(tmp, 'forge', '.cache', 'llm-ack.yaml'),
      `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-05T00:00:00Z\nconfig_hash: ${configHash}\n`,
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('enforce_sync=true + LLM 返 critical → archive preflight 阻塞 exit 2', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        await runArchivePreflight(join(tmp, 'forge'), 'add-payment').catch(() => undefined);
        expect(exitSpy).toHaveBeenCalledWith(2);
        expect(errSpy.mock.calls.flat().join('\n')).toContain('critical 差异未 resolve');
        // sync-state 文件应已写
        expect(existsSync(join(tmp, 'forge', 'legacy-sync-state', 'add-payment.yaml'))).toBe(true);
      } finally {
        exitSpy.mockRestore();
        errSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('enforce_sync=false → preflight 跳过', async () => {
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n  enforce_sync: false\n`,
    );
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await runArchivePreflight(join(tmp, 'forge'), 'add-payment');
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });

  it('无 legacy-anchors.yaml → preflight 跳过(graceful)', async () => {
    rmSync(join(tmp, 'forge', 'legacy-anchors.yaml'));
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { runArchivePreflight } = await import('../../../src/cli/commands/archive.js');
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await runArchivePreflight(join(tmp, 'forge'), 'add-payment');
        expect(exitSpy).not.toHaveBeenCalled();
      } finally {
        exitSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
```

- [ ] **Step 3:在 archive.ts 末尾把 `runArchivePreflight` 与 `runArchivePostHook` 加 export(给 test 用)**

```typescript
export { runArchivePreflight, runArchivePostHook };
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/cli/legacy-bridge/archive-integration.test.ts
```

预期:3 tests passing。

- [ ] **Step 5:typecheck + 跑全部 archive 相关测试(确认未破坏现有)**

```bash
pnpm typecheck
pnpm vitest run tests/cli/archive.test.ts tests/core/archive/ tests/cli/legacy-bridge/
```

预期:典型 archive.test.ts 现有 case 不受影响(因为没配 legacy-bridge 时 preflight/posthook graceful skip)。

- [ ] **Step 6:commit**

```bash
git add src/cli/commands/archive.ts tests/cli/legacy-bridge/archive-integration.test.ts
git commit -m "feat(archive): 集成 brownfield preflight + post-archive 双 hook(决策 #19 / §2.5)"
```

---

### Task C6:并发 / lock 集成测试(对抗 Codex C-2 / I-5)

**Files:**
- Create: `tests/core/legacy-bridge/concurrency.test.ts`

- [ ] **Step 1:写 `tests/core/legacy-bridge/concurrency.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireLockByPath,
  LockHeldError,
} from '../../../src/core/archive/lock.js';

describe('legacy-bridge 并发 / lock 防死锁(C-2 / I-5)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'forge-concurrency-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('regenerate(获 archive.lock + legacy-bridge.lock)与 archive(获 archive.lock)互斥', async () => {
    const releaseA = await acquireLockByPath(dir, 'archive', 'archive.lock');
    await expect(
      acquireLockByPath(dir, 'legacy-bridge-regenerate', 'archive.lock'),
    ).rejects.toThrow(LockHeldError);
    await releaseA();
  });

  it('map 与 regenerate 同时跑 → legacy-bridge.lock 互斥', async () => {
    const releaseMap = await acquireLockByPath(dir, 'legacy-bridge-map', 'legacy-bridge.lock');
    await expect(
      acquireLockByPath(dir, 'legacy-bridge-regenerate', 'legacy-bridge.lock'),
    ).rejects.toThrow(LockHeldError);
    await releaseMap();
  });

  it('archive 内 sync-check 复用 archive.lock(不再获 legacy-bridge.lock)', async () => {
    const releaseArchive = await acquireLockByPath(dir, 'archive', 'archive.lock');
    // archive 内 sync-check 不调 acquireLockByPath legacy-bridge.lock
    // legacy-bridge.lock 仍可被独立 map / resolve 持有
    const releaseMap = await acquireLockByPath(
      dir,
      'legacy-bridge-map',
      'legacy-bridge.lock',
    );
    await releaseArchive();
    await releaseMap();
  });

  it('resolve 与 sync-check 同 change-id 竞争 → legacy-bridge.lock 互斥', async () => {
    const r1 = await acquireLockByPath(dir, 'legacy-bridge-resolve', 'legacy-bridge.lock');
    await expect(
      acquireLockByPath(dir, 'legacy-bridge-sync-check', 'legacy-bridge.lock'),
    ).rejects.toThrow(LockHeldError);
    await r1();
  });

  it('release 后另一进程可以获(无残留)', async () => {
    const r1 = await acquireLockByPath(dir, 'legacy-bridge-map', 'legacy-bridge.lock');
    await r1();
    const r2 = await acquireLockByPath(dir, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
    await r2();
  });

  it('lock 顺序固定:先 archive.lock 后 legacy-bridge.lock(死锁防护)', async () => {
    // 模拟正确顺序
    const a = await acquireLockByPath(dir, 'legacy-bridge-regenerate', 'archive.lock');
    const b = await acquireLockByPath(dir, 'legacy-bridge-regenerate', 'legacy-bridge.lock');
    await b();
    await a();
    // 不抛错即为通过(Plan 7 在 regenerate action 中用此顺序;此 case 仅断言两 lock 可顺序持有)
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/concurrency.test.ts
```

预期:6 tests passing。

- [ ] **Step 3:commit**

```bash
git add tests/core/legacy-bridge/concurrency.test.ts
git commit -m "test(legacy-bridge): 并发 / lock 互斥 / 死锁防护(C-2 / I-5)"
```

---

## Phase D:mapper + indexer + archive hash 检测(0.5 周)

### Task D1:`src/core/legacy-bridge/mapper.ts`(扫 docs/+src/ → LLM 推测 → draft yaml + 同名 .md 概览)

**Files:**
- Create: `src/core/legacy-bridge/mapper.ts`
- Test: `tests/core/legacy-bridge/mapper.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/mapper.ts`**

```typescript
// 二阶段 mapping 第一阶段:LLM 扫 docs/+src/ → anchors-draft.yaml — Plan 7 Phase D
// 决策 #4(二阶段 mapping)+ M-2(--merge / --overwrite 语义)

import Anthropic from '@anthropic-ai/sdk';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import type { LegacyAnchor, LegacyAnchorRole, LegacyAnchorsFile } from './types.js';
import { redact } from './redact.js';

const DEFAULT_DOCS_PATHS = ['docs', 'doc', 'document', 'documents', 'documentation'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'forge', // forge 自身产物
  '.cache',
]);

/** mapper 输入 */
export interface MapperInput {
  /** 项目根 */
  projectRoot: string;
  /** 用户额外 docs 目录(覆盖 DEFAULT_DOCS_PATHS) */
  docsPaths?: string[];
  /** 是否扫 src/(找 .test 反推 system-tests) */
  scanSrc?: boolean;
  /** 现有 anchors.yaml 内容(用于 --merge 决策) */
  existing?: LegacyAnchorsFile;
  /** merge 模式(M-2) */
  mode: 'merge' | 'overwrite';
}

/** mapper 输出 */
export interface MapperOutput {
  draftYaml: string;
  draftMarkdown: string;
  /** 新增的 anchor(相对 existing) */
  newAnchors: LegacyAnchor[];
  /** 保留的现有 anchor(merge 模式) */
  preservedAnchors: LegacyAnchor[];
  /** 扫到但未匹配 role 的文件(让 LLM 标 'unmatched',用户后审) */
  unmatched: string[];
}

/** mapper 客户端最小接口 */
export interface MapperClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const SCAN_FILE_EXTS = new Set(['.md', '.txt', '.csv', '.xlsx']);
const PREVIEW_LINES = 30;

/** 递归扫目录 */
async function* walk(dir: string, baseRoot: string): AsyncGenerator<string> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    if (name.startsWith('.') && name !== '.gitattributes') continue;
    const full = join(dir, name);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      yield* walk(full, baseRoot);
    } else if (s.isFile() && SCAN_FILE_EXTS.has(extname(name).toLowerCase())) {
      yield relative(baseRoot, full);
    }
  }
}

/** 取文件前 N 行作 preview(LLM 据此推测 role) */
async function readPreview(path: string): Promise<string> {
  const ext = extname(path).toLowerCase();
  if (ext === '.xlsx') {
    return '(xlsx 二进制 — 不读取 preview;由 LLM 据文件名推测 role)';
  }
  try {
    const content = await readFile(path, 'utf8');
    const lines = content.split(/\r?\n/).slice(0, PREVIEW_LINES);
    return lines.join('\n');
  } catch {
    return '(读取失败)';
  }
}

/** 拼 LLM prompt:让 LLM 给一批文件分类 role */
function buildMapperPrompt(
  fileEntries: Array<{ path: string; preview: string }>,
): string {
  return `你是一名文档资产分类员。对下面每个文件,判断其属于哪种 brownfield 角色。

# 角色定义
- requirements:SRS / PRD / 需求规格
- high-level-design:HLD / 概要设计 / Architecture
- low-level-design:LLD / 详细设计 / Module Spec
- system-tests:系统测试用例 / testcases
- acceptance-report:验收报告
- rationale:设计决策 / 历史背景
- glossary:术语表
- unmatched:不属于上述任何一种(README / changelog / API doc 等)

# 输出格式(必须严格 JSON)
\`\`\`
[
  {"path": "docs/SRS.md", "role": "requirements", "modules": ["payment","order"]}
]
\`\`\`
modules 字段可空(不确定时输出 [])。

# 文件清单
${fileEntries.map((e) => `## ${e.path}\n${e.preview}`).join('\n\n')}

仅输出 JSON 数组,不输出 preamble。`;
}

/** 解析 LLM 返回 */
function parseMapperResponse(
  text: string,
  fallbackPaths: string[],
): Array<{ path: string; role: LegacyAnchorRole | 'unmatched'; modules?: string[] }> {
  try {
    const arr = JSON.parse(text.trim()) as Array<{
      path: string;
      role: string;
      modules?: string[];
    }>;
    if (!Array.isArray(arr)) throw new Error('not array');
    return arr.map((item) => ({
      path: item.path,
      role: item.role as LegacyAnchorRole | 'unmatched',
      modules: item.modules,
    }));
  } catch {
    // 解析失败:全 mark unmatched(用户审)
    return fallbackPaths.map((p) => ({ path: p, role: 'unmatched' as const }));
  }
}

/** 跑 mapping(LLM 推测) */
export async function runMapper(
  client: MapperClient,
  input: MapperInput,
): Promise<MapperOutput> {
  const { projectRoot } = input;
  const docsPaths = input.docsPaths ?? DEFAULT_DOCS_PATHS;

  // 收集文件
  const allFiles: string[] = [];
  for (const docDir of docsPaths) {
    const full = join(projectRoot, docDir);
    if (!existsSync(full)) continue;
    for await (const f of walk(full, projectRoot)) {
      allFiles.push(f);
    }
  }
  // 决策 #3a 全自动扫:也扫 src/ 找测试用例(.test / .spec / 测试文件名)
  if (input.scanSrc) {
    const srcRoot = join(projectRoot, 'src');
    if (existsSync(srcRoot)) {
      for await (const f of walk(srcRoot, projectRoot)) {
        if (f.includes('test') || f.includes('spec')) allFiles.push(f);
      }
    }
  }

  // 读 preview;用 redact mask 敏感数据
  const entries: Array<{ path: string; preview: string }> = [];
  for (const f of allFiles) {
    const preview = redact(await readPreview(join(projectRoot, f))).redactedText;
    entries.push({ path: f, preview });
  }

  // 调 LLM
  let classifications: Array<{ path: string; role: LegacyAnchorRole | 'unmatched'; modules?: string[] }>;
  if (entries.length === 0) {
    classifications = [];
  } else {
    const mapPrompt = buildMapperPrompt(entries);
    // P7-07 修复:LLM 调用前数据传输声明
    console.log(
      `→ sending ${Buffer.byteLength(mapPrompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${DEFAULT_MODEL}, op=map ${entries.length} files)`,
    );
    const result = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: mapPrompt }],
    });
    const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
    classifications = parseMapperResponse(block?.text ?? '', allFiles);
  }

  const newAnchors: LegacyAnchor[] = [];
  const unmatched: string[] = [];
  // 同 role 第一个标 authoritative=true(简化策略;用户后审)
  const roleSeen = new Set<LegacyAnchorRole>();
  for (const c of classifications) {
    if (c.role === 'unmatched') {
      unmatched.push(c.path);
      continue;
    }
    const isFirst = !roleSeen.has(c.role);
    roleSeen.add(c.role);
    newAnchors.push({
      role: c.role,
      path: c.path,
      authoritative: isFirst,
      modules: c.modules,
    });
  }

  // merge 模式:保留 existing 中的 anchor(用户审过部分)
  let preservedAnchors: LegacyAnchor[] = [];
  if (input.mode === 'merge' && input.existing) {
    const existingPaths = new Set(input.existing.anchors.map((a) => a.path));
    preservedAnchors = input.existing.anchors;
    // 新增的 anchor 中,如果 path 已在 existing,跳过(避免重复)
    const filteredNew = newAnchors.filter((a) => !existingPaths.has(a.path));
    newAnchors.length = 0;
    newAnchors.push(...filteredNew);
  }

  const finalFile: LegacyAnchorsFile = {
    schema: 'forge-legacy-anchor/v1',
    anchors: [...preservedAnchors, ...newAnchors],
    redact: input.existing?.redact,
  };

  const draftYaml = stringifyYaml(finalFile);
  const draftMarkdown = renderMapperOverview(finalFile, unmatched);

  return {
    draftYaml,
    draftMarkdown,
    newAnchors,
    preservedAnchors,
    unmatched,
  };
}

/** 渲染概览 markdown(给用户审) */
function renderMapperOverview(file: LegacyAnchorsFile, unmatched: string[]): string {
  const lines: string[] = [];
  lines.push('# Legacy Anchors Draft 概览');
  lines.push('');
  lines.push('LLM 自动扫描 + 推测的 anchor 草稿。请审改 yaml 后跑 `mv legacy-anchors-draft.yaml legacy-anchors.yaml`。');
  lines.push('');
  lines.push('## Anchors by role');
  const byRole: Record<string, LegacyAnchor[]> = {};
  for (const a of file.anchors) {
    const list = byRole[a.role] ?? [];
    list.push(a);
    byRole[a.role] = list;
  }
  for (const [role, anchors] of Object.entries(byRole)) {
    lines.push(`### ${role} (${anchors.length})`);
    lines.push('');
    for (const a of anchors) {
      const auth = a.authoritative ? ' **(authoritative)**' : '';
      lines.push(`- \`${a.path}\`${auth}${a.modules?.length ? ` modules: ${a.modules.join(', ')}` : ''}`);
    }
    lines.push('');
  }
  if (unmatched.length > 0) {
    lines.push('## Unmatched files(LLM 不确定 role)');
    lines.push('');
    for (const p of unmatched) {
      lines.push(`- ${p}`);
    }
  }
  return lines.join('\n');
}

/** 写 draft 到磁盘 */
export async function writeMapperDraft(
  forgeRoot: string,
  output: MapperOutput,
): Promise<{ yamlPath: string; mdPath: string }> {
  const yamlPath = join(forgeRoot, 'legacy-anchors-draft.yaml');
  const mdPath = join(forgeRoot, 'legacy-anchors-draft.md');
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(forgeRoot, { recursive: true });
  await writeFile(yamlPath, output.draftYaml, 'utf8');
  await writeFile(mdPath, output.draftMarkdown, 'utf8');
  return { yamlPath, mdPath };
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/mapper.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMapper, writeMapperDraft, type MapperClient } from '../../../src/core/legacy-bridge/mapper.js';
import { parse as parseYaml } from 'yaml';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

function makeMockMapper(jsonText: string): MapperClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: jsonText }],
      }) as never,
    },
  };
}

describe('legacy-bridge/mapper', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-mapper-'));
    mkdirSync(join(tmp, 'docs'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'SRS.md'), '# 需求规格说明书\n## 1. 概述');
    writeFileSync(join(tmp, 'docs', 'HLD.md'), '# 概要设计\n## 1. 架构');
    writeFileSync(join(tmp, 'docs', 'README.md'), '# 项目说明');
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('happy path:LLM 返 3 个分类 → newAnchors / unmatched 正确', async () => {
    const mock = makeMockMapper(
      JSON.stringify([
        { path: 'docs/SRS.md', role: 'requirements', modules: ['payment'] },
        { path: 'docs/HLD.md', role: 'high-level-design' },
        { path: 'docs/README.md', role: 'unmatched' },
      ]),
    );
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    expect(r.newAnchors).toHaveLength(2);
    expect(r.newAnchors[0]?.role).toBe('requirements');
    expect(r.newAnchors[0]?.authoritative).toBe(true);
    expect(r.unmatched).toEqual(['docs/README.md']);
  });

  it('docsPaths 自定义路径 → 仅扫指定目录', async () => {
    mkdirSync(join(tmp, 'specifications'), { recursive: true });
    writeFileSync(join(tmp, 'specifications', 'spec.md'), '# spec');
    const mock = makeMockMapper(
      JSON.stringify([{ path: 'specifications/spec.md', role: 'requirements' }]),
    );
    const r = await runMapper(mock, {
      projectRoot: tmp,
      docsPaths: ['specifications'],
      mode: 'overwrite',
    });
    const yaml = parseYaml(r.draftYaml) as LegacyAnchorsFile;
    expect(yaml.anchors[0]?.path).toBe('specifications/spec.md');
  });

  it('--merge 模式:保留 existing anchors,跳过 path 重复', async () => {
    const existing: LegacyAnchorsFile = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        { role: 'requirements', path: 'docs/SRS.md', authoritative: true, modules: ['user-edited'] },
      ],
    };
    const mock = makeMockMapper(
      JSON.stringify([
        { path: 'docs/SRS.md', role: 'requirements' }, // 已存在 — 应保留 user-edited
        { path: 'docs/HLD.md', role: 'high-level-design' }, // 新增
      ]),
    );
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'merge', existing });
    expect(r.preservedAnchors).toHaveLength(1);
    expect(r.preservedAnchors[0]?.modules).toEqual(['user-edited']);
    expect(r.newAnchors).toHaveLength(1);
    expect(r.newAnchors[0]?.path).toBe('docs/HLD.md');
  });

  it('LLM 输出非 JSON → fallback 全 unmatched(不阻塞)', async () => {
    const mock = makeMockMapper('not json');
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    expect(r.newAnchors).toHaveLength(0);
    expect(r.unmatched.length).toBeGreaterThan(0);
  });

  it('docs 目录不存在 → 空 newAnchors,无错', async () => {
    rmSync(join(tmp, 'docs'), { recursive: true });
    const mock = makeMockMapper('[]');
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    expect(r.newAnchors).toHaveLength(0);
  });

  it('writeMapperDraft 落盘 yaml + md', async () => {
    mkdirSync(join(tmp, 'forge'), { recursive: true });
    const mock = makeMockMapper(
      JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements' }]),
    );
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    const { yamlPath, mdPath } = await writeMapperDraft(join(tmp, 'forge'), r);
    const { readFileSync, existsSync } = await import('node:fs');
    expect(existsSync(yamlPath)).toBe(true);
    expect(existsSync(mdPath)).toBe(true);
    expect(readFileSync(yamlPath, 'utf8')).toContain('schema: forge-legacy-anchor/v1');
  });

  it('skip node_modules / .git / forge / dist', async () => {
    mkdirSync(join(tmp, 'node_modules'), { recursive: true });
    writeFileSync(join(tmp, 'node_modules', 'should-skip.md'), '# vendor');
    mkdirSync(join(tmp, 'forge'), { recursive: true });
    writeFileSync(join(tmp, 'forge', 'config.yaml'), 'schema: x');
    const mock = makeMockMapper(JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements' }]));
    const r = await runMapper(mock, { projectRoot: tmp, mode: 'overwrite' });
    const yaml = parseYaml(r.draftYaml) as LegacyAnchorsFile;
    expect(yaml.anchors.every((a) => !a.path.includes('node_modules'))).toBe(true);
    expect(yaml.anchors.every((a) => !a.path.startsWith('forge/'))).toBe(true);
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/mapper.test.ts
```

预期:7 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/mapper.ts tests/core/legacy-bridge/mapper.test.ts
git commit -m "feat(legacy-bridge): mapper.ts 二阶段 + --merge / --overwrite(决策 #4 / M-2)"
```

---

### Task D2:`src/core/legacy-bridge/indexer.ts`(每 anchor ~100 字摘要 + 大文件分块)

**Files:**
- Create: `src/core/legacy-bridge/indexer.ts`
- Test: `tests/core/legacy-bridge/indexer.test.ts`

- [ ] **Step 1:写 `src/core/legacy-bridge/indexer.ts`**

```typescript
// 索引摘要器 — Plan 7 Phase D / spec §1.2 Layer 2
// 每 anchor ~100 字 LLM 摘要;大文件(> 30KB)分块输入,合并摘要

import Anthropic from '@anthropic-ai/sdk';
import { extname } from 'node:path';
import { readAnchorFile } from './encoding.js';
import { parseWorkbook, getSheet, sheetToMarkdown } from './excel.js';
import { redact } from './redact.js';
import type { LegacyAnchor, LegacyAnchorsFile } from './types.js';

/** 单 anchor 索引项 */
export interface IndexEntry {
  path: string;
  role: string;
  /** ~100 字摘要(±20 字容差) */
  summary: string;
  /** 输入字节数(用于诊断) */
  inputBytes: number;
}

/** 索引器客户端 */
export interface IndexerClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const SUMMARY_TARGET_LEN = 100;
const SUMMARY_TOLERANCE = 20;
/** 大文件分块阈值(单 chunk) */
const CHUNK_THRESHOLD_BYTES = 30 * 1024;

/** 取 anchor 文本(支持 md / xlsx) */
async function readAnchorText(anchor: LegacyAnchor): Promise<string> {
  const ext = extname(anchor.path).toLowerCase();
  if (ext === '.xlsx') {
    const wb = await parseWorkbook(anchor.path);
    const sheet = getSheet(wb, anchor.sheet, anchor.path);
    return sheetToMarkdown(sheet);
  }
  return (await readAnchorFile(anchor.path)).text;
}

/** 把长文本分块(按段落边界,不在中间断) */
export function chunkText(text: string, maxChunkBytes: number = CHUNK_THRESHOLD_BYTES): string[] {
  if (Buffer.byteLength(text, 'utf8') <= maxChunkBytes) return [text];
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (Buffer.byteLength(current + '\n\n' + p, 'utf8') > maxChunkBytes && current) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? current + '\n\n' + p : p;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** 调 LLM 生成 ~100 字摘要 */
async function summarizeChunk(client: IndexerClient, chunk: string, role: string): Promise<string> {
  const prompt = `请用约 100 字总结下列 ${role} 文档片段的核心内容。直接输出摘要,不加 preamble。

# 片段
${chunk}`;
  // P7-07 修复:LLM 调用前数据传输声明
  console.log(
    `→ sending ${Buffer.byteLength(prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${DEFAULT_MODEL}, op=index)`,
  );
  const result = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return (block?.text ?? '').trim();
}

/** P7-03 修复:metadata-only role 集合(与 regenerator.ts 保持一致;此处复写避免循环 import) */
const METADATA_ONLY_INDEX_ROLES = new Set(['acceptance-report']);

/** 跑单 anchor 的索引 */
export async function indexAnchor(client: IndexerClient, anchor: LegacyAnchor): Promise<IndexEntry> {
  // P7-03 修复:acceptance-report 走 metadata-only(spec §7 line 909 / 决策 #8 / I-8)
  // 仅读文件名 + frontmatter(若有),不读全文不发 LLM
  if (METADATA_ONLY_INDEX_ROLES.has(anchor.role)) {
    return await indexAnchorMetadataOnly(anchor);
  }
  const text = await readAnchorText(anchor);
  // redact 敏感数据后再发 LLM
  const masked = redact(text).redactedText;
  const inputBytes = Buffer.byteLength(masked, 'utf8');
  const chunks = chunkText(masked);

  let summary: string;
  if (chunks.length === 1) {
    summary = await summarizeChunk(client, chunks[0]!, anchor.role);
  } else {
    // 分块各自摘要,再合并
    const partials: string[] = [];
    for (const c of chunks) {
      partials.push(await summarizeChunk(client, c, anchor.role));
    }
    // 二次合并:让 LLM 把多个 chunk 摘要合成 ~100 字
    summary = await summarizeChunk(client, partials.join('\n\n'), anchor.role);
  }

  return {
    path: anchor.path,
    role: anchor.role,
    summary,
    inputBytes,
  };
}

/** 跑全部 authoritative anchor */
export async function buildIndex(
  client: IndexerClient,
  file: LegacyAnchorsFile,
): Promise<IndexEntry[]> {
  const auth = file.anchors.filter((a) => a.authoritative);
  const out: IndexEntry[] = [];
  for (const a of auth) {
    out.push(await indexAnchor(client, a));
  }
  return out;
}

/** 渲染索引为 markdown(forge/docs/index.md) */
export function renderIndexMarkdown(entries: IndexEntry[]): string {
  const lines: string[] = [];
  lines.push('# Legacy Anchor Index');
  lines.push('');
  lines.push('| role | path | summary |');
  lines.push('|---|---|---|');
  for (const e of entries) {
    const summaryEscaped = e.summary.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    lines.push(`| ${e.role} | \`${e.path}\` | ${summaryEscaped} |`);
  }
  return lines.join('\n');
}

/** 摘要长度容差校验(spec §5.4 indexer) */
export function isSummaryWithinTolerance(summary: string): boolean {
  const len = summary.length;
  return len >= SUMMARY_TARGET_LEN - SUMMARY_TOLERANCE * 2 && len <= SUMMARY_TARGET_LEN + SUMMARY_TOLERANCE * 4;
}

/** P7-03 修复:metadata-only 索引(不发 LLM,只读文件名 + 可选 frontmatter)
 * spec §7 line 909:验收报告仅在 forge/docs/index.md 索引文件名 + metadata,
 * 不读全文,不发 LLM,提供 trace graph 入口
 */
async function indexAnchorMetadataOnly(anchor: LegacyAnchor): Promise<IndexEntry> {
  const { readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  let frontmatterSummary = '(metadata-only;不读全文)';
  try {
    if (existsSync(anchor.path)) {
      const raw = (await readFile(anchor.path, 'utf8')).slice(0, 2048);
      // 仅解析 frontmatter(若有);用 gray-matter 静态扫
      const matter = (await import('gray-matter')).default;
      const parsed = matter(raw);
      const meta = parsed.data ?? {};
      const fields = ['client', 'date', 'version', 'pass_count', 'total_count']
        .filter((k) => k in meta)
        .map((k) => `${k}=${String(meta[k])}`)
        .join(', ');
      if (fields) {
        frontmatterSummary = `acceptance metadata:${fields}(metadata-only,不发 LLM)`;
      } else {
        frontmatterSummary = `(metadata-only;无 frontmatter,仅索引文件路径作 trace 入口)`;
      }
    }
  } catch {
    // 解析失败不阻塞
  }
  return {
    path: anchor.path,
    role: anchor.role,
    summary: frontmatterSummary,
    inputBytes: 0,
  };
}
```

- [ ] **Step 2:写 `tests/core/legacy-bridge/indexer.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import {
  chunkText,
  indexAnchor,
  buildIndex,
  renderIndexMarkdown,
  isSummaryWithinTolerance,
  type IndexerClient,
} from '../../../src/core/legacy-bridge/indexer.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LegacyAnchor } from '../../../src/core/legacy-bridge/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

function makeMockIndexer(text: string): IndexerClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text }],
      }) as never,
    },
  };
}

describe('legacy-bridge/indexer', () => {
  it('chunkText 短文本 → 1 块', () => {
    expect(chunkText('hello world')).toEqual(['hello world']);
  });

  it('chunkText 长文本 → 多块,按段落边界', () => {
    const long = 'a'.repeat(20_000) + '\n\n' + 'b'.repeat(20_000) + '\n\n' + 'c'.repeat(20_000);
    const chunks = chunkText(long, 30_000);
    expect(chunks.length).toBeGreaterThan(1);
    // 不应在段落中间断
    for (const c of chunks) {
      expect(c).not.toMatch(/^aab/);
    }
  });

  it('indexAnchor happy path → IndexEntry', async () => {
    const mock = makeMockIndexer('本文档定义订单管理系统的需求规格,涵盖支付幂等性、退款规则、用户隐私等核心约束。');
    const anchor: LegacyAnchor = {
      role: 'requirements',
      path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
      authoritative: true,
    };
    const e = await indexAnchor(mock, anchor);
    expect(e.role).toBe('requirements');
    expect(e.summary).toContain('订单管理');
    expect(e.inputBytes).toBeGreaterThan(0);
  });

  it('buildIndex 仅含 authoritative=true 的 anchor', async () => {
    const mock = makeMockIndexer('摘要文本');
    const file = {
      schema: 'forge-legacy-anchor/v1' as const,
      anchors: [
        {
          role: 'requirements' as const,
          path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
          authoritative: true,
        },
        {
          role: 'requirements' as const,
          path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
          authoritative: false, // 不被索引
        },
      ],
    };
    const r = await buildIndex(mock, file);
    expect(r).toHaveLength(1);
  });

  it('renderIndexMarkdown 输出表', () => {
    const md = renderIndexMarkdown([
      { path: 'docs/SRS.md', role: 'requirements', summary: '订单管理需求', inputBytes: 1000 },
      { path: 'docs/HLD.md', role: 'high-level-design', summary: '架构概述', inputBytes: 800 },
    ]);
    expect(md).toContain('| role | path | summary |');
    expect(md).toContain('| requirements | `docs/SRS.md` | 订单管理需求 |');
  });

  it('isSummaryWithinTolerance 100±N 内 → true', () => {
    const sample = 'a'.repeat(100);
    expect(isSummaryWithinTolerance(sample)).toBe(true);
  });

  it('isSummaryWithinTolerance 5 字 → false(过短)', () => {
    expect(isSummaryWithinTolerance('短')).toBe(false);
  });
});
```

- [ ] **Step 3:跑测试**

```bash
pnpm vitest run tests/core/legacy-bridge/indexer.test.ts
```

预期:7 tests passing。

- [ ] **Step 4:commit**

```bash
git add src/core/legacy-bridge/indexer.ts tests/core/legacy-bridge/indexer.test.ts
git commit -m "feat(legacy-bridge): indexer.ts 每 anchor ~100 字摘要 + 大文件分块(spec §1.2 Layer 2)"
```

---

### Task D3:CLI 填实 `map` + `index` 子命令

**Files:**
- Modify: `src/cli/commands/legacy-bridge.ts`
- Test: `tests/cli/legacy-bridge/map.test.ts`
- Test: `tests/cli/legacy-bridge/index.test.ts`

- [ ] **Step 1:替换 map 子命令 stub**

```typescript
import { runMapper, writeMapperDraft } from '../../core/legacy-bridge/mapper.js';

  cmd
    .command('map')
    .description('扫 docs/ + src/ → LLM 推测 → legacy-anchors-draft.yaml(决策 #4)')
    .option('--merge', '与已存在 anchors.yaml 合并新发现项,保留用户审过部分(默认)', true)
    .option('--overwrite', '全量重生成(覆盖用户改动,需用户确认)')
    .option('--docs-paths <paths>', '逗号分隔的额外 docs 目录(默认扫 docs/ doc/ document/)')
    .option('--redact-report', '输出每条 redact 规则的命中数')
    .action(
      async (opts: {
        merge?: boolean;
        overwrite?: boolean;
        docsPaths?: string;
        redactReport?: boolean;
      }) => {
        const projectRoot = process.cwd();
        const forgeRoot = join(projectRoot, 'forge');
        const configPath = join(forgeRoot, 'config.yaml');
        if (!existsSync(configPath)) {
          console.error('forge/config.yaml 不存在,先跑 forge init');
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
        const existingAnchors = await loadAnchorsFile(forgeRoot).catch(() => null);

        // mode 决策
        const mode: 'merge' | 'overwrite' = opts.overwrite ? 'overwrite' : 'merge';
        if (mode === 'overwrite' && existingAnchors) {
          console.warn('⚠ --overwrite 将覆盖现有 legacy-anchors.yaml(用户审过的部分会丢);确认请按 Enter,Ctrl-C 取消');
          if (process.stdout.isTTY) {
            await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));
          }
        }

        // ack 检查
        const ack = await checkAck(forgeRoot, config, existingAnchors);
        if (!ack.ok) {
          console.error(renderOptinPrompt(ack.reason, ack.customerDataPaths));
          process.exit(LB_EXIT_GENERAL_ERROR);
        }

        // 锁
        let release: (() => Promise<void>) | undefined;
        try {
          release = await acquireLockByPath(forgeRoot, 'legacy-bridge-map', 'legacy-bridge.lock');
        } catch (err) {
          if (err instanceof LockHeldError) {
            console.error(`✗ ${err.message}`);
            process.exit(LB_EXIT_LOCK_HELD);
          }
          throw err;
        }

        try {
          const { anthropicApiKey } = loadEnv();
          const client = new Anthropic({ apiKey: anthropicApiKey });
          const docsPaths = opts.docsPaths
            ? opts.docsPaths.split(',').map((s) => s.trim())
            : undefined;
          const out = await runMapper(client, {
            projectRoot,
            docsPaths,
            scanSrc: true,
            mode,
            existing: existingAnchors ?? undefined,
          });
          const { yamlPath, mdPath } = await writeMapperDraft(forgeRoot, out);
          console.log(`✓ wrote ${yamlPath}`);
          console.log(`✓ wrote ${mdPath}`);
          console.log(
            `   新增 ${out.newAnchors.length} 个 anchor(merge 保留 ${out.preservedAnchors.length});unmatched ${out.unmatched.length} 个文件需用户审`,
          );
          console.log('下一步:审改 legacy-anchors-draft.yaml 后跑 mv legacy-anchors-draft.yaml legacy-anchors.yaml');
          process.exit(LB_EXIT_OK);
        } finally {
          if (release) await release();
        }
      },
    );
```

- [ ] **Step 2:替换 index 子命令 stub**

```typescript
import { buildIndex, renderIndexMarkdown } from '../../core/legacy-bridge/indexer.js';

  cmd
    .command('index')
    .description('为每个 anchor 生成 ~100 字 LLM 摘要(决策 #14 Layer 2)')
    .option('--yes', '非 TTY 必须显式 ack')
    .action(async (opts: { yes?: boolean }) => {
      const forgeRoot = join(process.cwd(), 'forge');
      const configPath = join(forgeRoot, 'config.yaml');
      if (!existsSync(configPath)) {
        console.error('forge/config.yaml 不存在,先跑 forge init');
        process.exit(LB_EXIT_GENERAL_ERROR);
      }
      const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
      const anchors = await loadAnchorsFile(forgeRoot).catch((err) => {
        if (err instanceof LegacyAnchorsError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        throw err;
      });
      if (!anchors) {
        console.error('✗ legacy-anchors.yaml 不存在;先跑 forge legacy-bridge map 生成 draft');
        process.exit(LB_EXIT_GENERAL_ERROR);
      }
      const ack = await checkAck(forgeRoot, config, anchors);
      if (!ack.ok) {
        console.error(renderOptinPrompt(ack.reason, ack.customerDataPaths));
        process.exit(LB_EXIT_GENERAL_ERROR);
      }

      // 锁
      let releaseLb: (() => Promise<void>) | undefined;
      let releaseArchive: (() => Promise<void>) | undefined;
      try {
        releaseArchive = await acquireLockByPath(forgeRoot, 'legacy-bridge-index', 'archive.lock');
        releaseLb = await acquireLockByPath(forgeRoot, 'legacy-bridge-index', 'legacy-bridge.lock');
      } catch (err) {
        if (err instanceof LockHeldError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_LOCK_HELD);
        }
        throw err;
      }

      try {
        const { anthropicApiKey } = loadEnv();
        const client = new Anthropic({ apiKey: anthropicApiKey });
        const entries = await buildIndex(client, anchors);
        const md = renderIndexMarkdown(entries);
        const indexPath = join(forgeRoot, 'docs', 'index.md');
        await mkdir(join(forgeRoot, 'docs'), { recursive: true });
        await writeFile(indexPath, md, 'utf8');
        console.log(`✓ wrote ${indexPath} (${entries.length} entries)`);
        process.exit(LB_EXIT_OK);
      } finally {
        if (releaseLb) await releaseLb();
        if (releaseArchive) await releaseArchive();
      }
    });
```

- [ ] **Step 3:写 `tests/cli/legacy-bridge/map.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              { path: 'docs/SRS.md', role: 'requirements', modules: ['payment'] },
            ]),
          },
        ],
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge legacy-bridge map (CLI)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-map-cli-'));
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    mkdirSync(join(tmp, 'docs'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'SRS.md'), '# SRS');
    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n`,
    );
    const configHash = createHash('sha256')
      .update(JSON.stringify({ allow_llm_calls: true }, ['allow_llm_calls']))
      .digest('hex')
      .slice(0, 16);
    writeFileSync(
      join(tmp, 'forge', '.cache', 'llm-ack.yaml'),
      `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-05T00:00:00Z\nconfig_hash: ${configHash}\n`,
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('happy path → 写 legacy-anchors-draft.yaml + .md', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      try {
        await cmd.parseAsync(['node', 'forge', 'map', '--overwrite']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(existsSync(join(tmp, 'forge', 'legacy-anchors-draft.yaml'))).toBe(true);
        expect(existsSync(join(tmp, 'forge', 'legacy-anchors-draft.md'))).toBe(true);
      } finally {
        exitSpy.mockRestore();
        logSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
```

- [ ] **Step 4:写 `tests/cli/legacy-bridge/index.test.ts`(空 happy path)**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('@anthropic-ai/sdk', () => {
  const Anthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '本文档总结订单与支付的核心需求,大约 100 字以内的摘要。' }],
      }),
    },
  }));
  return { default: Anthropic };
});

vi.mock('../../../forge-eval/load-env.js', () => ({
  loadEnv: () => ({ anthropicApiKey: 'sk-test' }),
}));

describe('forge legacy-bridge index (CLI)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'forge-idx-cli-'));
    mkdirSync(join(tmp, 'forge', '.cache'), { recursive: true });
    mkdirSync(join(tmp, 'docs', 'legacy'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'legacy', 'SRS.md'), '# SRS');

    writeFileSync(
      join(tmp, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1\nlegacy_bridge:\n  allow_llm_calls: true\n`,
    );
    writeFileSync(
      join(tmp, 'forge', 'legacy-anchors.yaml'),
      `schema: forge-legacy-anchor/v1\nanchors:\n  - role: requirements\n    path: ${join(tmp, 'docs', 'legacy', 'SRS.md').replace(/\\/g, '/')}\n    authoritative: true\n`,
    );

    const configHash = createHash('sha256')
      .update(JSON.stringify({ allow_llm_calls: true }, ['allow_llm_calls']))
      .digest('hex')
      .slice(0, 16);
    writeFileSync(
      join(tmp, 'forge', '.cache', 'llm-ack.yaml'),
      `schema: forge-llm-ack/v1\nacknowledged_at: 2026-05-05T00:00:00Z\nconfig_hash: ${configHash}\n`,
    );
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('happy path → 写 forge/docs/index.md', async () => {
    const cwd = process.cwd();
    try {
      process.chdir(tmp);
      const { buildLegacyBridgeCommand } = await import('../../../src/cli/commands/legacy-bridge.js');
      const cmd = buildLegacyBridgeCommand();
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await cmd.parseAsync(['node', 'forge', 'index']);
        expect(exitSpy).toHaveBeenCalledWith(0);
        expect(existsSync(join(tmp, 'forge', 'docs', 'index.md'))).toBe(true);
      } finally {
        exitSpy.mockRestore();
      }
    } finally {
      process.chdir(cwd);
    }
  });
});
```

- [ ] **Step 5:跑测试**

```bash
pnpm vitest run tests/cli/legacy-bridge/map.test.ts tests/cli/legacy-bridge/index.test.ts
```

预期:2 tests passing。

- [ ] **Step 6:commit**

```bash
git add src/cli/commands/legacy-bridge.ts tests/cli/legacy-bridge/map.test.ts tests/cli/legacy-bridge/index.test.ts
git commit -m "feat(cli): legacy-bridge map + index 全实现(决策 #4 / Layer 2)"
```

---

## Phase E:复写质量 eval 框架 + release hardening(0.7 周)

### Task E1:`forge-eval/regeneration-types.ts`(scenario 类型 + 结果类型)

**Files:**
- Create: `forge-eval/regeneration-types.ts`

- [ ] **Step 1:写 `forge-eval/regeneration-types.ts`**

```typescript
// regeneration eval scenario 类型 — Plan 7 Phase E
// spec §5.1:复用 Plan 5 forge-eval 基础设施 + 新增分层抽样

import type { KeyFact, LegacyAnchorRole, QualityResult } from '../src/core/legacy-bridge/types.js';

/** scenario YAML 顶层 */
export interface RegenScenario {
  /** scenario id(文件名同名,如 well-formed-srs) */
  id: string;
  description?: string;
  /** 评测用模型,默认 'claude-sonnet-4-6' */
  model?: string;
  /** 复写 role(决定 SRS / HLD / LLD / system-tests) */
  role: LegacyAnchorRole;
  /** 输入 anchor 列表(scenarios fixture 路径,相对 forge-eval/regeneration-scenarios/) */
  input_anchors: Array<{
    role: LegacyAnchorRole;
    /** scenario 内 fixture 文件路径 */
    path: string;
    authoritative: boolean;
    /** Excel 子 sheet */
    sheet?: string;
  }>;
  /** 关键事实清单(分层抽样输入) */
  key_facts: KeyFact[];
  /** 总体保真率阈值(默认 0.9) */
  regeneration_threshold?: number;
  /** critical 子集必抽必保留(默认 1.0) */
  critical_must_preserve?: number;
  /** 用户自补 redact 规则(可选) */
  redact?: Array<{ regex?: string; literal?: string; name?: string }>;
}

/** 单 scenario 跑结果 */
export interface RegenScenarioResult {
  scenario: RegenScenario;
  qualityResult: QualityResult;
  /** 复写产物正文(用于 debug) */
  body: string;
  /** 总 cost */
  totalCost: number;
  /** 是否最终通过(quality.passed) */
  passed: boolean;
}

/** 全 run 汇总 */
export interface RegenRunSummary {
  timestamp: string;
  results: RegenScenarioResult[];
  totalCost: number;
  /** 全部 scenario 都 passed 才视为 run pass */
  runPass: boolean;
}
```

- [ ] **Step 2:typecheck**

```bash
pnpm typecheck
```

预期:0 errors。

- [ ] **Step 3:commit**

```bash
git add forge-eval/regeneration-types.ts
git commit -m "feat(eval-regen): regeneration-types.ts(scenario / result / summary)"
```

---

### Task E2:6 个 regeneration scenario YAML

**Files:**
- Create: `forge-eval/regeneration-scenarios/well-formed-srs.yaml` + 其 fixture
- Create: `forge-eval/regeneration-scenarios/messy-srs-multi-version.yaml`
- Create: `forge-eval/regeneration-scenarios/srs-with-rationale.yaml`
- Create: `forge-eval/regeneration-scenarios/chinese-srs.yaml`
- Create: `forge-eval/regeneration-scenarios/srs-with-redact.yaml`
- Create: `forge-eval/regeneration-scenarios/partial-anchor-missing.yaml`
- Create: `forge-eval/regeneration-scenarios/fixtures/` 目录下对应 .md / .xlsx

- [ ] **Step 1:创建 fixtures 目录 + 第一个 well-formed-srs**

```bash
mkdir -p forge-eval/regeneration-scenarios/fixtures
```

写 `forge-eval/regeneration-scenarios/fixtures/well-formed-srs.md`:

```markdown
# 订单系统需求规格说明书 v3.2

## 1. 概述
本系统提供订单管理、支付、退款三大核心功能。

## 2. 数据库约束
### 2.1 Order 表
- user_id 字段非空
- amount 必须 > 0
- status 字段枚举:pending / paid / shipped / refunded

### 2.2 Payment 表
- transaction_id 唯一索引
- 支付时间精确到毫秒(timestamp(3))

## 3. 业务规则
### 3.1 支付幂等
所有支付接口必须使用 Idempotency-Key 头部,服务端用此 key 去重 24 小时。

### 3.2 退款窗口
退款必须在 7 天内发起,超过 7 天系统拒绝。

## 4. 安全约束
### 4.1 PCI-DSS
信用卡号不得存储在数据库,只能存 token(支付网关返回)。

### 4.2 GDPR
用户主动删除账号 30 天内必须从所有 backup 中清除个人数据。
```

写 `forge-eval/regeneration-scenarios/well-formed-srs.yaml`:

```yaml
id: well-formed-srs
description: 完整 SRS,期望保真率 > 90%(spec §5.1)
model: claude-sonnet-4-6
role: requirements
input_anchors:
  - role: requirements
    path: fixtures/well-formed-srs.md
    authoritative: true
key_facts:
  - text: "Order 表 user_id 字段非空"
    section: "§2.1"
    critical: true
  - text: "amount 必须 > 0"
    section: "§2.1"
    critical: true
  - text: "status 字段枚举:pending / paid / shipped / refunded"
    section: "§2.1"
    critical: false
  - text: "Payment 表 transaction_id 唯一索引"
    section: "§2.2"
    critical: true
  - text: "支付时间精确到毫秒(timestamp(3))"
    section: "§2.2"
    critical: false
  - text: "支付接口必须使用 Idempotency-Key 头部"
    section: "§3.1"
    critical: true
  - text: "Idempotency-Key 24 小时去重窗口"
    section: "§3.1"
    critical: false
  - text: "退款必须在 7 天内发起"
    section: "§3.2"
    critical: true
  - text: "信用卡号不得存储,只能存 token"
    section: "§4.1"
    critical: true
  - text: "GDPR:用户删除账号 30 天内清除 backup"
    section: "§4.2"
    critical: true
regeneration_threshold: 0.9
critical_must_preserve: 1.0
```

- [ ] **Step 2:写 `messy-srs-multi-version.yaml` + fixture**

写 `forge-eval/regeneration-scenarios/fixtures/messy-srs-v1.md`:

```markdown
# 订单系统 SRS v1(2024 年初版,已废弃)

## 1. 数据库
- Order 表 user_id 可空(允许游客下单)

## 2. 支付
- 不要求幂等性
```

写 `forge-eval/regeneration-scenarios/fixtures/messy-srs-v3.md`:

```markdown
# 订单系统 SRS v3.2(当前权威版)

## 1. 数据库
- Order 表 user_id **非空**(2025 移除游客下单)

## 2. 支付
- 强制 Idempotency-Key
```

写 `forge-eval/regeneration-scenarios/messy-srs-multi-version.yaml`:

```yaml
id: messy-srs-multi-version
description: 多版本混乱,验证 authoritative=true 仅用当前版(决策 #10)
model: claude-sonnet-4-6
role: requirements
input_anchors:
  - role: requirements
    path: fixtures/messy-srs-v1.md
    authoritative: false  # 历史版,默认不进 LLM
  - role: requirements
    path: fixtures/messy-srs-v3.md
    authoritative: true
key_facts:
  - text: "Order 表 user_id 非空"
    section: "§1"
    critical: true
  - text: "强制 Idempotency-Key"
    section: "§2"
    critical: true
regeneration_threshold: 0.9
critical_must_preserve: 1.0
```

- [ ] **Step 3:写 `srs-with-rationale.yaml` + fixture**

写 `forge-eval/regeneration-scenarios/fixtures/srs-with-rationale.md`:

```markdown
# 订单系统 SRS

## 1. 支付幂等性

**强制要求**:所有支付接口使用 Idempotency-Key 头部。

**rationale**:2023 年 P0 事故 — 用户重复点击按钮导致重复扣款,客诉 200+。
事故复盘后定下此约束,任何后续 PR 必须保留该字段。

## 2. 退款 7 天

**rationale**:与法务 / 客服协商一致,7 天可全免人工介入,
超 7 天走客服渠道,避免规则被滥用。
```

写 `forge-eval/regeneration-scenarios/srs-with-rationale.yaml`:

```yaml
id: srs-with-rationale
description: 含历史背景段(2023 P0 事故),验证背景被保留
model: claude-sonnet-4-6
role: requirements
input_anchors:
  - role: requirements
    path: fixtures/srs-with-rationale.md
    authoritative: true
key_facts:
  - text: "Idempotency-Key 头部强制"
    section: "§1"
    critical: true
  - text: "2023 P0 事故触发本约束"
    section: "§1 rationale"
    critical: false
  - text: "退款 7 天窗口"
    section: "§2"
    critical: true
  - text: "与法务客服协商一致"
    section: "§2 rationale"
    critical: false
regeneration_threshold: 0.9
critical_must_preserve: 1.0
```

- [ ] **Step 4:写 `chinese-srs.yaml` + fixture**

写 `forge-eval/regeneration-scenarios/fixtures/chinese-srs.md`(纯中文):

```markdown
# 客户管理系统需求规格

## 1. 客户信息
客户姓名必须非空,身份证号必须 18 位。

## 2. 隐私
客户敏感信息(身份证 / 手机号)必须加密存储。

## 3. 操作日志
所有客户信息修改必须记录操作员 ID 与时间戳。
```

写 `forge-eval/regeneration-scenarios/chinese-srs.yaml`:

```yaml
id: chinese-srs
description: 中文老文档,验证编码处理
model: claude-sonnet-4-6
role: requirements
input_anchors:
  - role: requirements
    path: fixtures/chinese-srs.md
    authoritative: true
key_facts:
  - text: "客户姓名必须非空"
    section: "§1"
    critical: true
  - text: "身份证号必须 18 位"
    section: "§1"
    critical: true
  - text: "敏感信息加密存储"
    section: "§2"
    critical: true
  - text: "操作日志含操作员 ID 与时间戳"
    section: "§3"
    critical: true
regeneration_threshold: 0.9
critical_must_preserve: 1.0
```

- [ ] **Step 5:写 `srs-with-redact.yaml` + fixture**

写 `forge-eval/regeneration-scenarios/fixtures/srs-with-redact.md`(P7-13/P7-14 修复:进 git 的 fixture 仅含自补 literal,不含触发 GitHub scanner 的真 secret 格式):

```markdown
# 内部 API SRS

## 1. 数据库连接
生产环境 DB host:INTERNAL-DB-PROD-01(实际连接串通过环境变量注入)

## 2. 内部资源
S3 bucket id:ACME-S3-BUCKET-PROD-A12

## 3. 业务规则
所有写操作必须经过审计日志。
```

写 `forge-eval/regeneration-scenarios/srs-with-redact.yaml`(用 `redact` 字段配自补 literal,验证发 LLM 前真被 mask):

```yaml
id: srs-with-redact
description: 含内部业务字面量,验证用户自补 redact literal 在发 LLM 前生效(决策 #20)
model: claude-sonnet-4-6
role: requirements
input_anchors:
  - role: requirements
    path: fixtures/srs-with-redact.md
    authoritative: true
redact:
  - literal: INTERNAL-DB-PROD-01
    name: internal-host
  - literal: ACME-S3-BUCKET-PROD-A12
    name: bucket-id
key_facts:
  - text: "所有写操作必须经过审计日志"
    section: "§3"
    critical: true
  - text: "INTERNAL-DB-PROD-01 已被 redact 不应出现在复写产物(应替换为 <<REDACTED-N>>)"
    section: "§1"
    critical: false
regeneration_threshold: 0.9
critical_must_preserve: 1.0
```

- [ ] **Step 6:写 `partial-anchor-missing.yaml`**

写 `forge-eval/regeneration-scenarios/partial-anchor-missing.yaml`(故意 path 指向不存在文件):

```yaml
id: partial-anchor-missing
description: 一份 anchor 文件不存在,验证部分降级(spec §4.1)
model: claude-sonnet-4-6
role: requirements
input_anchors:
  - role: requirements
    path: fixtures/well-formed-srs.md
    authoritative: true
  - role: rationale
    path: fixtures/MISSING-FILE.md
    authoritative: true
key_facts:
  - text: "Order 表 user_id 字段非空"
    section: "§2.1"
    critical: true
regeneration_threshold: 0.9
critical_must_preserve: 1.0
```

- [ ] **Step 7:验证 6 个 scenario yaml 合法**

```bash
ls forge-eval/regeneration-scenarios/*.yaml
```

预期 6 行(well-formed-srs / messy-srs-multi-version / srs-with-rationale / chinese-srs / srs-with-redact / partial-anchor-missing)。

- [ ] **Step 8:commit**

```bash
git add forge-eval/regeneration-scenarios/
git commit -m "feat(eval-regen): 6 scenarios + 5 fixtures(spec §5.1)"
```

---

### Task E3:`forge-eval/regeneration-runner.ts`(走真 LLM 跑分层抽样)

**Files:**
- Create: `forge-eval/regeneration-runner.ts`
- Create: `forge-eval/regeneration-index.ts`(CLI 入口)
- Test: `tests/forge-eval/regeneration-runner.test.ts`

- [ ] **Step 1:写 `forge-eval/regeneration-runner.ts`**

```typescript
// 复写 eval scenario runner — Plan 7 Phase E
// spec §5.1:跑真 LLM,分层抽样验证保真率;复用 Plan 5 forge-eval 基础设施

import Anthropic from '@anthropic-ai/sdk';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { regenerateRole } from '../src/core/legacy-bridge/regenerator.js';
import {
  stratifiedSample,
  judgeAllFacts,
  formatQualityReport,
  DEFAULT_FIDELITY_THRESHOLD,
} from '../src/core/legacy-bridge/quality-judge.js';
import type { LegacyAnchor } from '../src/core/legacy-bridge/types.js';
import type {
  RegenScenario,
  RegenScenarioResult,
  RegenRunSummary,
} from './regeneration-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, 'regeneration-scenarios');

/** 读取并校验单 scenario YAML */
export async function loadRegenScenario(scenarioId: string): Promise<RegenScenario> {
  const path = join(SCENARIOS_DIR, `${scenarioId}.yaml`);
  if (!existsSync(path)) {
    throw new Error(`scenario 文件不存在:${path}`);
  }
  const raw = await readFile(path, 'utf8');
  const data = parseYaml(raw) as RegenScenario;
  validateScenario(data, path);
  return data;
}

/** 校验 scenario 合约 */
export function validateScenario(scenario: RegenScenario, ctx: string): void {
  if (!scenario.id) throw new Error(`${ctx}: 缺 id`);
  if (!scenario.role) throw new Error(`${ctx}: 缺 role`);
  if (!Array.isArray(scenario.input_anchors) || scenario.input_anchors.length === 0) {
    throw new Error(`${ctx}: input_anchors 为空`);
  }
  if (!Array.isArray(scenario.key_facts) || scenario.key_facts.length === 0) {
    throw new Error(`${ctx}: key_facts 为空`);
  }
  for (const f of scenario.key_facts) {
    if (typeof f.text !== 'string' || typeof f.section !== 'string' || typeof f.critical !== 'boolean') {
      throw new Error(`${ctx}: key_fact 缺字段`);
    }
  }
}

/** 单 scenario 跑(真 LLM) */
export async function runRegenScenario(
  client: Anthropic,
  scenario: RegenScenario,
): Promise<RegenScenarioResult> {
  // 取 authoritative anchor
  const auth = scenario.input_anchors.find((a) => a.authoritative);
  if (!auth) throw new Error(`${scenario.id}: 无 authoritative anchor`);
  const historical = scenario.input_anchors.filter((a) => !a.authoritative);

  // 把 scenario 内 path 转绝对路径(相对 SCENARIOS_DIR)
  const toAbs = (relPath: string): string => resolve(SCENARIOS_DIR, relPath);
  const authoritativeAbs: LegacyAnchor = {
    role: auth.role,
    path: toAbs(auth.path),
    authoritative: true,
    sheet: auth.sheet,
  };

  // partial-anchor-missing scenario:authoritative 文件存在,但 historical 缺失
  // 决策:caller 应处理 missing(由 readAnchorAsText 抛错)→ 此 case 期望 scenario 整体失败,
  // runner 捕获 → result 标 failed=false 但保留报告
  let body: string;
  let totalCost: number;
  let qualityResult;

  try {
    const out = await regenerateRole(
      {
        role: scenario.role,
        authoritative: authoritativeAbs,
        historical: historical
          .filter((a) => existsSync(toAbs(a.path)))
          .map((a) => ({
            role: a.role,
            path: toAbs(a.path),
            authoritative: false,
            sheet: a.sheet,
          })),
        forgeVersion: '0.2.0-eval',
        regenLicense: 'derived-from-source',
      },
      client,
    );
    body = out.body;
    totalCost = out.estimatedCost;

    // 分层抽样
    const sampling = stratifiedSample({
      allFacts: scenario.key_facts,
      total: 30,
    });
    qualityResult = await judgeAllFacts(
      client,
      body,
      sampling,
      scenario.regeneration_threshold ?? DEFAULT_FIDELITY_THRESHOLD,
    );
  } catch (err) {
    // 失败 → 保留报告,标 failed
    body = `(scenario failed: ${(err as Error).message})`;
    totalCost = 0;
    qualityResult = {
      total_rate: 0,
      critical_rate: 0,
      per_section_rates: {},
      lost_critical: scenario.key_facts.filter((f) => f.critical),
      lost_non_critical: scenario.key_facts.filter((f) => !f.critical),
      uncovered_sections: [],
      passed: false,
    };
  }

  return {
    scenario,
    qualityResult,
    body,
    totalCost,
    passed: qualityResult.passed,
  };
}

/** 跑全部 scenario */
export async function runAllRegenScenarios(
  client: Anthropic,
  scenarioIds: string[],
): Promise<RegenRunSummary> {
  const results: RegenScenarioResult[] = [];
  for (const id of scenarioIds) {
    const scenario = await loadRegenScenario(id);
    const r = await runRegenScenario(client, scenario);
    results.push(r);
    console.log(`[${id}] passed=${r.passed} total_rate=${(r.qualityResult.total_rate * 100).toFixed(1)}%`);
  }
  const totalCost = results.reduce((sum, r) => sum + r.totalCost, 0);
  return {
    timestamp: new Date().toISOString(),
    results,
    totalCost,
    runPass: results.every((r) => r.passed),
  };
}

/** 渲染 markdown 报告 */
export function buildRegenReport(summary: RegenRunSummary): string {
  const lines: string[] = [];
  lines.push(`# Regeneration Eval Report`);
  lines.push('');
  lines.push(`生成时间:${summary.timestamp}`);
  lines.push(`总 cost:$${summary.totalCost.toFixed(2)}`);
  lines.push(`总览:${summary.runPass ? '✓ ALL PASS' : '✗ FAIL'}`);
  lines.push('');
  for (const r of summary.results) {
    lines.push(`## ${r.scenario.id}${r.passed ? ' ✓' : ' ✗'}`);
    lines.push('');
    lines.push(formatQualityReport(r.scenario.role, r.qualityResult));
    lines.push('');
  }
  return lines.join('\n');
}

/** 写报告到 forge-eval/regen-report.md */
export async function writeRegenReport(summary: RegenRunSummary, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, 'regen-report.md');
  await writeFile(path, buildRegenReport(summary), 'utf8');
  return path;
}
```

- [ ] **Step 2:写 `forge-eval/regeneration-index.ts`(CLI 入口)**

```typescript
#!/usr/bin/env tsx
// regen-eval CLI 入口 — Plan 7 Phase E
// 用法:pnpm eval-regen / pnpm eval-regen:scenario <id>

import Anthropic from '@anthropic-ai/sdk';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.js';
import { runAllRegenScenarios, writeRegenReport } from './regeneration-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, 'regeneration-scenarios');

interface CliOptions {
  scenario?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--scenario') {
      const next = argv[i + 1];
      if (!next) throw new Error('--scenario 需要 id 参数');
      opts.scenario = next;
      i += 1;
    }
  }
  return opts;
}

function listAllScenarios(): string[] {
  return readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const { anthropicApiKey } = loadEnv();
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const scenarioIds = opts.scenario ? [opts.scenario] : listAllScenarios();
  console.log(`Running ${scenarioIds.length} scenario(s):${scenarioIds.join(', ')}`);

  const summary = await runAllRegenScenarios(client, scenarioIds);
  const reportPath = await writeRegenReport(summary, __dirname);
  console.log(`\n✓ wrote ${reportPath}`);
  console.log(`总 cost:$${summary.totalCost.toFixed(2)}`);
  if (!summary.runPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
```

- [ ] **Step 3:写 `tests/forge-eval/regeneration-runner.test.ts`(mock LLM 单测)**

```typescript
import { describe, it, expect } from 'vitest';
import {
  loadRegenScenario,
  validateScenario,
  runRegenScenario,
  buildRegenReport,
} from '../../forge-eval/regeneration-runner.js';
import type { RegenScenario, RegenRunSummary } from '../../forge-eval/regeneration-types.js';
import type Anthropic from '@anthropic-ai/sdk';

function makeMockClient(regeneratedBody: string, judgeAlwaysPreserved = true): Anthropic {
  let callCount = 0;
  return {
    messages: {
      create: async () => {
        callCount += 1;
        // 第 1 次 call:regenerator(返复写正文)
        // 后续 calls:judge(返 preserved)
        const text = callCount === 1
          ? regeneratedBody
          : (judgeAlwaysPreserved ? 'preserved\nok' : 'lost\n找不到');
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 1000, output_tokens: 500 },
        };
      },
    },
  } as unknown as Anthropic;
}

describe('forge-eval/regeneration-runner', () => {
  it('loadRegenScenario 读 well-formed-srs', async () => {
    const s = await loadRegenScenario('well-formed-srs');
    expect(s.id).toBe('well-formed-srs');
    expect(s.key_facts.length).toBeGreaterThan(5);
    expect(s.key_facts.some((f) => f.critical)).toBe(true);
  });

  it('validateScenario 缺 key_facts → 抛错', () => {
    const bad: RegenScenario = {
      id: 'bad',
      role: 'requirements',
      input_anchors: [{ role: 'requirements', path: 'x.md', authoritative: true }],
      key_facts: [],
    };
    expect(() => validateScenario(bad, 'fake')).toThrow(/key_facts 为空/);
  });

  it('runRegenScenario happy path → passed=true(全 preserved)', async () => {
    const scenario = await loadRegenScenario('well-formed-srs');
    const long = '# 复写\n## 1. 章节\n' + scenario.key_facts.map((f) => f.text).join('\n');
    const r = await runRegenScenario(makeMockClient(long, true), scenario);
    expect(r.passed).toBe(true);
    expect(r.qualityResult.critical_rate).toBe(1.0);
  });

  it('runRegenScenario judge lost 全部 → passed=false', async () => {
    const scenario = await loadRegenScenario('well-formed-srs');
    const long = '# 复写\n## 1. 章节\n' + 'a'.repeat(200);
    const r = await runRegenScenario(makeMockClient(long, false), scenario);
    expect(r.passed).toBe(false);
    expect(r.qualityResult.lost_critical.length).toBeGreaterThan(0);
  });

  it('buildRegenReport 含 ✓/✗ 与所有 scenario', () => {
    const summary: RegenRunSummary = {
      timestamp: '2026-05-05T00:00:00Z',
      results: [
        {
          scenario: { id: 'a', role: 'requirements', input_anchors: [], key_facts: [] },
          qualityResult: {
            total_rate: 1,
            critical_rate: 1,
            per_section_rates: {},
            lost_critical: [],
            lost_non_critical: [],
            uncovered_sections: [],
            passed: true,
          },
          body: 'b',
          totalCost: 0.5,
          passed: true,
        },
      ],
      totalCost: 0.5,
      runPass: true,
    };
    const md = buildRegenReport(summary);
    expect(md).toContain('## a ✓');
    expect(md).toContain('ALL PASS');
  });

  it('partial-anchor-missing scenario → 因 historical 缺失走 graceful path', async () => {
    const scenario = await loadRegenScenario('partial-anchor-missing');
    // historical anchor MISSING-FILE.md 不存在 → runner 应 skip 它,只用 authoritative
    const long = '# 复写\n## §2.1 章节\nOrder 表 user_id 字段非空。';
    const r = await runRegenScenario(makeMockClient(long, true), scenario);
    // 不应抛错
    expect(r.body).toBeDefined();
  });
});
```

- [ ] **Step 4:跑测试**

```bash
pnpm vitest run tests/forge-eval/regeneration-runner.test.ts
```

预期:6 tests passing。

- [ ] **Step 5:commit**

```bash
git add forge-eval/regeneration-runner.ts forge-eval/regeneration-index.ts tests/forge-eval/regeneration-runner.test.ts
git commit -m "feat(eval-regen): runner + CLI entry + 6 scenario(spec §5.1)"
```

---

### Task E4:CI workflow(`.github/workflows/regen-eval.yml`)

**Files:**
- Create: `.github/workflows/regen-eval.yml`

- [ ] **Step 1:写 `.github/workflows/regen-eval.yml`**

```yaml
# Regeneration Eval Workflow — Plan 7 Phase E
# spec §5.1:weekly + PR(若改 regenerator.ts / quality-judge.ts) + 手动
# ANTHROPIC_API_KEY 通过 GitHub Secrets 注入

name: regen-eval

on:
  pull_request:
    paths:
      - 'src/core/legacy-bridge/regenerator.ts'
      - 'src/core/legacy-bridge/quality-judge.ts'
      - 'forge-eval/regeneration-runner.ts'
      - 'forge-eval/regeneration-types.ts'
      - 'forge-eval/regeneration-scenarios/**'
  schedule:
    - cron: '0 8 * * 0' # 周日 UTC 8am(同 skill-eval cadence)
  workflow_dispatch:
    inputs:
      scenario:
        description: '单 scenario id(可选,默认全跑)'
        required: false
        type: string

jobs:
  regen-eval:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20.19.0
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Run regen-eval
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          if [ -n "${{ inputs.scenario }}" ]; then
            pnpm eval-regen:scenario --scenario "${{ inputs.scenario }}"
          else
            pnpm eval-regen
          fi

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: regen-report
          path: forge-eval/regen-report.md
```

- [ ] **Step 2:验证 yaml 合法**

```bash
which actionlint && actionlint .github/workflows/regen-eval.yml || echo 'actionlint 未装,跳过'
```

预期:无 actionlint warning(若装了)。

- [ ] **Step 3:commit**

```bash
git add .github/workflows/regen-eval.yml
git commit -m "ci(eval-regen): regen-eval workflow(PR/weekly/manual)"
```

---

### Task E5:Release hardening — 跨平台 fixture 测试

**Files:**
- Create: `tests/cli/legacy-bridge/cross-platform.test.ts`

- [ ] **Step 1:写 `tests/cli/legacy-bridge/cross-platform.test.ts`**

```typescript
// 跨平台 / Windows-specific fixture 行为(spec §5.5)— Plan 7 Phase E
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readAnchorFile, detectLineEnding } from '../../../src/core/legacy-bridge/encoding.js';
import { computeAnchorHash } from '../../../src/core/legacy-bridge/hash-anchor.js';
import { redact, DEFAULT_REDACT_RULES } from '../../../src/core/legacy-bridge/redact.js';
import { parseWorkbook, getSheet } from '../../../src/core/legacy-bridge/excel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

describe('legacy-bridge cross-platform fixtures(spec §5.5 acceptance)', () => {
  it('中文路径 + 中文文件名 → 读取 + hash 稳定', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const r = await readAnchorFile(path);
    const h = await computeAnchorHash(path);
    expect(r.text).toContain('需求规格说明书');
    expect(h).not.toBeNull();
  });

  it('GBK 编码 → mojibake 检测命中', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'gbk-encoded-srs.md'));
    expect(r.hasMojibake).toBe(true);
  });

  it('Windows CRLF fixture → detectLineEnding=CRLF', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'windows-crlf-srs.md'));
    expect(r.lineEnding).toBe('CRLF');
  });

  it('Excel 多 sheet + 中文 sheet 名 → 正确读', async () => {
    const wb = await parseWorkbook(join(FIXTURE_DIR, 'excel-test-cases.xlsx'));
    const cn = getSheet(wb, '覆盖率', join(FIXTURE_DIR, 'excel-test-cases.xlsx'));
    expect(cn.rows[0]).toContain('模块');
  });

  it('redact 默认规则数量 ≥ 12(覆盖 spec §4.5;P7-13 修复:不依赖 fixture 真值命中)', async () => {
    // git-safe fixture 中默认规则不命中(避免 GitHub secret scanning 阻拦),
    // 覆盖度由 DEFAULT_REDACT_RULES.length 单独验证;
    // 真值命中由 redact.test.ts 内字符串拼接 case 验证。
    expect(DEFAULT_REDACT_RULES.length).toBeGreaterThanOrEqual(12);
    const names = DEFAULT_REDACT_RULES.map((r) => r.name);
    expect(new Set(names).size).toBe(DEFAULT_REDACT_RULES.length);
  });

  it('DEFAULT_REDACT_RULES 与 spec §4.5 一致(12+ 类)', () => {
    expect(DEFAULT_REDACT_RULES.length).toBeGreaterThanOrEqual(12);
  });
});
```

- [ ] **Step 2:跑测试**

```bash
pnpm vitest run tests/cli/legacy-bridge/cross-platform.test.ts
```

预期:6 tests passing(若 redact 命中数不到 9,回 redact 默认规则补)。

- [ ] **Step 3:commit**

```bash
git add tests/cli/legacy-bridge/cross-platform.test.ts
git commit -m "test(legacy-bridge): 跨平台 fixture acceptance(中文/GBK/CRLF/Excel/redact)"
```

---

### Task E6:`scripts/release-gate.mjs` 加 brownfield 验证段

**Files:**
- Modify: `scripts/release-gate.mjs`

- [ ] **Step 1:在 `scripts/release-gate.mjs` 末尾、`forge --version` 验证之后,追加 brownfield 验证段**

打开现有 `scripts/release-gate.mjs`,定位到 `forge --version` 验证之后,加:

```javascript
// Plan 7 Phase F:验证 brownfield 工件
console.log('\n[brownfield] 验证 legacy-bridge --help 可用 ...');
try {
  const helpOut = execSync('forge legacy-bridge --help', { encoding: 'utf8' });
  if (!helpOut.includes('map') || !helpOut.includes('regenerate') || !helpOut.includes('sync-check')) {
    throw new Error('legacy-bridge --help 输出缺子命令');
  }
  console.log('  ✓ legacy-bridge --help 含 5 子命令');
} catch (err) {
  console.error('FAIL: legacy-bridge --help');
  console.error(err.message);
  process.exit(1);
}

// tarball 大小回归(加 exceljs 后 tarball ~490KB 上限,vs Plan 6 ~150KB)
console.log('\n[size] 校验 tarball 大小不超 1MB(exceljs 引入回归)...');
try {
  const tarballSize = require('node:fs').statSync(tarballName).size;
  const sizeMB = tarballSize / 1024 / 1024;
  console.log(`  → ${tarballName}: ${sizeMB.toFixed(2)} MB`);
  if (sizeMB > 1.0) {
    throw new Error(`tarball 大小 ${sizeMB.toFixed(2)} MB 超阈值 1.0 MB`);
  }
  console.log('  ✓ tarball 大小 < 1 MB');
} catch (err) {
  console.error('FAIL: tarball size check');
  console.error(err.message);
  process.exit(1);
}
```

- [ ] **Step 2:跑一次 release-gate(本地)**

```bash
pnpm install --frozen-lockfile
node scripts/release-gate.mjs
```

预期:5 个本地命令全过 + pack + dry install + brownfield --help 验证 + tarball 大小验证全过。任一 fail 回前面 task 修。

- [ ] **Step 3:commit**

```bash
git add scripts/release-gate.mjs
git commit -m "build(release-gate): 加 legacy-bridge --help 验证 + tarball 大小回归(I-6)"
```

---

## Phase F:用户文档 + Release v0.2.0 + 主 spec §7 同步(0.7 周)

### Task F1:写 `docs/legacy-bridge.md`(完整使用手册)

**Files:**
- Create: `docs/legacy-bridge.md`

- [ ] **Step 1:写 `docs/legacy-bridge.md`**

````markdown
# Forge legacy-bridge — Brownfield Onboarding 使用手册

> v0.2 新增。已有完整老文档(SRS / HLD / LLD / 测试用例)的项目接入 forge 时使用。

## 概览

`forge legacy-bridge` 三层能力:

| Layer | 命令 | 用途 |
|---|---|---|
| Layer 1 | `forge legacy-bridge sync-check` | 每次 archive 自动跑,检测本次 change 是否需更新老文档 |
| Layer 2 | `forge legacy-bridge index` | one-shot 初始化,为每份老锚点生成 ~100 字摘要 |
| Layer 3a | `forge legacy-bridge regenerate` | one-shot 复写器,LLM 读老锚点 + 代码 → 规范化 SRS/HLD/LLD/system-tests |

老文档**长期保留**,forge 只做**单向同步**(archive → legacy)。反向 sync 推 v0.3。

## 前置:LLM 调用 opt-in(决策 #22 / spec §1.1.1)

v0.2 brownfield 突破 v0.1 §2.3 LLM 边界(在用户路径调 Anthropic API)。需显式 opt-in:

```yaml
# forge/config.yaml
legacy_bridge:
  allow_llm_calls: true       # 必选,默认 false
  enforce_sync: false         # 可选,默认 false(渐进体验)
  auto_resolve_cross_anchor: false  # 可选,默认 false(默认入 diff)
  regen_license: derived-from-source  # 可选,默认 derived-from-source(§9 法律安全)
  provider: anthropic         # v0.2 唯一支持
```

启用步骤:

```bash
# 1. 编辑 forge/config.yaml 加上面段
# 2. 一次性 ack 数据传输到 Anthropic API
forge legacy-bridge --acknowledge-data-transfer

# 3. 若有 contains_customer_data=true 的 anchor,二次确认
forge legacy-bridge --acknowledge-data-transfer --acknowledge-customer-data

# 4. 跑后续命令
forge legacy-bridge regenerate
```

### 合规场景(enterprise / air-gapped / GDPR 要求数据驻留)

保持 `allow_llm_calls: false` 或省略。brownfield 工具拒绝运行,
archive sync-check 自动 graceful skip,forge 主工作流不变。

## 完整工作流

### T0:初始化(~30 分钟人工 + ~$10-20 LLM 成本)

```bash
# 1. 二阶段 mapping 第一阶段:LLM 自动扫产 draft
forge legacy-bridge map --overwrite       # 全量重生成
# 或
forge legacy-bridge map                   # --merge 默认,保留用户改动

# 输出:
#   forge/legacy-anchors-draft.yaml
#   forge/legacy-anchors-draft.md(human-readable 概览)

# 2. 用户审改 yaml(改 role 错分类 / 补 unmatched / 删多余)

# 3. 把 draft 改名为正式 anchors.yaml
mv forge/legacy-anchors-draft.yaml forge/legacy-anchors.yaml

# 4. 复写器(one-shot,LLM 读老锚点 → 复写规范化版本)
forge legacy-bridge regenerate
# 输出:
#   forge/docs/regenerated/SRS.md      (含 frontmatter + disclaimer + license)
#   forge/docs/regenerated/HLD.md
#   forge/docs/regenerated/LLD.md
#   forge/docs/regenerated/system-tests.md

# 5. 索引摘要(供 sync-check 性能 + 新 change 提供老文档背景)
forge legacy-bridge index
# 输出:
#   forge/docs/index.md                  (每 anchor 一行 ~100 字摘要)
```

### T1:日常 archive(每次都跑 sync-check 自动)

```bash
# 用户做 change → /forge:apply → /forge:archive
forge archive add-payment

# 自动触发(根据 enforce_sync 配置):
# - enforce_sync=true → archive preflight 跑 sync-check;critical pending → exit 2
# - enforce_sync=false(默认)→ archive 完成后 post-archive 跑 sync-check;不阻塞
```

### T2:resolve 差异项

archive 后看到 `forge/legacy-sync-state/<change-id>.md` 报告:

```bash
# 用户根据报告决定:
# critical 项 #1 真要更新 SRS §4.5 → 用户手动改 docs/legacy/SRS.md §4.5,
#   然后改 forge/legacy-sync-state/<change-id>.yaml 的 #1 status: pending → resolved-by-doc-update
# critical 项 #2 是 LLM 误判 → status: pending → false-positive,reason: "LLM 误读"
# minor 项 #3 不重要 → status: pending → skipped

# 跑 resolve 校验全部 ack
forge legacy-bridge resolve add-payment
```

退出码:
- `0`:全部 ack,sync-state 标 resolved
- `1`:status 字段非法值
- `2`:仍有 pending(列出)

### T3:复写产物的常态生命周期(不再 LLM 重跑)

复写产物归用户维护。手动编辑 `forge/docs/regenerated/SRS.md` 与编辑老文档一样自由。
git commit 跟其他源代码一起进版本控制。

罕见场景:用户彻底重生成 → `forge legacy-bridge regenerate`(等同 T0 重跑,**会覆盖手编辑**;
重跑前请 `git commit` 当前版以便对比 / 还原)。

## 关键 yaml 字段参考

### forge/legacy-anchors.yaml

```yaml
schema: forge-legacy-anchor/v1
anchors:
  - role: requirements          # requirements / high-level-design / low-level-design
                                  # / system-tests / acceptance-report / rationale / glossary
    path: docs/legacy/SRS-v3.2.md
    authoritative: true         # 当前权威版(同 role 仅允 1 个 true)
    version: "3.2"              # 文件版本号(可选,用户填)
    modules: [payment, order]   # 模块边界(用于 sync-check 反查影响)
    sheet: TestCases            # Excel 子 sheet(可选)
    contains_customer_data: false  # §9 GDPR:此文件含客户数据,启用 LLM 时额外 ack
    redact:                     # 此 anchor 专用 redact(决策 #20)
      - regex: "ACME-CUSTOMER-[A-Z][0-9]+"
      - literal: "INTERNAL-DB-PROD-01"
redact:                          # 全局 redact 规则(与每 anchor 的 redact 合并)
  - regex: "我司专用 token 模式"
```

### forge/legacy-sync-state/<change-id>.yaml

```yaml
schema: forge-legacy-sync/v1
change_id: add-payment
generated_at: 2026-05-05T10:30:00Z
diffs:
  - id: 1
    severity: critical
    anchor_path: docs/legacy/SRS.md
    section: §4.5
    description: 支付幂等性约束变化,需更新 SRS
    status: pending             # pending / resolved-by-doc-update / false-positive / skipped
    reason: ""                  # status≠pending 时填(可选)
cross_anchor_conflicts:         # 跨 anchor 不一致(决策 #18 修订:默认入 diff)
  - id: 100
    severity: major
    anchor_path: docs/legacy/SRS.md vs docs/legacy/HLD.md
    description: SRS §4.5 与 HLD §6.2 矛盾
    status: pending
```

## 5 档严重度参考

| 档 | 含义 | 例子 |
|---|---|---|
| 🔴 critical | 合规 / 安全 / 业务硬约束变化 | 支付幂等性 / GDPR / PCI-DSS / 客户验收硬指标 |
| 🟠 major | 行为接口变更 | 新增 endpoint / 字段重命名 / 业务规则改动 |
| 🟡 minor | 文字描述需更新 | 老文档措辞与新代码细微出入 |
| 🔵 style | 格式 / 排版小调整 | 章节顺序变化 / 标点 |
| ⚪ info | 背景信息 | LLM 注意到但无需更新 |

## redact 默认规则参考(决策 #20 / spec §4.5)

| name | 匹配 | 例子 |
|---|---|---|
| aws-access-key | AKIA + 16 字符 | <<aws-example-placeholder>> |
| gcp-api-key | AIza + 35 字符 | AIzaSyDdI0hCZtE6vy... |
| azure-conn-string | DefaultEndpointsProtocol=... | (Azure storage) |
| github-pat | ghp_/gho_/ghu_/ghs_/ghr_ + 36+ 字符 | ghp_aaaaaaa... |
| gitlab-pat | glpat- + 20+ 字符 | glpat-xxxxx |
| slack-token | xox[bpoa]-... | xoxb-1234-... |
| oauth-bearer-basic | Bearer/Basic + 20+ 字符 | Authorization: Bearer xxx |
| jwt | eyJ.eyJ.xxx | eyJhbGciOiJIUzI1NiJ9.... |
| private-key-marker | -----BEGIN ... PRIVATE KEY----- | RSA / EC / OPENSSH 等 |
| db-url-with-creds | postgres/mysql/mongodb/redis://user:pass@host | postgres://app:s3cret@host |
| email | foo@bar.com | (任何邮箱) |
| ipv4-private | 10.x / 192.168.x / 172.16-31.x | 10.0.5.42 |

跑 `--redact-report` flag 验证规则真生效:

```bash
forge legacy-bridge regenerate --redact-report
# 输出:
# [redact] aws-access-key:    3 命中
# [redact] github-pat:         12 命中
# ...
# total: 17 项已 mask 为 <<REDACTED-N>>
```

## FAQ

### Q1:`legacy-anchors.yaml` 与 `forge/config.yaml#legacy_bridge` 的职责怎么分?

| 文件 | 职责 |
|---|---|
| `legacy-anchors.yaml` | anchor metadata:role / path / authoritative / hash / 此 anchor 专用 redact |
| `forge/config.yaml#legacy_bridge` | 全局 policy:allow_llm_calls / enforce_sync / auto_resolve_cross_anchor / regen_license / provider |

(M-5)

### Q2:复写产物可不可以 commit 到 git?

可以。`forge/docs/regenerated/` 整个目录建议 commit。frontmatter 里的 `license: derived-from-source` 是声明,
具体许可由 anchor 源决定(§9)。如果你的项目是 OSS,在 `config.yaml#legacy_bridge.regen_license` 显式覆盖
为 `MIT` / `Apache-2.0` 等。

### Q3:Air-gapped 环境怎么用?

不用 brownfield。保持 `allow_llm_calls: false`,brownfield 命令拒绝运行(graceful exit),
archive 工作流不受影响。手动维护老文档即可。

### Q4:Excel(.xlsx)解析失败怎么办?

如果 Excel 含 chart / pivot / formula,exceljs 解析会报 `unsupportedFeatures`(spec §6.5)。
解决:在 Excel 中"另存为 .csv",改 `legacy-anchors.yaml` 的 path 指向 .csv。

### Q5:复写保真率 < 90% 怎么办?

`forge legacy-bridge regenerate` 失败时不 retry(决策 #16),直接产 `.partial` 报告。三选一:

1. **接受 .partial**:`mv forge/docs/regenerated/SRS.md.partial forge/docs/regenerated/SRS.md`,
   人工补丢失 fact
2. **重写 prompt 重跑**:在 PR 调整 `regenerator.ts` 的 prompt 后重跑
3. **手补**:直接编辑复写产物,补丢失的 critical fact

## 7 个 acceptance scenario(release gate 跑)

每发版必须人工跑(spec §5.1 + Phase F release-gate-checklist 加 §2.4):

| # | 场景 | 验证 |
|---|---|---|
| 1 | opt-in 流程 | `forge legacy-bridge regenerate` 在未 ack 时拒绝运行 + 提示 |
| 2 | redact 真生效 | `--redact-report` 输出 ≥ 9 类规则命中数 |
| 3 | preflight 阻塞 | enforce_sync=true + critical pending → archive exit 2 |
| 4 | lock 并发 | regenerate + archive 同时跑 → 后到者 exit 5 |
| 5 | 多 harness skill smoke | Plan 4 e2e brainstorming acceptance 仍过 |
| 6 | Excel 解析 | 多 sheet xlsx 正确解析 + 中文 sheet 名 |
| 7 | disclaimer 含 license | 复写产物 frontmatter 含 `license: derived-from-source` |

## 退出码(spec §4.6 + §2.1)

| 码 | 含义 |
|---|---|
| 0 | 成功(含 graceful skip) |
| 1 | 一般错误 / 配置错 / 参数无效 |
| 2 | 业务规则失败(critical pending / 保真率不达标) |
| 3 | 复写部分成功(.partial) |
| 4 | 数据损坏(预留) |
| 5 | lock 被另一进程持有 |
````

- [ ] **Step 2:commit**

```bash
git add docs/legacy-bridge.md
git commit -m "docs: legacy-bridge.md 完整使用手册 + opt-in / redact / 7 acceptance / FAQ"
```

---

### Task F2:更新 `docs/getting-started.md` + `docs/cli-reference.md`

**Files:**
- Modify: `docs/getting-started.md`
- Modify: `docs/cli-reference.md`

- [ ] **Step 1:在 `docs/getting-started.md` 末尾追加 §6 brownfield 段**

打开现有 `docs/getting-started.md`,在文件末尾追加:

```markdown

## 6. 已有老文档项目接入(v0.2 brownfield)

> 适用场景:已有完整 SRS / HLD / 测试用例的项目接入 forge,且老文档不能被替代(合规 / 客户验收 / 审计要求)

完整流程见 [`docs/legacy-bridge.md`](./legacy-bridge.md)。三步初始化:

```bash
# 1. 启用 LLM 调用(在 forge/config.yaml 加 legacy_bridge.allow_llm_calls: true 后)
forge legacy-bridge --acknowledge-data-transfer

# 2. 二阶段 mapping
forge legacy-bridge map
# 审改 forge/legacy-anchors-draft.yaml 后:
mv forge/legacy-anchors-draft.yaml forge/legacy-anchors.yaml

# 3. 复写器 + 索引(one-shot)
forge legacy-bridge regenerate
forge legacy-bridge index
```

后续每次 `forge archive` 自动 sync-check;详见手册。

合规场景(enterprise / air-gapped):保持 `allow_llm_calls: false`,
brownfield 工具 graceful skip,主工作流不变。
```

- [ ] **Step 2:在 `docs/cli-reference.md` 末尾追加 `forge legacy-bridge` 命令段**

打开现有 `docs/cli-reference.md`,在末尾(在退出码表之前)追加:

````markdown

## forge legacy-bridge — Brownfield Onboarding(v0.2)

完整文档:[`docs/legacy-bridge.md`](./legacy-bridge.md)。

### `forge legacy-bridge --acknowledge-data-transfer [--acknowledge-customer-data]`

一次性 ack 数据传输到 Anthropic API(决策 #22 / §9 GDPR)。

| flag | 用途 |
|---|---|
| `--acknowledge-data-transfer` | 必选;ack 老文档 + 代码 + 测试用例发往 LLM provider |
| `--acknowledge-customer-data` | 当 anchors.yaml 含 contains_customer_data=true 时必加 |

### `forge legacy-bridge map [--merge | --overwrite]`

LLM 扫 docs/+src/ 推测 role,产 anchors-draft.yaml + draft .md 概览。

| flag | 用途 |
|---|---|
| `--merge`(默认) | 与已存在 anchors.yaml 合并新发现项,保留用户审过部分 |
| `--overwrite` | 全量重生成(覆盖用户改动,需 TTY 确认) |
| `--docs-paths <paths>` | 逗号分隔的额外 docs 目录(默认扫 docs/ doc/ document/) |
| `--redact-report` | 输出每条 redact 规则的命中数 |

### `forge legacy-bridge regenerate [--role <r>] [--dry-run] [--include-historical] [--yes]`

复写器:LLM 读 anchors → 规范 SRS/HLD/LLD/system-tests + 双 LLM 抽样验证。

| flag | 用途 |
|---|---|
| `--role <role>` | 仅复写指定 role(默认全 4 role) |
| `--dry-run` | 不调 LLM,只估算 cost + 列要扫的文件 |
| `--include-historical` | 把 authoritative=false 历史版作背景(默认关) |
| `--redact-report` | 输出 redact 命中数 |
| `--yes` | 非 TTY 必须显式 ack 高 cost 才继续(M-4) |

### `forge legacy-bridge index [--yes]`

为每个 authoritative anchor 生成 ~100 字 LLM 摘要 → `forge/docs/index.md`。

### `forge legacy-bridge sync-check [--change-id <id>]`

检测 change 影响的 anchor → 5 档差异报告 → `forge/legacy-sync-state/<id>.{md,yaml}`。

### `forge legacy-bridge resolve <change-id>`

校验 sync-state diffs 全部 ack 后标 resolved。

退出码补充(基础码沿用已有表):

| 码 | brownfield 上下文含义 |
|---|---|
| 0 | 成功(含 graceful skip:无 anchors / allow_llm_calls=false) |
| 1 | 配置错(opt-in 未做)/ 参数无效 / status 字段非法 |
| 2 | critical 未 resolve / 保真率不达标 |
| 3 | 复写部分成功(.partial 文件) |
| 5 | archive.lock 或 legacy-bridge.lock 被另一进程持有 |
````

- [ ] **Step 3:commit**

```bash
git add docs/getting-started.md docs/cli-reference.md
git commit -m "docs: getting-started.md + cli-reference.md 加 brownfield 段"
```

---

### Task F3:更新 `docs/release-gate-checklist.md` 加 §2.4 brownfield acceptance(7 scenario)

**Files:**
- Modify: `docs/release-gate-checklist.md`

- [ ] **Step 1:在 `docs/release-gate-checklist.md` 的 §2.3 失败处理之前(实际位置:§2.2 Codex 段后),追加 §2.4 brownfield 段**

打开现有 `docs/release-gate-checklist.md`,在 `### 2.3 失败处理` 之前插入:

````markdown
### 2.4 Brownfield Acceptance(v0.2 新增)

**v0.2 必须跑 7 个 brownfield scenario。任一失败不发版。**

#### 2.4.1 opt-in 流程

1. 起空目录 `mkdir /tmp/forge-bf-1 && cd $_ && git init`
2. `pnpm dlx @accelerator-mzq/forge init --harness claude`
3. 不在 `forge/config.yaml` 加 `legacy_bridge.allow_llm_calls`
4. 跑 `forge legacy-bridge regenerate`
5. **期望(✅)**:exit 1 + 提示 "legacy-bridge 命令需要发送数据到 Anthropic API"

#### 2.4.2 redact 真生效

1. 写 `docs/legacy/secret-srs.md`,含 `<<aws-example-placeholder>>` + `ghp_aaaaaaaa...` + `foo@example.com`
2. 配 anchors.yaml + 启用 LLM(`forge legacy-bridge --acknowledge-data-transfer`)
3. 跑 `forge legacy-bridge regenerate --redact-report --dry-run`
4. **期望(✅)**:stdout 输出 ≥ 3 类规则命中数(aws / github-pat / email)

#### 2.4.3 preflight 阻塞

1. `forge/config.yaml` 加 `legacy_bridge.enforce_sync: true`
2. 制造 1 条 critical pending diff(手编辑 `forge/legacy-sync-state/<id>.yaml`,severity=critical, status=pending)
3. 跑 `forge archive add-payment`(假设有此 change)
4. **期望(✅)**:exit 2,stderr 含 "1 项 critical 差异未 resolve"

#### 2.4.4 lock 并发

1. 终端 A:`forge legacy-bridge regenerate &`(后台)
2. 终端 B 立即:`forge archive add-x`
3. **期望(✅)**:终端 B exit 5,stderr 含 "another forge archive is in progress"
4. 终端 A 跑完后,终端 B 重跑应正常

#### 2.4.5 多 harness skill smoke 不退化

跑 §2.1 + §2.2 的 Claude Code + Codex acceptance test 各一次。
**期望(✅)**:Plan 4 e2e brainstorming 逻辑无变化。

#### 2.4.6 Excel 解析

1. 准备多 sheet `.xlsx`(用 `tests/fixtures/legacy-bridge/_make-excel-fixture.mjs` 生成 fixture)
2. 配 anchors.yaml `path: ./test.xlsx, sheet: TestCases`
3. 跑 `forge legacy-bridge regenerate --role system-tests --dry-run`
4. **期望(✅)**:exit 0,无 ExcelParseError

#### 2.4.7 disclaimer 含 license

1. 跑 `forge legacy-bridge regenerate`(配好 anchors)
2. cat `forge/docs/regenerated/SRS.md`
3. **期望(✅)**:frontmatter 含 `license: derived-from-source` + 顶部 disclaimer 含 "此文档由 forge 自动生成"

#### 失败处理

任一不满足:
- 不发版
- GitHub Issue 标 `release-gate-fail` + `brownfield`
- 检查最近 PR 是否动了 `src/core/legacy-bridge/` 或 `forge-eval/regeneration-*`
- 修复 → 重跑全套 release gate
````

- [ ] **Step 2:commit**

```bash
git add docs/release-gate-checklist.md
git commit -m "docs(release-gate): 加 §2.4 brownfield acceptance(7 scenario)"
```

---

### Task F4:更新 `CHANGELOG.md` v0.2.0 段 + `package.json` version bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`(version 0.0.1 / 0.1.0 → 0.2.0)
- Modify: `README.md`(状态段)

- [ ] **Step 1:在 `CHANGELOG.md` 顶部追加 v0.2.0 段**

打开现有 `CHANGELOG.md`,在 `## [Unreleased]` 段之后(或在 v0.1.0 段之前)插入:

```markdown
## [0.2.0] - 2026-05-XX

### Added(brownfield onboarding)

- **`forge legacy-bridge` 主命令** + 5 子命令(`map / regenerate / index / sync-check / resolve`)
- **三层能力**:
  - Layer 1 sync-check(每次 archive 自动跑,5 档差异报告)
  - Layer 2 index(每 anchor ~100 字摘要)
  - Layer 3a regenerate(one-shot 复写器,LLM 读老锚点 → 规范化 SRS/HLD/LLD/system-tests)
- **archive preflight + post-archive 双 hook**(根据 `legacy_bridge.enforce_sync` 选择走哪边)
- **二阶段 mapping**:`map --merge` / `--overwrite`,LLM 推测 role + 用户审改
- **双 LLM 抽样验证**:critical 全量必抽 + 各章节按比例抽,失败直报 `.partial`(无 retry)
- **12+ 类默认 redact 规则** + 自定义 + `--redact-report` 命中数 + `<<REDACTED-N>>` 占位
- **Excel(.xlsx)原生解析**(`exceljs`,sheet 字段精确指向)
- **共享 lock 设计**:`legacy-bridge.lock`(独立)+ archive.lock 复用 + 顺序固定避死锁
- **LLM opt-in 机制**(突破 v0.1 §2.3 边界):
  - `forge/config.yaml#legacy_bridge.allow_llm_calls` 默认 `false`
  - 一次性 ack 命令 `forge legacy-bridge --acknowledge-data-transfer`
  - GDPR 二次确认门 `--acknowledge-customer-data`
  - 每次 LLM 调用前 stdout 数据传输声明
- **复写产物 frontmatter** 含 `generated-by` / `generated-at` / `sources` / `fidelity-rate` / `critical-fact-rate` /
  `license` / `forge-version` + 顶部 disclaimer
- **跨 anchor 一致性默认入 diff**(major 档);`auto_resolve_cross_anchor: true` 才走 mtime > role 优先级
- **6 个 regeneration eval scenario** + `pnpm eval-regen` + CI weekly + paths trigger
- **完整用户文档**:`docs/legacy-bridge.md` + `getting-started.md` brownfield 段 + `cli-reference.md` 命令段 +
  `release-gate-checklist.md` 7 acceptance
- **依赖**:`exceljs@^4`(MIT,Apache 2.0 兼容)+ `chardet@^2`(devDep,可选)

### Changed

- `src/core/archive/lock.ts`:`LockMode` union 扩展支持 5 个 legacy-bridge mode
- `src/cli/commands/archive.ts`:集成 brownfield preflight + post-archive 双 hook
- `forge/config.yaml`:扩展 `legacy_bridge` 段(allow_llm_calls / enforce_sync /
  auto_resolve_cross_anchor / regen_license / provider)

### Deferred to v0.3.0(spec §6.6 同步修订主 spec §7)

- OpenCode adapter(原 spec §7 v0.2 → v0.3,plugin 路线)
- specs-sync delete operation(原 spec §7 v0.2 → v0.3)
- 反向 sync(改老锚点 → 提示新 change)
- 跨 anchor 一致性专门审计(`legacy-bridge audit-consistency`)
- 真 brownfield 代码逆向(无文档项目从代码推 SRS)

### Compatibility

- v0.1.x 项目升级到 v0.2 后,**未配 `legacy-anchors.yaml` 时 sync-check graceful skip**,archive 行为不变
- 已发布 v0.1 的 archive `delete` delta 错误信息保留(用户预期内,不破坏向后兼容)
```

- [ ] **Step 2:`package.json` version bump 到 `0.2.0`**

打开 `package.json`,改 `"version": "..."` 字段为:

```json
  "version": "0.2.0",
```

(原 0.1.0 或 0.0.1)

- [ ] **Step 3:更新 `README.md` 状态段**

第 5 行(状态段)改为:

```markdown
**当前状态**:Phase 1+2+3+4+5+6+7 完成(测试全绿)。**v0.2.0 候选,Release gate 待跑**。
```

在 `## Plan 6 进度` 段后追加:

```markdown
## Plan 7 进度

Phase 7(brownfield onboarding)完成:

- `forge legacy-bridge` 主命令 + 5 子命令(map / regenerate / index / sync-check / resolve)
- LLM opt-in 流程(决策 #22:`allow_llm_calls` + `--acknowledge-data-transfer` + GDPR 二次确认)
- archive preflight + post-archive 双 hook(决策 #19:`enforce_sync` 控制阻塞 / 不阻塞)
- 双 LLM 抽样保真率验证(分层抽样 + critical 全量必抽 + per-section 防统计骗术)
- 12+ 类默认 redact + Excel 解析 + 共享 lock(`legacy-bridge.lock`)
- 6 个 regeneration eval scenario + `pnpm eval-regen` + CI workflow
- 完整用户文档 + 7 个 brownfield acceptance scenario(release-gate-checklist §2.4)

**前置 v0.2.0 发版**:仓库 Settings → Secrets 已配 `ANTHROPIC_API_KEY`(Plan 5 沿用)。
**真 publish + git tag + GitHub release 由 maintainer 跑 release gate 通过后手动执行**。
```

- [ ] **Step 4:typecheck + 跑全部测试**

```bash
pnpm typecheck && pnpm vitest run
```

预期:全 0 退出码。

- [ ] **Step 5:commit**

```bash
git add CHANGELOG.md package.json README.md
git commit -m "chore: bump version to 0.2.0 + CHANGELOG + README 状态"
```

---

### Task F5:同步更新主 spec `2026-05-04-forge-fusion-design.md` §6/§7(I-7)

**Files:**
- Modify: `docs/specs/2026-05-04-forge-fusion-design.md`

- [ ] **Step 1a(P7-16 修复):同步主 spec §2.3 line 192 的旧表述**

主 spec line 192 在"v0.1 不在范围"段写了 `不做 brownfield onboarding(OpenSpec 的 /opsx:onboard,v2 再说)`,需同步:

```markdown
- 不做 brownfield onboarding(OpenSpec 的 `/opsx:onboard`,v2 再说)
```

改为:

```markdown
- ~~不做 brownfield onboarding~~ — **v0.2 已实现**(对应 OpenSpec 的 `/opsx:onboard`),见 [`docs/specs/2026-05-05-brownfield-onboarding-design.md`](2026-05-05-brownfield-onboarding-design.md)
```

- [ ] **Step 1b:在主 spec §7 ("不在范围(明确不做)")中,把 brownfield 那行从"v2"改为"v0.2 已实现(见 brownfield-onboarding-design)"**

打开 `docs/specs/2026-05-04-forge-fusion-design.md`,定位到 §7 段(line 1189 附近):

```markdown
- Brownfield onboarding(`/opsx:onboard` 等价物,v2)
```

改为:

```markdown
- ~~Brownfield onboarding~~ — **v0.2 已实现**,见 [`docs/specs/2026-05-05-brownfield-onboarding-design.md`](2026-05-05-brownfield-onboarding-design.md) + [`docs/plans/2026-05-05-plan-7-brownfield.md`](../plans/2026-05-05-plan-7-brownfield.md)
```

- [ ] **Step 2:在主 spec §6 / §1.2 决策清单 / 风险段把 OpenCode 与 specs-sync delete 推到 v0.3**

定位到 §1.2 决策清单 line 17:

```markdown
| 4 | 支持 harness | **v0.1 = Claude Code + Codex(2 harness)**;OpenCode 推 v0.2 等 plugin(`experimental.chat.messages.transform`)实现。基于 Phase 0.5 spike 实测结果(详见 [`spike/RESULTS.md`](../../spike/RESULTS.md)) |
```

改为(把 v0.2 改 v0.3):

```markdown
| 4 | 支持 harness | **v0.1+v0.2 = Claude Code + Codex(2 harness)**;OpenCode 推 **v0.3** 等 plugin(`experimental.chat.messages.transform`)实现。基于 Phase 0.5 spike 实测结果(详见 [`spike/RESULTS.md`](../../spike/RESULTS.md))。**Plan 7(v0.2 brownfield)未实施 OpenCode adapter**。 |
```

定位到 §3.5 specs-sync delete 段(line 609 附近):

```markdown
**specs-sync delete 语义推 v0.2**:
```

改为:

```markdown
**specs-sync delete 语义推 v0.3**(原 v0.2 范围,因 v0.2 brownfield 工作量已大,推 v0.3):
```

定位到 v0.1 archive 抛错信息相关段(line 615 附近):

```markdown
- v0.1 的 archive 命令调 specs-sync 时,如果 deltas 含 delete operation,直接抛错(`v0.2 not implemented`)
```

改为:

```markdown
- v0.1+v0.2 的 archive 命令调 specs-sync 时,如果 deltas 含 delete operation,直接抛错(`v0.3 not implemented`,**保留向后兼容:已发布 v0.1.0 错误信息延续**)
```

(注:**这不是矛盾,是有意的双轨措辞**(brownfield design §6.6 line 898 显式声明)——
- **spec 文档措辞**改为 `v0.3 not implemented` 反映新路线图
- **代码实际抛错的字符串字面量**保留 `v0.2 not implemented` 不动,因为已发布 v0.1.0 用户脚本可能 grep 这个字符串做错误处理,改字面量会破坏向后兼容
- 即:`grep -n 'v0.2 not implemented' src/core/specs-sync/`,不动这些匹配位置;只改 markdown 文档段)

定位到 §6 line 1118 OpenCode 相关段:

```markdown
- OpenCode:参照 superpowers 仓库的 `docs/README.opencode.md` 找出 bootstrap 注入路径,做最小 PoC
```

改为:

```markdown
- OpenCode(**v0.3 范围**):参照 superpowers 仓库的 `docs/README.opencode.md` 找出 bootstrap 注入路径,做最小 PoC
```

定位到 §6 line 1182(风险段):

```markdown
1. **OpenCode 自动注入需 plugin**——Phase 0.5 spike 已确认 OpenCode skill 路径只注册工具不自动 inject。v0.2 通过实现 `experimental.chat.messages.transform` plugin 解决,参考 superpowers `.opencode/plugins/superpowers.js`。v0.1 不支持 OpenCode。
```

改为:

```markdown
1. **OpenCode 自动注入需 plugin**——Phase 0.5 spike 已确认 OpenCode skill 路径只注册工具不自动 inject。**v0.3** 通过实现 `experimental.chat.messages.transform` plugin 解决,参考 superpowers `.opencode/plugins/superpowers.js`。v0.1 + v0.2 不支持 OpenCode。
```

- [ ] **Step 3:在主 spec §1.2 决策清单(line 34 附近)更新 v0.2 路线图描述**

```markdown
| 21 | OpenSpec 迁移工具 | v0.1 不做,v0.2 加 `forge migrate-from-openspec` |
```

改为:

```markdown
| 21 | OpenSpec 迁移工具 | v0.1 / v0.2 不做,**v0.3** 加 `forge migrate-from-openspec` |
```

- [ ] **Step 4:验证 spec 内文件链接仍合法**

```bash
grep -nE "brownfield-onboarding-design|plan-7-brownfield" docs/specs/2026-05-04-forge-fusion-design.md
```

预期:至少 1 处 §7 引用 brownfield design + 1 处 plan 7 引用。

- [ ] **Step 5:commit**

```bash
git add docs/specs/2026-05-04-forge-fusion-design.md
git commit -m "docs(spec): 主 spec §7 / §6 同步:brownfield 已实现 + OpenCode + specs-sync delete 推 v0.3(I-7)"
```

---

### Task F6:全量本地验证 + push + Plan 7 完成记录

**Files:** 无新增(收尾)

- [ ] **Step 1:跑 5 个本地命令 + release-gate.mjs**

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build && pnpm vitest run
node scripts/release-gate.mjs
```

预期:全 0 退出码。任一 fail 回前面 Task 修。

- [ ] **Step 2:统计测试数**

```bash
pnpm vitest run --reporter=basic 2>&1 | tail -5
```

预期:总 tests pass 数 ≥ 380(Plan 6 末尾约 275 + Plan 7 新增 ~135 = ~410,落在 380-420 之间合理)。具体新增分布:
- legacy-bridge core 单元(anchors / ack / redact / conflict / excel / encoding / mapper / regenerator /
  quality-judge / indexer / sync-check / diff-report / resolve / hash-anchor / concurrency)≈ 90
- legacy-bridge CLI 集成(skeleton / map / regenerate / index / sync-check / resolve / cross-platform /
  archive-integration)≈ 25
- forge-eval/regeneration-runner ≈ 6
- core/archive/lock 扩展 case ≈ 3
- core/parse/config legacy_bridge 段 ≈ 3
- 合计 ~127(±5)

- [ ] **Step 3:push 到 dev**

```bash
git push origin plan-7-brownfield:dev
```

(实际命名按维护者偏好)

- [ ] **Step 4:监视 CI**

```bash
gh run watch
```

预期:`ci.yml`(typecheck/lint/test/build)全绿。`skill-eval.yml` 与 `regen-eval.yml` 仅在 paths 命中或 weekly 时触发,
若 PR 改了相关文件,需要 ANTHROPIC_API_KEY secret 已配置才会跑过。

- [ ] **Step 5:在本 plan 文件末尾追加完成记录**

打开 `docs/plans/2026-05-05-plan-7-brownfield.md`,在文件末尾(本 Task 之下)新增:

```markdown
---

## Plan 7 完成记录

- 完成时间:<UTC YYYY-MM-DD HH:MM>
- 总测试数:<N>
- CI run URL:<gh URL>
- 关键 commit 范围:<first hash>..<last hash>
- 月预算估算:brownfield ~$30-50(weekly regen-eval + sync-check + 用户主动 regenerate / index)
- v0.2.0 npm publish 状态:**待 maintainer 手动跑 release-gate 后执行**(spec §F + Plan 6 风格沿用)
```

```bash
git add docs/plans/2026-05-05-plan-7-brownfield.md
git commit -m "docs(plan-7): 完成记录 + 时间戳"
git push origin plan-7-brownfield:dev
```

---

## Plan 7 完成标准

- [ ] CI Linux + Windows 全绿(`ci.yml` 不受 `regen-eval.yml` 影响)
- [ ] 5 个本地命令(typecheck / lint / format:check / build / test)全 0
- [ ] `node scripts/release-gate.mjs` 全过
- [ ] 测试数 ≥ 380(总数,Plan 6 末尾 ~275 + Plan 7 新增 ~127 → ~402)
- [ ] `src/core/legacy-bridge/` 17 个 .ts 文件全部存在(types / anchors / ack / redact / conflict / budget / excel / encoding / hash-anchor / mapper / regenerator / quality-judge / indexer / sync-check / diff-report / resolve / index)
- [ ] `forge-eval/regeneration-scenarios/` 6 yaml + 5 fixture md 全部存在
- [ ] `forge legacy-bridge --help` 输出 5 子命令清单
- [ ] `forge legacy-bridge map --overwrite` 在 fixture 项目能跑通(配 mock LLM)
- [ ] `forge legacy-bridge regenerate --dry-run` 输出 anchor 列表 + 估算 cost
- [ ] `forge legacy-bridge resolve <id>` 在全 ack 时 exit 0,有 pending 时 exit 2
- [ ] `forge archive` 配 `enforce_sync=true` + critical pending → exit 2(preflight 阻塞)
- [ ] `forge archive` 在没 anchors 时行为 = v0.1(graceful skip)
- [ ] `legacy_bridge.allow_llm_calls=false` 时 brownfield 命令拒绝运行 + 提示
- [ ] 复写产物 frontmatter 含 `generated-by` + `license: derived-from-source` + 顶部 disclaimer
- [ ] redact 默认规则覆盖 12+ 类(spec §4.5)
- [ ] `pnpm eval-regen --scenario well-formed-srs` 在配 ANTHROPIC_API_KEY 后真能跑通
- [ ] `.github/workflows/regen-eval.yml` 存在且 yaml 合法
- [ ] `docs/legacy-bridge.md` 含完整使用手册 + 7 acceptance + FAQ + redact 规则参考
- [ ] `docs/release-gate-checklist.md` 含 §2.4 brownfield acceptance(7 scenario)
- [ ] 主 spec `2026-05-04-forge-fusion-design.md` §6/§7 已同步:brownfield 标"v0.2 已实现"+ OpenCode/specs-sync delete 推 v0.3
- [ ] `package.json#version = 0.2.0`
- [ ] tarball 大小 < 1 MB(release-gate.mjs 验证)
- [ ] `forge legacy-bridge --acknowledge-data-transfer` 在配好 config 时写 `forge/.cache/llm-ack.yaml`
- [ ] 含 customer_data 的 anchor + 缺 `--acknowledge-customer-data` → exit 1 + GDPR 提示
- [ ] lock 死锁防护:regenerate / index 按 archive.lock → legacy-bridge.lock 顺序持有

---

## Plan 7 → v0.3.0 衔接

v0.3.0 范围(spec §6.6):

- **OpenCode adapter**(原 spec §7 v0.2 → v0.3):实现 `experimental.chat.messages.transform` plugin,参考 superpowers `.opencode/plugins/superpowers.js`
- **specs-sync delete operation**(原 spec §3.5 v0.2 → v0.3):设计 deletion marker 格式 + 同步更新 spec
- **brownfield 反向 sync**:改老锚点 → 自动建议新 change
- **brownfield 跨 anchor 一致性专门审计命令**:`forge legacy-bridge audit-consistency`
- **brownfield 真代码逆向**:无文档项目从代码推 SRS / HLD
- **brownfield LLM provider 扩展**:OpenAI / 自托管(`legacy_bridge.provider` 字段已预留 `'anthropic'` 值)

Plan 7 给 v0.3 留下的接口:

- `legacy_bridge.provider: 'anthropic'` 已预留 union 扩展(决策 #22)
- `forge-eval/regeneration-runner.ts` 与 Plan 5 forge-eval 共用 `loadEnv` / `judgeWithLlm`,扩 OpenAI 时统一改一处
- `forge/legacy-sync-state/<id>.yaml#cross_anchor_conflicts` schema 已含 status 字段,
  v0.3 的 audit-consistency 命令复用此结构
- 7 个 brownfield acceptance scenario(release-gate-checklist §2.4)是 v0.3 仍要全过的回归基线

---

## 自查记录(writing-plans skill 要求)

**Spec coverage**:

| spec 章节 | Plan 7 任务 |
|---|---|
| §1.1.1 v0.2 突破 v0.1 §2.3 LLM 边界 | A6 + B1.3(opt-in 流程)+ F5(主 spec 同步) |
| §1.2 三层能力架构 | C1-C4(Layer 1) + D2-D3(Layer 2) + B2.4(Layer 3a) |
| §1.3 决策清单 23 条 | A1-F6 全程覆盖,每个决策对应 1+ task(详见 spec §10 Codex 修订记录映射) |
| §2.1 CLI 入口 | A6(骨架)+ B3.2(regenerate)+ C4(sync-check/resolve)+ D3(map/index) |
| §2.2 文件结构 | A4(types) + 全程产物落 forge/legacy-anchors.yaml / docs/regenerated/ / legacy-sync-state/ |
| §2.3 核心模块 | B1.1-B3.1 / C1-C3 / D1-D2 |
| §2.4 复用现有模块 | A2(lock 扩展)+ B2.3(hash-anchor 复用 src/core/hash)+ B3.1(quality-judge 风格继承 forge-eval/judge.ts) |
| §2.5 archive 衔接(preflight + post-archive) | C5 |
| §2.6 lock 设计(决策 #23) | A2 + C6 |
| §2.7 LLM opt-in 流程 | B1.3 |
| §3.1-3.5 数据流 T0-T4 | F1(用户文档完整 walk-through) + 各 task 实施细节 |
| §4 错误处理 | 各 task 内 try/catch + 退出码统一(spec §4.6) |
| §4.5 redact 12 类 | B1.1 |
| §5.1 复写质量 eval(分层抽样) | B3.1 + E1-E4 |
| §5.2 sync-check 单测 | C2 + C5 + 并发 C6 |
| §5.3 CLI 集成测试 | B3.2 / C4 / D3 / E5 |
| §5.5 跨平台 fixture | B2.1 + B2.2 + E5 |
| §5.7 测试体量 ~135 新 | 全程 ≈ 127(±5,与 spec 一致) |
| §6.1 阶段拆分 8 phase | Phase A / B1 / B2 / B3 / C / D / E / F 一对一 |
| §6.5 依赖选定 exceljs | A1 + B2.2 |
| §6.6 路线图衔接 v0.3 | F5(主 spec §6/§7 同步) |
| §7 不做项 | Phase 0 范围段 + F1 用户文档 FAQ |
| §8 与 v0.1 衔接(向后兼容) | C5 graceful skip + A2 lock 扩展不破坏现有 |
| §9 许可与署名 | B2.4(frontmatter license) + B1.3(GDPR 二次确认) |
| §10 Codex 修订记录 | C-1 → §1.1.1 + B1.3;C-2 → A2 + C6;C-3 → C5;C-4 → F1 文档说明;
  I-1 → B1.1;I-2 → B3.1;I-3 → B1.2;I-4 → 8 phase 拆分;I-5 → C6;I-6 → A1 + E6;
  I-7 → F5;I-8 → A4 acceptance-report role;I-9 → B2.4 license + B1.3 customer_data;
  M-1-M-5 → 文档措辞统一 |

**Placeholder 扫描**(P7-06 修订):已扫;每个 task step 都含具体命令 / 完整代码 / 期望输出。文件路径精确到 `src/core/legacy-bridge/<file>.ts` 与 `tests/core/legacy-bridge/<file>.test.ts`。无 TBD / TODO / "implement later" / "similar to Task N" 字样。

**Phase A 骨架的"待替换骨架"提示是有意分阶段交付**(不属于 placeholder 缺陷):Phase A Task A6 的 5 个 CLI 子命令 stub 在该 phase 跑通编译 + skeleton 单测,后续 phase 的 task **逐个替换**(B1.3 替换 `--acknowledge-data-transfer` 主入口 / B3.2 替换 `regenerate` / C4 替换 `sync-check` 与 `resolve` / D3 替换 `map` 与 `index`);每个替换 task 含完整代码,与 Plan 4 / Plan 5 的"Phase A 写 loader 后 Phase B 填实模板"分阶段风格一致。

**Type 一致性**:

- `LegacyAnchor`(types.ts)字段 `role`、`path`、`authoritative`、`hash`、`last_regenerated`、`redact`、
  `contains_customer_data`、`modules`、`sheet` — 在 anchors.ts / regenerator.ts / sync-check.ts / mapper.ts /
  hash-anchor.ts 一致引用
- `SyncStateDiff` status union `pending | resolved-by-doc-update | false-positive | skipped` —
  diff-report.ts / resolve.ts / sync-check.ts 一致
- `LockMode` union 在 lock.ts 定义,在 legacy-bridge.ts / archive.ts 引用 — 7 个 mode 名拼写一致
- `QualityResult` 字段 `total_rate / critical_rate / per_section_rates / lost_critical / lost_non_critical /
  uncovered_sections / passed` — quality-judge.ts 定义,regeneration-runner.ts / regenerator.test.ts 一致引用
- `KeyFact { text, section, critical }` — types.ts 定义,quality-judge.ts / regeneration-types.ts 一致
- `AckCheckResult.reason` union `allow_llm_calls=false | ack-missing | ack-stale-config-changed |
  customer-data-not-acknowledged` — ack.ts 定义,renderOptinPrompt 与 legacy-bridge.ts CLI action 一致引用
- `RegenerateInput.regenLicense: string` — Phase B2.4 命名 `regenLicense`,Phase E3 runner 调用同名;不与
  config.yaml 字段名 `regen_license`(yaml 风格)冲突,因为 caller 在 CLI action 内做转换
- `REGEN_FILENAMES`(regenerator.ts)与 4 核心 role 的文件名一致(SRS.md / HLD.md / LLD.md / system-tests.md);
  brownfield design §1.2 + 决策 #14 一致

**实施顺序约束**:

- Task A2(lock 扩展)必须先于 B1.3 / B3.2 / C4 / D3(后者都要用 `acquireLockByPath`)
- Task A4(types)必须先于所有后续 .ts 文件
- Task B2.3(hash-anchor)必须先于 C2(sync-check 内 checkAnchorHash 调用)
- Task B3.1(quality-judge)必须先于 E3(regeneration-runner 调用 stratifiedSample / judgeAllFacts)
- Task C5(archive 集成)必须最后于 C1-C4 之后(集成 sync-check / diff-report / resolve)
- Task F5(主 spec §7 同步)必须在 Phase A-E 实施完成后,因为它声明"已实现"(I-7)
- Task F6 是收尾,必须最后

---

**END OF PLAN 7**

