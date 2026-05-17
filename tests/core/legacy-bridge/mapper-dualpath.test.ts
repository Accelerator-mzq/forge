// tests/core/legacy-bridge/mapper-dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMapTask } from '../../../src/core/legacy-bridge/mapper.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'SRS.md'), '# 需求规格\nAKIA1234567890ABCDEF', 'utf8');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('buildMapTask', () => {
  it('产 1 个 op=map 的 LlmTask,preview 已 redact', async () => {
    const task = await buildMapTask({ projectRoot: dir, mode: 'overwrite' });
    expect(task.op).toBe('map');
    expect(task.prompt).toContain('docs/SRS.md');
    expect(task.prompt).not.toContain('AKIA1234567890ABCDEF'); // redact 生效
    expect(task.outputPath).toContain('legacy-bridge-result-map');
  });
});
