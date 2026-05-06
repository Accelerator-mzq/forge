// ForgeConfig.legacy_bridge 段解析测试 — Plan 7 Phase A Task A3
// 验证 brownfield onboarding 全局策略(决策 #18/#19/#21/#22)透传到 parseConfig 结果

import { describe, it, expect } from 'vitest';
import { parseConfig } from '../../../src/core/parse/yaml.js';

describe('parseConfig - legacy_bridge 段(Plan 7)', () => {
  it('完整 legacy_bridge 段被透传', () => {
    const yaml = `
schema: forge-spec-driven/v1
legacy_bridge:
  allow_llm_calls: true
  enforce_sync: true
  auto_resolve_cross_anchor: false
  regen_license: derived-from-source
  provider: anthropic
`;
    const config = parseConfig(yaml);
    expect(config.legacy_bridge?.allow_llm_calls).toBe(true);
    expect(config.legacy_bridge?.enforce_sync).toBe(true);
    expect(config.legacy_bridge?.auto_resolve_cross_anchor).toBe(false);
    expect(config.legacy_bridge?.regen_license).toBe('derived-from-source');
    expect(config.legacy_bridge?.provider).toBe('anthropic');
  });

  it('legacy_bridge 缺失 → 字段为 undefined(向后兼容)', () => {
    const yaml = 'schema: forge-spec-driven/v1\n';
    const config = parseConfig(yaml);
    expect(config.legacy_bridge).toBeUndefined();
  });

  it('legacy_bridge 部分字段缺失 → 仅保留已声明字段', () => {
    const yaml = `
schema: forge-spec-driven/v1
legacy_bridge:
  allow_llm_calls: true
`;
    const config = parseConfig(yaml);
    expect(config.legacy_bridge?.allow_llm_calls).toBe(true);
    expect(config.legacy_bridge?.enforce_sync).toBeUndefined();
  });
});
