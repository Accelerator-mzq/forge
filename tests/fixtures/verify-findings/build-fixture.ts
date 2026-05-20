// tests/fixtures/verify-findings/build-fixture.ts — plan-9d Task 8 v3 fixture 共享生成器
// 避免每个 fixture 重写 marker YAML;按参数构造完整 change 目录
//
// v3 M-2 修订:tasks_hash / content_hash 由 computeTasksHash + computeContentHash 真算
// v3 M-3 修订:finding.content_hash 用与 marker 顶层一致的 sha256: 前缀格式
// v13 修订:test.log + computeLogHash 提前到 marker 构造之前(避免 use-before-declaration)

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { computeFindingHash } from '../../../src/core/validate/finding-hash.js';
import { computeContentHash } from '../../../src/core/hash/content.js';
import { computeTasksHash } from '../../../src/core/hash/tasks.js';
import { computeLogHash } from '../../../src/core/hash/log.js';
import type { Finding } from '../../../src/core/schemas/severity.js';

export interface FixtureOpts {
  /** finding 字段(覆盖默认)*/
  finding?: Partial<Finding>;
  /** 是否写 ack-log 匹配条目 */
  ackLogMatch?: 'matching' | 'hash-mismatch' | 'missing' | 'user-mismatch';
  /** 是否在 pending-acks 写残留 */
  pendingAcksResidual?: boolean;
  /** 是否故意篡改 marker finding_hash */
  tamperHash?: boolean;
  /** finding 是否含 downgrade 字段 + ack-log 匹配 downgrade */
  downgrade?: {
    fromSeverity: 'WARNING' | 'CRITICAL';
    ackedBy: string;
    rationale: string;
    ackLogMatch: boolean;
  };
  changeId: string;
}

/**
 * 构建一个完整 forge change 目录(proposal/design/tasks/specs + .verify-passed + .review-passed
 * + .evidence/ack-log.jsonl + .evidence/pending-acks/)
 *
 * 返回 { changeDir, finding }(finding 已含正确 finding_hash 或被故意篡改的 hash)
 */
