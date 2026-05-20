// tests/cli/validate-verify-findings.test.ts — plan-9d Task 4
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateChange } from '../../src/core/validate/index.js';

describe('validate.ts auto-produce verify-domain CRITICAL findings (plan-9d Task 4)', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `forge-9d-validate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    await mkdir(join(testDir, 'specs'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('tasks.md fake-completion(标 [x] 但 changeDir 无实施)→ validate 层不产 finding(由 verify slash 阶段产,沿 §11.1bis)', async () => {
    // v13 review MINOR:case 边界明确化 — fake_completion candidate 归属 verify slash(commands/verify.md Task 5),
    // 不在 validate CLI 阶段产 finding;本测试反向验证 validate 层**不**产 tasks 类 CRITICAL finding
    await writeFile(
      join(testDir, 'proposal.md'),
      `# Proposal\n\n## Why\n\ntest\n\n## What\n\nadd X\n\n## Impact\n\nsmall`,
    );
    await writeFile(
      join(testDir, 'design.md'),
      `# Design\n\n## Context\n\nnone\n\n## Approach\n\nimpl X`,
    );
    await writeFile(
      join(testDir, 'tasks.md'),
      `# Tasks\n\n- [x] task-1: implement X\n- [ ] task-2: test X`,
    );
    await writeFile(
      join(testDir, 'specs', 'x.md'),
      `# Spec X\n\n## Purpose\n\ntest\n\n## Requirement: r1\n\nWHEN x THEN y`,
    );

    const result = await validateChange(testDir);
    // v14 review MINOR regression 修订:过滤谓词用 artifact 字段(沿 src/core/validate/types.ts:12)
    const tasksCriticalFindings = result.errors.filter(
      (e) => e.artifact === 'tasks' && e.severity === 'CRITICAL',
    );
    expect(tasksCriticalFindings).toHaveLength(0);
  });

  it('specs/ 为空 → CRITICAL specs/no-files + finding_hash', async () => {
    await writeFile(
      join(testDir, 'proposal.md'),
      `# Proposal\n\n## Why\n\nx\n\n## What\n\ny\n\n## Impact\n\nz`,
    );
    await writeFile(join(testDir, 'design.md'), `# Design\n\n## Context\n\nx\n\n## Approach\n\ny`);
    await writeFile(join(testDir, 'tasks.md'), `# Tasks\n\n- [ ] task-1: x`);
    // specs/ 创建但空

    const result = await validateChange(testDir);
    expect(result.valid).toBe(false);
    const specsCritical = result.errors.find(
      (e) => e.artifact === 'specs' && e.severity === 'CRITICAL',
    );
    expect(specsCritical).toBeDefined();
    expect(specsCritical?.finding_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('fs 错(读取 proposal 失败)→ severity 不标,exit 走 fs 类(沿 v3 B2)', async () => {
    // proposal.md 不存在 → readFile 抛 ENOENT
    const result = await validateChange(testDir);
    const fsErr = result.errors.find(
      (e) => e.artifact === 'proposal' && e.message.startsWith('[fs]'),
    );
    expect(fsErr).toBeDefined();
    expect(fsErr?.severity).toBeUndefined(); // fs 错不标 severity
    expect(fsErr?.finding_hash).toBeUndefined(); // fs 错不产 finding_hash
  });
});
