// archive-resume-summary.test.ts — plan-9e1 Task 5 单测
// 测试 forge archive --resume-summary <archive-id> 五场景:
//   1. archive 目录有 .tmp + 无正式 .yaml + 内容合法 → rename 成功(exit 0)
//   2. archive 目录有 .tmp + 已存在正式 .yaml → 拒签(exit 1,conflict)
//   3. archive 目录无 .tmp 也无正式 .yaml → 报错(exit 1,missing)
//   4. archive 目录有 .tmp + schema 损坏 → 拒签(exit 3,corrupt schema)
//   5. archive 目录有 .tmp + YAML 语法错 → 拒签(exit 3,corrupt parse)
//
// 沿 archive.test.ts 同模式 — tmpdir 搭 forge skeleton + 跑 archive --resume-summary

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// dist binary 路径 — build 后才存在
const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');

/**
 * 搭 forge skeleton:forgeRoot/changes/archive/<archiveId>/ + .cache/ + config.yaml
 * 并按 opts 写 .tmp / 正式 .yaml
 */
function setupArchivedChange(opts: { withTmp: boolean; withFinal: boolean }): {
  tmpRoot: string;
  archiveId: string;
  cleanup: () => void;
} {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-resume-'));
  const archiveId = '2026-05-12-add-x';
  const archiveDir = join(tmpRoot, 'forge', 'changes', 'archive', archiveId);
  mkdirSync(archiveDir, { recursive: true });
  mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
  // 最小 config.yaml
  writeFileSync(
    join(tmpRoot, 'forge', 'config.yaml'),
    'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
    'utf8',
  );
  if (opts.withTmp) {
    // 合法 archive_summary.tmp.yaml — 满足 validateArchiveSummarySchema 所有字段
    writeFileSync(
      join(archiveDir, 'archive_summary.tmp.yaml'),
      [
        'schema: forge-archive-summary/v1',
        'version: 1.0.0',
        'archived_at: 2026-05-12T16:45:00Z',
        'change_id: add-x',
        'verify_passed:',
        '  verified_invariants: [hash-match, evidence-complete]',
        'review_passed:',
        '  reviewers: [ai-agent]',
        'process_evidence_summary:',
        '  placeholder: true',
        '  note: placeholder',
        'handoff_to_backlog: []',
        'acked_warnings: []',
        'pending_suggestions: []',
        '',
      ].join('\n'),
      'utf8',
    );
  }
  if (opts.withFinal) {
    // 正式 archive_summary.yaml — 同样合法
    writeFileSync(
      join(archiveDir, 'archive_summary.yaml'),
      [
        'schema: forge-archive-summary/v1',
        'version: 1.0.0',
        'archived_at: 2026-05-12T16:45:00Z',
        'change_id: add-x',
        'verify_passed:',
        '  verified_invariants: [hash-match]',
        'review_passed:',
        '  reviewers: [ai-agent]',
        'process_evidence_summary:',
        '  placeholder: true',
        'handoff_to_backlog: []',
        'acked_warnings: []',
        'pending_suggestions: []',
        '',
      ].join('\n'),
      'utf8',
    );
  }
  return {
    tmpRoot,
    archiveId,
    cleanup: () => rmSync(tmpRoot, { recursive: true, force: true }),
  };
}

/**
 * 跑 forge archive --resume-summary <archiveId>,以 tmpRoot 为 cwd
 * 返回 { code, stderr, stdout }
 */
function runResume(
  tmpRoot: string,
  archiveId: string,
): { code: number; stderr: string; stdout: string } {
  const res = spawnSync('node', [FORGE_CLI, 'archive', '--resume-summary', archiveId], {
    cwd: tmpRoot,
    encoding: 'utf8',
  });
  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
}

describe('forge archive --resume-summary', () => {
  it('场景 1:有 .tmp 无正式 + .tmp 内容合法 → rename 成功(exit 0)', () => {
    const ctx = setupArchivedChange({ withTmp: true, withFinal: false });
    try {
      const r = runResume(ctx.tmpRoot, ctx.archiveId);
      expect(r.code).toBe(0);
      const archiveDir = join(ctx.tmpRoot, 'forge', 'changes', 'archive', ctx.archiveId);
      // rename 完成:正式文件存在、.tmp 已消失
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(true);
      expect(existsSync(join(archiveDir, 'archive_summary.tmp.yaml'))).toBe(false);
    } finally {
      ctx.cleanup();
    }
  });

  it('场景 2:有 .tmp 与正式 .yaml 都存在 → 拒签(exit 1,conflict)', () => {
    const ctx = setupArchivedChange({ withTmp: true, withFinal: true });
    try {
      const r = runResume(ctx.tmpRoot, ctx.archiveId);
      expect(r.code).toBe(1);
      // stderr 含 conflict / 两个都存在 信息
      expect(r.stderr).toMatch(/两个 archive_summary 都存在|conflict|拒签/);
    } finally {
      ctx.cleanup();
    }
  });

  it('场景 3:无 .tmp 也无正式 → 报错(exit 1,missing)', () => {
    const ctx = setupArchivedChange({ withTmp: false, withFinal: false });
    try {
      const r = runResume(ctx.tmpRoot, ctx.archiveId);
      expect(r.code).toBe(1);
      // stderr 含 missing / 找不到 信息
      expect(r.stderr).toMatch(/找不到|missing|不存在/);
    } finally {
      ctx.cleanup();
    }
  });

  // v2 BLOCKER 5 新增:.tmp 内容 schema 损坏 → exit 3(corrupt,沿 master §3.12.3)
  it('场景 4:有 .tmp 无正式 + .tmp schema 损坏 → 拒签(exit 3,corrupt schema)', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-resume-corrupt-'));
    const archiveId = '2026-05-12-add-x';
    const archiveDir = join(tmpRoot, 'forge', 'changes', 'archive', archiveId);
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'forge', 'config.yaml'),
      'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
      'utf8',
    );
    // 写入 schema 字段错的 .tmp(not-archive-summary 不是合法 literal)
    writeFileSync(
      join(archiveDir, 'archive_summary.tmp.yaml'),
      'schema: not-archive-summary\nversion: 1.0.0\n',
      'utf8',
    );
    try {
      const r = runResume(tmpRoot, archiveId);
      // v2 BLOCKER 5:corrupt → exit 3
      expect(r.code).toBe(3);
      expect(r.stderr).toMatch(/corrupt|schema|损坏|校验失败/);
      // .tmp 未被升级为正式名(校验失败拒签)
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(false);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // v3 MINOR 1 新增:纯 YAML 语法错(parse 失败)→ exit 3
  it('场景 5:有 .tmp 无正式 + .tmp YAML 语法错(parse 失败)→ 拒签(exit 3,corrupt parse)', () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-resume-parse-'));
    const archiveId = '2026-05-12-add-x';
    const archiveDir = join(tmpRoot, 'forge', 'changes', 'archive', archiveId);
    mkdirSync(archiveDir, { recursive: true });
    mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'forge', 'config.yaml'),
      'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
      'utf8',
    );
    // 写入纯 YAML 语法错(@@@@@  是 YAML 不合法字符开头 + 无 indent / 无字段)
    writeFileSync(
      join(archiveDir, 'archive_summary.tmp.yaml'),
      '@@@@@ corrupt yaml @@@@@\n  not: valid: yaml: structure\n',
      'utf8',
    );
    try {
      const r = runResume(tmpRoot, archiveId);
      expect(r.code).toBe(3);
      expect(r.stderr).toMatch(/parse|corrupt|YAML/i);
      expect(existsSync(join(archiveDir, 'archive_summary.yaml'))).toBe(false);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
