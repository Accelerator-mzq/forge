import { describe, it, expect } from 'vitest';
import { SuperpowersSource } from '../../../src/core/migrate/sources/superpowers.js';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  ScanResult,
  ClassificationPlan,
  ScannedFile,
} from '../../../src/core/migrate/types.js';

describe('SuperpowersSource.detect', () => {
  it('found=false 当 docs/superpowers/ 缺', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-detect-'));
    const src = new SuperpowersSource();
    const r = await src.detect(tmp);
    expect(r.found).toBe(false);
    await rm(tmp, { recursive: true, force: true });
  });

  it('found=true 当 docs/superpowers/{specs,plans}/ 存在', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-sp-detect-'));
    await mkdir(join(tmp, 'docs/superpowers/specs'), { recursive: true });
    await mkdir(join(tmp, 'docs/superpowers/plans'), { recursive: true });
    const src = new SuperpowersSource();
    const r = await src.detect(tmp);
    expect(r.found).toBe(true);
    expect(r.rootPath).toBe(join(tmp, 'docs/superpowers'));
    await rm(tmp, { recursive: true, force: true });
  });
});
