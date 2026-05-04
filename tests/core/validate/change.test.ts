// tests/core/validate/change.test.ts — Task 17: validateChange 顶层校验测试
import { describe, it, expect } from 'vitest';
import { validateChange } from '../../../src/core/validate/index.js';
import { resolve } from 'node:path';

// 使用 Tasks 8-10 已建立的 valid-change fixture
const validChange = resolve(__dirname, '../../fixtures/valid-change');

describe('validateChange', () => {
  it('returns valid=true for the valid-change fixture', async () => {
    const r = await validateChange(validChange);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('returns errors when proposal is missing', async () => {
    const r = await validateChange('/nonexistent/path');
    expect(r.valid).toBe(false);
  });
});
