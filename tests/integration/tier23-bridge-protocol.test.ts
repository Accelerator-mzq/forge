// tests/integration/tier23-bridge-protocol.test.ts — Task E2:bridge-protocol-fixture 集成测试
//
// ⚠ 本 fixture 测试的是 CLI/fence/产物链是否能正确通过:
//    • 含 WARNING finding 的 change 经过 forge ack propose + forge ack confirm 后
//    • 能让 forge archive 真实 exit 0
//
// 本测试 **不测** 模型是否遵从桥接清单(tier23-command-bridge.md)的行为约束。
// 测试覆盖:verify/review marker 构造 → ack-warning 两步协议 → archive fence 全链通过。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { stringify as yamlStringify, parse as yamlParse } from 'yaml';
import { computeFindingHash, extractHashPayload } from '../../src/core/validate/finding-hash.js';
import { computeContentHash } from '../../src/core/hash/content.js';
import { computeTasksHash } from '../../src/core/hash/tasks.js';
import { computeLogHash } from '../../src/core/hash/log.js';
import type { Finding } from '../../src/core/schemas/severity.js';

// CLI 入口:dist/cli/index.js(需 pnpm build 先跑)
const CLI_ENTRY = join(process.cwd(), 'dist/cli/index.js');

/**
 * runForge — 运行 forge CLI 子进程并返回 exit code + stderr
 * 沿 ack-confirm-marker.test.ts 的 runForge 模式
 */
function runForge(cwd: string, args: string[]): { code: number; stderr: string; stdout: string } {
  try {
    const stdout = execFileSync('node', [CLI_ENTRY, ...args], {
      cwd,
      encoding: 'utf8',
    });
    return { code: 0, stderr: '', stdout: stdout ?? '' };
  } catch (e: unknown) {
    const err = e as { status?: number; stderr?: string; stdout?: string };
    return {
      code: err.status ?? 1,
      stderr: String(err.stderr ?? ''),
      stdout: String(err.stdout ?? ''),
    };
  }
}

