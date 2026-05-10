# Plan 8f — `forge migrate` Phase 6 CLI 端到端 + 文档实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans。Steps 用 checkbox(`- [ ]`)语法跟踪。

**Goal**:实施 CLI 端到端测;写 README + docs/migration/from-openspec.md + from-superpowers.md;补 SIGINT process.once 测试。M6 里程碑。

**Architecture**:CLI 端到端测覆盖 exit code(0/2/4/5)+ stdout 关键 token + dry-run 路径;文档面向用户,讲迁移前要做啥、估价怎么读、`[needs-fix]` 怎么补、cleanup 建议、archive 降级机制(M13)、bundled 限制(M16)、0.6 fidelity 说明。

**Tech Stack**:vitest + child_process(CLI 端到端);docs 纯 markdown。

**Spec 引用**:[`2026-05-10-forge-migrate-design.md`](../specs/2026-05-10-forge-migrate-design.md) §6.1 README + §6.2 docs/migration/。

**前置**:Plan 8a-8e 完成;CLI 真功能跑通。

---

## File Structure(Plan 8f 完成时改动)

```
tests/cli/
└── migrate.test.ts                       ← ★ NEW(Task 6.1)

README.md                                 ← 改(Task 6.2):加"从已有项目搬过来"段
docs/migration/
├── from-openspec.md                      ← ★ NEW(Task 6.3)
└── from-superpowers.md                   ← ★ NEW(Task 6.4)
```

---

## Task 6.1:CLI 端到端测

**Files:** Create `tests/cli/migrate.test.ts`

**Spec 引用**:§4.1 测试分层 CLI 行 + §4.3 CLI 集成测断言。

- [ ] **Step 1:写 fail test**

```ts
// tests/cli/migrate.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FORGE_CLI = join(__dirname, '../../dist/cli/index.js');

function runForge(args: string[], cwd: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', [FORGE_CLI, 'migrate', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err: any) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

describe('forge migrate CLI 端到端', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'forge-cli-migrate-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('参数缺失 → exit 2 + stderr 提示', () => {
    const r = runForge([], tmp);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/source/);
  });

  it("source 非 'openspec'/'superpowers' → exit 2", () => {
    const r = runForge(['unknown'], tmp);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/openspec.*superpowers/);
  });

  it('源不存在 → exit 2', () => {
    const r = runForge(['openspec'], tmp);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/openspec.*不存在/);
  });

  it('--dry-run 不写 forge/(只 .cache 等 bootstrap)', async () => {
    await mkdir(join(tmp, 'openspec', 'specs', 'foo'), { recursive: true });
    await writeFile(join(tmp, 'openspec', 'specs', 'foo', 'spec.md'), '# Foo\n');
    const r = runForge(['openspec', '--dry-run', '--no-regenerate'], tmp);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('source=openspec');
    // forge/ 不应有 specs/foo/spec.md(dry-run 不写)
    let exists = true;
    try { await import('node:fs').then((m) => m.promises.access(join(tmp, 'forge/specs/foo/spec.md'))); } catch { exists = false; }
    expect(exists).toBe(false);
  });

  it('LockHeldError 友好文案(非 archive 误导)', async () => {
    // 模拟 lock 占用:先开锁文件
    await mkdir(join(tmp, 'forge/.cache'), { recursive: true });
    await writeFile(
      join(tmp, 'forge/.cache/migrate.lock'),
      JSON.stringify({ pid: process.pid, started_at: '2026-01-01', mode: 'migrate' }),
    );
    await mkdir(join(tmp, 'openspec'), { recursive: true });
    const r = runForge(['openspec'], tmp);
    expect(r.stderr).toContain('forge migrate is blocked by lock');
    expect(r.stderr).not.toContain('forge archive'); // 友好化:不误导用户以为 archive 命令占锁
  });
});
```

- [ ] **Step 2:跑 fail**

```bash
pnpm test -- tests/cli/migrate.test.ts
```

- [ ] **Step 3:实施(已有功能,本 task 主要补 stderr 文案 / dry-run 输出 / SIGINT 退出码)**

若上述 case 有 FAIL,根据失败信息调整 `runMigrate` 的 stderr / stdout 输出。

