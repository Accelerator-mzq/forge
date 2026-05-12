// src/core/archive/legacy-exemption.ts — plan-9j Task 3
// 沿 design §3.4.4.1 精确豁免表 + 反向加固
// 13 不变量中 #1-8/10/13 跳过;#9/11/12 保留 + 反向加固;legacy=true ⊥ (created>=1.0.0 且 resigned 缺失) 互斥(v6 修订 resigned-aware)

import { type ValidationResult, ok, failed, mergeResults } from '../validate/types.js';

/** v0.4 marker 视为 legacy 的 semver 上界(<1.0.0) */
const V10_SEMVER_RE = /^[1-9]\d*\./; // 主版本 >=1 即视为 v1.0.0+

/**
 * legacy 精确豁免校验(沿 design §3.4.4.1)
 *
 * 规则:
 * 1. 若 process_evidence_unavailable_legacy != true → 非 legacy,本函数不裁决,返通过(strict path 处理)
 * 2. 若是 legacy + created_by_tool_version >=1.0.0 → 互斥拒签
 * 3. 反向加固:legacy marker **不应该**有 tdd_exemption / process_verification_mode 字段
 *
 * @param marker .verify-passed / .review-passed 解析后 Record
 * @param file 可选错误报告用 marker 文件路径
 */
export function validateLegacyExemption(
  marker: Record<string, unknown>,
  file?: string,
): ValidationResult {
  // 1. 字段类型严格校验
  const legacyMeta = marker.process_evidence_unavailable_legacy;
  if (legacyMeta !== undefined && typeof legacyMeta !== 'boolean') {
    return failed({
      artifact: 'marker',
      field: 'process_evidence_unavailable_legacy',
      message: `process_evidence_unavailable_legacy must be boolean or omitted,实际:${typeof legacyMeta}`,
      file,
    });
  }

  // 2. 非 legacy → 本函数不裁决,返通过(strict path 处理)
  if (legacyMeta !== true) {
    return ok();
  }

  const results: ValidationResult[] = [];

  // 3. 互斥校验(v3 BLOCKER 2 resigned-aware):legacy=true ⊥ (created>=1.0.0 且 resigned 缺失)
  // 沿 design §3.4.4.1 修订规则:resign 后 marker(含 resigned_by_tool_version)允许 legacy + version 共存
  const version = marker.created_by_tool_version;
  const resignedVersion = marker.resigned_by_tool_version;
  if (
    typeof version === 'string' &&
    V10_SEMVER_RE.test(version) &&
    typeof resignedVersion !== 'string'
  ) {
    results.push(
      failed({
        artifact: 'marker',
        field: 'process_evidence_unavailable_legacy',
        message:
          `legacy=true 与 (created_by_tool_version >= 1.0.0 且 resigned_by_tool_version 缺失)互斥(实际 created=${version});` +
          `**原生 v1.0** 创建的 marker 不允许 legacy 标记;resign 后 marker 应同时含 resigned 字段。沿 design §3.4.4.1 修订 + v2 BLOCKER 2 选项 C`,
        file,
      }),
    );
  }

  // v3 BLOCKER 6 反向加固 #9 placeholder:legacy=true 时若含 process_evidence 整字段 → 拒签
  // 沿 design §3.4.4.1 line 1798 关键不变量保留 + 9g 未完成 fail-closed
  if (marker.process_evidence !== undefined && marker.process_evidence !== null) {
    results.push(
      failed({
        artifact: 'marker',
        field: 'process_evidence',
        message:
          `legacy marker 不应该有 process_evidence 整字段(legacy 没走 v1.0 process_evidence 协议;` +
          `若有则疑似 tamper 或工具伪造,fence 拒签 — 沿 design §3.4.4.1 #9 反向加固,9g 未完成时 fail-closed)`,
        file,
      }),
    );
  }

  // 4. 反向加固 #11:legacy marker 不应有 tdd_exemption 字段
  if (marker.tdd_exemption !== undefined && marker.tdd_exemption !== null) {
    results.push(
      failed({
        artifact: 'marker',
        field: 'tdd_exemption',
        message:
          `tdd_exemption 字段不允许出现在 legacy marker 中(疑似 tamper:legacy marker 没走 v1.0 协议);` +
          `沿 design §3.4.4.1 不变量 #11 反向加固`,
        file,
      }),
    );
  }

  // 5. 反向加固 #12:legacy marker 不应有 process_verification_mode 字段
  if (marker.process_verification_mode !== undefined && marker.process_verification_mode !== null) {
    results.push(
      failed({
        artifact: 'marker',
        field: 'process_verification_mode',
        message:
          `process_verification_mode 字段不允许出现在 legacy marker 中(同上反向加固);` +
          `沿 design §3.4.4.1 不变量 #12`,
        file,
      }),
    );
  }

  return mergeResults(...results);
}
