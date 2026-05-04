// Marker YAML 解析器 — 只负责"语法解析",不验证字段值(那是 marker-schema.ts 的事)

import { parse as parseYAML } from 'yaml';
import type { AnyMarker } from './types.js';

export class MarkerParseError extends Error {
  constructor(
    message: string,
    // override 覆盖 Error 基类的 cause 属性(TS 4.3+)
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'MarkerParseError';
  }
}

/**
 * 解析任一 marker YAML。
 * 不验证字段值合法性,只返回 unknown shape 的对象。
 * 调用方应紧接着用 validateMarkerSchema(...)。
 */
export function parseMarker(text: string): AnyMarker {
  let parsed: unknown;
  try {
    parsed = parseYAML(text);
  } catch (err) {
    throw new MarkerParseError('YAML parse failed', err);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new MarkerParseError('marker must be a YAML mapping');
  }
  return parsed as AnyMarker;
}
