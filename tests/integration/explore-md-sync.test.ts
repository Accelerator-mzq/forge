// explore-md-sync.test.ts — plan-9f Task 3 md5 sync 守护
// 守住根级 commands/explore.md 与模板 src/core/templates/commands/explore.md 内容完全一致
// 沿 plan-9e2 Task 5 archive-md-sync.test.ts 模板;沿 plan-9j Task 6.2 slash 模板双同步模式

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

describe('explore.md 双文件同步守护 — plan-9f Task 3', () => {
  it('根级 commands/explore.md 与模板 src/core/templates/commands/explore.md md5 完全一致', () => {
    const rootPath = join(process.cwd(), 'commands', 'explore.md');
    const tmplPath = join(process.cwd(), 'src', 'core', 'templates', 'commands', 'explore.md');
    const rootMd5 = createHash('md5').update(readFileSync(rootPath)).digest('hex');
    const tmplMd5 = createHash('md5').update(readFileSync(tmplPath)).digest('hex');
    expect(rootMd5).toBe(tmplMd5);
  });
});
