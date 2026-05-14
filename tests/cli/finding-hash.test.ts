// tests/cli/finding-hash.test.ts — plan-9d Task 4 v4 R-5
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

describe('forge finding hash helper (v4 R-5)', () => {
  const cliPath = join(process.cwd(), 'dist/cli/index.js');

  function runHelper(input: string): { exitCode: number; stdout: string; stderr: string } {
    try {
      const stdout = execFileSync('node', [cliPath, 'finding', 'hash'], {
        input,
        encoding: 'utf8',
      });
      return { exitCode: 0, stdout, stderr: '' };
    } catch (err) {
      const e = err as { status: number; stdout: string; stderr: string };
      return { exitCode: e.status ?? 0, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    }
  }

  it('合法 payload → 输出 64-hex finding_hash', () => {
    const payload = JSON.stringify({
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      dimension: 'correctness',
      check_type: 'requirement-mapping',
      severity: 'WARNING',
      automated: false,
      evidence: 'x',
      recommendation: 'y',
    });
    const { exitCode, stdout } = runHelper(payload);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('缺字段 → exit 1', () => {
    const { exitCode, stderr } = runHelper(JSON.stringify({ content_hash: 'sha256:abc' }));
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/缺必填字段/);
  });

  it('非 JSON → exit 1', () => {
    const { exitCode, stderr } = runHelper('not json');
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/不是合法 JSON/);
  });

  it('合法 payload 含 extra keys(id/resolved)→ hash 不含 extra(v5 REG-2)', () => {
    const payload = JSON.stringify({
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      dimension: 'correctness',
      check_type: 'requirement-mapping',
      severity: 'WARNING',
      automated: false,
      evidence: 'x',
      recommendation: 'y',
      // extra keys - 应被丢弃
      id: 99,
      resolved: true,
      finding_hash: 'fake',
    });
    const cleanPayload = JSON.stringify({
      content_hash: 'sha256:' + 'a'.repeat(64),
      git_head: 'd'.repeat(40),
      dimension: 'correctness',
      check_type: 'requirement-mapping',
      severity: 'WARNING',
      automated: false,
      evidence: 'x',
      recommendation: 'y',
    });
    const a = runHelper(payload);
    const b = runHelper(cleanPayload);
    expect(a.exitCode).toBe(0);
    expect(b.exitCode).toBe(0);
    expect(a.stdout.trim()).toBe(b.stdout.trim()); // 含 extra 与不含 extra hash 一致
  });
});
