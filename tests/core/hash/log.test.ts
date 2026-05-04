import { describe, it, expect } from 'vitest';
import { computeLogHash } from '../../../src/core/hash/index.js';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('computeLogHash', () => {
  it('hashes a log file', async () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-loghash-'));
    const f = join(d, 'log.txt');
    writeFileSync(f, 'PASS test 1\nPASS test 2\n');
    try {
      const h = await computeLogHash(f);
      expect(h).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('throws when file does not exist', async () => {
    await expect(computeLogHash('/nonexistent/path.log')).rejects.toThrow();
  });
});
