// tests/migrate/regenerate.test.ts
// Task 5.15 — regenerate 集成测 mock SDK 全链路
// 断言:成功件落地 / too-few-facts → .partial + reason / abort / JSON parse fail

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRegenerate } from '../../src/core/migrate/regenerate.js';
import type { AnthropicClient, KeyFact } from '../../src/core/migrate/quality.js';
import type {
  ClassificationPlan,
  TraceOp,
  MigrateSource,
  ScanResult,
  DetectResult,
  CopyOp,
  MissingArtifact,
} from '../../src/core/migrate/types.js';

// helper:构造最简 MigrateSource(固定返回 missing 列表)
function makeSource(id: 'openspec' | 'superpowers', missing: MissingArtifact[]): MigrateSource {
  return {
    id,
    detect: async (): Promise<DetectResult> => ({ found: true, rootPath: '/x' }),
    scan: async (): Promise<ScanResult> => ({ isEmpty: false, files: [] }),
    classify: async (): Promise<ClassificationPlan> => ({
      changes: [],
      specs: [],
      drafts: [],
      configFiles: [],
      skipped: [],
    }),
    prepareCopy: (): CopyOp[] => [],
    transform: (content: string): string => content,
    listMissingArtifacts: () => missing,
  };
}

// helper:mock client 队列,每次调用消费队列中一个 text
function mockClientQueue(textsByCall: string[]): AnthropicClient {
  let idx = 0;
  return {
    messages: {
      create: vi.fn().mockImplementation(() => {
        const text = textsByCall[idx++] ?? '';
        return Promise.resolve({ content: [{ type: 'text', text }] });
      }),
    },
  } as unknown as AnthropicClient;
}

