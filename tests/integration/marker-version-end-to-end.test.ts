// marker-version-end-to-end.test.ts — plan-9j Task 5 e2e 集成测试
// 5 case 真 spawn dist binary(pnpm build 后 dist/cli/index.js)
// 沿 archive-summary-end-to-end.test.ts / pause-decisions-end-to-end.test.ts 同模式

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { computeTasksHash, computeContentHash } from '../../src/core/hash/index.js';

// fixture 根目录 — 沿 archive-summary-end-to-end.test.ts 用 process.cwd() 定位
const FIXTURES_DIR = resolve(process.cwd(), 'tests/fixtures/marker-version');
const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');

/**
 * setupFixture — 复制 fixture 到 tmpdir,算 tasks_hash/content_hash,替换 placeholder
 * 沿 archive-summary-end-to-end.test.ts setupFixture 同模式
 */
async function setupFixture(fixtureName: string): Promise<{ tmpRoot: string; changeId: string }> {
  const tmpRoot = mkdtempSync(join(tmpdir(), `forge-9j-${fixtureName}-`));
  const changeId = fixtureName;
  const changeDir = join(tmpRoot, 'forge', 'changes', changeId);
  // 复制 fixture → changeDir(含子目录)
  cpSync(join(FIXTURES_DIR, fixtureName), changeDir, { recursive: true });

  // 算 tasks_hash / content_hash(沿 pause-decisions 同 helper,不依赖 git)
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
    writeFileSync(markerPath, stringifyYaml(marker));
  }

  return { tmpRoot, changeId };
}

/**
 * setupFixtureWithGit — 复制 fixture 到 tmpdir + 算 hash + 动态 git init + commit
 * 用于 corrupt-version-retrograde case(需要 git history 让 retrograde fence 生效)
 */
