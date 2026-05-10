// src/core/migrate/regenerate.ts
// --regenerate 主流程 — Plan 8e Task 5.11
// Spec §2.8 v3 完整流程 + §5.1 复用 legacy-bridge/redact

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { redact } from '../legacy-bridge/redact.js';
import {
  callAnthropic,
  extractFacts,
  extractMotivationFacts,
  extractBehaviorFacts,
  judgeAll,
  getFidelityThreshold,
  QualityFailure,
  AbortInterrupted,
  type AnthropicClient,
} from './quality.js';
import type {
  ClassificationPlan,
  MissingArtifact,
  MigrateSource,
  TraceOp,
  ScannedFile,
} from './types.js';

// 生成用 opus(质量高);extract+judge 用 sonnet(quality.ts 内部已固定)
const REGEN_MODEL = 'claude-opus-4-7';

// ============================================================================
// 公共接口
// ============================================================================

export interface RegenerateContext {
  source: MigrateSource;
  plan: ClassificationPlan;
  cwd: string;
  abortController: AbortController;
  client: AnthropicClient;
  /** 追加一条 TraceOp 到 trace.json */
  appendTraceOp: (op: TraceOp) => Promise<void>;
}

export interface RegenerateResult {
  succeeded: number;
  failed: number;
  /** .partial 文件路径列表(给 report 汇总显示) */
  partials: string[];
}

// ============================================================================
// 主流程
// ============================================================================

/**
 * runRegenerate:遍历 missing artifacts,逐件 regenerate。
 * 失败写 .partial 文件(spec §3.1),用户可查看失败原因。
 * AbortInterrupted → 立即 break,不继续处理后续件。
 */
export async function runRegenerate(ctx: RegenerateContext): Promise<RegenerateResult> {
  const result: RegenerateResult = { succeeded: 0, failed: 0, partials: [] };
  // 枚举缺件(由 MigrateSource.listMissingArtifacts 提供)
  const missing = ctx.source.listMissingArtifacts(ctx.plan);
  // 按源类型取 fidelity 阈值(superpowers 0.6 / openspec 0.9)
  const threshold = getFidelityThreshold(ctx.source.id);

  for (const m of missing) {
    // 检查 abort 信号,若已中断则停止遍历
    if (ctx.abortController.signal.aborted) break;
    try {
      const generated = await regenerateOne(m, ctx, threshold);
      const targetAbs = join(ctx.cwd, m.targetPath);
      await writeFile(targetAbs, generated, 'utf8');
      // 写 TraceOp:regen 字段记录 model / facts 占位(facts 数量在 judgeAll 内部处理)
      await ctx.appendTraceOp({
        from: null,
        to: targetAbs,
        // MissingArtifact.kind 是 'proposal'|'specs';TraceOp.kind 是 ArtifactKind
        // 'specs' 不在 ArtifactKind 里,映射为 'spec'
        kind: m.kind === 'specs' ? 'spec' : 'proposal',
        transform: ['regen'],
        validate: 'ok',
        regen: { model: REGEN_MODEL, facts: 0, passed: 0, threshold },
        writtenAt: new Date().toISOString(),
        status: 'committed',
      });
      result.succeeded++;
    } catch (err) {
      // 分类错误原因:quality 失败 / 中断 / 网络
      const reason =
        err instanceof QualityFailure
          ? `quality-fail: ${err.reason}`
          : err instanceof AbortInterrupted
            ? 'interrupted'
            : 'network-error';
      // .partial 文件:写失败原因注释,让用户知道哪件失败(spec §3.1)
      const partialPath = join(ctx.cwd, `${m.targetPath}.partial-${m.kind}.md`);
      await writeFile(partialPath, `<!-- regen failed: ${reason} -->\n`, 'utf8');
      result.partials.push(partialPath);
      result.failed++;
      // AbortInterrupted → 立即终止整个循环
      if (err instanceof AbortInterrupted) break;
    }
  }
  return result;
}

// ============================================================================
// 单件 regenerate
// ============================================================================

