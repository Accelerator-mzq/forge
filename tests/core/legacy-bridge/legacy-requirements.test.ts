import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLegacyRequirements,
  validateLegacyRequirementsFile,
  finalizeLegacyRequirements,
} from '../../../src/core/legacy-bridge/legacy-requirements.js';
import type { LegacyRequirement } from '../../../src/core/legacy-bridge/legacy-requirements.js';

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

function req(partial: Partial<LegacyRequirement>): LegacyRequirement {
  return {
    id: '',
    title: 't',
    description: 'd',
    status: 'unimplemented',
    source: { document: 'docs/SRS.md', section: '1', kind: 'srs' },
    evidence: [],
    confidence: 'medium',
    priority: null,
    review: 'pending',
    notes: '',
    ...partial,
  };
}

describe('finalizeLegacyRequirements', () => {
  it('空 id 按 max(既有 LR-NNNN)+1 顺序分配,4 位零填充', () => {
    const draft = [
      req({ id: 'LR-0007', title: '已有' }),
      req({ id: '', title: '新1' }),
      req({ id: '', title: '新2' }),
    ];
    const out = finalizeLegacyRequirements(draft);
    expect(out.requirements.map((r) => r.id)).toEqual(['LR-0007', 'LR-0008', 'LR-0009']);
  });

  it('整表 review 置 confirmed', () => {
    const out = finalizeLegacyRequirements([req({ id: 'LR-0001', review: 'pending' })]);
    expect(out.requirements[0]?.review).toBe('confirmed');
  });

  it('无既有 ID 时从 LR-0001 起', () => {
    const out = finalizeLegacyRequirements([req({}), req({})]);
    expect(out.requirements.map((r) => r.id)).toEqual(['LR-0001', 'LR-0002']);
  });

  it('幂等:对已 finalize 的结果再 finalize,ID 不变', () => {
    const once = finalizeLegacyRequirements([req({}), req({ id: 'LR-0003' })]);
    const twice = finalizeLegacyRequirements(once.requirements);
    expect(twice.requirements.map((r) => r.id)).toEqual(once.requirements.map((r) => r.id));
  });
});
