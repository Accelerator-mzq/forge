import { describe, it, expect } from 'vitest';
import { readDeltas, applyDeltas } from '../../src/core/specs-sync/index.js';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 创建临时目录辅助函数,返回 changeSpecs/currentSpecs 路径和清理函数
function setup(): { changeSpecs: string; currentSpecs: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'forge-sync-'));
  const changeSpecs = join(root, 'change/specs');
  const currentSpecs = join(root, 'forge/specs');
  mkdirSync(changeSpecs, { recursive: true });
  mkdirSync(currentSpecs, { recursive: true });
  return {
    changeSpecs,
    currentSpecs,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('specs-sync', () => {
  // 新 spec 文件应产生 create 操作
  it('detects "create" when spec is new', async () => {
    const { changeSpecs, currentSpecs, cleanup } = setup();
    try {
      writeFileSync(join(changeSpecs, 'login.md'), '# Login\n');
      const deltas = await readDeltas(changeSpecs, currentSpecs);
      expect(deltas).toHaveLength(1);
      expect(deltas[0]).toMatchObject({ name: 'login', operation: 'create' });
    } finally {
      cleanup();
    }
  });

  // 已存在的 spec 文件应产生 replace 操作
  it('detects "replace" when spec already exists', async () => {
    const { changeSpecs, currentSpecs, cleanup } = setup();
    try {
      writeFileSync(join(currentSpecs, 'login.md'), '# Old\n');
      writeFileSync(join(changeSpecs, 'login.md'), '# New\n');
      const deltas = await readDeltas(changeSpecs, currentSpecs);
      expect(deltas[0]?.operation).toBe('replace');
    } finally {
      cleanup();
    }
  });

  // applyDeltas 正确写入 create 和 replace 的文件内容
  it('applies create + replace correctly', async () => {
    const { changeSpecs, currentSpecs, cleanup } = setup();
    try {
      writeFileSync(join(currentSpecs, 'old.md'), '# Old\n');
      writeFileSync(join(changeSpecs, 'old.md'), '# Updated\n');
      writeFileSync(join(changeSpecs, 'new.md'), '# Brand New\n');
      const deltas = await readDeltas(changeSpecs, currentSpecs);
      await applyDeltas(currentSpecs, deltas);
      expect(readFileSync(join(currentSpecs, 'old.md'), 'utf8')).toBe('# Updated\n');
      expect(readFileSync(join(currentSpecs, 'new.md'), 'utf8')).toBe('# Brand New\n');
    } finally {
      cleanup();
    }
  });

  // delete 操作尚未实现(v0.2),应抛出包含 v0.2 的错误
  it('throws on delete (v0.2 not implemented)', async () => {
    const { currentSpecs, cleanup } = setup();
    try {
      await expect(
        applyDeltas(currentSpecs, [{ name: 'x', operation: 'delete', content: null }]),
      ).rejects.toThrow(/v0\.2/);
    } finally {
      cleanup();
    }
  });
});
