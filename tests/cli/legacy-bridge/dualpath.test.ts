// tests/cli/legacy-bridge/dualpath.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { runMapCommand } from '../../../src/cli/commands/legacy-bridge.js';
import { writeAck } from '../../../src/core/legacy-bridge/ack.js';
import type { ForgeConfig } from '../../../src/core/schema/types.js';

const CONFIG_YAML = 'legacy_bridge:\n  allow_llm_calls: true\n';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-cli-'));
  await mkdir(join(dir, 'docs'), { recursive: true });
  await writeFile(join(dir, 'docs', 'SRS.md'), '# 需求', 'utf8');
  // opt-in gate fixture(Task 6.0):config + writeAck 写匹配 config_hash 的 ack 文件
  await mkdir(join(dir, 'forge'), { recursive: true });
  await writeFile(join(dir, 'forge', 'config.yaml'), CONFIG_YAML, 'utf8');
  await writeAck(join(dir, 'forge'), parseYaml(CONFIG_YAML) as ForgeConfig);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('runMapCommand 默认 agent 模式', () => {
  it('默认(无 flag)→ emit manifest 到 .cache,不调 LLM', async () => {
    const code = await runMapCommand({
      projectRoot: dir,
      mode: 'overwrite',
      apply: false,
      api: false,
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', '.cache', 'legacy-bridge-task-map.json'))).toBe(true);
  });

  it('--apply 模式:喂 agent 结果文件 → 产 draft yaml', async () => {
    await runMapCommand({ projectRoot: dir, mode: 'overwrite', apply: false, api: false }); // 先 emit
    await writeFile(
      join(dir, 'forge', '.cache', 'legacy-bridge-result-map.json'),
      JSON.stringify({ text: JSON.stringify([{ path: 'docs/SRS.md', role: 'requirements' }]) }),
      'utf8',
    );
    const code = await runMapCommand({
      projectRoot: dir,
      mode: 'overwrite',
      apply: true,
      api: false,
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, 'forge', 'legacy-anchors-draft.yaml'))).toBe(true);
  });

  it('--apply 但无 manifest → 返回非 0 exit code', async () => {
    const code = await runMapCommand({
      projectRoot: dir,
      mode: 'overwrite',
      apply: true,
      api: false,
    });
    expect(code).not.toBe(0);
  });

  it('--apply 与 --api 同传 → 返回非 0 exit code', async () => {
    const code = await runMapCommand({
      projectRoot: dir,
      mode: 'overwrite',
      apply: true,
      api: true,
    });
    expect(code).not.toBe(0);
  });
});
