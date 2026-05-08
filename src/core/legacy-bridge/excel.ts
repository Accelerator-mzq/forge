// .xlsx 解析 — Plan 7 Phase B2
// spec §6.5 选定 exceljs;chart/pivot/formula 不支持时引导用户导出 csv

import ExcelJS from 'exceljs';

/** 单 sheet 解析结果 */
export interface SheetResult {
  name: string;
  rows: string[][];
  /** 是否含 chart / pivot / formula(spec §6.5 v0.2 不支持) */
  unsupportedFeatures: string[];
}

/** 整个 workbook 解析结果 */
export interface WorkbookResult {
  sheets: SheetResult[];
}

/** 自定义异常:Excel 解析失败或含不支持特性(供 CLI 转 exit 2) */
export class ExcelParseError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ExcelParseError';
  }
}

/**
 * 用 exceljs 读 .xlsx,返回所有 sheet 的行二维数组。
 *
 * - chart / pivotTable 等不支持特性 → 标 unsupportedFeatures(caller 决定是 fail 还是 warn)
 * - formula → 读 result(已计算值)而不是 formula 表达式
 * - 损坏 / 空 workbook → 抛 ExcelParseError
 */
export async function parseWorkbook(path: string): Promise<WorkbookResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(path);
  } catch (err) {
    throw new ExcelParseError(
      `xlsx 解析失败,可能损坏或非 .xlsx 格式:${(err as Error).message}`,
      path,
    );
  }

  const sheets: SheetResult[] = [];
  for (const ws of workbook.worksheets) {
    const rows: string[][] = [];
    const unsupportedFeatures: string[] = [];

    // 检测不支持特性
    // exceljs 把 pivotTable 等暴露为 worksheet.pivotTables;若无属性则 try-catch 兜底
    if ((ws as unknown as { pivotTables?: unknown[] }).pivotTables?.length) {
      unsupportedFeatures.push('pivotTable');
    }
    // chart / drawing 通过 model.drawings 或 drawings 暴露(版本相关);用 try 兜
    try {
      const drawings = (ws.model as unknown as { drawings?: unknown[] }).drawings;
      if (Array.isArray(drawings) && drawings.length > 0) {
        unsupportedFeatures.push('chart/drawing');
      }
    } catch {
      // ignore
    }

    // 遍历行(eachRow 跳过空行;rowNumber 从 1 起)
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      // row.values 索引从 1 起,[0] 永远 undefined
      const values = row.values as Array<unknown>;
      for (let i = 1; i < values.length; i += 1) {
        const v = values[i];
        if (v === undefined || v === null) {
          cells.push('');
        } else if (typeof v === 'object' && v !== null && 'result' in v) {
          // formula cell:取计算缓存值
          cells.push(String((v as { result: unknown }).result ?? ''));
        } else if (typeof v === 'object' && v !== null && 'richText' in v) {
          // richText:拼 plain
          const rt = (v as { richText: { text: string }[] }).richText;
          cells.push(rt.map((seg) => seg.text).join(''));
        } else {
          cells.push(String(v));
        }
      }
      rows.push(cells);
    });

    sheets.push({ name: ws.name, rows, unsupportedFeatures });
  }

  if (sheets.length === 0) {
    throw new ExcelParseError('workbook 无 sheet', path);
  }

  return { sheets };
}

/** 取指定 sheet(若 sheet 不存在 → 抛错;sheet=undefined → 取第一个) */
export function getSheet(
  result: WorkbookResult,
  sheet: string | undefined,
  pathForError: string,
): SheetResult {
  if (sheet === undefined) {
    const first = result.sheets[0];
    if (!first) throw new ExcelParseError('workbook 无 sheet', pathForError);
    return first;
  }
  const found = result.sheets.find((s) => s.name === sheet);
  if (!found) {
    throw new ExcelParseError(
      `sheet '${sheet}' 不存在;可用:${result.sheets.map((s) => s.name).join(', ')}`,
      pathForError,
    );
  }
  return found;
}

/**
 * 把 sheet 转成简单 markdown 表(供 LLM 输入)。
 * 第 1 行作 header(若 rows 非空)。
 */
export function sheetToMarkdown(sheet: SheetResult): string {
  if (sheet.rows.length === 0) return `(空 sheet: ${sheet.name})`;
  const lines: string[] = [];
  lines.push(`### Sheet: ${sheet.name}\n`);
  const header = sheet.rows[0] ?? [];
  lines.push('| ' + header.map(escapeMd).join(' | ') + ' |');
  lines.push('|' + header.map(() => '---').join('|') + '|');
  for (const row of sheet.rows.slice(1)) {
    lines.push('| ' + row.map(escapeMd).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function escapeMd(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
