// tests/core/legacy-bridge/regenerator-dualpath.test.ts
import { describe, it, expect } from 'vitest';
import { buildRegenerateRound1Tasks } from '../../../src/core/legacy-bridge/regenerator.js';
import type { LegacyAnchor } from '../../../src/core/legacy-bridge/types.js';

const auth: LegacyAnchor = { role: 'requirements', path: 'docs/SRS.md', authoritative: true };

describe('buildRegenerateRound1Tasks', () => {
  it('产 2 个 LlmTask:regenerate + extract-facts', async () => {
    const tasks = await buildRegenerateRound1Tasks(
      {
        role: 'requirements',
        authoritative: auth,
        forgeVersion: '1.4.0',
        regenLicense: 'derived-from-source',
      },
      async () => '老 SRS 正文,含密钥 AKIA1234567890ABCDEF',
    );
    expect(tasks.map((t) => t.op).sort()).toEqual(['extract-facts', 'regenerate']);
    for (const t of tasks) expect(t.prompt).not.toContain('AKIA1234567890ABCDEF'); // redact
  });

  it('metadata-only role 抛 RegenOutputError', async () => {
    await expect(
      buildRegenerateRound1Tasks(
        {
          role: 'acceptance-report',
          authoritative: auth,
          forgeVersion: '1.4.0',
          regenLicense: 'derived-from-source',
        },
        async () => 'x',
      ),
    ).rejects.toThrow(/metadata-only/);
  });
});
