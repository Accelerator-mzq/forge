// tests/core/legacy-bridge/llm-task-io.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildManifest,
  writeManifest,
  readManifest,
  manifestPath,
} from '../../../src/core/legacy-bridge/llm-task.js';
import type { LlmTask } from '../../../src/core/legacy-bridge/llm-task.js';

const task: LlmTask = {
  op: 'map',
  inputs: [],
  prompt: 'p',
  model: 'm',
  outputSchema: 's',
  outputPath: 'o',
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeManifest / readManifest', () => {
  it('写后读回 manifest,verify 通过', async () => {
    const m = buildManifest({ op: 'map', round: 1, tasks: [task], forgeVersion: '1.4.0' });
    await writeManifest(dir, m);
    const back = await readManifest(dir, 'map');
    expect(back).not.toBeNull();
    expect(back!.manifest_hash).toBe(m.manifest_hash);
  });

  it('磁盘上被篡改 → readManifest 抛带「篡改」字样的错', async () => {
    const m = buildManifest({ op: 'map', round: 1, tasks: [task], forgeVersion: '1.4.0' });
    await writeManifest(dir, m);
    const raw = JSON.parse(await readFile(manifestPath(dir, 'map'), 'utf8'));
    raw.round = 99; // 篡改但不重算 hash
    await writeFile(manifestPath(dir, 'map'), JSON.stringify(raw), 'utf8');
    await expect(readManifest(dir, 'map')).rejects.toThrow(/篡改|不匹配/);
  });

  it('manifest 不存在 → readManifest 返回 null', async () => {
    expect(await readManifest(dir, 'index')).toBeNull();
  });
});
