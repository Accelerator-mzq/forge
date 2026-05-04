// smoke 测试 — 验证 import 工作 + 版本常量
import { describe, it, expect } from 'vitest';
import { FORGE_VERSION } from '../src/index.js';

describe('smoke', () => {
  it('should export FORGE_VERSION as a string', () => {
    expect(typeof FORGE_VERSION).toBe('string');
    expect(FORGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
