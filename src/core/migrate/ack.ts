// src/core/migrate/ack.ts
// migrate 专属 ack — Plan 8e Task 5.1
// Spec §2.8 步骤 4 + §5.1 不复用 legacy-bridge(brownfield 路径 + 文案)

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify, parse } from 'yaml';

export interface MigrateAckInput {
  source: 'openspec' | 'superpowers';
  estimatedCostUsd: number;
}

// 渲染交互 prompt:列数据传输内容 + 预估成本 + 提供商
export function renderMigratePrompt(input: MigrateAckInput): string {
  const { source, estimatedCostUsd } = input;
  const sourceDesc =
    source === 'openspec'
      ? 'openspec/specs/changes/explorations/ 下的 markdown 文档'
      : 'docs/superpowers/{specs,plans}/ 下的 design.md + plan.md';

  return `
✗ forge migrate --regenerate 需要发送数据到 Anthropic API。

数据传输内容(${source} source):
- ${sourceDesc}
- redact 规则会先 mask 敏感信息(token / API key / IP / email);自定义 --redact-rules 可附加

预估成本:$${estimatedCostUsd.toFixed(2)} USD
提供商:Anthropic Claude API

确认继续 → 输入 ack token(下一行 prompt 提示):
`.trim();
}

interface MigrateAckFile {
  schema: 'forge-migrate-ack/v1';
  ts: string;
  source: string;
  estimated_cost_usd: number;
  acknowledged_at: string;
}

// ack 文件路径(forge/.forge-ack/migrate-<ts>.yaml)
export function ackFilePath(forgeRoot: string, ts: string): string {
  return join(forgeRoot, '.forge-ack', `migrate-${ts}.yaml`);
}

// 写 ack 文件(0o600 防泄漏)
export async function writeMigrateAck(
  forgeRoot: string,
  ts: string,
  input: MigrateAckInput,
): Promise<void> {
  const data: MigrateAckFile = {
    schema: 'forge-migrate-ack/v1',
    ts,
    source: input.source,
    estimated_cost_usd: input.estimatedCostUsd,
    acknowledged_at: new Date().toISOString(),
  };
  await writeFile(ackFilePath(forgeRoot, ts), stringify(data), {
    encoding: 'utf8',
    mode: 0o600,
  });
}

export interface CheckAckResult {
  ok: boolean;
  reason?: 'ack-missing' | 'ack-corrupt';
}

// 检查 ack 文件存在且 schema 正确
export async function checkMigrateAck(forgeRoot: string, ts: string): Promise<CheckAckResult> {
  const path = ackFilePath(forgeRoot, ts);
  if (!existsSync(path)) return { ok: false, reason: 'ack-missing' };
  try {
    const raw = await readFile(path, 'utf8');
    const ack = parse(raw) as MigrateAckFile | null;
    if (!ack || ack.schema !== 'forge-migrate-ack/v1') {
      return { ok: false, reason: 'ack-corrupt' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'ack-corrupt' };
  }
}
