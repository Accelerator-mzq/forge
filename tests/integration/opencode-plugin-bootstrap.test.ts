// tests/integration/opencode-plugin-bootstrap.test.ts
// Task B2: 验证 .opencode/plugins/forge.js 注入 forge plugin root 行
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('.opencode/plugins/forge.js bootstrap 注入 plugin root', () => {
  it('forge.js 源码含 `forge plugin root:` 注入逻辑', () => {
    const src = readFileSync(join(process.cwd(), '.opencode/plugins/forge.js'), 'utf8');
    expect(src.includes('forge plugin root:')).toBe(true);
    // 用 path.resolve(__dirname, '../..') 算仓库根绝对路径
    expect(/forge plugin root:.*resolve/s.test(src) || src.includes('forgeRepoRoot')).toBe(true);
  });
});