describe('runRegenerate — mock SDK 全链路', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'forge-regen-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('成功:1 件 → proposal.md 落地 + traceOp committed', async () => {
    // fixture:建 design 文件 + 目标目录
    await mkdir(join(tmp, 'docs/superpowers/specs'), { recursive: true });
    const designPath = join(tmp, 'docs/superpowers/specs/2026-01-01-foo-design.md');
    await writeFile(designPath, '# Foo Design\n动机:用户需要 X');
    await mkdir(join(tmp, 'forge/changes/foo'), { recursive: true });

    // 8 条 facts(>= 5 通过 MIN_FACTS 阈值)
    const facts8: KeyFact[] = Array.from({ length: 8 }, (_, i) => ({
      text: `motivation ${i}`,
      section: '§Why',
      critical: i === 0,
    }));

    // mock 队列:
    //   调用 1 = callAnthropic(生成 proposal)
    //   调用 2 = extractMotivationFacts → callAnthropic
    //   调用 3-10 = judgeAll 并行 8 个 fact(每 fact 1 次)
    const client = mockClientQueue([
      '# Foo Proposal\n## Why\nx\n## What\nY', // 生成
      JSON.stringify(facts8), // extractMotivationFacts
      ...Array(8).fill('preserved\n'), // judgeAll × 8
    ]);

    const traceOps: TraceOp[] = [];
    const plan: ClassificationPlan = {
      changes: [
        {
          slug: 'foo',
          classification: 'active',
          artifacts: {
            design: {
              absPath: designPath,
              relPath: 'specs/2026-01-01-foo-design.md',
              kind: 'design',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
          },
        },
      ],
      specs: [],
      drafts: [],
      configFiles: [],
      skipped: [],
    };

    const source = makeSource('superpowers', [
      {
        changeSlug: 'foo',
        kind: 'proposal',
        targetPath: 'forge/changes/foo/proposal.md',
        factsSource: 'design',
      },
    ]);

    const result = await runRegenerate({
      source,
      plan,
      cwd: tmp,
      abortController: new AbortController(),
      client,
      appendTraceOp: async (op) => {
        traceOps.push(op);
      },
    });

    // 断言:成功 1 件,无失败
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    // traceOp 已追加 1 条
    expect(traceOps).toHaveLength(1);
    // proposal.md 已写盘,内容含 ## Why
    const proposalContent = await readFile(join(tmp, 'forge/changes/foo/proposal.md'), 'utf8');
    expect(proposalContent).toContain('## Why');
  });

  it('too-few-facts:< 5 → .partial 残留 + reason quality-fail: too-few-facts', async () => {
    await mkdir(join(tmp, 'docs/superpowers/specs'), { recursive: true });
    const designPath = join(tmp, 'docs/superpowers/specs/2026-01-01-foo-design.md');
    await writeFile(designPath, '# Foo\n');
    await mkdir(join(tmp, 'forge/changes/foo'), { recursive: true });

    // mock 队列:生成 1 次 + extractMotivationFacts 返 1 条 facts(< 5)
    const client = mockClientQueue([
      '# Generated', // 生成
      JSON.stringify([{ text: 'one', section: '§1', critical: false }]), // 仅 1 条 < 5 → too-few-facts
    ]);

    const plan: ClassificationPlan = {
      changes: [
        {
          slug: 'foo',
          classification: 'active',
          artifacts: {
            design: {
              absPath: designPath,
              relPath: 'specs/2026-01-01-foo-design.md',
              kind: 'design',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
          },
        },
      ],
      specs: [],
      drafts: [],
      configFiles: [],
      skipped: [],
    };

    const source = makeSource('superpowers', [
      {
        changeSlug: 'foo',
        kind: 'proposal',
        targetPath: 'forge/changes/foo/proposal.md',
        factsSource: 'design',
      },
    ]);

    const result = await runRegenerate({
      source,
      plan,
      cwd: tmp,
      abortController: new AbortController(),
      client,
      appendTraceOp: async () => {},
    });

    // 断言:失败 1 件,.partial 残留含 too-few-facts reason
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.partials).toHaveLength(1);
    const partialContent = await readFile(result.partials[0]!, 'utf8');
    expect(partialContent).toContain('quality-fail: too-few-facts');
  });

  it('JSON parse fail → .partial + parse-error', async () => {
    await mkdir(join(tmp, 'docs/superpowers/specs'), { recursive: true });
    const designPath = join(tmp, 'docs/superpowers/specs/2026-01-01-foo-design.md');
    await writeFile(designPath, '# Foo\n');
    await mkdir(join(tmp, 'forge/changes/foo'), { recursive: true });

    // mock 队列:生成 1 次 + extractMotivationFacts 返非 JSON 字符串 → parse-error
    const client = mockClientQueue([
      '# Generated', // 生成
      'not json at all', // extractMotivationFacts → parse error
    ]);

    const plan: ClassificationPlan = {
      changes: [
        {
          slug: 'foo',
          classification: 'active',
          artifacts: {
            design: {
              absPath: designPath,
              relPath: 'specs/2026-01-01-foo-design.md',
              kind: 'design',
              size: 0,
              mtime: '',
              encoding: 'utf8',
            },
          },
        },
      ],
      specs: [],
      drafts: [],
      configFiles: [],
      skipped: [],
    };

    const source = makeSource('superpowers', [
      {
        changeSlug: 'foo',
        kind: 'proposal',
        targetPath: 'forge/changes/foo/proposal.md',
        factsSource: 'design',
      },
    ]);

    const result = await runRegenerate({
      source,
      plan,
      cwd: tmp,
      abortController: new AbortController(),
      client,
      appendTraceOp: async () => {},
    });

    // 断言:失败 1 件,.partial 含 parse-error
    expect(result.failed).toBe(1);
    expect(result.partials).toHaveLength(1);
    const partialContent = await readFile(result.partials[0]!, 'utf8');
    expect(partialContent).toContain('parse-error');
  });

  it('AbortController.abort() pre-call → 直接 break,无 .partial', async () => {
    // 不提供任何 mock 响应(不会被调用)
    const client = mockClientQueue([]);

    const plan: ClassificationPlan = {
      changes: [],
      specs: [],
      drafts: [],
      configFiles: [],
      skipped: [],
    };

    // source 有 1 件 missing,但 abort 在循环前触发
    const source = makeSource('superpowers', [
      {
        changeSlug: 'foo',
        kind: 'proposal',
        targetPath: 'forge/changes/foo/proposal.md',
        factsSource: 'design',
      },
    ]);

    const ac = new AbortController();
    // 提前 abort → 循环第一次检查 signal.aborted 即 break
    ac.abort();

    const result = await runRegenerate({
      source,
      plan,
      cwd: tmp,
      abortController: ac,
      client,
      appendTraceOp: async () => {},
    });

    // 断言:abort 前已 break,无任何成功/失败,.partial 为空
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.partials).toHaveLength(0);
  });
});
