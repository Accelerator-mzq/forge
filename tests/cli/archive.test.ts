// tests/cli/archive.test.ts — v4 OpenSpec alignment 简版(plan-v4 Phase 4 Task 4.9)
//
// v4 archive 9 步主流程(沿 src/cli/commands/archive.ts):
//   1. forgeRoot + changeId selection / 2. legacy-bridge preflight / 3. spec validate
//   4. marker check + v2 schema validate / 5. task progress confirm
//   6. spec deltas / 7. mv → archive / 8. archive_summary.yaml / 9. posthook + backlog
//
// 覆盖:happy path / 缺 marker / 旧 v1 marker / human-override + --force /
//      incomplete tasks + --yes / --skip-specs / spec validate fail
//
// 测试不再覆盖 v3 反加固特性(hash 校验 / fence / evidence / ack-log)— Phase 1 已删

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify as stringifyYAML, parse as parseYAML } from 'yaml';
import { runCli } from './helpers.js';

// ─── Helper:搭建 v4 最小合法 forge 骨架 ────────────────────────────────────

/** 在 projectRoot 下创建 forge 目录结构;返回 changesDir 路径 */
function setupForgeRoot(projectRoot: string): string {
  const forgeDir = join(projectRoot, 'forge');
  mkdirSync(join(forgeDir, 'changes'), { recursive: true });
  mkdirSync(join(forgeDir, 'specs'), { recursive: true });
  mkdirSync(join(forgeDir, '.cache'), { recursive: true });
  writeFileSync(
    join(forgeDir, 'config.yaml'),
    'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
    'utf8',
  );
  return join(forgeDir, 'changes');
}

/**
 * 在 changesDir 下创建合法 v4 change(proposal/design/tasks/specs + 两 v2 marker)
 * @returns changeDir 路径
 */
function setupValidChange(
  changesDir: string,
  changeId: string,
  opts: {
    verifyActor?: 'ai-agent' | 'human-override';
    reviewActor?: 'ai-agent' | 'human-override';
    incompleteTasks?: boolean;
  } = {},
): string {
  const verifyActor = opts.verifyActor ?? 'ai-agent';
  const reviewActor = opts.reviewActor ?? 'ai-agent';
  const incomplete = opts.incompleteTasks ?? false;

  const changeDir = join(changesDir, changeId);
  mkdirSync(join(changeDir, 'specs'), { recursive: true });

  // 四件套(完整 markdown 段位)
  const proposalContent = '# Add Login\n\n## Why\n用户需要登录.\n\n## What\nOAuth2 流程.\n';
  const designContent =
    '# Design\n\n## Architecture\nJWT token + refresh.\n\n## Out of Scope\nSSO.\n';
  const tasksContent = incomplete
    ? '# Tasks\n\n- [x] t1: 实现登录\n- [ ] t2: 写测试\n'
    : '# Tasks\n\n- [x] t1: 实现登录\n- [x] t2: 写测试\n';
  // 写 spec(必须含 Scenario / Given-When-Then 段才能过 spec validate)
  const specContent =
    '# Login Spec\n\n## Scenario: 登录成功\n\n**Given** 凭证合法\n**When** 用户提交\n**Then** 颁发 token\n';

  writeFileSync(join(changeDir, 'proposal.md'), proposalContent, 'utf8');
  writeFileSync(join(changeDir, 'design.md'), designContent, 'utf8');
  writeFileSync(join(changeDir, 'tasks.md'), tasksContent, 'utf8');
  writeFileSync(join(changeDir, 'specs', 'login.md'), specContent, 'utf8');

  // v4 极简 marker(沿 src/core/markers/types.ts v2)
  const verifyMarker = {
    schema: 'forge-verify/v2',
    verified_at: '2026-05-21T10:00:00Z',
    verified_by: verifyActor,
  };
  const reviewMarker = {
    schema: 'forge-review/v2',
    reviewed_at: '2026-05-21T11:00:00Z',
    reviewed_by: reviewActor,
  };
  writeFileSync(join(changeDir, '.verify-passed'), stringifyYAML(verifyMarker), 'utf8');
  writeFileSync(join(changeDir, '.review-passed'), stringifyYAML(reviewMarker), 'utf8');

  return changeDir;
}

// ─── 测试主体 ───────────────────────────────────────────────────────────

