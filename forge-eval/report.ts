// markdown report 生成 — Plan 5
// 输入 RunSummary,输出 markdown 字符串(写到 eval-report.md)

import type { RunSummary } from './types.js';

/** 把 RunSummary 渲染为完整 markdown 报告(总览 + 失败详情 + cost) */
export function buildMarkdownReport(summary: RunSummary): string {
  const lines: string[] = [];
  lines.push('# Forge Skill Eval Report');
  lines.push('');
  lines.push(`- **运行时间**:${summary.timestamp}`);
  lines.push(`- **范围**:${summary.skillsRun.join(', ')}`);
  lines.push(`- **总 API 调用**:${summary.totalApiCalls}`);
  lines.push(`- **总 tokens**:${summary.totalTokens.toLocaleString('en-US')}`);
  // 注意:字段名为 totalEstimatedCost(M-1 修复后,与 types.ts 一致)
  lines.push(`- **总估算 cost**:$${summary.totalEstimatedCost.toFixed(4)}`);
  lines.push(`- **整体结果**:${summary.runPass ? '✅ PASS' : '❌ FAIL'}`);
  lines.push('');

  // 总览表:每个 scenario pair 一行
  lines.push('## 总览');
  lines.push('');
  lines.push('| skill | scenario | RED avg | GREEN avg | delta | green pass | pair pass |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const pair of summary.pairs) {
    const redAvg = avgScore(pair.red.turnResults);
    const greenAvg = avgScore(pair.green.turnResults);
    lines.push(
      `| ${pair.skill} | ${pair.scenarioId} | ${redAvg.toFixed(1)} | ${greenAvg.toFixed(1)} | ${pair.delta.toFixed(1)} | ${pair.green.scenarioPass ? '✅' : '❌'} | ${pair.pairPass ? '✅' : '❌'} |`,
    );
  }
  lines.push('');

  // 失败 pair 详情(仅有失败时输出)
  const failed = summary.pairs.filter((p) => !p.pairPass);
  if (failed.length > 0) {
    lines.push('## 失败详情');
    lines.push('');
    for (const pair of failed) {
      lines.push(`### ${pair.skill} / ${pair.scenarioId}`);
      lines.push('');
      lines.push(`- delta:${pair.delta.toFixed(2)}(threshold 由 compare.ts 决定)`);
      lines.push(`- GREEN scenarioPass:${pair.green.scenarioPass}`);
      lines.push('');
      lines.push('**失败 turn 列表(GREEN)**:');
      for (const turn of pair.green.turnResults) {
        if (turn.turnPass) continue;
        lines.push(
          `- **${turn.turnId}**:judge=${turn.judgeResult.score}(${turn.judgeResult.reasoning})`,
        );
        if (!turn.patternResult.skipped && !turn.patternResult.pass) {
          for (const f of turn.patternResult.failures) {
            lines.push(`  - 模式匹配失败:${f}`);
          }
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n') + '\n';
}

/** 计算一组 turn 的 judge 平均分 */
function avgScore(turns: { judgeResult: { score: number } }[]): number {
  if (turns.length === 0) return 0;
  return turns.reduce((acc, t) => acc + t.judgeResult.score, 0) / turns.length;
}
