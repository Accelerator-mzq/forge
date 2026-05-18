import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLegacyRequirements,
  validateLegacyRequirementsFile,
} from '../../../src/core/legacy-bridge/legacy-requirements.js';

async function tmpForge(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'lr-'));
  const forge = join(root, 'forge');
  await mkdir(forge, { recursive: true });
  return forge;
}

describe('loadLegacyRequirements', () => {
  it('文件不存在 → 返回 null', async () => {
    const forge = await tmpForge();
    expect(await loadLegacyRequirements(forge)).toBeNull();
  });

  it('读出合法 yaml', async () => {
    const forge = await tmpForge();
    await writeFile(
      join(forge, 'legacy-requirements.yaml'),
      `schema: forge-legacy-requirements/v1
requirements:
  - id: LR-0001
    title: 登录支持 2FA
    description: 系统应支持双因素认证
    status: unimplemented
    source: { document: docs/SRS.md, section: "3.2.1", kind: srs }
    evidence: []
    confidence: medium
    priority: high
    review: confirmed
    notes: ""
`,
      'utf8',
    );
    const file = await loadLegacyRequirements(forge);
    expect(file?.requirements[0]?.id).toBe('LR-0001');
    expect(file?.requirements[0]?.source.section).toBe('3.2.1');
  });
});

describe('validateLegacyRequirementsFile', () => {
  it('schema 字段错 → 抛错', () => {
    expect(() => validateLegacyRequirementsFile({ schema: 'wrong', requirements: [] })).toThrow(
      /schema/,
    );
  });

  it('status 越界 → 抛错', () => {
    const bad = {
      schema: 'forge-legacy-requirements/v1',
      requirements: [
        {
          id: 'LR-0001',
          title: 't',
          description: 'd',
          status: 'done',
          source: { document: 'a', section: '', kind: 'srs' },
          evidence: [],
          confidence: 'high',
          priority: null,
          review: 'pending',
          notes: '',
        },
      ],
    };
    expect(() => validateLegacyRequirementsFile(bad)).toThrow(/status/);
  });
});
