import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseWorkbook,
  getSheet,
  sheetToMarkdown,
  ExcelParseError,
} from '../../../src/core/legacy-bridge/excel.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../fixtures/legacy-bridge/excel-test-cases.xlsx');

describe('legacy-bridge/excel', () => {
  it('parseWorkbook 解析 fixture 多 sheet', async () => {
    const wb = await parseWorkbook(FIXTURE);
    expect(wb.sheets.map((s) => s.name).sort()).toEqual(['TestCases', '覆盖率']);
  });

  it('TestCases sheet 行数正确(header + 4 case = 5)', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const tc = getSheet(wb, 'TestCases', FIXTURE);
    expect(tc.rows).toHaveLength(5);
    expect(tc.rows[0]).toEqual(['ID', 'Title', 'Steps', 'Expected']);
    expect(tc.rows[1]?.[0]).toBe('TC-001');
  });

  it('中文 sheet 名 → 正确读取', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const cov = getSheet(wb, '覆盖率', FIXTURE);
    expect(cov.rows[0]).toEqual(['模块', '已覆盖用例', '未覆盖用例']);
  });

  it('sheet 名不存在 → 抛 ExcelParseError 含可用列表', async () => {
    const wb = await parseWorkbook(FIXTURE);
    expect(() => getSheet(wb, 'Nonexistent', FIXTURE)).toThrow(ExcelParseError);
    expect(() => getSheet(wb, 'Nonexistent', FIXTURE)).toThrow(/TestCases.*覆盖率/);
  });

  it('sheet=undefined → 取第一个 sheet', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const first = getSheet(wb, undefined, FIXTURE);
    expect(first.name).toBe('TestCases');
  });

  it('sheetToMarkdown 输出 markdown 表', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const tc = getSheet(wb, 'TestCases', FIXTURE);
    const md = sheetToMarkdown(tc);
    expect(md).toContain('### Sheet: TestCases');
    expect(md).toContain('| ID | Title');
    expect(md).toContain('TC-001');
  });

  it('parseWorkbook 损坏文件 → 抛 ExcelParseError', async () => {
    await expect(parseWorkbook('/tmp/nonexistent.xlsx')).rejects.toThrow(ExcelParseError);
  });

  it('TestCases 无 unsupportedFeatures(简单 sheet)', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const tc = getSheet(wb, 'TestCases', FIXTURE);
    expect(tc.unsupportedFeatures).toEqual([]);
  });

  it('hyperlink cell → 取 text 不是 [object Object]', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const tc = getSheet(wb, 'TestCases', FIXTURE);
    const tc004 = tc.rows.find((r) => r[0] === 'TC-004');
    expect(tc004).toBeDefined();
    expect(tc004?.[1]).toBe('点击此链接');
    expect(tc004?.[1]).not.toContain('[object Object]');
  });

  it('Date cell → ISO 8601 字符串(locale-independent)', async () => {
    const wb = await parseWorkbook(FIXTURE);
    const tc = getSheet(wb, 'TestCases', FIXTURE);
    const tc004 = tc.rows.find((r) => r[0] === 'TC-004');
    expect(tc004?.[3]).toBe('2026-01-15T08:00:00.000Z');
  });
});
