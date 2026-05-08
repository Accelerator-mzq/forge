// 文件读取 + utf8 强制 + 可选 chardet 探测 — Plan 7 Phase B2
// 决策 / spec §4.1:Windows 老项目常见 GBK 转 markdown,强制 utf8 读;mojibake 探测仅 dry-run 用

import { readFile } from 'node:fs/promises';

/** 读文件结果,含原始字节用于 dry-run 时探测疑似编码 */
export interface ReadAnchorResult {
  /** UTF-8 字符串内容 */
  text: string;
  /** 原始字节(dry-run 时用于探测) */
  raw: Buffer;
  /** 是否含 mojibake 嫌疑(简易 heuristic:含 U+FFFD 或大量孤立 surrogate) */
  hasMojibake: boolean;
  /** 行尾(LF / CRLF) */
  lineEnding: 'LF' | 'CRLF' | 'mixed' | 'none';
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

/** 检测行尾(spec §5.5 windows-crlf fixture) */
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
 * 用 chardet 探测疑似编码(可选依赖,缺失时 detectedEncoding='unknown')。
 * spec §4.1 (M-3) dry-run 输出文件路径 + 疑似编码 + mojibake 段前后 80 字符 hex/text 对照。
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
  } catch {
    detectedEncoding = 'chardet-not-installed';
  }

  let mojibakeContext: string | undefined;
  if (result.hasMojibake) {
    // 找到第一个 mojibake 标记位置
    const idx = result.text.indexOf('�');
    // 获取前 80 字符
    const before = result.text.slice(Math.max(0, idx - 80), idx);
    // 获取后 80 字符
    const after = result.text.slice(idx, Math.min(result.text.length, idx + 80));
    // 格式化输出
    mojibakeContext = `[before 80]: ${JSON.stringify(before)}\n[after 80]:  ${JSON.stringify(after)}`;
  }

  return { path, detectedEncoding, mojibakeContext };
}
