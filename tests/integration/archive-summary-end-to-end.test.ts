// archive-summary-end-to-end.test.ts — plan-9e1 Task 6 e2e
// 沿 pause-decisions-end-to-end.test.ts 同模式
// 7 fixture × tmpdir 复制 × 算 hash + 替占位 × spawn forge archive × 断言 exit + archive_summary.yaml(v3 MAJOR 2)

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  cpSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { computeTasksHash, computeContentHash } from '../../src/core/hash/index.js';
import { computeFindingHash, extractHashPayload } from '../../src/core/validate/finding-hash.js';

const FIXTURES_DIR = resolve(process.cwd(), 'tests/fixtures/archive-warnings');
const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');

async function setupFixture(
  fixtureName: string,
): Promise<{ tmpRoot: string; changeId: string; archiveDate: string }> {
  const tmpRoot = mkdtempSync(join(tmpdir(), `forge-9e1-${fixtureName}-`));
  const changeId = fixtureName;
  const changeDir = join(tmpRoot, 'forge', 'changes', changeId);
  cpSync(join(FIXTURES_DIR, fixtureName), changeDir, { recursive: true });

  // 算 hash
  const tasksContent = readFileSync(join(changeDir, 'tasks.md'), 'utf8');
  const tasksHash = computeTasksHash(tasksContent);
  const contentHash = await computeContentHash(changeDir);

  // 改两个 marker 的 hash 字段 + 重算 finding_hash 占位
  for (const markerName of ['.verify-passed', '.review-passed']) {
    const markerPath = join(changeDir, markerName);
    if (!existsSync(markerPath)) continue;
    const marker = parseYaml(readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
    marker.tasks_hash = tasksHash;
    marker.content_hash = contentHash;
    // 若有 verify_findings → 重算 finding_hash + content_hash + git_head 字段
    if (Array.isArray(marker.verify_findings)) {
      const findings = marker.verify_findings as Array<Record<string, unknown>>;
      for (const f of findings) {
        f.content_hash = contentHash;
        f.git_head = '0'.repeat(40); // 沿 fixture 字面 — 非 git 项目
        const expectedHash = computeFindingHash(extractHashPayload(f as never));
        f.finding_hash = expectedHash;
      }
    }
    writeFileSync(markerPath, stringifyYaml(marker));
  }

  // 替换 ack-log 占位
  const ackLogPath = join(changeDir, '.evidence', 'ack-log.jsonl');
  if (existsSync(ackLogPath)) {
    let ackText = readFileSync(ackLogPath, 'utf8');
    ackText = ackText.replace(/<fixture-name>/g, fixtureName);
    // 替换 ack-log finding_hash 占位为重算值(对应 verify_findings id=1 的 finding_hash)
    const verifyPath = join(changeDir, '.verify-passed');
    if (existsSync(verifyPath)) {
      const verifyMarker = parseYaml(readFileSync(verifyPath, 'utf8')) as Record<string, unknown>;
      const findings = (verifyMarker.verify_findings as Array<Record<string, unknown>>) ?? [];
      const f1 = findings.find((f) => f.id === 1);
      if (f1 && typeof f1.finding_hash === 'string') {
        ackText = ackText.replace(/placeholder-hash[-\w]*/g, f1.finding_hash);
      }
    }
    writeFileSync(ackLogPath, ackText);
  }

  return { tmpRoot, changeId, archiveDate: new Date().toISOString().slice(0, 10) };
}

function runArchive(
  tmpRoot: string,
  changeId: string,
): { code: number; stderr: string; stdout: string } {
  const res = spawnSync('node', [FORGE_CLI, 'archive', changeId, '--force'], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });
  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
}

