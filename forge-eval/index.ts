// forge-eval CLI 入口 — Plan 5
// 用法:
//   pnpm eval                      # 全量 12 skill
//   pnpm eval:changed              # 只跑 git diff 改动的 skill
//   pnpm eval:skill brainstorming  # 单 skill 调试

import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'node:fs/promises';
import { loadEnv } from './load-env.js';
import { SKILL_NAMES, type SkillName } from './load-skill.js';
import { orchestrateRun } from './runner.js';
import { buildMarkdownReport } from './report.js';
import { getChangedSkills } from './changed-only.js';
import { checkBudget } from './budget.js';

// CLI 参数解析结果
interface CliOptions {
  changedOnly: boolean;
  skill?: SkillName;
}

/**
 * 解析 process.argv 参数
 * 支持:--changed-only / --skill <name>
 */
function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { changedOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--changed-only') {
      opts.changedOnly = true;
    } else if (a === '--skill') {
      const next = argv[i + 1];
      if (!next || !SKILL_NAMES.includes(next as SkillName)) {
        throw new Error(`--skill 后必须跟合法 skill 名;可选:${SKILL_NAMES.join(',')}`);
      }
      opts.skill = next as SkillName;
      i += 1;
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  // 加载环境变量(缺少 ANTHROPIC_API_KEY 时抛错 → 退出码 2)
  // v1.0(9i):anthropicBaseUrl 可选,支持第三方 endpoint(OpenRouter / LiteLLM / Bedrock proxy)
  const { anthropicApiKey, anthropicBaseUrl } = loadEnv();

  let skillsToRun: SkillName[];
  if (opts.skill) {
    // 单 skill 模式:调试用
    skillsToRun = [opts.skill];
  } else if (opts.changedOnly) {
    // changed-only 模式:git diff 过滤
    skillsToRun = getChangedSkills();
    if (skillsToRun.length === 0) {
      console.log('✓ changed-only:无 skill 改动,跳过');
      return;
    }
  } else {
    // 默认全量:跑全部 12 个 skill
    skillsToRun = [...SKILL_NAMES];
  }

  console.log(`将运行 ${skillsToRun.length} 个 skill:${skillsToRun.join(', ')}`);

  // 估算 + 警告(粗略:每 skill 平均 2.5 scenarios)
  checkBudget(skillsToRun.length * 2.5);

  // 初始化 Anthropic SDK 客户端
  // v1.0(9i):baseURL 可选,支持第三方兼容 endpoint;未配置时走 SDK 默认 https://api.anthropic.com
  const client = new Anthropic({
    apiKey: anthropicApiKey,
    ...(anthropicBaseUrl ? { baseURL: anthropicBaseUrl } : {}),
  });
  if (anthropicBaseUrl) {
    console.log(`ℹ 使用第三方 endpoint:${anthropicBaseUrl}`);
  }
  const summary = await orchestrateRun(skillsToRun, client);
  const md = buildMarkdownReport(summary);
  await writeFile('eval-report.md', md, 'utf8');

  console.log(`✓ eval 完成。${summary.runPass ? 'PASS' : 'FAIL'};报告 eval-report.md`);
  // 注:RunSummary 字段为 totalEstimatedCost(types.ts M-1 fix 后字段名)
  console.log(
    `  API 调用 ${summary.totalApiCalls},tokens ${summary.totalTokens.toLocaleString('en-US')},estimated cost $${summary.totalEstimatedCost.toFixed(4)}`,
  );

  if (!summary.runPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('✗ eval 失败:', err);
  process.exit(2);
});
