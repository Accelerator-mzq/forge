// severity-mapper.test.ts — mapCodexToForge / mapForgeToForgeTier 单元测试
// 4 个测试:codex 4 种 severity 映射 + forge 4 级→3 级映射

import { describe, it, expect } from 'vitest';
import {
  mapCodexToForge,
  mapForgeToForgeTier,
} from '../../../src/core/stage-extensions/severity-mapper.js';
import type { SeverityMap } from '../../../src/core/stage-extensions/types.js';
import type { StageExtensionsDefaults } from '../../../src/core/schema/types.js';

// 默认 severity_map(与 STAGE_EXTENSIONS_DEFAULTS 保持一致)
const severityMap: SeverityMap = {
  critical: 'BLOCKER',
  high: 'MAJOR',
  medium: 'MINOR',
  low: 'NIT',
};

// 默认 severity_map_to_forge
const severityMapToForge: StageExtensionsDefaults['severity_map_to_forge'] = {
  BLOCKER: 'critical',
  MAJOR: 'critical',
  MINOR: 'warning',
  NIT: 'suggestion',
};

describe('severity-mapper', () => {
  describe('mapCodexToForge', () => {
    it('maps critical → BLOCKER', () => {
      // codex critical 应映射为 forge BLOCKER
      expect(mapCodexToForge('critical', severityMap)).toBe('BLOCKER');
    });

    it('maps high → MAJOR', () => {
      // codex high 应映射为 forge MAJOR
      expect(mapCodexToForge('high', severityMap)).toBe('MAJOR');
    });

    it('maps medium → MINOR', () => {
      // codex medium 应映射为 forge MINOR
      expect(mapCodexToForge('medium', severityMap)).toBe('MINOR');
    });

    it('maps low → NIT', () => {
      // codex low 应映射为 forge NIT
      expect(mapCodexToForge('low', severityMap)).toBe('NIT');
    });
  });

  describe('mapForgeToForgeTier', () => {
    it('maps BLOCKER → critical', () => {
      // forge BLOCKER 应映射为 forge 3 级 critical
      expect(mapForgeToForgeTier('BLOCKER', severityMapToForge)).toBe('critical');
    });

    it('maps MAJOR → critical', () => {
      // forge MAJOR 也映射为 critical(默认配置)
      expect(mapForgeToForgeTier('MAJOR', severityMapToForge)).toBe('critical');
    });

    it('maps MINOR → warning', () => {
      // forge MINOR 应映射为 warning
      expect(mapForgeToForgeTier('MINOR', severityMapToForge)).toBe('warning');
    });

    it('maps NIT → suggestion', () => {
      // forge NIT 应映射为 suggestion
      expect(mapForgeToForgeTier('NIT', severityMapToForge)).toBe('suggestion');
    });
  });
});
