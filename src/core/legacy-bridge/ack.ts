// LLM opt-in ack 流程 — Plan 7 Phase B1
// 决策 #22:首次跑 brownfield 命令时,要求用户显式 ack 数据传输到 LLM provider
// §4.5 GDPR:含客户数据的 anchor 还需 customer_data_acknowledged 二次确认

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { LlmAckFile, LegacyAnchorsFile } from './types.js';
import type { ForgeConfig } from '../schema/types.js';

/** ack 文件路径 */
export function ackPath(forgeRoot: string): string {
  return join(forgeRoot, '.cache', 'llm-ack.yaml');
}

/** 计算 config.yaml#legacy_bridge 段的 hash(用于检测用户改 config 后要求重新 ack) */
export function computeConfigHash(config: ForgeConfig): string {
  const lb = config.legacy_bridge ?? {};
  // I2 修:JSON.stringify 第二参数为数组时,作为 key 白名单 + 输出顺序保证(MDN replacer array
  // 语义)。等效于按 sorted key 顺序序列化 lb 全部字段,产出对 key 顺序无关的 stable 字符串。
  const stable = JSON.stringify(lb, Object.keys(lb).sort());
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

/** ack 校验结果 */
export interface AckCheckResult {
  ok: boolean;
  /** ok=false 时给 caller 的下一步提示 */
  reason?:
    | 'allow_llm_calls=false'
    | 'ack-missing'
    | 'ack-stale-config-changed'
    | 'customer-data-not-acknowledged';
  /** 当前 config_hash(供 caller 写入新 ack) */
  currentConfigHash: string;
  /** 含客户数据的 anchor 路径(reason=customer-data-not-acknowledged 时填) */
  customerDataPaths?: string[];
}

/** 检查 ack 状态:是否允许跑 LLM 命令 */
export async function checkAck(
  forgeRoot: string,
  config: ForgeConfig,
  anchors: LegacyAnchorsFile | null,
): Promise<AckCheckResult> {
  const currentConfigHash = computeConfigHash(config);

  // 1. allow_llm_calls 必须为 true
  if (!config.legacy_bridge?.allow_llm_calls) {
    return { ok: false, reason: 'allow_llm_calls=false', currentConfigHash };
  }

  // 2. ack 文件必须存在
  const path = ackPath(forgeRoot);
  if (!existsSync(path)) {
    return { ok: false, reason: 'ack-missing', currentConfigHash };
  }

  // 3. ack 与当前 config 一致(hash 比对)
  // C1 修:writeFile 中途中断会留 0 字节空文件;parseYaml('') 返 null;
  // 直接 ack.schema 抛 TypeError。包 try/catch + null 判断,异常 → ack-missing 让用户重 ack。
  const raw = await readFile(path, 'utf8');
  let ack: LlmAckFile | null;
  try {
    ack = parseYaml(raw) as LlmAckFile | null;
  } catch {
    return { ok: false, reason: 'ack-missing', currentConfigHash };
  }
  if (ack == null || ack.schema !== 'forge-llm-ack/v1') {
    return { ok: false, reason: 'ack-missing', currentConfigHash };
  }
  if (ack.config_hash !== currentConfigHash) {
    return { ok: false, reason: 'ack-stale-config-changed', currentConfigHash };
  }

  // 4. GDPR:含客户数据的 anchor 是否单独 ack
  const customerDataPaths = (anchors?.anchors ?? [])
    .filter((a) => a.contains_customer_data === true)
    .map((a) => a.path);
  if (customerDataPaths.length > 0 && !ack.customer_data_acknowledged) {
    return {
      ok: false,
      reason: 'customer-data-not-acknowledged',
      currentConfigHash,
      customerDataPaths,
    };
  }

  return { ok: true, currentConfigHash };
}

/**
 * 写 ack 文件(`forge legacy-bridge --acknowledge-data-transfer`)。
 *
 * @param forgeRoot           forge 根目录
 * @param config              当前 config(用于计算 config_hash)
 * @param customerDataAck    若 anchors 中存在 contains_customer_data=true 的项,
 *                            必须传 true 才写入(否则抛错引导用户先看 §4.5 提示)
 */
export async function writeAck(
  forgeRoot: string,
  config: ForgeConfig,
  customerDataAck: boolean = false,
): Promise<void> {
  await mkdir(join(forgeRoot, '.cache'), { recursive: true });
  const ack: LlmAckFile = {
    schema: 'forge-llm-ack/v1',
    acknowledged_at: new Date().toISOString(),
    config_hash: computeConfigHash(config),
    customer_data_acknowledged: customerDataAck,
  };
  // M1 修:0o600(rw-------)防 enterprise 多用户机器上其他 user 读 config_hash 推测 legacy_bridge 段结构
  await writeFile(ackPath(forgeRoot), stringifyYaml(ack), { encoding: 'utf8', mode: 0o600 });
}

/** 渲染 opt-in 拒绝时给用户的完整提示(spec §2.7) */
export function renderOptinPrompt(
  reason: AckCheckResult['reason'],
  customerDataPaths?: string[],
): string {
  if (reason === 'allow_llm_calls=false' || reason === 'ack-missing') {
    return `
✗ legacy-bridge 命令需要发送数据到 Anthropic API。

数据传输内容:
- docs/legacy/ 下的老文档全文
- src/ 下的代码片段
- tests/ 下的测试用例

数据已通过 forge/legacy-anchors.yaml#redact 配置 mask。
提供商:Anthropic Claude API(默认,v0.2 唯一支持)
数据驻留:Anthropic 当前默认不保留 30+ 天

启用步骤:
1. 在 forge/config.yaml 加:
   legacy_bridge:
     allow_llm_calls: true
2. 跑 forge legacy-bridge --acknowledge-data-transfer
   (一次性 ack,记录到 forge/.cache/llm-ack.yaml)
3. 重新跑当前命令

合规场景:enterprise / air-gapped / GDPR 要求数据驻留时,
保持 false 或省略此字段。brownfield 工具拒绝运行,
archive sync-check 自动 graceful skip,forge 主工作流不变。
`.trim();
  }
  if (reason === 'ack-stale-config-changed') {
    return `
✗ forge/config.yaml#legacy_bridge 段已变化,llm-ack.yaml 已过期。
请重新跑 forge legacy-bridge --acknowledge-data-transfer 确认新配置。
`.trim();
  }
  if (reason === 'customer-data-not-acknowledged') {
    const paths = customerDataPaths ?? [];
    return `
✗ 以下 anchor 标为含客户数据(contains_customer_data: true):
${paths.map((p) => `  - ${p}`).join('\n')}

启用 LLM 调用前请确认有数据出境授权(GDPR Art. 44+ / DPA 协议),
并已签 Anthropic DPA。然后跑:

  forge legacy-bridge --acknowledge-data-transfer --acknowledge-customer-data

来一并确认两项 ack。
`.trim();
  }
  return `✗ unknown ack state: ${reason}`;
}
