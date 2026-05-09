import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  readAnchorFile,
  readAnchorAsText,
  detectLineEnding,
  dryRunEncodingProbe,
} from '../../../src/core/legacy-bridge/encoding.js';
import type { LegacyAnchor } from '../../../src/core/legacy-bridge/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

describe('legacy-bridge/encoding', () => {
  it('UTF-8 中文文件读取正常', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'));
    expect(r.hasMojibake).toBe(false);
    expect(r.text).toContain('需求规格说明书');
    expect(r.text).toContain('Idempotency-Key');
  });

  it('GBK 文件以 utf8 读 → hasMojibake=true', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'gbk-encoded-srs.md'));
    expect(r.hasMojibake).toBe(true);
  });

  it('detectLineEnding LF', () => {
    expect(detectLineEnding('a\nb\nc')).toBe('LF');
  });

  it('detectLineEnding CRLF', () => {
    expect(detectLineEnding('a\r\nb\r\nc')).toBe('CRLF');
  });

  it('detectLineEnding mixed', () => {
    expect(detectLineEnding('a\r\nb\nc')).toBe('mixed');
  });

  it('detectLineEnding none', () => {
    expect(detectLineEnding('single line no newline')).toBe('none');
  });

  it('CRLF fixture 检测 CRLF', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'windows-crlf-srs.md'));
    expect(r.lineEnding).toBe('CRLF');
  });

  it('dryRunEncodingProbe 输出 detectedEncoding(chardet 缺失也不抛)', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'gbk-encoded-srs.md'));
    const probe = await dryRunEncodingProbe('test', r);
    expect([
      'unknown',
      'chardet-not-installed',
      'GB18030',
      'GBK',
      'Big5',
      'windows-1252',
    ]).toContain(probe.detectedEncoding);
    expect(probe.mojibakeContext).toContain('before 80 text');
    expect(probe.mojibakeContext).toContain('before 80 hex');
    expect(probe.mojibakeContext).toContain('after 80 hex');
    // hex 段必须是十六进制(只含 0-9a-f),允许空(若 byteIdx=0 时 before 80 hex 为空)
    expect(probe.mojibakeContext).toMatch(/\[before 80 hex\]:\s+[0-9a-f]*/);
    expect(probe.mojibakeContext).toMatch(/\[after 80 hex\]:\s+[0-9a-f]+/);
  });

  it('dryRunEncodingProbe utf8 文件无 mojibakeContext', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'));
    const probe = await dryRunEncodingProbe('test', r);
    expect(probe.mojibakeContext).toBeUndefined();
  });

  // Phase F follow-up:统一公共 readAnchorAsText
  describe('readAnchorAsText 路径分发(md vs xlsx)', () => {
    it('.md 路径走 readAnchorFile,返回原文 utf8 文本', async () => {
      const anchor: LegacyAnchor = {
        role: 'requirements',
        path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
        authoritative: true,
      };
      const text = await readAnchorAsText(anchor);
      expect(text).toContain('需求规格说明书');
      expect(text).toContain('Idempotency-Key');
    });

    it('.xlsx 路径走 exceljs + sheetToMarkdown,返回 markdown 表格(不再是 ZIP binary)', async () => {
      const anchor: LegacyAnchor = {
        role: 'system-tests',
        path: join(FIXTURE_DIR, 'excel-test-cases.xlsx'),
        sheet: 'TestCases',
        authoritative: true,
      };
      const text = await readAnchorAsText(anchor);
      // markdown 表格必含 | 和换行;ZIP binary 头是 "PK"(0x50 0x4B)
      expect(text.startsWith('PK')).toBe(false);
      expect(text).toContain('|');
      // sheetToMarkdown 转 fixture 第一行表头 ID/Title/Steps/Expected
      expect(text).toContain('ID');
      expect(text).toContain('Title');
      // fixture 数据行
      expect(text).toContain('TC-001');
      expect(text).toContain('幂等支付');
    });
  });
});
