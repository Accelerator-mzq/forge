// forge/config.yaml 解析器

import { parse as parseYAML } from 'yaml';
import type { ForgeConfig } from '../schema/index.js';

/** YAML 解析失败或必需字段缺失时抛此 error */
export class ConfigParseError extends Error {
  // cause 使用 override 避免与 Error.cause 冲突
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ConfigParseError';
  }
}

/**
 * 解析 forge/config.yaml 文本。
 * - YAML 解析失败 → ConfigParseError
 * - 缺 schema 字段 → ConfigParseError("missing schema field")
 */
export function parseConfig(text: string): ForgeConfig {
  let parsed: unknown;
  try {
    // 调用 yaml v2 的 parse，strict 模式下格式错误会抛异常
    parsed = parseYAML(text);
  } catch (err) {
    throw new ConfigParseError('YAML parse failed', err);
  }

  // 根节点必须是 mapping（对象）
  if (!parsed || typeof parsed !== 'object') {
    throw new ConfigParseError('config.yaml must be a YAML mapping at root');
  }

  const obj = parsed as Record<string, unknown>;

  // schema 字段是必填项
  if (typeof obj.schema !== 'string') {
    throw new ConfigParseError('missing schema field (string)');
  }

  // 先转 unknown 再转 ForgeConfig，schema 已验证为 string
  return obj as unknown as ForgeConfig;
}