export async function buildFixture(
  rootDir: string,
  opts: FixtureOpts,
): Promise<{
  changeDir: string;
  finding: Finding;
}> {
  const changeDir = join(rootDir, 'forge/changes', opts.changeId);
  await mkdir(join(changeDir, 'specs'), { recursive: true });
  await mkdir(join(changeDir, '.evidence'), { recursive: true });

  // 1. proposal/design/tasks/specs(先写,后面 hash 计算依赖文件存在)
  const tasksContent = `# Tasks\n\n- [x] task-1: implement X\n`;
  await writeFile(
    join(changeDir, 'proposal.md'),
    `# Proposal\n\n## Why\nx\n\n## What\ny\n\n## Impact\nz\n`,
  );
  await writeFile(join(changeDir, 'design.md'), `# Design\n\n## Context\nx\n\n## Approach\ny\n`);
  await writeFile(join(changeDir, 'tasks.md'), tasksContent);
  await writeFile(
    join(changeDir, 'specs', 'spec.md'),
    `# Spec\n\n## Purpose\nx\n\n## Requirement: r1\n\nWHEN x THEN y\n`,
  );

  // v3 M-2 修订:真算 hash(沿 archive.ts:274-276 同函数)
  const realTasksHash = computeTasksHash(tasksContent);
  const realContentHash = await computeContentHash(changeDir);

  // 2. 构造 finding(v3 M-3:content_hash 用 marker 同步 sha256: 前缀)
  const base: Finding = {
    id: 1,
    dimension: 'correctness',
    check_type: 'requirement-mapping',
    severity: 'WARNING',
    automated: false,
    content_hash: realContentHash,
    git_head: 'd'.repeat(40),
    evidence: 'specs/spec.md Requirement r1 在 src/x.ts:10 实现与 spec 不一致',
    recommendation: '改 src/x.ts:10 让 behavior 与 spec 一致',
    resolved: false,
    finding_hash: '',
  };
  const finding = { ...base, ...opts.finding };
  if (opts.downgrade) {
    finding.downgraded_from = opts.downgrade.fromSeverity;
    finding.downgraded_to = finding.severity;
    finding.downgrade_acked_by = opts.downgrade.ackedBy;
    finding.downgrade_rationale = opts.downgrade.rationale;
  }
  const realFindingHash = computeFindingHash({
    content_hash: finding.content_hash,
    git_head: finding.git_head,
    dimension: finding.dimension,
    check_type: finding.check_type,
    severity: finding.severity,
    automated: finding.automated,
    evidence: finding.evidence,
    recommendation: finding.recommendation,
  });
  finding.finding_hash = opts.tamperHash ? 'f'.repeat(64) : realFindingHash;

  // 3. .evidence/test.log + 真算 log_hash(v13 REG-LOGHASH-ORDER-001:前置)
  const logPath = join(changeDir, '.evidence', 'test.log');
  await writeFile(logPath, 'PASS 17/17\n');
  const realLogHash = await computeLogHash(logPath);

  // 4. .verify-passed YAML(hash 用真值)
  const verifyMarker = {
    schema: 'forge-verify/v1',
    verified_at: '2026-05-12T10:00:00Z',
    verified_by: 'ai-agent',
    tasks_hash: realTasksHash,
    content_hash: realContentHash,
    evidence: [
      {
        scenario_id: 's1',
        test_command: 'pnpm test',
        test_file: 'tests/x.test.ts',
        log_path: './.evidence/test.log',
        log_hash: realLogHash,
        pass: true,
      },
    ],
    verify_findings: [finding],
  };
  await writeFile(join(changeDir, '.verify-passed'), yamlStringify(verifyMarker));

  // 5. .review-passed YAML(is_git_repo=false 配合 --force 跳 git 检查)
  await writeFile(
    join(changeDir, '.review-passed'),
    yamlStringify({
      schema: 'forge-review/v1',
      reviewed_at: '2026-05-12T11:00:00Z',
      reviewed_by: 'ai-agent',
      tasks_hash: realTasksHash,
      content_hash: realContentHash,
      git: { is_git_repo: false },
      review_outcomes: [],
    }),
  );

  // 6. .evidence/ack-log.jsonl(若有 ack 或 downgrade)
  const ackEntries: Record<string, unknown>[] = [];
  if (
    opts.ackLogMatch &&
    opts.ackLogMatch !== 'missing' &&
    finding.severity === 'WARNING' &&
    finding.severity_acked_by
  ) {
    ackEntries.push({
      schema: 'forge-ack-log/v1',
      kind: 'ack',
      timestamp: '2026-05-12T10:00:00Z',
      action: 'ack-warning',
      change_id: opts.changeId,
      finding_id: String(finding.id),
      user: opts.ackLogMatch === 'user-mismatch' ? 'ai-agent' : finding.severity_acked_by,
      rationale: 'edge case acceptable',
      git_head: 'd'.repeat(40),
      finding_hash: opts.ackLogMatch === 'hash-mismatch' ? 'e'.repeat(64) : realFindingHash,
    });
  }
  if (opts.downgrade?.ackLogMatch) {
    ackEntries.push({
      schema: 'forge-ack-log/v1',
      kind: 'ack',
      timestamp: '2026-05-12T10:30:00Z',
      action: 'downgrade',
      change_id: opts.changeId,
      finding_id: String(finding.id),
      user: opts.downgrade.ackedBy,
      rationale: opts.downgrade.rationale,
      git_head: 'd'.repeat(40),
      finding_hash: realFindingHash,
    });
  }
  if (ackEntries.length > 0) {
    await writeFile(
      join(changeDir, '.evidence', 'ack-log.jsonl'),
      ackEntries.map((e) => JSON.stringify(e)).join('\n') + '\n',
    );
  }

  // 7. pending-acks 残留
  if (opts.pendingAcksResidual) {
    await mkdir(join(changeDir, '.evidence', 'pending-acks'), { recursive: true });
    await writeFile(
      join(changeDir, '.evidence', 'pending-acks', `finding-${finding.id}-20260512.yaml`),
      'pending: true',
    );
  }

  return { changeDir, finding };
}
