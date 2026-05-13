// tests/core/validate/coverage-gap.test.ts — plan-9d Task 4 v2 B-2 修订
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanCoverageGaps } from '../../../src/core/validate/coverage-gap.js';

describe('coverage_gap scanner (plan-9d Task 4 v2)', () => {
  let testDir: string;
  let codebaseRoot: string;

  beforeEach(async () => {
    codebaseRoot = join(
      tmpdir(),
      `forge-9d-cov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    testDir = join(codebaseRoot, 'forge/changes/test-change');
    await mkdir(join(testDir, 'specs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(codebaseRoot, { recursive: true, force: true });
  });

  it('extractRequirements 解析 ## Requirement: heading → 列表', async () => {
    const { extractRequirements } = await import('../../../src/core/validate/coverage-gap.js');
    const reqs = extractRequirements(
      `# Auth\n\n## Purpose\nx\n\n## Requirement: token-refresh-flow\n\nWHEN x THEN y\n\n## Requirement: refresh-rate-limit\n\nWHEN p THEN q`,
    );
    expect(reqs).toHaveLength(2);
    expect(reqs[0]?.id).toBe('token-refresh-flow');
    expect(reqs[1]?.id).toBe('refresh-rate-limit');
  });

  it('extractKeywords 拆 hyphen / camelCase / underscore', async () => {
    const { extractKeywords } = await import('../../../src/core/validate/coverage-gap.js');
    expect(extractKeywords('token-refresh-flow')).toEqual(['token', 'refresh', 'flow']);
    expect(extractKeywords('tokenRefreshFlow')).toEqual(['token', 'refresh', 'flow']);
    expect(extractKeywords('token_refresh_flow')).toEqual(['token', 'refresh', 'flow']);
    expect(extractKeywords('JWT API Endpoint')).toEqual(['jwt', 'api', 'endpoint']);
    expect(extractKeywords('the a is')).toEqual([]); // 全停用词
  });

  it('spec Requirement 关键词在 codebase 0 命中 → 1 个 CoverageGapHit(精确断言)', async () => {
    await writeFile(
      join(testDir, 'specs', 'auth.md'),
      `# Auth Spec\n\n## Purpose\nx\n\n## Requirement: token-refresh-flow\n\nWHEN x THEN y\n\n## Requirement: rate-limit-throttle\n\nWHEN p THEN q`,
    );
    // codebase 实现 tokenRefreshFlow(覆盖 #1),rate-limit-throttle 完全 0 命中
    await mkdir(join(codebaseRoot, 'src'), { recursive: true });
    await writeFile(
      join(codebaseRoot, 'src', 'auth.ts'),
      `export function tokenRefreshFlow() { return 'x'; }`,
    );

    const gaps = await scanCoverageGaps(testDir, codebaseRoot);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.requirement_id).toBe('rate-limit-throttle');
    expect(gaps[0]?.total_hits).toBe(0);
    expect(gaps[0]?.searched_keywords).toEqual(['rate', 'limit', 'throttle']);
  });

  it('spec 全部 Requirement 都有 codebase 命中 → 0 个 CoverageGapHit', async () => {
    await writeFile(
      join(testDir, 'specs', 'auth.md'),
      `# Auth Spec\n\n## Purpose\nx\n\n## Requirement: login-handler\n\nWHEN x THEN y`,
    );
    await mkdir(join(codebaseRoot, 'src'), { recursive: true });
    await writeFile(
      join(codebaseRoot, 'src', 'login.ts'),
      `export function loginHandler() { return 'ok'; }`,
    );

    const gaps = await scanCoverageGaps(testDir, codebaseRoot);
    expect(gaps).toHaveLength(0);
  });

  it('specs/ 不存在 → 返回 [](不抛错)', async () => {
    await rm(join(testDir, 'specs'), { recursive: true, force: true });
    const gaps = await scanCoverageGaps(testDir, codebaseRoot);
    expect(gaps).toEqual([]);
  });
});
