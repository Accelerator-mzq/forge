// orphan-tmp.test.ts — plan-9e1 Task 5 单测
// 测试 scanOrphanTmp:active change 目录残留 archive_summary.tmp.yaml / archive_summary.yaml → WARNING
// v3 MAJOR 3 修订:同时扫两个文件名

import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanOrphanTmp } from '../../../src/core/validate/orphan-tmp.js';

describe('scanOrphanTmp', () => {
  it('change 目录无 .tmp → warnings 空', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-orphan-'));
    const changeDir = join(tmpRoot, 'change-x');
    mkdirSync(changeDir, { recursive: true });
    try {
      const result = await scanOrphanTmp(changeDir);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('change 目录有 archive_summary.tmp.yaml → warnings 含一项 + 提示用户决定', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-orphan-'));
    const changeDir = join(tmpRoot, 'change-x');
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(
      join(changeDir, 'archive_summary.tmp.yaml'),
      'schema: forge-archive-summary/v1\n',
      'utf8',
    );
    try {
      const result = await scanOrphanTmp(changeDir);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      // 提示 --resume-summary 或孤立信息
      expect(result.warnings[0]?.message).toMatch(/孤立|orphan|--resume-summary/);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // v3 MAJOR 3 新增:扫 .yaml(active change 不该有正式名 → rollback 残留信号)
  it('change 目录有 archive_summary.yaml → warnings 含一项 + 提示 rollback 残留', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-orphan-'));
    const changeDir = join(tmpRoot, 'change-x');
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(
      join(changeDir, 'archive_summary.yaml'),
      'schema: forge-archive-summary/v1\n',
      'utf8',
    );
    try {
      const result = await scanOrphanTmp(changeDir);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.field).toBe('archive_summary.yaml');
      expect(result.warnings[0]?.message).toMatch(/rollback 残留|active change/);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  // v3 MAJOR 3 新增:同时含两者 → warnings 含两项
  it('change 目录同时含 .tmp + .yaml → warnings 含两项', async () => {
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9e1-orphan-'));
    const changeDir = join(tmpRoot, 'change-x');
    mkdirSync(changeDir, { recursive: true });
    writeFileSync(join(changeDir, 'archive_summary.tmp.yaml'), 'schema: x\n', 'utf8');
    writeFileSync(join(changeDir, 'archive_summary.yaml'), 'schema: y\n', 'utf8');
    try {
      const result = await scanOrphanTmp(changeDir);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
