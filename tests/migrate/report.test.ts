// tests/migrate/report.test.ts
// Task 4.4 report.ts 单元测:Journal/finalizeAndRename/readTrace/writeReportMd
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Journal,
  finalizeAndRename,
  readTrace,
  writeReportMd,
} from '../../src/core/migrate/report.js';
import type { MigrateTrace, TraceOp } from '../../src/core/migrate/types.js';

describe('Journal — NDJSON + fsync', () => {
  it('append 一行后立即可被 readTrace 读', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-journal-'));
    const journalPath = join(tmp, 'migrate-trace.json.ndjson');
    const j = await Journal.open(journalPath);
    const op: TraceOp = {
      from: '/x/a',
      to: '/y/b',
      kind: 'proposal',
      transform: [],
      validate: 'ok',
      regen: null,
      writtenAt: '2026-05-10T00:00:00Z',
      status: 'committed',
    };
    await j.append(op);
    await j.close();
    const trace = await readTrace(tmp);
    expect(trace?.ops).toHaveLength(1);
    expect(trace?.ops[0]?.to).toBe('/y/b');
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('readTrace — reader 优先级', () => {
  it('.json 与 .ndjson 共存 → 优先 .json', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-prio-'));
    await writeFile(
      join(tmp, 'migrate-trace.json'),
      JSON.stringify({
        version: 1,
        source: 'openspec',
        sourceRoot: '',
        ts: '',
        ops: [{ to: 'final' }],
        conflicts: [],
        downgrades: [],
        cleanupHint: '',
      }),
    );
    await writeFile(join(tmp, 'migrate-trace.json.ndjson'), JSON.stringify({ to: 'old' }) + '\n');
    const trace = await readTrace(tmp);
    expect(trace?.ops[0]?.to).toBe('final');
    await rm(tmp, { recursive: true, force: true });
  });

  it('只 .ndjson → 读 ndjson 重建 ops 数组', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-ndjson-'));
    const lines =
      [
        JSON.stringify({ to: 'a', status: 'committed' }),
        JSON.stringify({ to: 'b', status: 'committed' }),
      ].join('\n') + '\n';
    await writeFile(join(tmp, 'migrate-trace.json.ndjson'), lines);
    const trace = await readTrace(tmp);
    expect(trace?.ops).toHaveLength(2);
    await rm(tmp, { recursive: true, force: true });
  });

  it('只 .tmp → 忽略,返 null', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-tmp-only-'));
    await writeFile(join(tmp, 'migrate-trace.json.tmp'), '{"version":1,"ops":[]}');
    const trace = await readTrace(tmp);
    expect(trace).toBeNull();
    await rm(tmp, { recursive: true, force: true });
  });

  it('无任何 trace 文件 → null', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-empty-'));
    expect(await readTrace(tmp)).toBeNull();
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('finalizeAndRename — 末态原子 rename', () => {
  it('从 .ndjson 重建 → 写 .tmp → fs.rename .json → 删 .ndjson', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-finalize-'));
    const ndjsonPath = join(tmp, 'migrate-trace.json.ndjson');
    await writeFile(
      ndjsonPath,
      JSON.stringify({ to: 'a', status: 'committed' }) +
        '\n' +
        JSON.stringify({ to: 'b', status: 'committed' }) +
        '\n',
    );
    const finalTrace: MigrateTrace = {
      version: 1,
      source: 'openspec',
      sourceRoot: '/x',
      ts: 'now',
      ops: [],
      conflicts: [],
      downgrades: [],
      cleanupHint: '',
    };
    await finalizeAndRename(tmp, finalTrace);
    expect(await readFile(join(tmp, 'migrate-trace.json'), 'utf8')).toBeTruthy();
    expect(existsSync(ndjsonPath)).toBe(false);
    await rm(tmp, { recursive: true, force: true });
  });
});

describe('writeReportMd', () => {
  it('生成 markdown 含 Summary + Plan + Cleanup', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'forge-report-'));
    const finalTrace: MigrateTrace = {
      version: 1,
      source: 'openspec',
      sourceRoot: '/x/openspec',
      ts: '2026-05-10T00:00:00Z',
      ops: [
        {
          from: '/x/a.md',
          to: '/y/forge/changes/add-bar/proposal.md',
          kind: 'proposal',
          transform: ['Problem→Why'],
          validate: 'ok',
          regen: null,
          writtenAt: '',
          status: 'committed',
        },
      ],
      conflicts: [{ target: '/y/forge/changes/old', rename: '/y/forge/changes/old--imported' }],
      downgrades: [],
      cleanupHint: 'git rm -r openspec/',
    };
    await writeReportMd(tmp, finalTrace);
    const md = await readFile(join(tmp, 'migrate-report.md'), 'utf8');
    expect(md).toContain('# Migration Report');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Plan');
    expect(md).toContain('## Conflicts');
    expect(md).toContain('git rm -r openspec/');
    await rm(tmp, { recursive: true, force: true });
  });
});
