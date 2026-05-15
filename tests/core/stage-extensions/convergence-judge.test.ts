// convergence-judge.test.ts — judgeConvergence 单元测试
// 5 个测试:置信度过滤 / BLOCKER+MAJOR vs MINOR+NIT 分桶 / shortCircuited /
//           shortCircuited=false(approve+block非空) / droppedByConfidence 计数

import { describe, it, expect } from 'vitest';
import { judgeConvergence } from '../../../src/core/stage-extensions/convergence-judge.js';
import type { CodexReviewOutput } from '../../../src/core/stage-extensions/types.js';
import type { ConvergenceConfig } from '../../../src/core/schema/types.js';
import type { SeverityMap } from '../../../src/core/stage-extensions/types.js';

// 测试用默认 severity_map
const severityMap: SeverityMap = {
  critical: 'BLOCKER',
  high: 'MAJOR',
  medium: 'MINOR',
  low: 'NIT',
};

// 测试用默认 convergence config
const defaultConfig: ConvergenceConfig = {
  max_rounds: 10,
  max_rounds_on_exceed: 'ask',
  block_severity: ['BLOCKER', 'MAJOR'],
  ignore_severity: ['MINOR', 'NIT'],
  confidence_threshold: 0.7,
  verdict_approve_short_circuit: true,
};

// 工厂:创建 CodexFinding
function makeFinding(
  severity: 'critical' | 'high' | 'medium' | 'low',
  confidence: number,
  title = 'test finding',
) {
  return {
    severity,
    title,
    body: 'body',
    file: 'src/foo.ts',
    line_start: 1,
    line_end: 2,
    confidence,
    recommendation: 'fix it',
  };
}

describe('convergence-judge', () => {
  it('过滤掉置信度低于阈值的 findings', () => {
    // confidence 0.5 < 0.7 阈值,应被过滤
    const output: CodexReviewOutput = {
      verdict: 'needs-attention',
      summary: 'test',
      findings: [makeFinding('critical', 0.5)],
      next_steps: [],
    };
    const result = judgeConvergence(output, defaultConfig, severityMap);

    // 被过滤掉 1 个
    expect(result.droppedByConfidence).toBe(1);
    expect(result.blockFindings).toHaveLength(0);
    expect(result.ignoreFindings).toHaveLength(0);
  });

  it('正确分桶:critical/high → blockFindings,medium/low → ignoreFindings', () => {
    // critical(BLOCKER)和 high(MAJOR)应进 blockFindings;medium(MINOR)和 low(NIT)进 ignoreFindings
    const output: CodexReviewOutput = {
      verdict: 'needs-attention',
      summary: 'test',
      findings: [
        makeFinding('critical', 0.9),
        makeFinding('high', 0.8),
        makeFinding('medium', 0.9),
        makeFinding('low', 0.8),
      ],
      next_steps: [],
    };
    const result = judgeConvergence(output, defaultConfig, severityMap);

    expect(result.blockFindings).toHaveLength(2);
    expect(result.ignoreFindings).toHaveLength(2);
    expect(result.blockFindings[0]?.forge_severity).toBe('BLOCKER');
    expect(result.blockFindings[1]?.forge_severity).toBe('MAJOR');
    expect(result.ignoreFindings[0]?.forge_severity).toBe('MINOR');
    expect(result.ignoreFindings[1]?.forge_severity).toBe('NIT');
  });

  it('shortCircuited=true:verdict=approve 且 blockFindings 为空', () => {
    // approve + 无 block findings → shortCircuited 应为 true
    const output: CodexReviewOutput = {
      verdict: 'approve',
      summary: 'all good',
      findings: [makeFinding('medium', 0.9)], // MINOR → ignoreFindings
      next_steps: [],
      thread_id: 'thread-123',
    };
    const result = judgeConvergence(output, defaultConfig, severityMap);

    expect(result.shortCircuited).toBe(true);
    expect(result.threadId).toBe('thread-123');
    expect(result.verdict).toBe('approve');
  });

  it('shortCircuited=false:verdict=approve 但 blockFindings 非空', () => {
    // approve + 有 BLOCKER → shortCircuited 应为 false
    const output: CodexReviewOutput = {
      verdict: 'approve',
      summary: 'mixed',
      findings: [makeFinding('critical', 0.9)], // BLOCKER → blockFindings
      next_steps: [],
    };
    const result = judgeConvergence(output, defaultConfig, severityMap);

    expect(result.shortCircuited).toBe(false);
    expect(result.blockFindings).toHaveLength(1);
  });

  it('正确计算 droppedByConfidence 数量', () => {
    // 3 个 findings 中 2 个低于阈值
    const output: CodexReviewOutput = {
      verdict: 'needs-attention',
      summary: 'test',
      findings: [
        makeFinding('critical', 0.3), // 低于 0.7,被丢弃
        makeFinding('high', 0.6), // 低于 0.7,被丢弃
        makeFinding('medium', 0.8), // 通过
      ],
      next_steps: [],
    };
    const result = judgeConvergence(output, defaultConfig, severityMap);

    expect(result.droppedByConfidence).toBe(2);
    expect(result.ignoreFindings).toHaveLength(1); // medium → MINOR → ignoreFindings
    expect(result.blockFindings).toHaveLength(0);
  });
});