describe('archive_summary e2e', () => {
  const cleanupDirs: string[] = [];
  afterAll(() => {
    for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true });
  });

  it('acked-warning → archive 成功 + summary 含 1 acked_warnings', async () => {
    const ctx = await setupFixture('acked-warning');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const summaryPath = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
      'archive_summary.yaml',
    );
    expect(existsSync(summaryPath)).toBe(true);
    const summary = parseYaml(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    expect((summary.acked_warnings as unknown[]).length).toBe(1);
    expect(r.stdout).toMatch(/Acknowledged Warnings \(1\)/);
  });

  it('pending-suggestion → archive 成功 + summary 含 1 pending_suggestions + 1 handoff', async () => {
    const ctx = await setupFixture('pending-suggestion');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const summaryPath = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
      'archive_summary.yaml',
    );
    const summary = parseYaml(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    expect((summary.pending_suggestions as unknown[]).length).toBe(1);
    expect((summary.handoff_to_backlog as unknown[]).length).toBe(1);
  });

  it('pause-out-of-scope → archive 成功 + handoff 含 pause_decisions + scope_entries 各一', async () => {
    const ctx = await setupFixture('pause-out-of-scope');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const summaryPath = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
      'archive_summary.yaml',
    );
    const summary = parseYaml(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    const handoff = summary.handoff_to_backlog as Array<Record<string, unknown>>;
    const bySource = new Set(handoff.map((h) => h.source));
    expect(bySource.has('pause_decisions')).toBe(true);
    expect(bySource.has('scope_entries')).toBe(true);
  });

  it('mixed-all-three → handoff 含三类 source', async () => {
    const ctx = await setupFixture('mixed-all-three');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const summaryPath = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
      'archive_summary.yaml',
    );
    const summary = parseYaml(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    const handoff = summary.handoff_to_backlog as Array<Record<string, unknown>>;
    const bySource = new Set(handoff.map((h) => h.source));
    expect(bySource).toEqual(new Set(['verify_findings', 'pause_decisions', 'scope_entries']));
  });

  it('warning-missing-ack-double-fence(WARNING 缺 ack)→ 9d fence 拒签 exit 1(v2 MAJOR 3 改名)', async () => {
    const ctx = await setupFixture('warning-missing-ack-double-fence');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(1);
    // 9d verify-findings-fence step 3.6 已拦,9e1 三级 fence verify 端瘦成 CRITICAL sanity 不重复;断言放宽匹配 9d 错误信息
    expect(r.stderr).toMatch(/verify_findings fence 拒签|WARNING.*缺 ack|severity_acked_by/);
  });

  // v2 MAJOR 3 + v3 BLOCKER 1 + MAJOR 4:唯一能证明 9e1 三级 fence 真接入的 case
  it('review-outcomes-c-rejected(C 简码)→ 9e1 三级 fence 拒签 exit 1 + 提示手动迁移 / 9j', async () => {
    const ctx = await setupFixture('review-outcomes-c-rejected');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(1);
    // 9d 跳过(无 verify_findings),9c pause fence 跳过(无 pause_decisions),9e1 三级 fence 必须拦
    expect(r.stderr).toMatch(/三级业务行为 fence 拒签|clarification|C\(clarification/);
    // v3 MAJOR 4 graceful 9j guidance:9j 完成 / 9j 未完成两路径
    expect(r.stderr).toMatch(/手动|手工|9j|forge upgrade --resign-markers/);
  });

  // v3 MAJOR 2 新增:唯一能证明 ScopeEntriesIntegrityError 独立路径接入的 case
  it('scope-entries-yaml-corrupt(proposal YAML 语法错)→ archive exit 1 + stderr 含 scope-entries 完整性 fence', async () => {
    const ctx = await setupFixture('scope-entries-yaml-corrupt');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(1);
    // 9d/9c/9e1 fence 全跳过(无 verify_findings/pause_decisions/review_outcomes);
    // builder step 4.5 抛 ScopeEntriesIntegrityError → archive.ts try/catch 转 exit 1
    expect(r.stderr).toMatch(
      /scope-entries 完整性 fence|scope-entries YAML parse|ScopeEntriesIntegrityError/,
    );
  });

  // plan-backlog-registry Task 7 — archive 成功后自动生成 forge/backlog/
  it('archive 成功后生成 forge/backlog/{active,archived,README}.md', async () => {
    const ctx = await setupFixture('mixed-all-three');
    cleanupDirs.push(ctx.tmpRoot);
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0);
    const backlogDir = join(ctx.tmpRoot, 'forge', 'backlog');
    expect(existsSync(join(backlogDir, 'active.md'))).toBe(true);
    expect(existsSync(join(backlogDir, 'archived.md'))).toBe(true);
    expect(existsSync(join(backlogDir, 'README.md'))).toBe(true);
    expect(readFileSync(join(backlogDir, 'active.md'), 'utf8')).toContain('# Active Backlog');
    expect(r.stdout).toMatch(/Backlog: forge\/backlog\/active\.md/);
  });

  // plan-backlog-registry Task 7 — backlog 写入失败不回滚 archive(spec §3.1)
  it('backlog 写入失败 → archive 仍 exit 0 + stderr warning + archive 不回滚', async () => {
    const ctx = await setupFixture('mixed-all-three');
    cleanupDirs.push(ctx.tmpRoot);
    // 把 active.md 预建成「目录」,使 backlog 的 writeFile 落 EISDIR 失败
    mkdirSync(join(ctx.tmpRoot, 'forge', 'backlog', 'active.md'), { recursive: true });
    const r = runArchive(ctx.tmpRoot, ctx.changeId);
    expect(r.code).toBe(0); // archive 主流程仍成功
    expect(r.stderr).toMatch(/backlog 重生成失败/);
    // archive 未回滚 + 主流程产物完整:change 已移进 archive/ 且 archive_summary.yaml 存在
    const archDir = join(
      ctx.tmpRoot,
      'forge',
      'changes',
      'archive',
      `${ctx.archiveDate}-${ctx.changeId}`,
    );
    expect(existsSync(archDir)).toBe(true);
    expect(existsSync(join(archDir, 'archive_summary.yaml'))).toBe(true);
  });
});
