// tests/core/validate/change.test.ts — Task 17: validateChange 顶层校验测试
import { describe, it, expect } from 'vitest';
import { validateChange } from '../../../src/core/validate/index.js';
import { resolve } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 使用 Tasks 8-10 已建立的 valid-change fixture
const validChange = resolve(__dirname, '../../fixtures/valid-change');

// 生成临时目录的 helper 函数，支持覆盖 proposal、design、tasks、specs 文件
function makeChangeDir(overrides: {
  proposal?: string;
  design?: string;
  tasks?: string;
  specs?: Record<string, string>;
}): string {
  const d = mkdtempSync(join(tmpdir(), 'forge-validate-change-'));
  writeFileSync(
    join(d, 'proposal.md'),
    overrides.proposal ?? '# Title\n\n## Why\nr\n\n## What\nw\n',
  );
  writeFileSync(join(d, 'design.md'), overrides.design ?? '# Design\n\n## Architecture\nx\n');
  writeFileSync(join(d, 'tasks.md'), overrides.tasks ?? '# T\n\n- [ ] t1: a\n');
  if (overrides.specs !== undefined) {
    mkdirSync(join(d, 'specs'));
    for (const [name, content] of Object.entries(overrides.specs)) {
      writeFileSync(join(d, 'specs', name), content);
    }
  } else {
    mkdirSync(join(d, 'specs'));
    writeFileSync(
      join(d, 'specs', 's.md'),
      '# S\n\n## Scenario: x\n\n**Given** g\n**When** w\n**Then** t\n',
    );
  }
  return d;
}

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

  // Plan 3 Task 2: partial-failure 测试

  it('returns errors when proposal is invalid (missing why)', async () => {
    const d = makeChangeDir({ proposal: '# Title\n\n## What\nw\n' }); // 没 Why
    try {
      const r = await validateChange(d);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.field === 'why')).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('returns errors when specs/ is empty', async () => {
    const d = makeChangeDir({ specs: {} }); // specs/ 存在但空
    try {
      const r = await validateChange(d);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.message.includes('no spec files'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('returns errors when tasks have duplicate id', async () => {
    const d = makeChangeDir({
      tasks: '# T\n\n- [ ] t1: a\n- [x] t1: b\n', // duplicate id
    });
    try {
      const r = await validateChange(d);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.message.includes('duplicate'))).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
