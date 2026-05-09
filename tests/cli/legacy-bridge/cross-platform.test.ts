// 跨平台 / Windows-specific fixture 行为(spec §5.5)— Plan 7 Phase E
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readAnchorFile } from '../../../src/core/legacy-bridge/encoding.js';
import { computeAnchorHash } from '../../../src/core/legacy-bridge/hash-anchor.js';
import { DEFAULT_REDACT_RULES } from '../../../src/core/legacy-bridge/redact.js';
import { parseWorkbook, getSheet } from '../../../src/core/legacy-bridge/excel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

describe('legacy-bridge cross-platform fixtures(spec §5.5 acceptance)', () => {
  it('中文路径 + 中文文件名 → 读取 + hash 稳定', async () => {
    const path = join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md');
    const r = await readAnchorFile(path);
    const h = await computeAnchorHash(path);
    expect(r.text).toContain('需求规格说明书');
    expect(h).not.toBeNull();
  });

  it('GBK 编码 → mojibake 检测命中', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'gbk-encoded-srs.md'));
    expect(r.hasMojibake).toBe(true);
  });

  it('Windows CRLF fixture → detectLineEnding=CRLF', async () => {
    const r = await readAnchorFile(join(FIXTURE_DIR, 'windows-crlf-srs.md'));
    expect(r.lineEnding).toBe('CRLF');
  });

  it('Excel 多 sheet + 中文 sheet 名 → 正确读', async () => {
    const wb = await parseWorkbook(join(FIXTURE_DIR, 'excel-test-cases.xlsx'));
    const cn = getSheet(wb, '覆盖率', join(FIXTURE_DIR, 'excel-test-cases.xlsx'));
    expect(cn.rows[0]).toContain('模块');
  });

  it('redact 默认规则数量 ≥ 12(覆盖 spec §4.5;P7-13 修复:不依赖 fixture 真值命中)', async () => {
    // git-safe fixture 中默认规则不命中(避免 GitHub secret scanning 阻拦),
    // 覆盖度由 DEFAULT_REDACT_RULES.length 单独验证;
    // 真值命中由 redact.test.ts 内字符串拼接 case 验证。
    expect(DEFAULT_REDACT_RULES.length).toBeGreaterThanOrEqual(12);
    const names = DEFAULT_REDACT_RULES.map((r) => r.name);
    expect(new Set(names).size).toBe(DEFAULT_REDACT_RULES.length);
  });

  it('DEFAULT_REDACT_RULES 与 spec §4.5 一致(12+ 类)', () => {
    expect(DEFAULT_REDACT_RULES.length).toBeGreaterThanOrEqual(12);
  });
});
