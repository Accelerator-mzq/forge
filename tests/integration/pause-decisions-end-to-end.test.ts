// pause-decisions-end-to-end.test.ts — plan-9c Task 5 e2e 集成测试
// 沿 9d Task 8 verify-findings-end-to-end.test.ts 同模式
// tmpdir 复制 fixture → 算实际 hash 改 marker → 跑 forge archive → 断言 exit code + stderr

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { computeTasksHash, computeContentHash } from '../../src/core/hash/index.js';

// fixture 根目录 — 沿 scope-end-to-end.test.ts 用 process.cwd() 定位
const FIXTURES_DIR = resolve(process.cwd(), 'tests/fixtures/pause-decisions');
const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');

// Helper:复制 fixture 到 tmpdir,算 tasks_hash/content_hash,改 marker + ack-log
// v2 codex BLOCKER 3 修订:不再 git init/commit/算 diff_hash;marker 用 is_git_repo:false + --force 跳过 git fence
// v2 codex BLOCKER 1 修订:替换 ack-log.jsonl 中 <fixture-name> 占位为真实 fixtureName,
//                          让 ack-log cross-check 找到匹配 change_id 的 ack-pause-warning 条目
async function setupFixture(fixtureName: string): Promise<{ tmpRoot: string; changeId: string }> {
  const tmpRoot = mkdtempSync(join(tmpdir(), `forge-9c-${fixtureName}-`));
  const changeId = fixtureName;
  const changeDir = join(tmpRoot, 'forge', 'changes', changeId);

  // 复制 fixture → changeDir(含 .evidence/ 子目录,如果 fixture 包含)
  cpSync(join(FIXTURES_DIR, fixtureName), changeDir, { recursive: true });

  // 算 tasks_hash / content_hash(no git;沿 9d 同 helper,不依赖 git)
  const tasksContent = readFileSync(join(changeDir, 'tasks.md'), 'utf8');
  const tasksHash = computeTasksHash(tasksContent);
  const contentHash = await computeContentHash(changeDir);

  // 改 .verify-passed / .review-passed 的 hash 字段
  for (const markerName of ['.verify-passed', '.review-passed']) {
    const markerPath = join(changeDir, markerName);
    if (!existsSync(markerPath)) continue;
    const marker = parseYaml(readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
    marker.tasks_hash = tasksHash;
    marker.content_hash = contentHash;
    // is_git_repo:false 已在 fixture YAML 静态写好,这里不改 git 字段
    writeFileSync(markerPath, stringifyYaml(marker));
  }

  // v2 BLOCKER 1:替换 ack-log.jsonl 中 <fixture-name> 占位
  const ackLogPath = join(changeDir, '.evidence', 'ack-log.jsonl');
  if (existsSync(ackLogPath)) {
    const ackContent = readFileSync(ackLogPath, 'utf8').replace(/<fixture-name>/g, fixtureName);
    writeFileSync(ackLogPath, ackContent);
  }

  return { tmpRoot, changeId };
}

// Helper:跑 forge archive,返回 exit code + stderr
function runArchive(tmpRoot: string, changeId: string): { code: number; stderr: string } {
  const res = spawnSync('node', [FORGE_CLI, 'archive', changeId, '--force'], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });
  return { code: res.status ?? -1, stderr: res.stderr };
}

describe('pause_decisions e2e fence', () => {
  const cleanupDirs: string[] = [];

  afterAll(() => {
    for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true });
  });

  it('option-1-expand-scope → archive 成功(exit 0)', async () => {
    const { tmpRoot, changeId } = await setupFixture('option-1-expand-scope');
    cleanupDirs.push(tmpRoot);
    const { code } = runArchive(tmpRoot, changeId);
    expect(code).toBe(0);
  });

  it('option-2-add-task → archive 成功(exit 0)', async () => {
    const { tmpRoot, changeId } = await setupFixture('option-2-add-task');
    cleanupDirs.push(tmpRoot);
    const { code } = runArchive(tmpRoot, changeId);
    expect(code).toBe(0);
  });

  it('option-3-out-of-scope → archive 成功(exit 0)', async () => {
    const { tmpRoot, changeId } = await setupFixture('option-3-out-of-scope');
    cleanupDirs.push(tmpRoot);
    const { code } = runArchive(tmpRoot, changeId);
    expect(code).toBe(0);
  });

  it('option-4-other → archive 成功(exit 0)', async () => {
    const { tmpRoot, changeId } = await setupFixture('option-4-other');
    cleanupDirs.push(tmpRoot);
    const { code } = runArchive(tmpRoot, changeId);
    expect(code).toBe(0);
  });

  it('critical-redirect-rejected → archive 拒签(exit 1)+ stderr 含 "CRITICAL"', async () => {
    const { tmpRoot, changeId } = await setupFixture('critical-redirect-rejected');
    cleanupDirs.push(tmpRoot);
    const { code, stderr } = runArchive(tmpRoot, changeId);
    expect(code).toBe(1);
    expect(stderr).toMatch(/CRITICAL/);
    expect(stderr).toMatch(/pause_decisions fence 拒签/);
  });
});
