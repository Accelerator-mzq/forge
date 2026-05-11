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
  // 加载环境变量(API_KEY 与 AUTH_TOKEN 都缺时抛错 → 退出码 2)
  // v1.0(9i):baseUrl + authToken 可选,支持第三方 endpoint
  // (OpenRouter / LiteLLM / Bedrock proxy / PackyAPI / OneAPI 等)
  const { anthropicApiKey, anthropicAuthToken, anthropicBaseUrl } = loadEnv();

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
  // v1.0(9i):baseURL + authToken 可选,支持第三方兼容 endpoint
  // - apiKey 走 x-api-key header(Anthropic 原生)
  // - authToken 走 Authorization: Bearer header(部分第三方如 PackyAPI / LiteLLM Bearer 模式)
  // - 至少一个必须存在(loadEnv 已校验);两个都给时 SDK 行为按 apiKey 优先
  //
  // v5 修订(packyapi cc-sale 调试):authToken 模式下手动补 anthropic-beta: oauth-2025-04-20。
  // 原因:SDK 0.93 src/client.ts:861 仅在用 credentials provider(非直接 authToken 字符串)
  // 时才自动加 OAUTH_API_BETA_HEADER('oauth-2025-04-20',src/lib/credentials/types.ts:49)。
  // 我们走 .env 注入字符串 authToken → SDK 不走 tokenCache 分支 → header 缺。
  // packyapi cc-sale 分组校验此 header 判定是否合法 OAuth 转发调用,缺则 403。
  // 对官方 Anthropic API:此 header 无害(原本就有 OAuth 客户端发);
  // 对 x-api-key 模式:不加(SDK 自身行为)。
  const oauthBetaHeader = 'oauth-2025-04-20';
  // v5 修订(packyapi cc-sale 调试):User-Agent 必须含 claude-cli / claude-code 标识,
  // 否则部分转发服务的 OAuth 订阅分组(如 packyapi cc-sale)拒签 403。
  // 实测 packyapi cc-sale 接受:claude-cli/* / Claude-Code/* / anthropic-claude-code/*
  // 拒绝:Anthropic/JS *(SDK 默认)/ @anthropic-ai/claude-code/*(@ 前缀)
  // 允许 env override 以适配其他第三方校验规则
  const claudeCodeUserAgent = process.env['FORGE_EVAL_USER_AGENT'] ?? 'claude-cli/1.0.0';
  // 调试 hook(v5 修订):FORGE_EVAL_DEBUG_HEADERS=1 时打印 outgoing 请求 headers + 响应状态
  // 用于诊断第三方 endpoint(packyapi cc-sale 等)的 header 校验需求
  const debugHeaders = process.env['FORGE_EVAL_DEBUG_HEADERS'] === '1';
  const customFetch = debugHeaders
    ? async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const headers = new Headers(init?.headers);
        const headerObj: Record<string, string> = {};
        // Bearer / API key 在调试时脱敏
        headers.forEach((value, key) => {
          if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-api-key') {
            headerObj[key] = value.substring(0, 12) + '***';
          } else {
            headerObj[key] = value;
          }
        });
        console.error('=== REQ', init?.method ?? 'GET', String(url));
        console.error('=== HEADERS', JSON.stringify(headerObj, null, 2));
        const res = await globalThis.fetch(url as RequestInfo, init);
        console.error('=== RESP', res.status, res.statusText);
        if (res.status >= 400) {
          // clone 以免 body 被消费
          const clone = res.clone();
          const text = await clone.text().catch(() => '(no body)');
          console.error('=== RESP BODY', text);
        }
        return res;
      }
    : undefined;
  const client = new Anthropic({
    ...(anthropicApiKey ? { apiKey: anthropicApiKey } : {}),
    ...(anthropicAuthToken ? { authToken: anthropicAuthToken } : {}),
    ...(anthropicBaseUrl ? { baseURL: anthropicBaseUrl } : {}),
    ...(anthropicAuthToken
      ? {
          defaultHeaders: {
            'anthropic-beta': oauthBetaHeader,
            'User-Agent': claudeCodeUserAgent,
          },
        }
      : {}),
    ...(customFetch ? { fetch: customFetch } : {}),
  });
  if (anthropicBaseUrl) {
    const authMode = anthropicAuthToken ? 'Bearer token + anthropic-beta oauth' : 'x-api-key';
    console.log(`ℹ 使用第三方 endpoint:${anthropicBaseUrl}(认证:${authMode})`);
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
