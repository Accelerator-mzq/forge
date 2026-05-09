#!/usr/bin/env tsx
// regen-eval CLI 入口 — Plan 7 Phase E
// 用法:pnpm eval-regen / pnpm eval-regen:scenario <id>

import Anthropic from '@anthropic-ai/sdk';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './load-env.js';
import { runAllRegenScenarios, writeRegenReport } from './regeneration-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, 'regeneration-scenarios');

interface CliOptions {
  scenario?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--scenario') {
      const next = argv[i + 1];
      if (!next) throw new Error('--scenario 需要 id 参数');
      opts.scenario = next;
      i += 1;
    }
  }
  return opts;
}

function listAllScenarios(): string[] {
  return readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => f.replace(/\.yaml$/, ''));
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const { anthropicApiKey } = loadEnv();
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const scenarioIds = opts.scenario ? [opts.scenario] : listAllScenarios();
  console.log(`Running ${scenarioIds.length} scenario(s):${scenarioIds.join(', ')}`);

  const summary = await runAllRegenScenarios(client, scenarioIds);
  const reportPath = await writeRegenReport(summary, __dirname);
  console.log(`\n✓ wrote ${reportPath}`);
  console.log(`总 cost:$${summary.totalCost.toFixed(2)}`);
  if (!summary.runPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
