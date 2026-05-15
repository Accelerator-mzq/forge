// thread-map.test.ts — ThreadMap 单元测试
// 4 个测试:缺文件→空map / recordRound+save+reload roundtrip / getThreadId无记录→null / resetStage

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ThreadMap } from '../../../src/core/stage-extensions/thread-map.js';
import type { ThreadMapEntry } from '../../../src/core/stage-extensions/thread-map.js';

let tmp: string;

// 每个测试前创建临时目录
beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), 'forge-threadmap-'));
});

// 每个测试后清理
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('ThreadMap', () => {
  it('load 缺文件时返回空 map(不 throw)', async () => {
    // .codex-threads.yaml 不存在时,load 应静默返回空 map
    const tm = new ThreadMap('c1', tmp);
    await tm.load(); // 不应 throw

    // getThreadId 对任意 stage/name 返回 null
    expect(tm.getThreadId('review', 'codex-review')).toBeNull();
  });

  it('recordRound + save + reload roundtrip 正确保留数据', async () => {
    // 记录一轮,save 后重新 load,数据应完整保留
    const entry: ThreadMapEntry = {
      thread_id: 'thread-abc',
      round: 1,
      last_verdict: 'needs-attention',
      last_finding_count: 3,
      last_round_at: '2026-05-15T10:00:00.000Z',
    };

    const tm = new ThreadMap('c1', tmp);
    await tm.load();
    tm.recordRound('review', 'codex-review', entry);
    await tm.save();

    // 重新 load 验证 thread_id 持久化
    const tm2 = new ThreadMap('c1', tmp);
    await tm2.load();
    expect(tm2.getThreadId('review', 'codex-review')).toBe('thread-abc');

    // 直接读盘 YAML 验证 ALL 字段都经磁盘 roundtrip 完整保留
    const yamlPath = path.join(tmp, 'changes', 'c1', '.codex-threads.yaml');
    const raw = await readFile(yamlPath, 'utf8');
    const parsed = parseYaml(raw) as {
      threads: Record<string, Record<string, ThreadMapEntry>>;
    };
    const persisted = parsed.threads['review']?.['codex-review'];
    expect(persisted).toEqual(entry);
  });

  it('getThreadId 无记录时返回 null', async () => {
    // 有其他 stage 的记录,但查询不存在的 stage 应返回 null
    const tm = new ThreadMap('c1', tmp);
    await tm.load();
    tm.recordRound('review', 'codex-review', {
      thread_id: 'thread-xyz',
      round: 1,
      last_verdict: 'approve',
      last_finding_count: 0,
      last_round_at: '2026-05-15T10:00:00.000Z',
    });

    // 不同 stage 应返回 null
    expect(tm.getThreadId('brainstorming', 'codex-review')).toBeNull();
    // 不同 name 应返回 null
    expect(tm.getThreadId('review', 'other-extension')).toBeNull();
  });

  it('resetStage 清除该 stage 全部记录', async () => {
    // 记录两个 stage,reset 其中一个后另一个应保留
    const tm = new ThreadMap('c1', tmp);
    await tm.load();

    tm.recordRound('review', 'codex-review', {
      thread_id: 'review-thread',
      round: 1,
      last_verdict: null,
      last_finding_count: 0,
      last_round_at: '2026-05-15T10:00:00.000Z',
    });
    tm.recordRound('verify', 'codex-verify', {
      thread_id: 'verify-thread',
      round: 1,
      last_verdict: null,
      last_finding_count: 0,
      last_round_at: '2026-05-15T10:01:00.000Z',
    });

    // reset review stage
    tm.resetStage('review');

    // review 的记录应被清除
    expect(tm.getThreadId('review', 'codex-review')).toBeNull();
    // verify 的记录应保留
    expect(tm.getThreadId('verify', 'codex-verify')).toBe('verify-thread');
  });
});
