// sync-check 核心 — Plan 7 Phase C
// 决策 #5/#18/#19/#22:5 档判定 + graceful skip + opt-in skip + cross-anchor 默认入 diff

import Anthropic from '@anthropic-ai/sdk';
import { redact } from './redact.js';
import { checkAnchorHash } from './hash-anchor.js';
import {
  decideCrossRole,
  type CrossRoleInput,
} from './conflict.js';
import { normalizeDiffsFromLlm } from './diff-report.js';
import type {
  LegacyAnchor,
  LegacyAnchorsFile,
  SyncStateFile,
  SyncStateDiff,
  RedactRule,
} from './types.js';

/** 单 change 的输入 */
export interface SyncCheckInput {
  changeId: string;
  /** change 的 proposal/specs/design 合并文本 */
  changeContext: string;
  /** 本次 change 影响的模块名(从 spec/<area>.md 反查) */
  affectedModules: string[];
  /** 全部 anchors */
  anchors: LegacyAnchorsFile;
  /** 是否走 auto_resolve_cross_anchor(决策 #18) */
  autoResolveCrossAnchor: boolean;
  /** 用于 cross-anchor 决策的 mtime 提供者 */
  mtimeOf: (path: string) => number;
}

/** 单 change 的输出 */
export interface SyncCheckOutput {
  syncState: SyncStateFile;
  /** 各 anchor 的 hash 状态(用于 caller warn 用户老文档已改) */
  hashChecks: Array<{ anchor: LegacyAnchor; state: 'fresh' | 'stale' | 'no-record' }>;
  /** P7-10 修复:读取失败的 anchor 路径列表(spec §4.1 line 498 部分降级) */
  missingAnchors: string[];
}

/** sync-check 客户端最小接口 */
export interface SyncCheckClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

/** 找本次 change 影响的 anchor(模块匹配) */
export function findAffectedAnchors(
  anchors: LegacyAnchorsFile,
  affectedModules: string[],
): LegacyAnchor[] {
  if (affectedModules.length === 0) return [];
  return anchors.anchors.filter((a) => {
    if (!a.modules || a.modules.length === 0) return false;
    return a.modules.some((m) => affectedModules.includes(m));
  });
}

/** 拼 LLM prompt(对单 anchor 判 5 档差异) */
function buildSyncCheckPrompt(
  anchor: LegacyAnchor,
  anchorTextMasked: string,
  changeContext: string,
): string {
  return `你是一名 brownfield sync 审计员。请判断"本次 change"是否要求更新对应"老文档锚点"。

# 本次 change 上下文
${changeContext}

# 老文档锚点(role=${anchor.role}, path=${anchor.path})
${anchorTextMasked}

# 输出要求
按 5 档严重度(critical / major / minor / style / info)输出 0 或多条 diff(JSON 数组,严格)。
- critical:合规 / 安全 / 业务硬约束变化
- major:行为接口变更
- minor:文字描述需更新
- style:格式 / 排版小调整
- info:背景信息(无需更新但可参考)

如果**没有**任何更新需要 → 输出空数组 \`[]\`。

# 输出格式(必须严格遵守)
仅输出 JSON 数组,每项含字段:
\`\`\`
[
  { "severity": "critical|major|minor|style|info", "section": "§4.5", "description": "..." }
]
\`\`\`
不要任何 preamble、不要 markdown code fence。`;
}

/** 跑单 anchor 的 sync-check(给 LLM 判 5 档) */
export async function syncCheckAnchor(
  client: SyncCheckClient,
  anchor: LegacyAnchor,
  anchorText: string,
  changeContext: string,
  redactRules: ReadonlyArray<RedactRule>,
): Promise<Array<Partial<SyncStateDiff>>> {
  const masked = redact(anchorText, redactRules).redactedText;
  const prompt = buildSyncCheckPrompt(anchor, masked, changeContext);
  // P7-07 修复:LLM 调用前数据传输声明(spec §1.1.1 line 40)
  console.log(
    `→ sending ${Buffer.byteLength(prompt, 'utf8')} bytes to Anthropic API (provider=anthropic, region: auto, model=${DEFAULT_MODEL})`,
  );
  const result = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = extractText(result);
  return parseLlmDiffJson(text, anchor);
}

/** 解析 LLM 返回的 diff JSON 数组 */
export function parseLlmDiffJson(
  text: string,
  anchor: LegacyAnchor,
): Array<Partial<SyncStateDiff>> {
  const trimmed = text.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // 解析失败 → 返回 1 条 info(说明 LLM 输出非 JSON,但不阻塞)
    return [
      {
        severity: 'info',
        anchor_path: anchor.path,
        description: `LLM 输出非合法 JSON,无法判定差异:${trimmed.slice(0, 200)}`,
      },
    ];
  }
  if (!Array.isArray(parsed)) {
    return [
      {
        severity: 'info',
        anchor_path: anchor.path,
        description: `LLM 输出非数组:${trimmed.slice(0, 200)}`,
      },
    ];
  }
  return parsed.map((item) => {
    const o = item as Partial<SyncStateDiff>;
    return {
      severity: o.severity,
      section: o.section,
      description: o.description,
      anchor_path: anchor.path,
    };
  });
}

