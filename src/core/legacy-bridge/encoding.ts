// 文件读取 + utf8 强制 + 可选 chardet 探测 — Plan 7 Phase B2
// 决策 / spec §4.1:Windows 老项目常见 GBK 转 markdown,强制 utf8 读;mojibake 探测仅 dry-run 用

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import type { LegacyAnchor } from './types.js';
import { parseWorkbook, getSheet, sheetToMarkdown, ExcelParseError } from './excel.js';

/** 读文件结果,含原始字节用于 dry-run 时探测疑似编码 */
export interface ReadAnchorResult {
  /** UTF-8 字符串内容 */
  text: string;
  /** 原始字节(dry-run 时用于探测) */
  raw: Buffer;
  /** 是否含 mojibake 嫌疑(简易 heuristic:含 U+FFFD 替换字符) */
  hasMojibake: boolean;
  /** 行尾(LF / CRLF) */
  lineEnding: 'LF' | 'CRLF' | 'mixed' | 'none';
}

/**
 * 把 anchor 文件读为 LLM 输入文本(支持 .md / .txt / .csv / .xlsx)。
 *
 * 路径以 .xlsx 结尾时走 exceljs 解析 + 转 markdown 表格;
 * 其他扩展名走 readAnchorFile(纯 utf8 文本)。
 *
 * spec §6.5 + 决策 §4.1:Excel 含 chart / pivot / formula 等不支持特性时抛 ExcelParseError,
 * 引导用户在 Excel 另存为 .csv 后改 anchors.yaml。
 *
 * 提取自 Plan 7 Phase B(原各 caller 私有 helper),Phase F follow-up 统一公共入口
 * 让 dry-run / index / regenerate 三个路径走同一逻辑(避免 dry-run 不真 parse Excel)。
 */
export async function readAnchorAsText(anchor: LegacyAnchor): Promise<string> {
  const ext = extname(anchor.path).toLowerCase();
  if (ext === '.xlsx') {
    const wb = await parseWorkbook(anchor.path);
    const sheet = getSheet(wb, anchor.sheet, anchor.path);
    // 决策 §4.1:chart / pivot / formula 不支持时拒绝运行,引导导出 csv
    if (sheet.unsupportedFeatures.length > 0) {
      throw new ExcelParseError(
        `sheet '${sheet.name}' 含不支持特性(${sheet.unsupportedFeatures.join(', ')});请在 Excel 另存为 .csv 后改 anchors.yaml path 指向 .csv(决策 §4.1)`,
        anchor.path,
      );
    }
    return sheetToMarkdown(sheet);
  }
  const r = await readAnchorFile(anchor.path);
  return r.text;
}

/** 强制以 utf8 读老文档(spec §4.1 强制 encoding: utf8) */
export async function readAnchorFile(path: string): Promise<ReadAnchorResult> {
  // 读取原始字节
  const raw = await readFile(path);
  // 强制 utf8 解码
  const text = raw.toString('utf8');
  // 检测 mojibake 标记(U+FFFD 替换符)
  const hasMojibake = /�/.test(text);
  // 检测行尾类型
  const lineEnding = detectLineEnding(text);
  return { text, raw, hasMojibake, lineEnding };
}

/** 检测行尾(见 fixture tests/fixtures/legacy-bridge/windows-crlf-srs.md) */
export function detectLineEnding(text: string): ReadAnchorResult['lineEnding'] {
  // 计数 CRLF
  const crlf = (text.match(/\r\n/g) ?? []).length;
  // 计数 LF(但不是 CRLF 的一部分,使用反向查断言)
  const lfOnly = (text.match(/(?<!\r)\n/g) ?? []).length;
  // 判断行尾类型
  if (crlf === 0 && lfOnly === 0) return 'none';
  if (crlf > 0 && lfOnly > 0) return 'mixed';
  if (crlf > 0) return 'CRLF';
  return 'LF';
}

/** dry-run 时调,用 chardet(可选依赖)探测疑似编码 + 输出 mojibake 段前后 80 字节对照 */
export interface EncodingDryRunReport {
  path: string;
  detectedEncoding: string;
  mojibakeContext?: string;
}

/**
 * 用 chardet 探测疑似编码(可选依赖,缺失时 detectedEncoding='chardet-not-installed';
 * 运行时错误时 detectedEncoding='chardet-error: <msg>')。
 * spec §4.1 (M-3) dry-run 输出文件路径 + 疑似编码 + mojibake 段前后 80 字符 text + 80 字节 hex 对照。
 */
export async function dryRunEncodingProbe(
  path: string,
  result: ReadAnchorResult,
): Promise<EncodingDryRunReport> {
  let detectedEncoding = 'unknown';
  try {
    // chardet 是可选 devDep;运行时无则 fallback
    const chardet = (await import('chardet')) as { detect: (buf: Buffer) => string | null };
    detectedEncoding = chardet.detect(result.raw) ?? 'unknown';
  } catch (e) {
    // 区分模块缺失 vs 运行时错误,排查体验:用户看到 'chardet-not-installed' 时确知要装 chardet
    const code = (e as NodeJS.ErrnoException).code;
    if (
      code === 'ERR_MODULE_NOT_FOUND' ||
      code === 'MODULE_NOT_FOUND' ||
      code === 'ERR_CANNOT_FIND_MODULE'
    ) {
      detectedEncoding = 'chardet-not-installed';
    } else {
      detectedEncoding = `chardet-error: ${(e as Error).message}`;
    }
  }

  let mojibakeContext: string | undefined;
  if (result.hasMojibake) {
    // 仅取第一处 mojibake 作 context 锚点;多处 mojibake 时 caller 可重跑或扩 dryRun API
    const idx = result.text.indexOf('�');
    const beforeText = result.text.slice(Math.max(0, idx - 80), idx);
    const afterText = result.text.slice(idx, Math.min(result.text.length, idx + 80));
    // byte offset 换算:utf8 编码的字节数(注意 mojibake 字符 U+FFFD 在 utf8 是 3 字节,原始字节可能是任意 1-2 字节,
    // 这里给的是 mojibake-after-decode 视角下的 byte 位置,作 hex dump 锚点;实际原始 GBK 字节序与该位置略有偏移属可接受)
    const byteIdx = Buffer.byteLength(result.text.slice(0, idx), 'utf8');
    const beforeHex = result.raw.subarray(Math.max(0, byteIdx - 80), byteIdx).toString('hex');
    const afterHex = result.raw
      .subarray(byteIdx, Math.min(result.raw.length, byteIdx + 80))
      .toString('hex');
    mojibakeContext =
      `[before 80 text]: ${JSON.stringify(beforeText)}\n` +
      `[before 80 hex]:  ${beforeHex}\n` +
      `[after 80 text]:  ${JSON.stringify(afterText)}\n` +
      `[after 80 hex]:   ${afterHex}`;
  }

  return { path, detectedEncoding, mojibakeContext };
}
