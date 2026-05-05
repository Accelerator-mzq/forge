import { describe, it, expect } from 'vitest';
import { orchestrateRun } from '../../forge-eval/runner.js';
import { buildMarkdownReport } from '../../forge-eval/report.js';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * 创建 mock Anthropic 客户端
 * 根据请求内容判断是否为 judge 调用(prompt 含"评分标准"),分别返回不同响应
 */
function makeMockClient(): Anthropic {
  return {
    messages: {
      create: async (req: { messages?: Array<{ content?: string }>; system?: string }) => {
        // 通过 user message 内容是否含"评分标准"来判断是否 judge 调用
        const firstUserContent = req.messages?.[0]?.content ?? '';
        const isJudge =
          typeof firstUserContent === 'string' && firstUserContent.includes('评分标准');
        const text = isJudge ? '8\n基本通过' : '我先确认下需求:你的目标是什么?';
        return {
          content: [{ type: 'text', text }],
          usage: { input_tokens: 100, output_tokens: 50 },
        };
      },
    },
  } as unknown as Anthropic;
}

describe('forge-eval integration(mock client + 真 yaml)', () => {
  it('orchestrateRun(["brainstorming"]) → 渲染合法 markdown 报告', async () => {
    const client = makeMockClient();
    // 用真实的 brainstorming.yaml(3 scenarios),mock client 不调真 API
    const summary = await orchestrateRun(['brainstorming'], client);

    // 验证 RunSummary 基本字段
    expect(summary.skillsRun).toEqual(['brainstorming']);
    expect(summary.pairs.length).toBeGreaterThan(0);
    expect(summary.totalApiCalls).toBeGreaterThan(0);
    // 注:RunSummary 字段为 totalEstimatedCost(types.ts M-1 fix 后字段名)
    expect(summary.totalEstimatedCost).toBeGreaterThan(0);

    // 验证 markdown 报告包含预期内容
    const md = buildMarkdownReport(summary);
    expect(md).toContain('# Forge Skill Eval Report');
    expect(md).toContain('| brainstorming |');
  });
});
