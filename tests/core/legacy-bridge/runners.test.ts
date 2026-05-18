// tests/core/legacy-bridge/runners.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ApiRunner,
  AgentHandoffRunner,
  readTaskResults,
} from '../../../src/core/legacy-bridge/runners.js';
import type { LlmTask } from '../../../src/core/legacy-bridge/llm-task.js';

const task: LlmTask = {
  op: 'map',
  inputs: [],
  prompt: 'p',
  model: 'claude-sonnet-4-6',
  outputSchema: 's',
  outputPath: 'forge/.cache/legacy-bridge-result-map.json',
};

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'lb-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('ApiRunner', () => {
  it('对每个 task 调一次 client,返回各自的文本结果', async () => {
    const calls: string[] = [];
    const fakeClient = {
      messages: {
        create: async (args: { messages: { content: string }[] }) => {
          calls.push(args.messages[0]!.content);
          return { content: [{ type: 'text', text: 'RESULT' }] };
        },
      },
    };
    const runner = new ApiRunner(fakeClient as never);
    const results = await runner.run([task]);
    expect(calls).toEqual(['p']);
    expect(results).toEqual([{ op: 'map', text: 'RESULT' }]);
  });

  it('API 未返回文本块 → text 为空字符串', async () => {
    const fakeClient = {
      messages: { create: async () => ({ content: [], stop_reason: 'refusal' }) },
    };
    const runner = new ApiRunner(fakeClient as never);
    const results = await runner.run([task]);
    expect(results).toEqual([{ op: 'map', text: '' }]);
  });
});

describe('AgentHandoffRunner', () => {
  it('emit 把 LlmTask[] 包成 manifest 信封写盘', async () => {
    const manifest = await new AgentHandoffRunner(dir, '1.4.0').emit('map', 1, [task], { k: 'v' });
    expect(manifest.op).toBe('map');
    expect(manifest.round).toBe(1);
    expect(manifest.meta).toEqual({ k: 'v' });
    expect(existsSync(join(dir, '.cache', 'legacy-bridge-task-map.json'))).toBe(true);
  });
});

describe('readTaskResults', () => {
  it('读 agent 写在 outputPath 的结果文件', async () => {
    await mkdir(join(dir, '.cache'), { recursive: true });
    await writeFile(
      join(dir, '.cache', 'legacy-bridge-result-map.json'),
      JSON.stringify({ text: 'AGENT_RESULT' }),
      'utf8',
    );
    const t: LlmTask = { ...task, outputPath: '.cache/legacy-bridge-result-map.json' };
    const results = await readTaskResults(dir, [t]);
    expect(results).toEqual([{ op: 'map', text: 'AGENT_RESULT' }]);
  });

  it('结果文件缺失 → 抛错', async () => {
    const t: LlmTask = { ...task, outputPath: '.cache/missing.json' };
    await expect(readTaskResults(dir, [t])).rejects.toThrow(/结果文件/);
  });

  it('结果文件是损坏 JSON → 抛带「解析失败」字样的错', async () => {
    await mkdir(join(dir, '.cache'), { recursive: true });
    await writeFile(join(dir, '.cache', 'legacy-bridge-result-map.json'), '{truncated', 'utf8');
    const t: LlmTask = { ...task, outputPath: '.cache/legacy-bridge-result-map.json' };
    await expect(readTaskResults(dir, [t])).rejects.toThrow(/解析失败/);
  });
});
