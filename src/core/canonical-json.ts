// canonical-json.ts:JCS(JSON Canonicalization Scheme,RFC 8785)序列化器
// v1.0 所有 hash payload 序列化路径必须经过本模块,确保跨平台 / 跨版本字节序列一致。
// 依赖 canonicalize npm 包(IETF RFC 8785 reference impl)。

import canonicalizeImpl from 'canonicalize';
import { createHash } from 'node:crypto';

/**
 * 序列化为 JCS canonical JSON。
 * - 字段按 lexicographic 排序
 * - 字符串 UTF-8 + 标准 escape
 * - 数值 IEEE 754 double + ECMA-262 数值字符串化
 * - 拒绝 Date / undefined / function 等非 JSON 值
 */
export function canonicalize(value: unknown): string {
  // canonicalize 包对非 JSON 值会返回 undefined,需手工拒绝
  if (containsNonJsonValue(value)) {
    throw new Error('canonicalize: input contains non-JSON value (Date / undefined / function)');
  }
  const result = canonicalizeImpl(value);
  if (result === undefined) {
    throw new Error('canonicalize: serialization returned undefined');
  }
  return result;
}

/** 计算 JCS payload 的 SHA256 hex hash */
export function canonicalHash(value: unknown): string {
  const json = canonicalize(value);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

function containsNonJsonValue(v: unknown): boolean {
  if (v === undefined) return true;
  if (typeof v === 'function') return true;
  if (v instanceof Date) return true;
  if (Array.isArray(v)) return v.some(containsNonJsonValue);
  if (v && typeof v === 'object') {
    return Object.values(v).some(containsNonJsonValue);
  }
  return false;
}
