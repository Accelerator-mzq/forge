// tests/integration/apply-md-sync.test.ts — plan-9h Task 2 md5 sync guard
// 沿 archive-md-sync.test.ts(plan-9e2)/ explore-md-sync.test.ts(plan-9f)同模板
// 守护 commands/apply.md 与 src/core/templates/commands/apply.md md5 完全一致

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

function md5(filePath: string): string {
  const content = readFileSync(filePath);
  return createHash('md5').update(content).digest('hex');
}

describe('apply.md md5 sync guard(plan-9h Task 2)', () => {
  it('commands/apply.md 与 src/core/templates/commands/apply.md md5 完全一致', () => {
    const root = process.cwd();
    const rootMd = join(root, 'commands', 'apply.md');
    const templateMd = join(root, 'src', 'core', 'templates', 'commands', 'apply.md');

    const rootMd5 = md5(rootMd);
    const templateMd5 = md5(templateMd);

    expect(rootMd5).toBe(templateMd5);
  });
});