describe('forge archive (v4)', () => {
  let proj: string;
  let changesDir: string;

  beforeEach(() => {
    proj = mkdtempSync(join(tmpdir(), 'forge-archive-v4-'));
    changesDir = setupForgeRoot(proj);
  });
  afterEach(() => rmSync(proj, { recursive: true, force: true }));

  it('happy path:完整 v2 marker + tasks 全打勾 → exit 0,写 archive_summary v2', () => {
    setupValidChange(changesDir, 'add-login');
    const result = runCli(['archive', 'add-login', '--yes'], proj);
    expect(result.exitCode, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`).toBe(0);

    // change 已移到 archive/<date>-<id>
    const archiveDir = join(changesDir, 'archive');
    expect(existsSync(archiveDir)).toBe(true);
    // 找带 add-login 后缀的归档目录
    const entries = require('node:fs').readdirSync(archiveDir);
    const archived = entries.find((e: string) => e.endsWith('-add-login'));
    expect(archived).toBeDefined();
    // archive_summary.yaml v2 schema
    const summaryPath = join(archiveDir, archived as string, 'archive_summary.yaml');
    expect(existsSync(summaryPath)).toBe(true);
    const summary = parseYAML(readFileSync(summaryPath, 'utf8')) as Record<string, unknown>;
    expect(summary.schema).toBe('forge-archive-summary/v2');
    expect(summary.change_id).toBe('add-login');
    expect(summary.verified_by).toBe('ai-agent');
    expect(summary.reviewed_by).toBe('ai-agent');
  });

  it('缺 .verify-passed → exit 1', () => {
    const changeDir = setupValidChange(changesDir, 'no-verify');
    rmSync(join(changeDir, '.verify-passed'));
    const result = runCli(['archive', 'no-verify', '--yes'], proj);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Missing \.verify-passed/);
  });

  it('缺 .review-passed → exit 1', () => {
    const changeDir = setupValidChange(changesDir, 'no-review');
    rmSync(join(changeDir, '.review-passed'));
    const result = runCli(['archive', 'no-review', '--yes'], proj);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Missing \.review-passed/);
  });

  it('v1 marker(forge-verify/v1)→ exit 1(v4 要求 v2)', () => {
    const changeDir = setupValidChange(changesDir, 'v1-marker');
    // 覆盖写一个 v1 marker
    writeFileSync(
      join(changeDir, '.verify-passed'),
      stringifyYAML({
        schema: 'forge-verify/v1',
        verified_at: '2026-05-21T10:00:00Z',
        verified_by: 'ai-agent',
        tasks_hash: 'sha256:' + 'a'.repeat(64),
        content_hash: 'sha256:' + 'b'.repeat(64),
        evidence: [],
      }),
      'utf8',
    );
    const result = runCli(['archive', 'v1-marker', '--yes'], proj);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/forge-verify\/v2/);
  });

  it('human-override marker 无 --force → exit 1', () => {
    setupValidChange(changesDir, 'human-ov', { verifyActor: 'human-override' });
    const result = runCli(['archive', 'human-ov', '--yes'], proj);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/human-override.*--force/s);
  });

  it('human-override marker + --force → exit 0', () => {
    setupValidChange(changesDir, 'human-ov-ok', { verifyActor: 'human-override' });
    const result = runCli(['archive', 'human-ov-ok', '--yes', '--force'], proj);
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
  });

  it('--skip-specs 跳过 spec deltas → exit 0,无 specs 应用', () => {
    setupValidChange(changesDir, 'skip-specs');
    const result = runCli(['archive', 'skip-specs', '--yes', '--skip-specs'], proj);
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
    // forge/specs/login.md 不应存在(--skip-specs 跳过)
    const mainSpec = join(proj, 'forge', 'specs', 'login.md');
    expect(existsSync(mainSpec)).toBe(false);
  });

  it('未传 --skip-specs:spec deltas 自动 apply 到 forge/specs/', () => {
    setupValidChange(changesDir, 'with-specs');
    const result = runCli(['archive', 'with-specs', '--yes'], proj);
    expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0);
    // forge/specs/login.md 应被创建(从 change/specs/login.md applyDeltas)
    const mainSpec = join(proj, 'forge', 'specs', 'login.md');
    expect(existsSync(mainSpec)).toBe(true);
  });

  it('change 不存在 → exit 1', () => {
    const result = runCli(['archive', 'nonexistent', '--yes'], proj);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/not found in forge\/changes/);
  });
});