/** 跑全 change 的 sync-check */
export async function runSyncCheck(
  client: SyncCheckClient,
  input: SyncCheckInput,
  readAnchorText: (path: string) => Promise<string>,
  /** P7-05 修复:可选索引 entries 用于预过滤(spec §3.2 line 388) */
  indexEntries?: Array<{ path: string; summary: string }>,
): Promise<SyncCheckOutput> {
  let affected = findAffectedAnchors(input.anchors, input.affectedModules);
  const allDiffs: SyncStateDiff[] = [];
  const redactRules = input.anchors.redact ?? [];
  /** P7-10 修复:汇总缺失锚点路径,部分降级不阻塞其余处理(spec §4.1 line 498) */
  const missingAnchors: string[] = [];

  // P7-05 修复:索引摘要先快速过滤(spec §3.2)。
  // 若提供 indexEntries,LLM 用摘要打分 → 仅"高分"摘要的 anchor 才打开原文。
  // 这里用简化策略:摘要含 changeContext 任一关键词的 anchor 视为高分;
  // indexEntries 缺失时,跳过过滤(全量打开,保留向后兼容)。
  if (indexEntries && indexEntries.length > 0) {
    const keywords = extractKeywords(input.changeContext);
    const filtered = affected.filter((a) => {
      const entry = indexEntries.find((e) => e.path === a.path);
      if (!entry) return true; // 无摘要 → 默认打开(保守)
      return keywords.some((k) => entry.summary.includes(k));
    });
    if (filtered.length > 0) affected = filtered;
  }

  for (const anchor of affected) {
    // P7-10 修复:单 anchor try/catch,缺失文件不阻塞其他 anchor
    let text: string;
    try {
      text = await readAnchorText(anchor.path);
    } catch (err) {
      missingAnchors.push(anchor.path);
      console.warn(`⚠ anchor ${anchor.path} 读取失败:${(err as Error).message};跳过该项继续`);
      continue;
    }
    const partial = await syncCheckAnchor(client, anchor, text, input.changeContext, redactRules);
    const normalized = normalizeDiffsFromLlm(partial);
    for (const d of normalized) {
      allDiffs.push({
        ...d,
        anchor_path: anchor.path,
      });
    }
  }

  // hash 检测(spec §3.2 / §4.3 不变量)
  const hashChecks = await Promise.all(
    affected.map(async (anchor) => ({
      anchor,
      state: (await checkAnchorHash(anchor)).state,
    })),
  );

  // 跨 anchor 冲突(决策 #18 修订):仅当多个 affected 同时 critical/major 时才考虑配对
  const crossInput: CrossRoleInput = {
    mtimeOf: input.mtimeOf,
    autoResolve: input.autoResolveCrossAnchor,
  };
  const crossAnchorConflicts: SyncStateDiff[] = [];
  // 简化策略:对 affected 中跨 role 的 anchor 配对 by role(LLM 已经判过单 anchor 差异)
  // 这里仅在 affected.length >= 2 且至少 2 个 role 不同时,加 1 条 cross_anchor_conflicts(default major)
  const distinctRoles = new Set(affected.map((a) => a.role));
  if (distinctRoles.size >= 2) {
    const decision = decideCrossRole(affected, crossInput);
    if (decision.kind === 'enter-diff') {
      crossAnchorConflicts.push({
        id: allDiffs.length + 1,
        severity: 'major',
        anchor_path: affected.map((a) => a.path).join(' vs '),
        description: `本次 change 跨 ${decision.conflictingRoles.join(' / ')} 多个 role,默认入 diff 让用户审(决策 #18 修订)`,
        status: 'pending',
      });
    }
  }

  // 重新分配 id(全局唯一)
  let counter = 0;
  for (const d of allDiffs) {
    counter += 1;
    d.id = counter;
  }
  for (const d of crossAnchorConflicts) {
    counter += 1;
    d.id = counter;
  }

  const syncState: SyncStateFile = {
    schema: 'forge-legacy-sync/v1',
    change_id: input.changeId,
    generated_at: new Date().toISOString(),
    diffs: allDiffs,
    cross_anchor_conflicts: crossAnchorConflicts.length > 0 ? crossAnchorConflicts : undefined,
  };

  return { syncState, hashChecks, missingAnchors };
}

/** P7-05 辅助:从 changeContext 抽简化关键词(用于索引召回过滤) */
function extractKeywords(text: string): string[] {
  // 取所有中文连续段(2+ 字)+ 英文标识符(3+ 字符)作关键词候选
  const cn = text.match(/[一-龥]{2,}/g) ?? [];
  const en = text.match(/[A-Za-z][A-Za-z0-9_-]{2,}/g) ?? [];
  // 去重 + 长度限制(避免 entry.summary.includes 全 hit)
  return Array.from(new Set([...cn, ...en])).slice(0, 30);
}

function extractText(result: Anthropic.Messages.Message): string {
  const block = result.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  return block?.text ?? '';
}