- [ ] **Step 4-5:pass + commit**

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
git add tests/cli/migrate.test.ts
git commit -m "test(migrate): migrate-6.1 CLI 端到端测(exit code + dry-run + lock 友好文案)"
```

---

## Task 6.2:README 加"从已有项目搬过来"段

**Files:** Modify `README.md`

**Spec 引用**:§6.1 README 加段。

- [ ] **Step 1:在 README 适当位置(如"v0.2 → v0.3 升级"段后)加**:

```md
## 从已有项目搬过来(v0.4+)

如果项目已经在用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 或装过 [superpowers](https://github.com/obra/superpowers) plugin,跑 `forge migrate <source>` 一键搬到 forge 工作目录:

```bash
# OpenSpec 项目
forge migrate openspec       # 默认 --regenerate(LLM 补缺件,会显示估价 + ack)

# superpowers 用户产物(docs/superpowers/{specs,plans}/)
forge migrate superpowers    # 同上;design+plan 配对成 forge change
```

加 `--no-regenerate` 跳过 LLM,只搬结构 + 跑 markdown-aware transformer;失败件标 `[needs-fix]`(用户后续手补 / 重跑 --regenerate)。

详见 [`docs/migration/from-openspec.md`](docs/migration/from-openspec.md) 与 [`docs/migration/from-superpowers.md`](docs/migration/from-superpowers.md)。

注:
- bundled plugin 中 `--regenerate` 不可用 — openspec source **静默退化**为 `--no-regenerate`;
  superpowers source 因结构必缺 proposal/specs 会**前置 prompt 让你确认**(`--no-interactive` 直接 abort)。
- archive 落点强制完整(M13):推测 archive 但缺 proposal/specs 且 regen 关闭 → 必须用户二次确认是否降级 active(`--no-interactive` 直接 abort exit 4)。
- 默认 cp 不动源;migrate 跑完后用户手动 `git rm -r openspec/`(or `docs/superpowers/{specs,plans}/`)清理。
```

- [ ] **Step 2:commit**

```bash
git add README.md
git commit -m "docs(migrate): migrate-6.2 README 加'从已有项目搬过来'段"
```

---

## Task 6.3:`docs/migration/from-openspec.md`

**Files:** Create `docs/migration/from-openspec.md`

**Spec 引用**:§6.2 详细文档(~每篇 ≤ 350 行)。

- [ ] **Step 1:写文档(以下为目录结构,完整内容由 subagent 实施期填实)**

```md
# 从 OpenSpec 项目迁移到 forge

本文档讲 `forge migrate openspec` 的完整流程、决策点、常见问题。

## 1. 迁移前检查清单

- [ ] 备份你的 openspec/ 目录(虽然 forge migrate 默认不动源,但建议)
- [ ] 确认在 git 仓库内(便于 archive-detect 用 git log 信号 + 失败回滚)
- [ ] 当前 cwd 没正在跑其他 forge 命令(锁占用)
- [ ] 检查 forge/ 是否已有同名 change(避免触发 --imported 后缀)

## 2. 端到端流程

### 2.1 默认路径(--regenerate)
... (详细输出示例 + 估价 ack 流程截图描述)

### 2.2 --no-regenerate 路径
...

### 2.3 --dry-run
...

## 3. transformer 规则速查

参考 spec §2.5;主要变换:
- `### Requirement: <name>` → `## Requirement: <name>`(改名不删除)
- `#### Scenario: <id>` → `## Scenario: <id>`
- `- **WHEN/THEN/GIVEN** <text>` → `**When/Then/Given** <text>`
- `## Problem` / `## Proposed Solution` → `## Why` / `## What`
- `- [ ] N. text` / `- [ ] N.M.K. text` → `- [ ] task-N: text` / `task-N-M-K:`

## 4. 常见问题

### 4.1 [needs-fix] 怎么处理?
- 看 `forge/migrate-report.md` 的 `[needs-fix: <field> <message>]` 标记
- 手补 / 或重跑 `forge migrate openspec --regenerate` 让 LLM 补

### 4.2 我有代码块内 #### Scenario 示例,migrate 改了吗?
- 不会;markdown-aware walker 跳过 fenced code(spec §2.5 v3)

### 4.3 我用 4 空格缩进的代码 block 包了 #### Scenario 示例,会被改吗?
- **会**;walker **不识 indented code block(known limitation,spec §7.1)**;请改用 fenced code

### 4.4 表格里有 GWT step 不被转换?
- **是**;walker 跳过 table-row;请改用 list 形式

### 4.5 三层 task 编号 1.2.3 的父子关系丢了?
- **是**;forge tasks parser 实测不识别父子;migrate 把 `task-1.2.3` 转 `task-1-2-3` 扁平化

## 5. cleanup

migrate 跑完后:
```bash
# 检查 forge/ 树就位;forge/migrate-report.md 含完整 plan + cleanup 建议
git status
git diff
# 满意后清源
git rm -r openspec/
git commit -m "chore: migrate openspec → forge"
```

## 6. rollback

本 spec 不实现 `forge migrate --rollback`;若需还原:
- 从 git 里 checkout 旧的 openspec/ 目录
- rm -rf forge/(若 migrate 落地的全部要丢)
- 24h 内 `--force` 路径可看 `forge/.forge-trash/<ts>/` 兜底
```

- [ ] **Step 2:commit**

```bash
git add docs/migration/from-openspec.md
git commit -m "docs(migrate): migrate-6.3 docs/migration/from-openspec.md"
```

---

## Task 6.4:`docs/migration/from-superpowers.md`

**Files:** Create `docs/migration/from-superpowers.md`

类似结构,加 superpowers-specific 内容:配对算法、archive 推测、bundled 限制、0.6 fidelity 说明。

- [ ] **Step 1:写文档(目录结构同 from-openspec.md;内容差异:配对 + archive-detect + LLM 必走原因)**

关键段落:
- 1. 迁移前:目录结构假设 `docs/superpowers/{specs,plans}/<date>-<topic>-{design,plan}.md`
- 2. 配对算法:`<date>-<topic>` 提取规则(锚定 `/-design\.md$/`)
- 3. archive 推测:checkbox + git log + critical-task-pending
- 4. **bundled limitation**:bundled plugin + superpowers 前置 prompt;`--no-interactive` 直接 abort
- 5. **fidelity 0.6 说明**:superpowers 缺 proposal/specs,LLM 从零生成,保真期望低;若用户调高阈值会触发更多 .partial,引导手补

- [ ] **Step 2:commit**

```bash
git add docs/migration/from-superpowers.md
git commit -m "docs(migrate): migrate-6.4 docs/migration/from-superpowers.md"
```

---

## Task 6.5:SIGINT process.once 测试

**Files:** Modify `tests/cli/migrate.test.ts`(追加)

**Spec 引用**:§3.3 SIGINT 处理 + codex C2 process.once 防累积。

- [ ] **Step 1:写测**

```ts
// tests/cli/migrate.test.ts(追加)
it('多次 runMigrate 不累积 SIGINT listener', async () => {
  // 通过 process.listenerCount('SIGINT') 检查
  const before = process.listenerCount('SIGINT');
  // 跑两次完整 dry-run
  // ... runMigrate(...) × 2
  const after = process.listenerCount('SIGINT');
  expect(after).toBe(before); // 用 once + finally off,listener 应不累积
});
```

- [ ] **Step 2-5:pass + commit**

```bash
pnpm test -- tests/cli/migrate.test.ts -t "SIGINT"
git commit -m "test(migrate): migrate-6.5 SIGINT process.once 不累积测试"
```

---

## Task 6.6:P6 完成 verification

- [ ] 全量 verification

```bash
cd D:/ClaudeProject/opsp/forge-repo
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

预期:全 0 error;tests/migrate/ + tests/cli/migrate.test.ts 全 PASS。

- [ ] commit M6 里程碑

```bash
git commit --allow-empty -m "$(cat <<'EOF'
chore(migrate): P6 CLI 端到端 + docs 完成里程碑(M6)

CLI 端到端测全 PASS;README + docs/migration/from-{openspec,superpowers}.md 落地;
SIGINT process.once 不累积 listener。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Plan 8f Self-Review

- [ ] CLI 端到端测覆盖参数错(2)、source 错(2)、源不存在(2)、dry-run、LockHeldError 友好文案
- [ ] README 加段(7 行简版 + 2 项注意:bundled / archive M13)
- [ ] docs/migration/from-openspec.md 6 段(检查清单 + 流程 + transformer + 常见问题 + cleanup + rollback)
- [ ] docs/migration/from-superpowers.md 含配对 + archive 推测 + bundled 限制 + 0.6 fidelity
- [ ] SIGINT process.once 测试覆盖 listener 不累积

P6 完成,M6 里程碑达成;P7 走 release-gate。
