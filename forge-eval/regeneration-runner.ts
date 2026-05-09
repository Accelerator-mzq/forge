// 复写 eval scenario runner — Plan 7 Phase E
// spec §5.1:跑真 LLM,分层抽样验证保真率;复用 Plan 5 forge-eval 基础设施

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { regenerateRole, type RegenerateClient } from '../src/core/legacy-bridge/regenerator.js';
import {
  stratifiedSample,
  judgeAllFacts,
  formatQualityReport,
  DEFAULT_FIDELITY_THRESHOLD,
  type JudgeClient,
} from '../src/core/legacy-bridge/quality-judge.js';
import type { LegacyAnchor } from '../src/core/legacy-bridge/types.js';
import type { RegenScenario, RegenScenarioResult, RegenRunSummary } from './regeneration-types.js';

// Anthropic SDK 的 messages.create 是 overload(stream true/false 分支),与单签名接口不直接兼容;
// runner 调用 regenerateRole + judgeAllFacts 都需要单签名接口,统一用交集类型(同 legacy-bridge.ts:332 模式)
export type RegenRunnerClient = RegenerateClient & JudgeClient;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, 'regeneration-scenarios');

/** 读取并校验单 scenario YAML */
export async function loadRegenScenario(scenarioId: string): Promise<RegenScenario> {
  const path = join(SCENARIOS_DIR, `${scenarioId}.yaml`);
  if (!existsSync(path)) {
    throw new Error(`scenario 文件不存在:${path}`);
  }
  const raw = await readFile(path, 'utf8');
  const data = parseYaml(raw) as RegenScenario;
  validateScenario(data, path);
  return data;
}

/** 校验 scenario 合约 */
export function validateScenario(scenario: RegenScenario, ctx: string): void {
  if (!scenario.id) throw new Error(`${ctx}: 缺 id`);
  if (!scenario.role) throw new Error(`${ctx}: 缺 role`);
  if (!Array.isArray(scenario.input_anchors) || scenario.input_anchors.length === 0) {
    throw new Error(`${ctx}: input_anchors 为空`);
  }
  if (!Array.isArray(scenario.key_facts) || scenario.key_facts.length === 0) {
    throw new Error(`${ctx}: key_facts 为空`);
  }
  for (const f of scenario.key_facts) {
    if (
      typeof f.text !== 'string' ||
      typeof f.section !== 'string' ||
      typeof f.critical !== 'boolean'
    ) {
      throw new Error(`${ctx}: key_fact 缺字段`);
    }
  }
}

/** 单 scenario 跑(真 LLM) */
export async function runRegenScenario(
  client: RegenRunnerClient,
  scenario: RegenScenario,
): Promise<RegenScenarioResult> {
  // 取 authoritative anchor
  const auth = scenario.input_anchors.find((a) => a.authoritative);
  if (!auth) throw new Error(`${scenario.id}: 无 authoritative anchor`);
  const historical = scenario.input_anchors.filter((a) => !a.authoritative);

  // 把 scenario 内 path 转绝对路径(相对 SCENARIOS_DIR)
  const toAbs = (relPath: string): string => resolve(SCENARIOS_DIR, relPath);
  const authoritativeAbs: LegacyAnchor = {
    role: auth.role,
    path: toAbs(auth.path),
    authoritative: true,
    sheet: auth.sheet,
  };

  // partial-anchor-missing scenario:authoritative 文件存在,但 historical 缺失
  // 决策:caller 应处理 missing(由 readAnchorAsText 抛错)→ 此 case 期望 scenario 整体失败,
  // runner 捕获 → result 标 failed=false 但保留报告
  let body: string;
  let totalCost: number;
  let qualityResult;

  try {
    const out = await regenerateRole(
      {
        role: scenario.role,
        authoritative: authoritativeAbs,
        historical: historical
          .filter((a) => existsSync(toAbs(a.path)))
          .map((a) => ({
            role: a.role,
            path: toAbs(a.path),
            authoritative: false,
            sheet: a.sheet,
          })),
        forgeVersion: '0.2.0-eval',
        regenLicense: 'derived-from-source',
      },
      client,
    );
    body = out.body;
    totalCost = out.estimatedCost;

    // 分层抽样
    const sampling = stratifiedSample({
      allFacts: scenario.key_facts,
      total: 30,
    });
    qualityResult = await judgeAllFacts(
      client,
      body,
      sampling,
      scenario.regeneration_threshold ?? DEFAULT_FIDELITY_THRESHOLD,
    );
  } catch (err) {
    // 失败 → 保留报告,标 failed
    body = `(scenario failed: ${(err as Error).message})`;
    totalCost = 0;
    qualityResult = {
      total_rate: 0,
      critical_rate: 0,
      per_section_rates: {},
      lost_critical: scenario.key_facts.filter((f) => f.critical),
      lost_non_critical: scenario.key_facts.filter((f) => !f.critical),
      uncovered_sections: [],
      passed: false,
    };
  }

  return {
    scenario,
    qualityResult,
    body,
    totalCost,
    passed: qualityResult.passed,
  };
}

/** 跑全部 scenario */
export async function runAllRegenScenarios(
  client: RegenRunnerClient,
  scenarioIds: string[],
): Promise<RegenRunSummary> {
  const results: RegenScenarioResult[] = [];
  for (const id of scenarioIds) {
    const scenario = await loadRegenScenario(id);
    const r = await runRegenScenario(client, scenario);
    results.push(r);
    console.log(
      `[${id}] passed=${r.passed} total_rate=${(r.qualityResult.total_rate * 100).toFixed(1)}%`,
    );
  }
  const totalCost = results.reduce((sum, r) => sum + r.totalCost, 0);
  return {
    timestamp: new Date().toISOString(),
    results,
    totalCost,
    runPass: results.every((r) => r.passed),
  };
}

/** 渲染 markdown 报告 */
export function buildRegenReport(summary: RegenRunSummary): string {
  const lines: string[] = [];
  lines.push(`# Regeneration Eval Report`);
  lines.push('');
  lines.push(`生成时间:${summary.timestamp}`);
  lines.push(`总 cost:$${summary.totalCost.toFixed(2)}`);
  lines.push(`总览:${summary.runPass ? '✓ ALL PASS' : '✗ FAIL'}`);
  lines.push('');
  for (const r of summary.results) {
    lines.push(`## ${r.scenario.id}${r.passed ? ' ✓' : ' ✗'}`);
    lines.push('');
    lines.push(formatQualityReport(r.scenario.role, r.qualityResult));
    lines.push('');
  }
  return lines.join('\n');
}

/** 写报告到 forge-eval/regen-report.md */
export async function writeRegenReport(summary: RegenRunSummary, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, 'regen-report.md');
  await writeFile(path, buildRegenReport(summary), 'utf8');
  return path;
}
