// 加载 .env 并校验 ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN — Plan 5
// 本地开发从 forge-eval/.env 读;CI 从 process.env 读(GitHub secret 注入)
// v1.0(9i):加 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN 可选支持第三方 endpoint
// (OpenRouter / LiteLLM / Bedrock proxy / PackyAPI / 其他 OneAPI 类转发服务)

import { config as loadDotenv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AnthropicEnv {
  /** API key — 走 x-api-key header(Anthropic 原生)。与 authToken 二选一 */
  anthropicApiKey?: string;
  /** Bearer token — 走 Authorization: Bearer header(部分第三方如 PackyAPI 用此协议)。SDK 0.93 自动从 ANTHROPIC_AUTH_TOKEN env 读取 */
  anthropicAuthToken?: string;
  /** 可选第三方 endpoint(空字符串视为未配置,走官方默认 https://api.anthropic.com) */
  anthropicBaseUrl?: string;
}

/**
 * 加载 forge-eval/.env(若存在),返回 Anthropic SDK 所需的认证 + endpoint 配置。
 * ANTHROPIC_API_KEY 与 ANTHROPIC_AUTH_TOKEN 至少一个必须存在;两个都缺时抛错。
 */
export function loadEnv(): AnthropicEnv {
  // 仅在 .env 存在时加载;CI 中 process.env 已由 secret 注入,无需 dotenv
  loadDotenv({ path: join(__dirname, '.env'), quiet: true });

  const key = process.env['ANTHROPIC_API_KEY']?.trim();
  const authToken = process.env['ANTHROPIC_AUTH_TOKEN']?.trim();
  if ((!key || key.length === 0) && (!authToken || authToken.length === 0)) {
    throw new Error(
      'ANTHROPIC_API_KEY 或 ANTHROPIC_AUTH_TOKEN 至少一个必须配置。本地:复制 forge-eval/.env.example 为 forge-eval/.env 填一个;' +
        '原生 Anthropic 用 API_KEY(x-api-key header);部分第三方(PackyAPI / LiteLLM Bearer 模式)用 AUTH_TOKEN(Authorization: Bearer header)。' +
        'CI:在 repo secrets 配同名变量。',
    );
  }
  // 可选第三方 endpoint;未配置时走 SDK 默认 https://api.anthropic.com
  const baseUrl = process.env['ANTHROPIC_BASE_URL']?.trim();
  return {
    anthropicApiKey: key && key.length > 0 ? key : undefined,
    anthropicAuthToken: authToken && authToken.length > 0 ? authToken : undefined,
    anthropicBaseUrl: baseUrl && baseUrl.length > 0 ? baseUrl : undefined,
  };
}
