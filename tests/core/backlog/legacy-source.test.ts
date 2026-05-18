import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBacklog } from '../../../src/core/backlog/index.js';

async function tmpForge(): Promise<string> {
  const forge = join(await mkdtemp(join(tmpdir(), 'bk-')), 'forge');
  await mkdir(forge, { recursive: true });
  return forge;
}

describe('buildBacklog 空 archive 容错', () => {
  it('forge/changes/archive/ 不存在 → buildBacklog 不抛错', async () => {
    const forge = await tmpForge();
    await expect(buildBacklog(forge)).resolves.toBeDefined();
  });
});
