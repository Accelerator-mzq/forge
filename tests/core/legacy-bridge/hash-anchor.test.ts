import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { computeAnchorHash, checkAnchorHash } from '../../../src/core/legacy-bridge/hash-anchor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

describe('legacy-bridge/hash-anchor', () => {
  it('文件不存在 → 返回 null', async () => {
    const h = await computeAnchorHash('/tmp/no-such-file-xyz');
    expect(h).toBeNull();
  });

  it('UTF-8 中文路径文件 → 稳定 hash', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const h1 = await computeAnchorHash(path);
    const h2 = await computeAnchorHash(path);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('CRLF / LF 同内容 → 同 hash(行尾 normalize)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'hash-anchor-'));
    try {
      const lfPath = join(d, 'lf.md');
      const crlfPath = join(d, 'crlf.md');
      writeFileSync(lfPath, 'a\nb\nc');
      writeFileSync(crlfPath, 'a\r\nb\r\nc');
      const lf = await computeAnchorHash(lfPath);
      const crlf = await computeAnchorHash(crlfPath);
      expect(lf).toBe(crlf);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('xlsx 二进制 → 不做行尾 normalize(用原始字节)', async () => {
    const h = await computeAnchorHash(join(FIXTURE_DIR, 'excel-test-cases.xlsx'));
    expect(h).not.toBeNull();
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('checkAnchorHash 当前 = 记录 → fresh', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const current = await computeAnchorHash(path);
    expect(current).not.toBeNull();
    const r = await checkAnchorHash({
      role: 'requirements',
      path,
      authoritative: true,
      hash: current!,
    });
    expect(r.state).toBe('fresh');
  });

  it('checkAnchorHash 记录与当前不一致 → stale', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const r = await checkAnchorHash({
      role: 'requirements',
      path,
      authoritative: true,
      hash: 'deadbeef0000000',
    });
    expect(r.state).toBe('stale');
  });

  it('checkAnchorHash 无记录 hash → no-record', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const r = await checkAnchorHash({
      role: 'requirements',
      path,
      authoritative: true,
    });
    expect(r.state).toBe('no-record');
  });

  it('readFile 抛非 ENOENT 错误 → 向上传(不吞)', async () => {
    // 给一个目录 path,readFile 会抛 EISDIR(不是 ENOENT)
    const dirPath = FIXTURE_DIR; // 是个目录
    await expect(computeAnchorHash(dirPath)).rejects.toThrow();
  });

  it('单独 \\r(老 Mac 行尾)→ 与 LF 同 hash', async () => {
    const d = mkdtempSync(join(tmpdir(), 'hash-anchor-cr-'));
    try {
      const lfPath = join(d, 'lf.md');
      const crPath = join(d, 'cr.md');
      writeFileSync(lfPath, 'a\nb\nc');
      writeFileSync(crPath, 'a\rb\rc');
      const lf = await computeAnchorHash(lfPath);
      const cr = await computeAnchorHash(crPath);
      expect(lf).toBe(cr);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
