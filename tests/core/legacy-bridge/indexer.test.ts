// indexer.ts 单测 — Plan 7 Phase D Task D2
// 覆盖:chunkText / indexAnchor / renderIndexMarkdown / 容差校验
// (buildIndex 已删除,其"仅含 authoritative=true"覆盖由 indexer-dualpath.test.ts 的 buildIndexTask 替代)

import { describe, it, expect } from 'vitest';
import {
  chunkText,
  indexAnchor,
  renderIndexMarkdown,
  isSummaryWithinTolerance,
  type IndexerClient,
} from '../../../src/core/legacy-bridge/indexer.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { LegacyAnchor } from '../../../src/core/legacy-bridge/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

function makeMockIndexer(text: string): IndexerClient {
  return {
    messages: {
      create: async () =>
        ({
          content: [{ type: 'text', text }],
        }) as never,
    },
  };
}

describe('legacy-bridge/indexer', () => {
  it('chunkText 短文本 → 1 块', () => {
    expect(chunkText('hello world')).toEqual(['hello world']);
  });

  it('chunkText 长文本 → 多块,按段落边界', () => {
    const long = 'a'.repeat(20_000) + '\n\n' + 'b'.repeat(20_000) + '\n\n' + 'c'.repeat(20_000);
    const chunks = chunkText(long, 30_000);
    expect(chunks.length).toBeGreaterThan(1);
    // 不应在段落中间断
    for (const c of chunks) {
      expect(c).not.toMatch(/^aab/);
    }
  });

  it('indexAnchor happy path → IndexEntry', async () => {
    const mock = makeMockIndexer(
      '本文档定义订单管理系统的需求规格,涵盖支付幂等性、退款规则、用户隐私等核心约束。',
    );
    const anchor: LegacyAnchor = {
      role: 'requirements',
      path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
      authoritative: true,
    };
    const e = await indexAnchor(mock, anchor);
    expect(e.role).toBe('requirements');
    expect(e.summary).toContain('订单管理');
    expect(e.inputBytes).toBeGreaterThan(0);
  });

  it('renderIndexMarkdown 输出表', () => {
    const md = renderIndexMarkdown([
      { path: 'docs/SRS.md', role: 'requirements', summary: '订单管理需求', inputBytes: 1000 },
      { path: 'docs/HLD.md', role: 'high-level-design', summary: '架构概述', inputBytes: 800 },
    ]);
    expect(md).toContain('| role | path | summary |');
    expect(md).toContain('| requirements | `docs/SRS.md` | 订单管理需求 |');
  });

  it('isSummaryWithinTolerance 100±N 内 → true', () => {
    const sample = 'a'.repeat(100);
    expect(isSummaryWithinTolerance(sample)).toBe(true);
  });

  it('isSummaryWithinTolerance 5 字 → false(过短)', () => {
    expect(isSummaryWithinTolerance('短')).toBe(false);
  });
});