describe('bridge-protocol-fixture:WARNING ack 全链到 archive(E2)', () => {
  let proj: string;
  let changeDir: string;

  beforeEach(async () => {
    // 创建临时目录作为项目根
    proj = mkdtempSync(join(tmpdir(), 'forge-e2e-bridge-'));

    // 构建 forge 骨架:forge/config.yaml + forge/changes/ + forge/specs/
    const forgeDir = join(proj, 'forge');
    mkdirSync(join(forgeDir, 'changes'), { recursive: true });
    mkdirSync(join(forgeDir, 'specs'), { recursive: true });
    mkdirSync(join(forgeDir, '.cache'), { recursive: true });
    writeFileSync(
      join(forgeDir, 'config.yaml'),
      'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
      'utf8',
    );

    // change 目录:bridge-fix
    const changeId = 'bridge-fix';
    changeDir = join(forgeDir, 'changes', changeId);
    mkdirSync(join(changeDir, 'specs'), { recursive: true });
    mkdirSync(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });

    // 写 change 文件(proposal/design/tasks/specs)
    const proposalContent =
      '# Add Bridge Fix\n\n## Why\n桥接协议需要补齐产物.\n\n## What\n生成清单产物.\n';
    const designContent = '# Design\n\n## Architecture\n产物链.\n';
    const tasksContent = '# Tasks\n\n- [x] t1: 实现桥接协议\n- [x] t2: 写测试\n';
    const specContent =
      '# Bridge Spec\n\n## Scenario: bridge fix passes\n\n**Given** 产物齐全\n**When** 运行 archive\n**Then** exit 0\n';

    writeFileSync(join(changeDir, 'proposal.md'), proposalContent, 'utf8');
    writeFileSync(join(changeDir, 'design.md'), designContent, 'utf8');
    writeFileSync(join(changeDir, 'tasks.md'), tasksContent, 'utf8');
    writeFileSync(join(changeDir, 'specs', 'bridge.md'), specContent, 'utf8');

    // 计算真实 hash(沿 archive.test.ts + build-fixture.ts 模式)
    const tasksHash = computeTasksHash(tasksContent);
    const contentHash = await computeContentHash(changeDir);

    // 写测试日志 + 计算 log hash(evidence 完整性校验需要)
    const logPath = join(changeDir, '.evidence', 'test.log');
    writeFileSync(logPath, 'PASS 2/2\n', 'utf8');
    const logHash = await computeLogHash(logPath);

    // 构造 WARNING finding,finding_hash 用真实 computeFindingHash
    // (archive fence 会重算比对,placeholder 会让 verify-findings-fence 拒签)
    const finding: Record<string, unknown> = {
      id: 1,
      dimension: 'correctness',
      check_type: 'requirement-mapping',
      severity: 'WARNING',
      automated: false,
      content_hash: contentHash,
      git_head: 'd'.repeat(40),
      evidence: 'specs/bridge.md Requirement r1 与实现不一致',
      recommendation: '补齐实现',
      resolved: false,
      severity_acked_by: null,
      severity_acked_at: null,
    };
    // ack-warning 不改 8 字段 payload,finding_hash 前后一致
    finding.finding_hash = computeFindingHash(extractHashPayload(finding as unknown as Finding));

    // 写 .verify-passed:含 WARNING finding + 真实 hash
    const verifyMarker = {
      schema: 'forge-verify/v1',
      verified_at: '2026-05-19T10:00:00Z',
      verified_by: 'ai-agent',
      tasks_hash: tasksHash,
      content_hash: contentHash,
      evidence: [
        {
          scenario_id: 's1',
          test_command: 'pnpm test',
          test_file: 'tests/bridge.test.ts',
          log_path: './.evidence/test.log',
          log_hash: logHash,
          pass: true,
        },
      ],
      verify_findings: [finding],
    };
    writeFileSync(join(changeDir, '.verify-passed'), yamlStringify(verifyMarker), 'utf8');

    // 写 .review-passed:is_git_repo=false(配合 --force 跳过 git 检查)
    const reviewMarker = {
      schema: 'forge-review/v1',
      reviewed_at: '2026-05-19T11:00:00Z',
      reviewed_by: 'ai-agent',
      tasks_hash: tasksHash,
      content_hash: contentHash,
      git: { is_git_repo: false },
      review_outcomes: [],
    };
    writeFileSync(join(changeDir, '.review-passed'), yamlStringify(reviewMarker), 'utf8');
  });

  afterEach(() => {
    // 清理临时目录
    rmSync(proj, { recursive: true, force: true });
  });

  it('WARNING finding → ack propose + ack confirm → forge archive exit 0', () => {
    const changeId = 'bridge-fix';

    // Step 1: forge ack propose —— AI 提议 ack-warning(预期 exit 1,阻止 AI 自 ack)
    const proposeResult = runForge(proj, [
      'ack',
      'propose',
      changeId,
      '--finding',
      '1',
      '--action',
      'ack-warning',
    ]);
    expect(
      proposeResult.code,
      `ack propose 应 exit 1(等待用户确认),stderr: ${proposeResult.stderr}`,
    ).toBe(1);

    // Step 2: forge ack confirm —— User 确认 ack(写 marker ack 字段 + ack-log)
    const confirmResult = runForge(proj, ['ack', 'confirm', changeId, '1']);
    expect(confirmResult.code, `ack confirm 应 exit 0,stderr: ${confirmResult.stderr}`).toBe(0);

    // 验证 confirm 后 marker 已写入 severity_acked_by/at
    const markerAfter = yamlParse(
      readFileSync(join(changeDir, '.verify-passed'), 'utf8'),
    ) as Record<string, unknown>;
    const findings = markerAfter.verify_findings as Array<Record<string, unknown>>;
    expect(findings[0]!.severity_acked_by, 'severity_acked_by 应非空').toBeTruthy();
    expect(findings[0]!.severity_acked_at, 'severity_acked_at 应非空').toBeTruthy();

    // Step 3: forge archive —— 断言 真实 exit 0(--force 跳过 non-git + human-override 检查)
    const archiveResult = runForge(proj, ['archive', changeId, '--force']);
    expect(
      archiveResult.code,
      `forge archive 应 exit 0,但返回 ${archiveResult.code}\nstderr:\n${archiveResult.stderr}\nstdout:\n${archiveResult.stdout}`,
    ).toBe(0);

    // 断言 archive 输出含 "Archive Complete" 或 "archived"
    expect(archiveResult.stdout).toMatch(/Archive Complete|archived/i);
  });
});
