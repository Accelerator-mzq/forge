import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runExtractCommand } from '../../../src/cli/commands/legacy-bridge.js';

/** 建一个带 forge/ + opt-in 配置的临时项目 */
async function tmpProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'extract-cli-'));
  const forge = join(root, 'forge');
  await mkdir(join(forge, '.cache'), { recursive: true });
  // D2 执行序在 E1 之前;建一个空 archive 目录使 --finalize 调的 generateBacklog 跑得通
  await mkdir(join(forge, 'changes', 'archive'), { recursive: true });
  await writeFile(
    join(root, 'forge', 'config.yaml'),
    'legacy_bridge:\n  allow_llm_calls: true\n',
    'utf8',
  );
  await writeFile(join(root, 'docs-SRS.md'), '# SRS\n需求一', 'utf8');
  return root;
}

describe('runExtractCommand', () => {
  it('--apply 与 --api 互斥 → 返回错误码', async () => {
    const root = await tmpProject();
    const code = await runExtractCommand({
      projectRoot: root,
      apply: true,
      api: true,
      finalize: false,
    });
    expect(code).not.toBe(0);
  });

  it('--apply 与 --finalize 互斥 → 返回错误码', async () => {
    const root = await tmpProject();
    const code = await runExtractCommand({
      projectRoot: root,
      apply: true,
      api: false,
      finalize: true,
    });
    expect(code).not.toBe(0);
  });

  it('--finalize 找不到 draft → 返回错误码', async () => {
    const root = await tmpProject();
    const code = await runExtractCommand({
      projectRoot: root,
      apply: false,
      api: false,
      finalize: true,
    });
    expect(code).not.toBe(0);
  });

  it('--finalize 有 draft → 写 legacy-requirements.yaml,分配 ID', async () => {
    const root = await tmpProject();
    await writeFile(
      join(root, 'forge', 'legacy-requirements-draft.yaml'),
      `schema: forge-legacy-requirements/v1
requirements:
  - id: ""
    title: 需求一
    description: d
    status: unimplemented
    source: { document: docs-SRS.md, section: "1", kind: srs }
    evidence: []
    confidence: medium
    priority: null
    review: pending
    notes: ""
`,
      'utf8',
    );
    const code = await runExtractCommand({
      projectRoot: root,
      apply: false,
      api: false,
      finalize: true,
    });
    expect(code).toBe(0);
    const finalized = await readFile(join(root, 'forge', 'legacy-requirements.yaml'), 'utf8');
    expect(finalized).toContain('LR-0001');
    expect(finalized).toContain('review: confirmed');
  });

  it('--finalize 后 backlog 刷新失败 → 返回 PARTIAL_SUCCESS(3),yaml 仍写成功', async () => {
    const root = await tmpProject();
    await writeFile(
      join(root, 'forge', 'legacy-requirements-draft.yaml'),
      `schema: forge-legacy-requirements/v1
requirements:
  - id: ""
    title: 需求一
    description: d
    status: unimplemented
    source: { document: docs-SRS.md, section: "1", kind: srs }
    evidence: []
    confidence: medium
    priority: null
    review: pending
    notes: ""
`,
      'utf8',
    );
    // 把 forge/backlog 占成普通文件 → generateBacklog 的 mkdir 抛错(无需 mock)
    await writeFile(join(root, 'forge', 'backlog'), 'occupied', 'utf8');
    const code = await runExtractCommand({
      projectRoot: root,
      apply: false,
      api: false,
      finalize: true,
    });
    expect(code).toBe(3); // LB_EXIT_PARTIAL_SUCCESS —— finalize 成功但 backlog 刷新失败
    expect(existsSync(join(root, 'forge', 'legacy-requirements.yaml'))).toBe(true);
  });
});