/**
 * regenerateOne:
 * 1. 读 facts source(M15 目标分桶:design → motivation / tasks → behavior / self → generic)
 * 2. redact — 发 LLM 前去除敏感信息(spec §5.1 复用 legacy-bridge/redact)
 * 3. callAnthropic opus 生成目标产物
 * 4. extractFacts 抽 facts 验证覆盖度
 * 5. judgeAll 判定 fidelity,低于阈值抛 QualityFailure
 * 6. 写盘前二次检查 abort(spec §3.1)
 */
async function regenerateOne(
  m: MissingArtifact,
  ctx: RegenerateContext,
  threshold: number,
): Promise<string> {
  // ---- 步骤 1:读 facts source ----
  let factsSourceContent: string;
  if (m.factsSource === 'design') {
    // 从 plan.changes 找对应 slug 的 design 文件
    const designFile = findArtifact(ctx.plan, m.changeSlug, 'design');
    factsSourceContent = designFile ? await readFile(designFile.absPath, 'utf8') : '';
  } else if (m.factsSource === 'tasks') {
    // 从 plan.changes 找对应 slug 的 tasks 文件
    const tasksFile = findArtifact(ctx.plan, m.changeSlug, 'tasks');
    factsSourceContent = tasksFile ? await readFile(tasksFile.absPath, 'utf8') : '';
  } else {
    // 'self' 路径:OpenSpec 件本身作为 facts 源(P5 简化,内容由调用方填充或留空)
    factsSourceContent = '';
  }

  // ---- 步骤 2:redact — 使用内置默认规则(DEFAULT_REDACT_RULES 已内置于 redact()) ----
  const { redactedText } = redact(factsSourceContent);

  // ---- 步骤 3:调 SDK 生成目标(用 opus,质量高) ----
  // proposal:依据 design 输出 forge 格式 proposal.md
  // specs:依据 tasks 输出 forge 格式 specs/<area>.md
  const targetPrompt =
    m.kind === 'proposal'
      ? `基于下面 design,生成符合 forge 格式的 proposal.md(# 标题 + ## Why + ## What):\n\n${redactedText}`
      : `基于下面 tasks,生成符合 forge 格式的 specs/<area>.md(# 标题 + ## Scenario: <id> + **Given/When/Then**):\n\n${redactedText}`;

  const generated = await callAnthropic(ctx.client, {
    model: REGEN_MODEL,
    prompt: targetPrompt,
    maxTokens: 4096,
    signal: ctx.abortController.signal,
  });

  // ---- 步骤 4:抽 facts(M15 目标分桶决定用哪种 extractor) ----
  // design → extractMotivationFacts(问题/动机/约束)
  // tasks  → extractBehaviorFacts(行为/输出)
  // self   → extractFacts(通用)
  const facts =
    m.factsSource === 'design'
      ? await extractMotivationFacts(ctx.client, redactedText, ctx.abortController.signal)
      : m.factsSource === 'tasks'
        ? await extractBehaviorFacts(ctx.client, redactedText, ctx.abortController.signal)
        : await extractFacts(ctx.client, redactedText, ctx.abortController.signal);

  // ---- 步骤 5:judge — 验生成产物覆盖了多少 facts ----
  const judge = await judgeAll(ctx.client, generated, facts, threshold, ctx.abortController.signal);
  if (!judge.passed) {
    // fidelity 不达标 → 抛 QualityFailure(主流程写 .partial)
    throw new QualityFailure('low-fidelity');
  }

  // ---- 步骤 6:写盘前二次检查 abort(spec §3.1) ----
  if (ctx.abortController.signal.aborted) throw new AbortInterrupted();

  return generated;
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * findArtifact:从 ClassificationPlan 中找指定 slug 的 design/tasks 文件。
 * 返回 undefined 表示对应产物不存在(调用方回退到空字符串)。
 */
function findArtifact(
  plan: ClassificationPlan,
  slug: string,
  kind: 'design' | 'tasks',
): ScannedFile | undefined {
  const change = plan.changes.find((c) => c.slug === slug);
  return change?.artifacts[kind];
}
