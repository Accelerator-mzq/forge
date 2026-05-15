// stage-extensions-commands-sync.test.ts — plan-stage-extensions Task 6 sync 守护
// 守住 5 个 commands/*.md 末尾段存在 + <STAGE> 占位正确替换 + 模板副本 md5 一致

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

// 5 个文件及其对应的 stage 名映射
const STAGE_MAP = [
  { file: 'brainstorm.md', stage: 'brainstorming' },
  { file: 'propose.md', stage: 'propose' },
  { file: 'apply.md', stage: 'apply_critical_plan_review' },
  { file: 'review.md', stage: 'review' },
  { file: 'verify.md', stage: 'verify' },
] as const;

describe('stage-extensions commands 末尾段同步守护 — plan-stage-extensions Task 6', () => {
  // (a) 根级与模板副本 md5 完全一致
  for (const { file } of STAGE_MAP) {
    it(`${file}: 根级 commands/${file} 与模板 src/core/templates/commands/${file} md5 完全一致`, () => {
      const rootPath = join(process.cwd(), 'commands', file);
      const tmplPath = join(process.cwd(), 'src', 'core', 'templates', 'commands', file);
      const rootMd5 = createHash('md5').update(readFileSync(rootPath)).digest('hex');
      const tmplMd5 = createHash('md5').update(readFileSync(tmplPath)).digest('hex');
      expect(rootMd5).toBe(tmplMd5);
    });
  }

  // (b) 末尾段存在 + <STAGE> 占位正确替换
  for (const { file, stage } of STAGE_MAP) {
    it(`${file}: 末尾段含 "stage-extensions run" 字面`, () => {
      const rootPath = join(process.cwd(), 'commands', file);
      const content = readFileSync(rootPath, 'utf8');
      expect(content).toContain('stage-extensions run');
    });

    it(`${file}: 末尾段含 "--stage ${stage}" 字面(正确替换 <STAGE>)`, () => {
      const rootPath = join(process.cwd(), 'commands', file);
      const content = readFileSync(rootPath, 'utf8');
      expect(content).toContain(`--stage ${stage}`);
    });

    it(`${file}: 末尾段不含残留 "<STAGE>" 未替换占位`, () => {
      const rootPath = join(process.cwd(), 'commands', file);
      const content = readFileSync(rootPath, 'utf8');
      // 确认 <STAGE> 字面已全部替换,不含未替换的残留
      expect(content).not.toContain('<STAGE>');
    });

    it(`${file}: 末尾段含 "Stage extensions hook" 标题`, () => {
      const rootPath = join(process.cwd(), 'commands', file);
      const content = readFileSync(rootPath, 'utf8');
      expect(content).toContain('## (可选)Stage extensions hook — Tier 1 Claude Code only');
    });
  }
});
