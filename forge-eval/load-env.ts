// 加载 .env 并校验 ANTHROPIC_API_KEY — Plan 5
// 本地开发从 forge-eval/.env 读;CI 从 process.env 读(GitHub secret 注入)
// v1.0(9i):加 ANTHROPIC_BASE_URL 可选支持第三方 endpoint(OpenRouter / LiteLLM / Bedrock proxy)

import { config as loadDotenv } from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 加载 forge-eval/.env(若存在),返回 ANTHROPIC_API_KEY 与可选 baseURL。
 * 缺失时抛错,提示用户复制 .env.example。
 */
export function loadEnv(): { anthropicApiKey: string; anthropicBaseUrl?: string } {
  // 仅在 .env 存在时加载;CI 中 process.env 已由 secret 注入,无需 dotenv
  loadDotenv({ path: join(__dirname, '.env'), quiet: true });

  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY 缺失。本地:复制 forge-eval/.env.example 为 forge-eval/.env 填 key;CI:在 repo secrets 配 ANTHROPIC_API_KEY。',
    );
  }
  // 可选:第三方兼容 endpoint(空字符串视为未配置,走官方默认 https://api.anthropic.com)
  const baseUrl = process.env['ANTHROPIC_BASE_URL']?.trim();
  return {
    anthropicApiKey: key,
    anthropicBaseUrl: baseUrl && baseUrl.length > 0 ? baseUrl : undefined,
  };
}