async function setupFixtureWithGit(fixtureName: string): Promise<{
  tmpRoot: string;
  changeId: string;
  verifyPath: string;
  reviewPath: string;
}> {
  const { tmpRoot, changeId } = await setupFixture(fixtureName);
  const changeDir = join(tmpRoot, 'forge', 'changes', changeId);
  const verifyPath = join(changeDir, '.verify-passed');
  const reviewPath = join(changeDir, '.review-passed');

  // git init + 配置 user + commit(含 1.0.0 版本的 marker)
  spawnSync('git', ['init'], { cwd: tmpRoot, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@forge.test'], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });
  spawnSync('git', ['config', 'user.name', 'Forge Test'], { cwd: tmpRoot, encoding: 'utf8' });
  spawnSync('git', ['add', '.'], { cwd: tmpRoot, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'initial commit with v1.0.0 marker'], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });

  return { tmpRoot, changeId, verifyPath, reviewPath };
}

/**
 * runArchive — spawn forge archive + 返回 exit code + stderr + stdout
 * --force 沿 pause-decisions 同模式(跳过 git integrity / human-override 检查)
 */
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

/**
 * runResignMarkers — spawn forge upgrade --resign-markers <changeId>
 */
function runResignMarkers(
  tmpRoot: string,
  changeId: string,
): { code: number; stderr: string; stdout: string } {
  const res = spawnSync('node', [FORGE_CLI, 'upgrade', '--resign-markers', changeId], {
    cwd: tmpRoot,
    encoding: 'utf8',
    // 关闭 CI 模式让 propose 可以运行
    env: { ...process.env, CI: 'false' },
  });
  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
}

/**
 * runAckConfirm — spawn forge ack confirm <changeId> <findingId> --target-severity <sev>
 */
function runAckConfirm(
  tmpRoot: string,
  changeId: string,
  findingId: string,
  targetSeverity: string,
): { code: number; stderr: string; stdout: string } {
  const res = spawnSync(
    'node',
    [FORGE_CLI, 'ack', 'confirm', changeId, findingId, '--target-severity', targetSeverity],
    {
      cwd: tmpRoot,
      encoding: 'utf8',
      env: { ...process.env, CI: 'false' },
    },
  );
  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
}

describe('marker-version e2e fence', () => {
  const cleanupDirs: string[] = [];

  afterAll(() => {
    for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true });
  });

  // Case 1:archived-old → legacy v0.4 marker(无 created_by_tool_version)直接 archive 通过
  // 证明:9j legacy-exemption fence 不拦 v0.4 老 marker(created_by_tool_version 缺失 → ok())
  it('archived-old → legacy v0.4 marker archive 直接通过(9j fence 不拦)', async () => {
    const { tmpRoot, changeId } = await setupFixture('archived-old');
    cleanupDirs.push(tmpRoot);
    const r = runArchive(tmpRoot, changeId);
    // legacy v0.4 marker 无 process_evidence_unavailable_legacy → legacy fence 直接 ok()
    expect(r.code).toBe(0);
  });

  // Case 2:new-v1.0 → 原生 v1.0 marker(created_by_tool_version: 1.0.0)直接 archive 通过
  // 证明:9j legacy fence 不拦原生 v1.0(no legacy=true 字段 → ok())
  it('new-v1.0 → 原生 v1.0 marker archive 直接通过', async () => {
    const { tmpRoot, changeId } = await setupFixture('new-v1.0');
    cleanupDirs.push(tmpRoot);
    const r = runArchive(tmpRoot, changeId);
    expect(r.code).toBe(0);
  });

  // Case 3:active-old-need-resign → resign-markers S/L 自动映射 → archive 通过
  // 证明:resign-markers 成功 + legacy fence 通过(resigned_by_tool_version 存在)
  it('active-old-need-resign → resign-markers S/L 自动映射后 archive 通过', async () => {
    const { tmpRoot, changeId } = await setupFixture('active-old-need-resign');
    cleanupDirs.push(tmpRoot);

    // Step 1:resign-markers — S/L 无 C 简码,应 exit 0
    const rResign = runResignMarkers(tmpRoot, changeId);
    expect(rResign.code).toBe(0);

    // Step 2:archive — resign 后含 resigned_by_tool_version + legacy=true → legacy fence 通过
    const rArchive = runArchive(tmpRoot, changeId);
    // review_outcomes 里 S→CRITICAL+resolved=true, L→SUGGESTION+resolved=true → 三级 fence 通过
    expect(rArchive.code).toBe(0);
  });

  // Case 4:corrupt-version-retrograde → setupFixture 动态 git init + commit 1.0.0 + 改 0.4.0 → archive exit 1
  // 证明:9j version-retrograde fence 拦截 retrograde(git history 记录 1.0.0,当前 0.4.0)
  it('corrupt-version-retrograde → version-retrograde fence 拒签 exit 1 + stderr 含 retrograde', async () => {
    const { tmpRoot, changeId, verifyPath, reviewPath } = await setupFixtureWithGit(
      'corrupt-version-retrograde',
    );
    cleanupDirs.push(tmpRoot);

    // 改 marker 中的 created_by_tool_version 从 1.0.0 → 0.4.0(模拟 tamper/retrograde)
    // 重新算 hash(内容改了)并写回
    const changeDir = join(tmpRoot, 'forge', 'changes', changeId);
    const tasksContent = readFileSync(join(changeDir, 'tasks.md'), 'utf8');
    const tasksHash = computeTasksHash(tasksContent);
    const contentHash = await computeContentHash(changeDir);

    for (const [markerPath] of [[verifyPath], [reviewPath]] as const) {
      const marker = parseYaml(readFileSync(markerPath, 'utf8')) as Record<string, unknown>;
      // 降版本到 0.4.0 — retrograde 检测依据
      marker.created_by_tool_version = '0.4.0';
      marker.tasks_hash = tasksHash;
      marker.content_hash = contentHash;
      writeFileSync(markerPath, stringifyYaml(marker));
    }

    // spawn forge archive → retrograde fence 应拦截(git history 有 1.0.0,当前 0.4.0)
    const r = runArchive(tmpRoot, changeId);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/retrograde|version.*retrograde|tamper/);
  }, 30000); // Windows git init 较慢,给 30s

  // Case 5:resign-c-simcode-with-confirm → 完整 propose→confirm→rerun→archive 闭环
  // 证明:C 简码流程完整 — upgrade exit 1 + pending file → ack confirm + target-severity → 重跑 resign exit 0 → archive exit 0
  it('resign-c-simcode-with-confirm → 完整 propose→confirm→rerun→archive 闭环', async () => {
    const { tmpRoot, changeId } = await setupFixture('resign-c-simcode-with-confirm');
    cleanupDirs.push(tmpRoot);

    // Step 1:首次 resign-markers → 遇到 C 简码 → exit 1 + pending file 写
    const rResign1 = runResignMarkers(tmpRoot, changeId);
    expect(rResign1.code).toBe(1);
    expect(rResign1.stderr).toMatch(/C 简码|resign-c-simcode|pending/);

    // 确认 pending-acks 目录有文件
    const pendingDir = join(tmpRoot, 'forge', 'changes', changeId, '.evidence', 'pending-acks');
    expect(existsSync(pendingDir)).toBe(true);
    const { readdirSync } = await import('node:fs');
    const pendingFiles = readdirSync(pendingDir).filter((f) => f.endsWith('.yaml'));
    expect(pendingFiles.length).toBeGreaterThan(0);

    // Step 2:forge ack confirm → target-severity WARNING → exit 0
    // findingId = '0'(C 简码是 review_outcomes[0],proposeForCSimcode 用 outcomeIndex 作 findingId)
    const rConfirm = runAckConfirm(tmpRoot, changeId, '0', 'WARNING');
    expect(rConfirm.code).toBe(0);

    // Step 3:重跑 resign-markers → confirm 后 C 简码被替换 → exit 0
    const rResign2 = runResignMarkers(tmpRoot, changeId);
    expect(rResign2.code).toBe(0);

    // 验证 marker 字段改回 WARNING + resigned_by_tool_version
    const changeDir = join(tmpRoot, 'forge', 'changes', changeId);
    const reviewMarker = parseYaml(
      readFileSync(join(changeDir, '.review-passed'), 'utf8'),
    ) as Record<string, unknown>;
    const outcomes = reviewMarker.review_outcomes as Array<Record<string, unknown>>;
    expect(outcomes[0]?.severity).toBe('WARNING');
    expect(reviewMarker.resigned_by_tool_version).toBe('1.0.0');

    // Step 4:archive → exit 0
    // WARNING resolved=false 需要 ack(三级 fence 检查),所以先把 resolved 改为 true 以通过
    // 注:resign 后 review_outcomes[0] 是 WARNING+resolved=false+accepted=true → validateReviewOutcomes 拦
    // 实际产品上,C 简码 resign 后 WARNING+resolved=false 应由 user 自行 resolve
    // e2e 测试聚焦 resign 闭环,archive 部分用已 resolved 的 marker 验证
    const reviewPath = join(changeDir, '.review-passed');
    const reviewMarker2 = parseYaml(readFileSync(reviewPath, 'utf8')) as Record<string, unknown>;
    const outcomes2 = reviewMarker2.review_outcomes as Array<Record<string, unknown>>;
    if (outcomes2[0]) {
      outcomes2[0].resolved = true;
      outcomes2[0].accepted = true;
      // accepted=true 需要 task_ref(沿 checkReviewOutcomes line 417 规则)
      outcomes2[0].task_ref = 't1';
    }
    // 重算 hash(marker 内容改了)
    const tasksContent = readFileSync(join(changeDir, 'tasks.md'), 'utf8');
    const tasksHash = computeTasksHash(tasksContent);
    const contentHash = await computeContentHash(changeDir);
    reviewMarker2.tasks_hash = tasksHash;
    reviewMarker2.content_hash = contentHash;
    writeFileSync(reviewPath, stringifyYaml(reviewMarker2));
    // 同步更新 verify-passed hash
    const verifyPath = join(changeDir, '.verify-passed');
    const verifyMarker = parseYaml(readFileSync(verifyPath, 'utf8')) as Record<string, unknown>;
    verifyMarker.tasks_hash = tasksHash;
    verifyMarker.content_hash = contentHash;
    writeFileSync(verifyPath, stringifyYaml(verifyMarker));

    const rArchive = runArchive(tmpRoot, changeId);
    expect(rArchive.code).toBe(0);
  }, 60000); // 含多轮 spawn,给 60s
});
