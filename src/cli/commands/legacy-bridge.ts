// forge legacy-bridge 主命令 + 6 子命令 — Plan 7 Phase A / Layer 3b extract(D2)
// 各子命令在后续 Phase B-D 填实;本 Task 仅完成骨架 + commander 结构
// spec §2.1 子命令一览 + 决策 #22 LLM opt-in 流程

import { Command } from 'commander';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync, statSync, type Dirent } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { acquireLockByPath, LockHeldError } from '../../core/archive/lock.js';
import { loadAnchorsFile, getAuthoritativeAnchors } from '../../core/legacy-bridge/anchors.js';
import { writeAck, checkAck } from '../../core/legacy-bridge/ack.js';
import { formatRedactReport, redact, type RedactReport } from '../../core/legacy-bridge/redact.js';
import {
  runSyncCheck,
  buildSyncCheckTask,
  applySyncCheckResult,
  type SyncCheckClient,
} from '../../core/legacy-bridge/sync-check.js';
import { renderDiffMarkdown, renderDiffYaml } from '../../core/legacy-bridge/diff-report.js';
import { resolveSyncState, ResolveError } from '../../core/legacy-bridge/resolve.js';
import {
  regenerateRole,
  REGEN_FILENAMES,
  RegenOutputError,
  METADATA_ONLY_ROLES,
  buildRegenerateRound1Tasks,
  applyRound1AndBuildRound2,
  applyRound2,
  wrapWithFrontmatterAndDisclaimer,
  validateRegenOutput,
} from '../../core/legacy-bridge/regenerator.js';
import {
  stratifiedSample,
  judgeAllFacts,
  formatQualityReport,
  extractFactsFromOriginal,
  DEFAULT_FIDELITY_THRESHOLD,
  type SamplingOutput,
} from '../../core/legacy-bridge/quality-judge.js';
import {
  estimateRegenerateCost,
  REGEN_WARN_USD,
  checkBudgetGate,
  countdown,
} from '../../core/legacy-bridge/budget.js';
import { computeAnchorHash } from '../../core/legacy-bridge/hash-anchor.js';
import { readAnchorFile, readAnchorAsText } from '../../core/legacy-bridge/encoding.js';
import { writeMapperDraft, buildMapTask, applyMapResult } from '../../core/legacy-bridge/mapper.js';
import { readManifest, consumeManifest, manifestPath } from '../../core/legacy-bridge/llm-task.js';
import type { LlmTask } from '../../core/legacy-bridge/llm-task.js';
import {
  ApiRunner,
  AgentHandoffRunner,
  readTaskResults,
  makeForgeApiClient,
  type RunnerClient,
} from '../../core/legacy-bridge/runners.js';
import { buildIndexTask, applyIndexResult } from '../../core/legacy-bridge/indexer.js';
import { FORGE_VERSION } from '../../index.js';
import type { ForgeConfig } from '../../core/schema/types.js';
import type {
  LegacyAnchorRole,
  RegenQualityFile,
  LegacyAnchorsFile,
  LegacyAnchor,
} from '../../core/legacy-bridge/types.js';
import type { RegenerateClient, RegenerateInput } from '../../core/legacy-bridge/regenerator.js';
import type { JudgeClient } from '../../core/legacy-bridge/quality-judge.js';
import type { IndexEntry } from '../../core/legacy-bridge/indexer.js';
import {
  discoverSources,
  buildExtractTasks,
  applyExtractResult,
  type ExtractResultInput,
} from '../../core/legacy-bridge/extractor.js';
import {
  loadLegacyRequirements,
  validateLegacyRequirementsFile,
  finalizeLegacyRequirements,
  LEGACY_REQUIREMENTS_FILE,
  LEGACY_REQUIREMENTS_DRAFT_FILE,
  LEGACY_REQUIREMENTS_DRAFT_MD,
  type LegacyRequirementsFile,
} from '../../core/legacy-bridge/legacy-requirements.js';

/** spec §5:opt-in gate —— agent 与 --api 两模式都先过。复用既有 checkAck。 */
export async function assertLlmOptIn(
  forgeRoot: string,
): Promise<{ ok: true } | { ok: false; reason: string; graceful: boolean }> {
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath))
    return { ok: false, graceful: false, reason: 'forge/config.yaml 不存在,先跑 forge init' };
  let config: ForgeConfig;
  try {
    config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
  } catch (e) {
    return { ok: false, graceful: false, reason: `config.yaml 格式错误:${(e as Error).message}` };
  }
  // allow_llm_calls=false/缺失 → graceful skip(spec §4 点6:两模式都 graceful skip)
  if (!config.legacy_bridge?.allow_llm_calls) {
    return {
      ok: false,
      graceful: true,
      reason: 'legacy_bridge.allow_llm_calls 未开启 — 跳过(graceful skip)',
    };
  }
  // loadAnchorsFile 对「文件不存在」已返回 null;corrupt(LegacyAnchorsError)不能静默吞 ——
  // 否则 contains_customer_data 的 GDPR 二次确认门会被绕过
  let anchors: LegacyAnchorsFile | null;
  try {
    anchors = await loadAnchorsFile(forgeRoot);
  } catch (e) {
    return {
      ok: false,
      graceful: false,
      reason: `legacy-anchors.yaml 解析失败:${(e as Error).message};修复后重试`,
    };
  }
  const ack = await checkAck(
    forgeRoot,
    config,
    anchors ?? { schema: 'forge-legacy-anchor/v1', anchors: [] },
  );
  if (!ack.ok)
    return {
      ok: false,
      graceful: false,
      reason: `LLM 数据传输 ack 未就绪:${ack.reason ?? '(unknown)'};跑 forge legacy-bridge --acknowledge-data-transfer`,
    };
  return { ok: true };
}

/** 5 子命令通用退出码,与 forge 现有约定一致(spec §4.6) */
export const LB_EXIT_OK = 0;
export const LB_EXIT_GENERAL_ERROR = 1;
export const LB_EXIT_BUSINESS_RULE_FAIL = 2;
export const LB_EXIT_PARTIAL_SUCCESS = 3;
export const LB_EXIT_DATA_CORRUPT = 4;
export const LB_EXIT_LOCK_HELD = 5;

/** map 子命令参数接口(三分支:emit / --apply / --api) */
export interface MapCommandOpts {
  /** 项目根目录(process.cwd() 或测试 fixture) */
  projectRoot: string;
  /** merge(保留用户审过部分) 或 overwrite(全量重生成) */
  mode: 'merge' | 'overwrite';
  /** 消费 agent 结果文件 → 写 draft yaml */
  apply: boolean;
  /** 进程内直接调 Anthropic SDK */
  api: boolean;
}

/**
 * map 子命令三分支执行函数:
 *   默认 → emit manifest(agent 路径);
 *   --apply → 读 agent 结果 → 写 draft yaml;
 *   --api → 进程内调 Anthropic SDK → 写 draft yaml。
 * 返回 exit code(0=成功,1=错误)。
 */
export async function runMapCommand(opts: MapCommandOpts): Promise<number> {
  const forgeRoot = join(opts.projectRoot, 'forge');
  // I-1:--apply(消费 agent 结果)与 --api(进程内调 SDK)语义互斥,同传无意义
  if (opts.apply && opts.api) {
    console.error('✗ --apply 与 --api 互斥,不能同时使用');
    return LB_EXIT_GENERAL_ERROR;
  }
  // --apply 不调 LLM,跳过 opt-in gate;emit / --api 先过 gate(spec §5)
  if (!opts.apply) {
    const optin = await assertLlmOptIn(forgeRoot);
    if (!optin.ok) {
      console.error(`✗ ${optin.reason}`);
      return optin.graceful ? LB_EXIT_OK : LB_EXIT_GENERAL_ERROR;
    }
  }
  if (opts.apply) {
    // --apply 分支:读 manifest → 读 agent 结果 → 后处理 → 写 draft
    // C-1:readManifest 在 manifest 损坏/篡改时抛错,包 try/catch 转友好错误
    let manifest: Awaited<ReturnType<typeof readManifest>>;
    try {
      manifest = await readManifest(forgeRoot, 'map');
    } catch (e) {
      console.error(`✗ map manifest 读取失败:${(e as Error).message}`);
      return LB_EXIT_GENERAL_ERROR;
    }
    if (!manifest) {
      console.error('✗ 无 map manifest;请先跑 forge legacy-bridge map');
      return LB_EXIT_GENERAL_ERROR;
    }
    // C-1:readTaskResults 在结果文件缺失/JSON 截断时抛错,同样包 try/catch
    let result: Awaited<ReturnType<typeof readTaskResults>>[number] | undefined;
    try {
      [result] = await readTaskResults(forgeRoot, manifest.tasks);
    } catch (e) {
      console.error(`✗ agent 结果读取失败:${(e as Error).message}`);
      return LB_EXIT_GENERAL_ERROR;
    }
    // I-2:manifest.tasks 为空时 result 为 undefined,显式守卫避免 TypeError
    if (!result) {
      console.error('✗ map manifest 的 tasks 为空,无 agent 结果');
      return LB_EXIT_GENERAL_ERROR;
    }
    const allFiles = manifest.tasks[0]?.inputs.map((i) => i.source) ?? [];
    // M-2:merge 模式下 legacy-anchors.yaml 损坏不能静默吞 —— 否则 merge 静默退化成 overwrite
    const existing =
      opts.mode === 'merge'
        ? ((await loadAnchorsFile(forgeRoot).catch((e) => {
            console.warn(
              `⚠ legacy-anchors.yaml 读取失败,merge 退化为 overwrite:${(e as Error).message}`,
            );
            return null;
          })) ?? undefined)
        : undefined;
    const out = applyMapResult(result.text, allFiles, { mode: opts.mode, existing });
    await writeMapperDraft(forgeRoot, out);
    await consumeManifest(forgeRoot, 'map');
    console.log('✓ map draft 已写 forge/legacy-anchors-draft.yaml');
    return LB_EXIT_OK;
  }
  // 准备 map task(确定性扫描 + redact + 拼 prompt)
  const task = await buildMapTask({ projectRoot: opts.projectRoot, mode: opts.mode });
  if (opts.api) {
    // --api 分支:进程内调 Anthropic SDK
    const client = (await makeForgeApiClient()) as unknown as RunnerClient;
    const [result] = await new ApiRunner(client).run([task]);
    // I-2:ApiRunner 返回空数组时 result 为 undefined,显式守卫避免 TypeError
    if (!result) {
      console.error('✗ ApiRunner 未返回结果');
      return LB_EXIT_GENERAL_ERROR;
    }
    // M-2:merge 模式下 legacy-anchors.yaml 损坏不能静默吞
    const existing =
      opts.mode === 'merge'
        ? ((await loadAnchorsFile(forgeRoot).catch((e) => {
            console.warn(
              `⚠ legacy-anchors.yaml 读取失败,merge 退化为 overwrite:${(e as Error).message}`,
            );
            return null;
          })) ?? undefined)
        : undefined;
    const out = applyMapResult(
      result.text,
      task.inputs.map((i) => i.source),
      { mode: opts.mode, existing },
    );
    await writeMapperDraft(forgeRoot, out);
    console.log('✓ map draft 已写(--api 单进程)');
    return LB_EXIT_OK;
  }
  // 默认 agent 模式:emit manifest 到 .cache,等 agent fulfill 后跑 --apply
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('map', 1, [task]);
  console.log(
    `✓ map manifest 已写 ${manifestPath(forgeRoot, 'map')}\n  → 请 fulfill 后跑 forge legacy-bridge map --apply(见 skill: legacy-bridge-fulfillment)`,
  );
  return LB_EXIT_OK;
}

// ==========================================================================
// extract 子命令四分支(Task D2)
// ==========================================================================

/** extract 子命令参数(四分支:emit / --apply / --api / --finalize) */
export interface ExtractCommandOpts {
  projectRoot: string;
  apply: boolean;
  api: boolean;
  finalize: boolean;
}

/** 收集 whole-repo 代码文件路径(file tree 索引,供 prompt 内嵌) */
async function collectCodeIndex(repoRoot: string): Promise<string[]> {
  const out: string[] = [];
  const skip = new Set([
    'node_modules',
    '.git',
    'dist',
    'dist-bundled',
    'build',
    'forge',
    '.cache',
  ]);
  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (skip.has(ent.name) || ent.name.startsWith('.')) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) await walk(full);
      else if (ent.isFile()) out.push(relative(repoRoot, full).split('\\').join('/'));
    }
  }
  await walk(repoRoot);
  return out.sort();
}

/**
 * extract 子命令四分支:
 *   默认 → 发现 + buildExtractTasks → emit manifest;
 *   --apply → 读 manifest + agent 结果 → applyExtractResult → 写 draft;
 *   --api → ApiRunner 进程内调 SDK → 同后处理;
 *   --finalize → 读 draft → finalizeLegacyRequirements → 写 legacy-requirements.yaml + 刷新 backlog。
 */
export async function runExtractCommand(opts: ExtractCommandOpts): Promise<number> {
  const forgeRoot = join(opts.projectRoot, 'forge');
  // 互斥校验:--apply / --api / --finalize 三者不能同传(spec §2)
  const exclusive = [opts.apply, opts.api, opts.finalize].filter(Boolean).length;
  if (exclusive > 1) {
    console.error('✗ --apply / --api / --finalize 三者互斥,只能用其一');
    return LB_EXIT_GENERAL_ERROR;
  }

  // --finalize 分支:纯确定性,不调 LLM,不过 opt-in gate(spec §6.2)
  if (opts.finalize) {
    return runExtractFinalize(forgeRoot);
  }

  // --apply 不调 LLM,跳过 opt-in gate;emit / --api 先过 gate(spec §5 / §5.3)
  if (!opts.apply) {
    const optin = await assertLlmOptIn(forgeRoot);
    if (!optin.ok) {
      console.error(`✗ ${optin.reason}`);
      return optin.graceful ? LB_EXIT_OK : LB_EXIT_GENERAL_ERROR;
    }
  }

  if (opts.apply) {
    return runExtractApply(forgeRoot);
  }

  // emit / --api:确定性 prep
  const sources = await discoverSources(opts.projectRoot);
  if (sources.length === 0) {
    console.error(
      '✗ 未发现任何需求文档 / backlog 文件;检查仓库是否有 SRS/PRD/BACKLOG/TODO 命名的文件',
    );
    return LB_EXIT_GENERAL_ERROR;
  }
  const codeIndex = await collectCodeIndex(opts.projectRoot);
  const tasks = await buildExtractTasks(opts.projectRoot, sources, codeIndex);
  // 透明告知(spec §5.3 第 3 点)
  console.log(`→ 本次将把 ${sources.length} 份发现文档交给 LLM(redact 已跑默认规则)`);

  if (opts.api) {
    const client = (await makeForgeApiClient()) as unknown as RunnerClient;
    const results = await new ApiRunner(client).run(tasks);
    const confirmed = await loadLegacyRequirements(forgeRoot);
    const apiInputs: ExtractResultInput[] = results.map((r, i) => ({
      text: r.text,
      source: tasks[i]!.inputs[0]!.source,
      kind: sources[i]!.kind,
    }));
    const out = applyExtractResult(apiInputs, confirmed);
    await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_FILE), out.draftYaml, 'utf8');
    await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_MD), out.draftMarkdown, 'utf8');
    console.log('✓ extract draft 已写(--api 单进程)');
    return LB_EXIT_OK;
  }

  // 默认 agent 模式:emit manifest。已确认 yaml 快照写进 meta —— `--apply` 据此做增量 diff,
  // 不在 apply 时回读磁盘(emit 与 apply 之间 yaml 可能被改;快照随 manifest_hash 锁定基线,spec §4.1/§6.1)
  const confirmedSnapshot = await loadLegacyRequirements(forgeRoot);
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('extract', 1, tasks, {
    confirmed_snapshot: confirmedSnapshot,
  });
  console.log(
    `✓ extract manifest 已写 ${manifestPath(forgeRoot, 'extract')}\n  → 请 fulfill 后跑 forge legacy-bridge extract --apply(见 skill: legacy-bridge-fulfillment)`,
  );
  return LB_EXIT_OK;
}

/** --apply:读 manifest + agent 结果 → 写 draft */
async function runExtractApply(forgeRoot: string): Promise<number> {
  let manifest: Awaited<ReturnType<typeof readManifest>>;
  try {
    manifest = await readManifest(forgeRoot, 'extract');
  } catch (e) {
    console.error(`✗ extract manifest 读取失败:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }
  if (!manifest) {
    console.error('✗ 无 extract manifest;请先跑 forge legacy-bridge extract');
    return LB_EXIT_GENERAL_ERROR;
  }
  let results: Awaited<ReturnType<typeof readTaskResults>>;
  try {
    results = await readTaskResults(forgeRoot, manifest.tasks);
  } catch (e) {
    console.error(`✗ agent 结果读取失败:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }
  // 每个 task 的来源文档 = task.inputs[0].source;kind 由 source 反查
  const applyInputs: ExtractResultInput[] = results.map((r, i) => {
    const src = manifest!.tasks[i]!.inputs[0]!.source;
    return { text: r.text, source: src, kind: inferKind(src) };
  });
  // 增量 diff 基线取自 manifest.meta 的快照(emit 时写入),不回读磁盘 —— manifest_hash 已锁定该快照
  const confirmed = (manifest.meta?.confirmed_snapshot ?? null) as LegacyRequirementsFile | null;
  let out;
  try {
    out = applyExtractResult(applyInputs, confirmed);
  } catch (e) {
    console.error(`✗ extract 结果校验失败:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }
  await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_FILE), out.draftYaml, 'utf8');
  await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_MD), out.draftMarkdown, 'utf8');
  await consumeManifest(forgeRoot, 'extract');
  console.log(
    `✓ extract draft 已写 forge/${LEGACY_REQUIREMENTS_DRAFT_FILE} —— 审改后跑 extract --finalize`,
  );
  return LB_EXIT_OK;
}

/** 据文件名反查 kind(与 extractor.classifyKind 同口径:只看 basename) */
function inferKind(relPath: string): 'srs' | 'backlog-file' | 'issue-export' {
  // 只看文件名本体 —— 否则 docs/issues/SRS.md 这类路径会被整路径里的 'issue' 误判为 issue-export
  const name = basename(relPath).toLowerCase();
  if (/issue/.test(name)) return 'issue-export';
  if (/^(backlog|todo|roadmap)\b/.test(name)) return 'backlog-file';
  return 'srs';
}

/** --finalize:读 draft → finalize → 写 legacy-requirements.yaml + 刷新 backlog */
async function runExtractFinalize(forgeRoot: string): Promise<number> {
  const draftPath = join(forgeRoot, LEGACY_REQUIREMENTS_DRAFT_FILE);
  let raw: string;
  try {
    raw = await readFile(draftPath, 'utf8');
  } catch {
    console.error(
      `✗ 找不到 ${LEGACY_REQUIREMENTS_DRAFT_FILE};请先跑 forge legacy-bridge extract + --apply`,
    );
    return LB_EXIT_GENERAL_ERROR;
  }
  let draftFile;
  try {
    draftFile = validateLegacyRequirementsFile(parseYaml(raw));
  } catch (e) {
    console.error(`✗ draft 校验失败:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }
  const finalized = finalizeLegacyRequirements(draftFile.requirements);
  await writeFile(join(forgeRoot, LEGACY_REQUIREMENTS_FILE), stringifyYaml(finalized), 'utf8');
  console.log(`✓ ${LEGACY_REQUIREMENTS_FILE} 已写(${finalized.requirements.length} 条)`);
  // 立即刷新 backlog(spec §6.2 第 6 步);archive 目录可能不存在 → buildBacklog 已容错(E1)
  try {
    const { generateBacklog } = await import('../../core/backlog/index.js');
    await generateBacklog(forgeRoot);
    console.log('✓ forge/backlog/ 已刷新');
  } catch (e) {
    // legacy-requirements.yaml 已写成功,但 backlog 未刷新 → 部分成功(active.md 暂时陈旧)。
    console.error(
      `⚠ legacy-requirements.yaml 已写,但 backlog 刷新失败:${(e as Error).message}\n  → 请手动跑 forge backlog 刷新`,
    );
    return LB_EXIT_PARTIAL_SUCCESS;
  }
  return LB_EXIT_OK;
}

// ==========================================================================
// index 子命令双路径(Task 6.2)
// ==========================================================================

/** index 子命令参数接口(三分支:emit / --apply / --api) */
export interface IndexCommandOpts {
  /** 项目根目录(process.cwd() 或测试 fixture) */
  projectRoot: string;
  /** 消费 agent 结果文件 → 写 index.md */
  apply: boolean;
  /** 进程内直接调 Anthropic SDK */
  api: boolean;
}

/**
 * index 子命令三分支执行函数:
 *   默认 → buildIndexTask → emit manifest(agent 路径);
 *   --apply → 读 agent 结果 → applyIndexResult → 写 index.md;
 *   --api → 进程内调 Anthropic SDK → 写 index.md。
 * 返回 exit code(0=成功,1=错误)。
 */
export async function runIndexCommand(opts: IndexCommandOpts): Promise<number> {
  const forgeRoot = join(opts.projectRoot, 'forge');
  // I-1:--apply 与 --api 语义互斥
  if (opts.apply && opts.api) {
    console.error('✗ --apply 与 --api 互斥,不能同时使用');
    return LB_EXIT_GENERAL_ERROR;
  }
  // --apply 不调 LLM,跳过 opt-in gate;emit / --api 先过 gate
  if (!opts.apply) {
    const optin = await assertLlmOptIn(forgeRoot);
    if (!optin.ok) {
      console.error(`✗ ${optin.reason}`);
      return optin.graceful ? LB_EXIT_OK : LB_EXIT_GENERAL_ERROR;
    }
  }

  // 读 anchors(--apply 也需要:applyIndexResult 用 file 反查 role)
  const anchors = await loadAnchorsFile(forgeRoot).catch((e) => {
    console.warn(`⚠ legacy-anchors.yaml 读取失败:${(e as Error).message}`);
    return null;
  });

  if (opts.apply) {
    // --apply 分支:读 manifest → 读 agent 结果 → applyIndexResult → 写 index.md
    let manifest: Awaited<ReturnType<typeof readManifest>>;
    try {
      manifest = await readManifest(forgeRoot, 'index');
    } catch (e) {
      console.error(`✗ index manifest 读取失败:${(e as Error).message}`);
      return LB_EXIT_GENERAL_ERROR;
    }
    if (!manifest) {
      console.error('✗ 无 index manifest;请先跑 forge legacy-bridge index');
      return LB_EXIT_GENERAL_ERROR;
    }
    // 从 manifest.meta.prebuilt 取回 metadata-only 已预建项(null-task 分支写的)
    const prebuilt = (manifest.meta?.prebuilt as IndexEntry[] | undefined) ?? [];
    let result: Awaited<ReturnType<typeof readTaskResults>>[number] | undefined;
    try {
      [result] = await readTaskResults(forgeRoot, manifest.tasks);
    } catch (e) {
      console.error(`✗ agent 结果读取失败:${(e as Error).message}`);
      return LB_EXIT_GENERAL_ERROR;
    }
    if (!result) {
      console.error('✗ index manifest 的 tasks 为空,无 agent 结果');
      return LB_EXIT_GENERAL_ERROR;
    }
    // applyIndexResult:LLM 输出 {path:summary} + prebuilt → markdown
    const file = anchors ?? { schema: 'forge-legacy-anchor/v1' as const, anchors: [] };
    const md = applyIndexResult(result.text, file, prebuilt);
    const indexPath = join(forgeRoot, 'docs', 'index.md');
    await mkdir(join(forgeRoot, 'docs'), { recursive: true });
    await writeFile(indexPath, md, 'utf8');
    await consumeManifest(forgeRoot, 'index');
    console.log(`✓ index.md 已写 ${indexPath}`);
    return LB_EXIT_OK;
  }

  // 需要 anchors 才能构建 task
  if (!anchors) {
    console.error('✗ legacy-anchors.yaml 不存在;先跑 forge legacy-bridge map 生成 draft');
    return LB_EXIT_GENERAL_ERROR;
  }

  if (opts.api) {
    // --api 分支:进程内调 Anthropic SDK,走与 agent 路径对称的 buildIndexTask + applyIndexResult
    const { task, prebuilt } = await buildIndexTask(anchors, (anchor) => readAnchorAsText(anchor));
    let resultText = '';
    if (task !== null) {
      const client = (await makeForgeApiClient()) as unknown as RunnerClient;
      const [result] = await new ApiRunner(client).run([task]);
      if (!result) {
        console.error('✗ ApiRunner 未返回结果');
        return LB_EXIT_GENERAL_ERROR;
      }
      resultText = result.text;
    }
    // task===null(全 metadata-only)→ resultText 保持 ''(applyIndexResult 对空串降级,仅渲染 prebuilt)
    const md = applyIndexResult(resultText, anchors, prebuilt);
    const indexPath = join(forgeRoot, 'docs', 'index.md');
    await mkdir(join(forgeRoot, 'docs'), { recursive: true });
    await writeFile(indexPath, md, 'utf8');
    console.log(`✓ index.md 已写(--api 单进程)${indexPath}`);
    return LB_EXIT_OK;
  }

  // 默认 agent 模式:buildIndexTask → 分析 null-task 分支
  const { task, prebuilt } = await buildIndexTask(anchors, (anchor) => readAnchorAsText(anchor));
  if (task === null) {
    // null-task:所有 anchor 均为 metadata-only,无 LLM 工作
    // 直接 applyIndexResult('', file, prebuilt) 写 index.md,不 emit
    console.log('ℹ 所有 anchor 均为 metadata-only,无需 LLM;直接写 index.md');
    const md = applyIndexResult('', anchors, prebuilt);
    const indexPath = join(forgeRoot, 'docs', 'index.md');
    await mkdir(join(forgeRoot, 'docs'), { recursive: true });
    await writeFile(indexPath, md, 'utf8');
    console.log(`✓ index.md 已写 ${indexPath}(metadata-only 路径)`);
    return LB_EXIT_OK;
  }
  // task 非 null:emit manifest,prebuilt 存进 meta 供 --apply 取回
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('index', 1, [task], {
    prebuilt: prebuilt as unknown as Record<string, unknown>[],
  });
  console.log(
    `✓ index manifest 已写 ${manifestPath(forgeRoot, 'index')}\n  → 请 fulfill 后跑 forge legacy-bridge index --apply`,
  );
  return LB_EXIT_OK;
}

// ==========================================================================
// sync-check 子命令双路径(Task 6.2)
// ==========================================================================

/** sync-check 子命令参数接口(三分支:emit / --apply / --api) */
export interface SyncCheckCommandOpts {
  /** 项目根目录 */
  projectRoot: string;
  /** 指定 change-id;默认 '(latest-archive)' */
  changeId?: string;
  /** 消费 agent 结果文件 → 写 sync-state yaml */
  apply: boolean;
  /** 进程内直接调 Anthropic SDK */
  api: boolean;
}

/** 从 changes/<changeId> 目录读 proposal.md + specs/,拼 changeContext + affectedModules */
async function readChangeContext(
  forgeRoot: string,
  changeId: string,
): Promise<{ changeContext: string; affectedModules: string[] }> {
  const changesDir = join(forgeRoot, 'changes', changeId);
  let changeContext = '';
  const affectedModules: string[] = [];
  if (existsSync(join(changesDir, 'proposal.md'))) {
    changeContext += await readFile(join(changesDir, 'proposal.md'), 'utf8');
  }
  if (existsSync(join(changesDir, 'specs'))) {
    const files = await readdir(join(changesDir, 'specs'));
    for (const f of files) {
      const txt = await readFile(join(changesDir, 'specs', f), 'utf8');
      changeContext += `\n## specs/${f}\n${txt}`;
      affectedModules.push(f.replace(/\.md$/, ''));
    }
  }
  return { changeContext, affectedModules };
}

/**
 * sync-check 子命令三分支执行函数:
 *   默认 → buildSyncCheckTask → emit manifest(agent 路径);
 *   --apply → 读 agent 结果 → applySyncCheckResult → 写 sync-state yaml;
 *   --api → 进程内调 Anthropic SDK → 写 sync-state yaml。
 * 返回 exit code(0=成功,1=错误)。
 */
export async function runSyncCheckCommand(opts: SyncCheckCommandOpts): Promise<number> {
  const forgeRoot = join(opts.projectRoot, 'forge');
  // I-1:--apply 与 --api 语义互斥
  if (opts.apply && opts.api) {
    console.error('✗ --apply 与 --api 互斥,不能同时使用');
    return LB_EXIT_GENERAL_ERROR;
  }
  // --apply 不调 LLM,跳过 opt-in gate
  if (!opts.apply) {
    const optin = await assertLlmOptIn(forgeRoot);
    if (!optin.ok) {
      console.error(`✗ ${optin.reason}`);
      return optin.graceful ? LB_EXIT_OK : LB_EXIT_GENERAL_ERROR;
    }
  }

  if (opts.apply) {
    // --apply 分支:读 manifest → 读 agent 结果 → applySyncCheckResult → 写 yaml
    let manifest: Awaited<ReturnType<typeof readManifest>>;
    try {
      manifest = await readManifest(forgeRoot, 'sync-check');
    } catch (e) {
      console.error(`✗ sync-check manifest 读取失败:${(e as Error).message}`);
      return LB_EXIT_GENERAL_ERROR;
    }
    if (!manifest) {
      console.error('✗ 无 sync-check manifest;请先跑 forge legacy-bridge sync-check');
      return LB_EXIT_GENERAL_ERROR;
    }
    let result: Awaited<ReturnType<typeof readTaskResults>>[number] | undefined;
    try {
      [result] = await readTaskResults(forgeRoot, manifest.tasks);
    } catch (e) {
      console.error(`✗ agent 结果读取失败:${(e as Error).message}`);
      return LB_EXIT_GENERAL_ERROR;
    }
    if (!result) {
      console.error('✗ sync-check manifest 的 tasks 为空,无 agent 结果');
      return LB_EXIT_GENERAL_ERROR;
    }
    // I-3:changeId 在 emit 时已写进 manifest.meta;--apply 不带 --change-id 时回退取 meta,
    // 避免写错文件名(emit 用 ch-001,apply 不带就写成 (latest-archive))
    const applyChangeId =
      opts.changeId ?? (manifest.meta?.changeId as string | undefined) ?? '(latest-archive)';
    // manifest.manifest_hash 作 produced_from(双路径 resume gate 复核用)
    const syncState = applySyncCheckResult(result.text, applyChangeId, manifest.manifest_hash);
    const stateDir = join(forgeRoot, 'legacy-sync-state');
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, `${applyChangeId}.md`), renderDiffMarkdown(syncState), 'utf8');
    await writeFile(join(stateDir, `${applyChangeId}.yaml`), renderDiffYaml(syncState), 'utf8');
    await consumeManifest(forgeRoot, 'sync-check');
    console.log(`✓ sync-state 已写 forge/legacy-sync-state/${applyChangeId}.yaml`);
    return LB_EXIT_OK;
  }

  const changeId = opts.changeId ?? '(latest-archive)';

  // emit / --api 需要 anchors
  const anchors = await loadAnchorsFile(forgeRoot).catch((e) => {
    console.warn(`⚠ legacy-anchors.yaml 读取失败:${(e as Error).message}`);
    return null;
  });
  if (!anchors) {
    // 无 anchors → graceful skip(决策 #11)
    console.log('no legacy anchors configured, skipping sync-check');
    return LB_EXIT_OK;
  }

  const configPath = join(forgeRoot, 'config.yaml');
  let config: ForgeConfig;
  try {
    config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
  } catch (e) {
    console.error(`forge/config.yaml 格式错误:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }

  const { changeContext, affectedModules } = await readChangeContext(forgeRoot, changeId);

  const syncInput = {
    changeId,
    changeContext,
    affectedModules,
    anchors,
    autoResolveCrossAnchor: config.legacy_bridge?.auto_resolve_cross_anchor ?? false,
    mtimeOf: (p: string) => {
      try {
        return Math.floor(statSync(p).mtimeMs / 1000);
      } catch {
        return 0;
      }
    },
  };

  if (opts.api) {
    // --api 分支:进程内调 Anthropic SDK
    const client = (await makeForgeApiClient()) as unknown as SyncCheckClient;
    const out = await runSyncCheck(
      client,
      syncInput,
      async (path) => (await readAnchorFile(path)).text,
    );
    const stateDir = join(forgeRoot, 'legacy-sync-state');
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, `${changeId}.md`), renderDiffMarkdown(out.syncState), 'utf8');
    await writeFile(join(stateDir, `${changeId}.yaml`), renderDiffYaml(out.syncState), 'utf8');
    // M-2:遍历 hashChecks 对 stale anchor warn(沿旧 action 写法,--api 才有 hashChecks)
    for (const h of out.hashChecks) {
      if (h.state === 'stale') {
        console.warn(`⚠ anchor ${h.anchor.path} 已改动(用户改了 docs/legacy/);复写产物可能脱节`);
      }
    }
    console.log(`✓ sync-state 已写(--api 单进程)`);
    return LB_EXIT_OK;
  }

  // 默认 agent 模式:buildSyncCheckTask → null-task 分支 / emit manifest
  const task = await buildSyncCheckTask(
    syncInput,
    async (path) => (await readAnchorFile(path)).text,
  );
  if (task === null) {
    // null-task:无受影响 anchor 或全部读取失败 → graceful skip
    console.log('ℹ 无受影响的 anchor,无需 sync-check');
    return LB_EXIT_OK;
  }
  // I-3:changeId 也写进 meta,--apply 不带 --change-id 时可回退;
  // gate_context='standalone' 标记本次非 archive 集成触发
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('sync-check', 1, [task], {
    gate_context: 'standalone',
    changeId,
  });
  console.log(
    `✓ sync-check manifest 已写 ${manifestPath(forgeRoot, 'sync-check')}\n  → 请 fulfill 后跑 forge legacy-bridge sync-check --apply`,
  );
  return LB_EXIT_OK;
}

// ==========================================================================
// regenerate 子命令双路径(Task 6.2 round-2:完整移植 + 默认翻转 agent)
// ==========================================================================

/** regenerate 子命令参数接口(三分支:emit / --apply / --api) */
export interface RegenerateCommandOpts {
  /** 项目根目录 */
  projectRoot: string;
  /** 仅复写指定 role(默认全量;Task 6.2 单 role 接线,多 role 全量留 TODO) */
  role?: LegacyAnchorRole;
  /** 消费 agent 结果文件 → 写产物 */
  apply: boolean;
  /** 进程内直接调 Anthropic SDK */
  api: boolean;
  /** §4.4 dry-run:不调 LLM,只列 anchor + 跑 redact */
  dryRun?: boolean;
  /** 把 authoritative=false 历史版作背景输入 */
  includeHistorical?: boolean;
  /** 输出每条 redact 规则命中数 */
  redactReport?: boolean;
  /** 非 TTY 显式 ack 高 cost(跳过 countdown) */
  yes?: boolean;
  /** 跳过 quality-judge 双 LLM 抽样 */
  skipQuality?: boolean;
}

/**
 * 三处成功路径共用的产物收尾 helper(I-1 + I-2 修):
 *   ① wrapWithFrontmatterAndDisclaimer 包 frontmatter + disclaimer(I-2);
 *   ② 写产物到 forge/docs/regenerated/<role>.md;
 *   ③ computeAnchorHash 回写 anchor.hash + last_regenerated 到 legacy-anchors.yaml(I-1)。
 * 供 --api / --apply round=1 --skip-quality / --apply round=2 passed 三处复用。
 */
async function finalizeRegenProduct(
  forgeRoot: string,
  outPath: string,
  regenBody: string,
  input: RegenerateInput,
  anchor: LegacyAnchor,
  anchorsFile: LegacyAnchorsFile,
): Promise<void> {
  // I-2:补 frontmatter + disclaimer(与 regenerateRole 单进程产物一致)
  const fullMarkdown = wrapWithFrontmatterAndDisclaimer(regenBody, input);
  await writeFile(outPath, fullMarkdown, 'utf8');
  // I-1:anchor hash + last_regenerated 回写 legacy-anchors.yaml
  const hash = await computeAnchorHash(anchor.path);
  anchor.hash = hash ?? anchor.hash;
  anchor.last_regenerated = new Date().toISOString();
  await writeFile(join(forgeRoot, 'legacy-anchors.yaml'), stringifyYaml(anchorsFile), 'utf8');
}

/**
 * regenerate 子命令三分支执行函数(单 role 双路径,Task 6.2 round-2 完整移植):
 *   --dry-run → 列 anchor + redact,不调 LLM 不 emit;
 *   默认 → buildRegenerateRound1Tasks → emit round=1 manifest;
 *   --apply round=1 → applyRound1AndBuildRound2(--skip-quality 时直接写产物)→ emit round=2;
 *   --apply round=2 → applyRound2 → 写产物(含 frontmatter + anchor 回写)/ .partial;
 *   --api → 旧单进程行为忠实移植(成本闸/countdown/regenerateRole/P7-02 抽样/frontmatter/anchor 回写)。
 * 返回 exit code(0=成功,1=错误,2=quality-fail,3=partial-success,5=lock-held)。
 */
export async function runRegenerateCommand(opts: RegenerateCommandOpts): Promise<number> {
  const forgeRoot = join(opts.projectRoot, 'forge');
  // I-1:--apply 与 --api 语义互斥
  if (opts.apply && opts.api) {
    console.error('✗ --apply 与 --api 互斥,不能同时使用');
    return LB_EXIT_GENERAL_ERROR;
  }
  // --apply 不调 LLM,跳过 opt-in gate;--dry-run 也不调 LLM(只读 anchor 跑 redact),
  // 不发数据 → 不过 opt-in gate(对齐 task「--dry-run 优先于一切」);emit / --api 先过 gate
  if (!opts.apply && !opts.dryRun) {
    const optin = await assertLlmOptIn(forgeRoot);
    if (!optin.ok) {
      console.error(`✗ ${optin.reason}`);
      return optin.graceful ? LB_EXIT_OK : LB_EXIT_GENERAL_ERROR;
    }
  }

  // 读 config + anchors(emit / --apply / --api 均需要)
  const configPath = join(forgeRoot, 'config.yaml');
  if (!existsSync(configPath)) {
    console.error('forge/config.yaml 不存在,先跑 forge init');
    return LB_EXIT_GENERAL_ERROR;
  }
  let config: ForgeConfig;
  try {
    config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
  } catch (e) {
    console.error(`forge/config.yaml 格式错误:${(e as Error).message}`);
    return LB_EXIT_GENERAL_ERROR;
  }

  // 读 anchors:损坏 warn(不静默吞 LegacyAnchorsError)
  const anchors = await loadAnchorsFile(forgeRoot).catch((e) => {
    console.warn(`⚠ legacy-anchors.yaml 读取失败:${(e as Error).message}`);
    return null;
  });
  if (!anchors) {
    console.error('✗ legacy-anchors.yaml 不存在;先跑 forge legacy-bridge map 生成 draft');
    return LB_EXIT_GENERAL_ERROR;
  }

  const regenLicense = config.legacy_bridge?.regen_license ?? 'derived-from-source';
  const docsDir = join(forgeRoot, 'docs', 'regenerated');
  // threshold 沿用 quality-judge DEFAULT_FIDELITY_THRESHOLD
  const threshold = DEFAULT_FIDELITY_THRESHOLD;

  // ----------------------------------------------------------------------
  // --apply 分支:读 manifest → 分 round 处理(不调 LLM,跳过 gate / 成本闸)
  // ----------------------------------------------------------------------
  if (opts.apply) {
    let manifest: Awaited<ReturnType<typeof readManifest>>;
    try {
      manifest = await readManifest(forgeRoot, 'regenerate');
    } catch (e) {
      console.error(`✗ regenerate manifest 读取失败:${(e as Error).message}`);
      return LB_EXIT_GENERAL_ERROR;
    }
    if (!manifest) {
      console.error('✗ 无 regenerate manifest;请先跑 forge legacy-bridge regenerate');
      return LB_EXIT_GENERAL_ERROR;
    }

    // M-4:role 在 emit 时已定 → manifest.meta.role 优先于 opts.role;不一致时 warn
    const metaRole = manifest.meta?.role as LegacyAnchorRole | undefined;
    if (metaRole && opts.role && metaRole !== opts.role) {
      console.warn(
        `⚠ --role '${opts.role}' 与 manifest 记录的 role '${metaRole}' 不一致;以 manifest 为准`,
      );
    }
    const taskRole = (metaRole ?? opts.role ?? 'requirements') as LegacyAnchorRole;
    // 从 anchors 反查该 role 的 authoritative anchor(产物收尾要 anchor 回写 hash)
    const applyAnchor = getAuthoritativeAnchors(anchors).find((a) => a.role === taskRole);

    if (manifest.round === 1) {
      // round=1 --apply:applyRound1AndBuildRound2
      let results: Awaited<ReturnType<typeof readTaskResults>>;
      try {
        results = await readTaskResults(forgeRoot, manifest.tasks);
      } catch (e) {
        console.error(`✗ agent 结果读取失败:${(e as Error).message}`);
        return LB_EXIT_GENERAL_ERROR;
      }
      // 按 task.op 区分 regenerate / extract-facts 两结果
      const regenResult = results.find((r) => r.op === 'regenerate');
      const extractResult = results.find((r) => r.op === 'extract-facts');
      if (!regenResult || !extractResult) {
        console.error('✗ round=1 结果不完整:需要 regenerate + extract-facts 两个 task 结果');
        return LB_EXIT_GENERAL_ERROR;
      }

      await mkdir(docsDir, { recursive: true });
      const outPath = join(docsDir, REGEN_FILENAMES[taskRole]);
      const partialPath = `${outPath}.partial`;

      // --skip-quality:不 emit 轮2,直接把 round-1 regenBody 经 frontmatter 包装写产物
      if (opts.skipQuality) {
        // regenBody 仍需过 markdown 合法性校验(validateRegenOutput:空/过短/frontmatter/fence 不闭合);
        // skip-quality 跳过 extract-facts 抽样,但产物校验不能省
        try {
          validateRegenOutput(regenResult.text, taskRole);
        } catch (e) {
          if (e instanceof RegenOutputError) {
            console.error(`✗ ${e.message}`);
            await writeFile(partialPath, regenResult.text, 'utf8');
            console.error(`✗ 已写 ${partialPath}`);
            return LB_EXIT_PARTIAL_SUCCESS;
          }
          throw e;
        }
        if (!applyAnchor) {
          console.error(`✗ role '${taskRole}' 在 legacy-anchors.yaml 无 authoritative anchor`);
          return LB_EXIT_GENERAL_ERROR;
        }
        const input: RegenerateInput = {
          role: taskRole,
          authoritative: applyAnchor,
          forgeVersion: FORGE_VERSION,
          regenLicense,
          globalRedactRules: anchors.redact,
        };
        await finalizeRegenProduct(
          forgeRoot,
          outPath,
          regenResult.text,
          input,
          applyAnchor,
          anchors,
        );
        await consumeManifest(forgeRoot, 'regenerate');
        console.log(`✓ --skip-quality:跳过 quality-judge,直接写产物 ${outPath}`);
        return LB_EXIT_OK;
      }

      // 正常路径:applyRound1AndBuildRound2 → emit 轮2
      let round2Result: { task: LlmTask; sampling: SamplingOutput };
      try {
        round2Result = applyRound1AndBuildRound2(regenResult.text, extractResult.text, taskRole);
      } catch (e) {
        if (e instanceof RegenOutputError) {
          // metadata-only role / extract-facts 空 → 写 .partial,不 emit 轮2
          console.error(`✗ ${e.message}`);
          await writeFile(partialPath, regenResult.text, 'utf8');
          console.error(`✗ 已写 ${partialPath};用户决策:接受 .partial / 重写 prompt`);
          return LB_EXIT_PARTIAL_SUCCESS;
        }
        throw e;
      }

      // 成功:emit round=2 manifest(meta 带 sampling / regenBody / role)
      const { task: r2task, sampling } = round2Result;
      await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('regenerate', 2, [r2task], {
        sampling: sampling as unknown as Record<string, unknown>,
        regenBody: regenResult.text,
        role: taskRole,
      });
      console.log(
        `✓ round=2 manifest 已写 ${manifestPath(forgeRoot, 'regenerate')}\n  → 请 fulfill quality-judge task 后跑 forge legacy-bridge regenerate --apply`,
      );
      return LB_EXIT_OK;
    }

    if (manifest.round === 2) {
      // round=2 --apply:applyRound2 → 写产物 / .partial
      let results: Awaited<ReturnType<typeof readTaskResults>>;
      try {
        results = await readTaskResults(forgeRoot, manifest.tasks);
      } catch (e) {
        console.error(`✗ agent 结果读取失败:${(e as Error).message}`);
        return LB_EXIT_GENERAL_ERROR;
      }
      const judgeResult = results.find((r) => r.op === 'quality-judge');
      if (!judgeResult) {
        console.error('✗ round=2 结果缺失:需要 quality-judge task 结果');
        return LB_EXIT_GENERAL_ERROR;
      }
      // 从 manifest.meta.sampling 取回 SamplingOutput(JSON 往返后 as 类型)
      const sampling = manifest.meta?.sampling as SamplingOutput | undefined;
      if (!sampling) {
        console.error('✗ manifest.meta.sampling 缺失,无法跑 applyRound2');
        return LB_EXIT_GENERAL_ERROR;
      }
      const regenBody = (manifest.meta?.regenBody as string | undefined) ?? '';
      const quality = applyRound2(judgeResult.text, sampling, threshold);
      await mkdir(docsDir, { recursive: true });
      const outPath = join(docsDir, REGEN_FILENAMES[taskRole]);
      const partialPath = `${outPath}.partial`;
      if (!quality.passed) {
        // 不达标:写 .partial + quality YAML(spec §4.3 不变量)
        await writeFile(
          partialPath,
          regenBody ||
            '<!-- 复写正文(来自 manifest.meta.regenBody)为空,请检查 round=1 --apply 是否正确存储 -->',
          'utf8',
        );
        const qualityFile: RegenQualityFile = {
          schema: 'forge-regen-quality/v1',
          role: taskRole,
          generated_at: new Date().toISOString(),
          result: quality,
        };
        await writeFile(`${outPath}.partial.yaml`, stringifyYaml(qualityFile), 'utf8');
        console.error(
          `✗ quality 不达标:total=${(quality.total_rate * 100).toFixed(1)}%,critical=${(quality.critical_rate * 100).toFixed(1)}%`,
        );
        console.error(formatQualityReport(taskRole, quality));
        console.error(`✗ 已写 ${partialPath} 与 ${outPath}.partial.yaml`);
        await consumeManifest(forgeRoot, 'regenerate');
        return LB_EXIT_PARTIAL_SUCCESS;
      }
      // 达标:I-2 补 frontmatter + I-1 回写 anchor hash + 写产物
      if (!applyAnchor) {
        console.error(`✗ role '${taskRole}' 在 legacy-anchors.yaml 无 authoritative anchor`);
        return LB_EXIT_GENERAL_ERROR;
      }
      const input: RegenerateInput = {
        role: taskRole,
        authoritative: applyAnchor,
        forgeVersion: FORGE_VERSION,
        regenLicense,
        globalRedactRules: anchors.redact,
      };
      await finalizeRegenProduct(forgeRoot, outPath, regenBody, input, applyAnchor, anchors);
      await consumeManifest(forgeRoot, 'regenerate');
      console.log(
        `✓ quality 达标:total=${(quality.total_rate * 100).toFixed(1)}%,critical=${(quality.critical_rate * 100).toFixed(1)}%`,
      );
      console.log(`✓ 写产物 ${outPath}(含 frontmatter,anchor hash 已回写)`);
      return LB_EXIT_OK;
    }

    console.error(`✗ manifest.round=${String(manifest.round)} 不识别`);
    return LB_EXIT_GENERAL_ERROR;
  }

  // ----------------------------------------------------------------------
  // emit / --api / --dry-run 共用:确定 authoritative anchor + role
  // ----------------------------------------------------------------------
  const authoritativeAnchors = getAuthoritativeAnchors(anchors)
    .filter((a) => !METADATA_ONLY_ROLES.includes(a.role))
    .filter((a) => !opts.role || a.role === opts.role);
  if (authoritativeAnchors.length === 0) {
    console.error(
      opts.role
        ? `✗ role '${opts.role}' 在 legacy-anchors.yaml 无 authoritative anchor`
        : '✗ legacy-anchors.yaml 无任何 authoritative=true 的非 metadata-only anchor',
    );
    return LB_EXIT_GENERAL_ERROR;
  }
  // Task 6.2 单 role 接线(全量多 role 留给后续):取第一个
  const anchor = authoritativeAnchors[0]!;
  // I-3 修:--include-historical 时收集同 role 的 authoritative=false anchors 作背景输入
  const historical = opts.includeHistorical
    ? (anchors.anchors ?? []).filter((a) => a.role === anchor.role && a.authoritative === false)
    : undefined;
  const regenInput: RegenerateInput = {
    role: anchor.role,
    authoritative: anchor,
    historical,
    forgeVersion: FORGE_VERSION,
    regenLicense,
    globalRedactRules: anchors.redact,
  };

  // ----------------------------------------------------------------------
  // --dry-run:不调 LLM、不 emit,列 anchor + 跑 redact(§4.4,优先于一切)
  // ----------------------------------------------------------------------
  if (opts.dryRun) {
    const globalRules = anchors.redact ?? [];
    const totalReport: RedactReport = { hitsByRule: {}, totalReplacements: 0, redactedText: '' };
    for (const a of authoritativeAnchors) {
      console.log(`[dry-run] role=${a.role} path=${a.path}`);
      const text = await readAnchorAsText(a);
      const customRules = [...globalRules, ...(a.redact ?? [])];
      const report = redact(text, customRules);
      for (const [name, count] of Object.entries(report.hitsByRule)) {
        totalReport.hitsByRule[name] = (totalReport.hitsByRule[name] ?? 0) + count;
      }
      totalReport.totalReplacements += report.totalReplacements;
    }
    if (opts.redactReport) {
      console.log(formatRedactReport(totalReport));
    }
    return LB_EXIT_OK;
  }

  // ----------------------------------------------------------------------
  // --api 分支:旧单进程行为忠实移植(regenerateRole + P7-02 双 LLM 抽样)
  // ----------------------------------------------------------------------
  if (opts.api) {
    // I-1 修:成本闸 + countdown 只对 --api 触发 —— 默认 emit 路径只写 manifest JSON
    // 到 .cache/,不发任何 LLM 请求、不耗 API 额度(agent 路径走会话额度),
    // 故 emit / --apply 路径完全不经成本闸。--api 真在进程内调 API,成本闸语义对它正确。
    const estimated = estimateRegenerateCost(authoritativeAnchors.length);
    const gate = checkBudgetGate(estimated, REGEN_WARN_USD, opts.yes ?? false);
    console.error(gate.message);
    if (!gate.proceed) {
      return gate.exitCode;
    }
    if (gate.requiresCountdown) {
      await countdown(5);
    }

    // 锁(决策 #23):同时获 archive.lock + legacy-bridge.lock,顺序固定
    let releaseArchive: (() => Promise<void>) | undefined;
    let releaseLb: (() => Promise<void>) | undefined;
    try {
      releaseArchive = await acquireLockByPath(
        forgeRoot,
        'legacy-bridge-regenerate',
        'archive.lock',
      );
      releaseLb = await acquireLockByPath(
        forgeRoot,
        'legacy-bridge-regenerate',
        'legacy-bridge.lock',
      );
    } catch (err) {
      // C-1 修:第二把锁(legacy-bridge.lock)获取若抛非 LockHeldError(权限错 / 磁盘满),
      // 第一把 archive.lock 已持有 —— 任何 catch 路径 rethrow / return 前都先释放它,防永久泄漏。
      if (releaseArchive) await releaseArchive();
      if (err instanceof LockHeldError) {
        console.error(`✗ ${err.message}`);
        return LB_EXIT_LOCK_HELD;
      }
      throw err;
    }

    try {
      // RegenerateClient / JudgeClient 结构相同;复用 makeForgeApiClient,double-cast
      const client = (await makeForgeApiClient()) as unknown as RegenerateClient & JudgeClient;
      await mkdir(docsDir, { recursive: true });

      console.log(`→ regenerating role=${anchor.role} (model=claude-sonnet-4-6)`);
      // regenerateRole 内含 redact + LLM 复写 + validateRegenOutput + frontmatter 包装
      const out = await regenerateRole(regenInput, client);

      if (opts.redactReport) {
        console.log(formatRedactReport(out.redactReport));
      }

      const outPath = join(docsDir, REGEN_FILENAMES[anchor.role]);
      const partialPath = `${outPath}.partial`;
      const qualityYamlPath = `${outPath}.partial.yaml`;

      // P7-02:默认跑 quality-judge 双 LLM 抽样;--skip-quality 跳过
      if (!opts.skipQuality) {
        const originalText = (await readAnchorFile(anchor.path)).text;
        console.log(`→ extracting key facts from ${anchor.path} (model B)`);
        const facts = await extractFactsFromOriginal(client, originalText);
        if (facts.length === 0) {
          console.warn(`⚠ 无法从原文抽取 key facts(LLM 输出非合法 JSON);quality-judge 跳过此 role`);
        } else {
          const sampling = stratifiedSample({ allFacts: facts });
          const quality = await judgeAllFacts(client, out.body, sampling);
          if (!quality.passed) {
            // 写 .partial + quality YAML(spec §4.3 不变量)
            await writeFile(partialPath, out.fullMarkdown, 'utf8');
            const qualityFile: RegenQualityFile = {
              schema: 'forge-regen-quality/v1',
              role: anchor.role,
              generated_at: new Date().toISOString(),
              result: quality,
            };
            await writeFile(qualityYamlPath, stringifyYaml(qualityFile), 'utf8');
            console.error(
              `✗ role=${anchor.role} 保真率不达标:total=${(quality.total_rate * 100).toFixed(1)}%, critical=${(quality.critical_rate * 100).toFixed(1)}%`,
            );
            console.error(formatQualityReport(anchor.role, quality));
            console.error(`✗ 已写 ${partialPath} 与 ${qualityYamlPath}`);
            return LB_EXIT_PARTIAL_SUCCESS;
          }
          console.log(
            `✓ quality 达标:total=${(quality.total_rate * 100).toFixed(1)}%, critical=${(quality.critical_rate * 100).toFixed(1)}%`,
          );
        }
      }

      // 写产物(out.fullMarkdown 已含 frontmatter)
      await writeFile(outPath, out.fullMarkdown, 'utf8');
      console.log(
        `✓ wrote ${outPath} (${out.tokensUsed} tokens, ~$${out.estimatedCost.toFixed(3)})`,
      );

      // I-1:anchor hash + last_regenerated 回写 legacy-anchors.yaml
      const hash = await computeAnchorHash(anchor.path);
      anchor.hash = hash ?? anchor.hash;
      anchor.last_regenerated = new Date().toISOString();
      await writeFile(join(forgeRoot, 'legacy-anchors.yaml'), stringifyYaml(anchors), 'utf8');
      console.log(`✓ legacy-anchors.yaml hash + last_regenerated 已更新`);
      return LB_EXIT_OK;
    } catch (err) {
      // RegenOutputError → exit 2(决策 #16);先释放锁再返回
      if (err instanceof RegenOutputError) {
        console.error(`✗ ${err.message}`);
        if (releaseLb) await releaseLb();
        if (releaseArchive) await releaseArchive();
        releaseLb = undefined;
        releaseArchive = undefined;
        return LB_EXIT_BUSINESS_RULE_FAIL;
      }
      throw err;
    } finally {
      if (releaseLb) await releaseLb();
      if (releaseArchive) await releaseArchive();
    }
  }

  // ----------------------------------------------------------------------
  // 默认 agent 模式:buildRegenerateRound1Tasks → emit round=1 manifest
  // ----------------------------------------------------------------------
  let round1Tasks: LlmTask[];
  try {
    round1Tasks = await buildRegenerateRound1Tasks(regenInput);
  } catch (e) {
    if (e instanceof RegenOutputError) {
      // metadata-only role(理论上已被上面 filter 排除,防御性处理)
      console.error(`✗ ${e.message}`);
      return LB_EXIT_GENERAL_ERROR;
    }
    throw e;
  }
  await new AgentHandoffRunner(forgeRoot, FORGE_VERSION).emit('regenerate', 1, round1Tasks, {
    role: anchor.role,
  });
  console.log(
    `✓ regenerate round=1 manifest 已写 ${manifestPath(forgeRoot, 'regenerate')}\n  → 请 fulfill 后跑 forge legacy-bridge regenerate --apply`,
  );
  return LB_EXIT_OK;
}

/** 主命令 build:无参数走 help;含 --acknowledge-data-transfer 时进入 ack 流程(Phase B1 填) */
export function buildLegacyBridgeCommand(): Command {
  const cmd = new Command('legacy-bridge')
    .description('Brownfield onboarding:与老文档体系并存 + archive→legacy 单向同步(v0.2)')
    .option('--acknowledge-data-transfer', 'opt-in:ack 数据将被发送到 LLM provider(决策 #22)')
    .option('--acknowledge-customer-data', '同时 ack 含客户数据的 anchor(§4.5 GDPR 二次确认门)');

  cmd.action(
    async (opts: { acknowledgeDataTransfer?: boolean; acknowledgeCustomerData?: boolean }) => {
      // M2 修:--acknowledge-customer-data 必须与 --acknowledge-data-transfer 同用,
      // 单独传不应静默走 help(用户不知 flag 没生效)
      if (opts.acknowledgeCustomerData && !opts.acknowledgeDataTransfer) {
        console.error('✗ --acknowledge-customer-data 必须与 --acknowledge-data-transfer 同时使用');
        process.exit(LB_EXIT_GENERAL_ERROR);
      }
      if (opts.acknowledgeDataTransfer) {
        const forgeRoot = join(process.cwd(), 'forge');
        const configPath = join(forgeRoot, 'config.yaml');
        if (!existsSync(configPath)) {
          console.error('forge/config.yaml 不存在,先跑 forge init 初始化项目');
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        // I1 修:config.yaml 格式损坏时 parseYaml 抛异常,用 try/catch 包装给友好提示
        let config: ForgeConfig;
        try {
          config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
        } catch (e) {
          console.error(`forge/config.yaml 格式错误:${(e as Error).message}`);
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        if (!config.legacy_bridge?.allow_llm_calls) {
          console.error(
            '✗ forge/config.yaml 未声明 legacy_bridge.allow_llm_calls: true,请先在 config 加该字段',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        // 检 anchors 中是否有 contains_customer_data
        const anchors = await loadAnchorsFile(forgeRoot);
        const hasCustomerData = (anchors?.anchors ?? []).some(
          (a) => a.contains_customer_data === true,
        );
        if (hasCustomerData && !opts.acknowledgeCustomerData) {
          console.error(
            '✗ legacy-anchors.yaml 标有 contains_customer_data=true 的 anchor;\n' +
              '请加 --acknowledge-customer-data 一并确认(§4.5 GDPR)',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        await writeAck(forgeRoot, config, hasCustomerData);
        console.log(
          `✓ ack 已写入 forge/.cache/llm-ack.yaml(customer_data_acknowledged=${hasCustomerData})`,
        );
        process.exit(LB_EXIT_OK);
      }
      cmd.help();
    },
  );

  // 5 个子命令骨架(各 Phase 填实)
  cmd
    .command('map')
    .description('扫 docs/ + src/ → LLM 推测 → legacy-anchors-draft.yaml(决策 #4)')
    .option('--merge', '与已存在 anchors.yaml 合并新发现项,保留用户审过部分(默认)', true)
    .option('--overwrite', '全量重生成(覆盖用户改动)')
    .option('--docs-paths <paths>', '逗号分隔的额外 docs 目录(默认扫 docs/ doc/ document/)')
    .option('--redact-report', '输出每条 redact 规则的命中数(决策 #20)')
    .option('--apply', '消费 agent 已写入的结果文件 → 产 draft yaml(默认 agent 路径第二步)')
    .option('--api', '进程内直接调 Anthropic SDK(跳过 agent 交接;需 ANTHROPIC_API_KEY)')
    .action(
      async (opts: {
        merge?: boolean;
        overwrite?: boolean;
        docsPaths?: string;
        redactReport?: boolean;
        apply?: boolean;
        api?: boolean;
      }) => {
        // mode 决策(M-2):--overwrite 优先;否则 merge(默认)
        const mode: 'merge' | 'overwrite' = opts.overwrite ? 'overwrite' : 'merge';
        // 调 runMapCommand 完成三分支逻辑(emit / --apply / --api)
        const code = await runMapCommand({
          projectRoot: process.cwd(),
          mode,
          apply: opts.apply ?? false,
          api: opts.api ?? false,
        });
        process.exit(code);
      },
    );

  cmd
    .command('regenerate')
    .description('LLM 复写规范 SRS/HLD/LLD/system-tests + 双 LLM 抽样验证(决策 #14-#16)')
    .option('--role <role>', '仅复写指定 role(默认全 4 role)')
    .option('--dry-run', '不调 LLM,只估算 cost + 列要扫的文件(§4.4)')
    .option('--include-historical', '把 authoritative=false 历史版作背景(默认关)')
    .option('--redact-report', '输出每条 redact 规则的命中数')
    .option('--yes', '非 TTY 必须显式 ack 高 cost 才继续(M-4)')
    .option('--skip-quality', '跳过 quality-judge 双 LLM 抽样(性能 / 调试用;P7-02 默认跑)')
    .option('--apply', '消费 agent 已写入的结果文件 → 写产物(默认 agent 路径第二步)')
    .option('--api', '进程内直接调 Anthropic SDK(跳过 agent 交接;需 ANTHROPIC_API_KEY)')
    .action(
      async (opts: {
        role?: LegacyAnchorRole;
        dryRun?: boolean;
        includeHistorical?: boolean;
        redactReport?: boolean;
        yes?: boolean;
        skipQuality?: boolean;
        apply?: boolean;
        api?: boolean;
      }) => {
        // Task 6.2 round-2:无条件路由到 runRegenerateCommand(默认 emit / --apply / --api)
        // 与 index / sync-check 一致:收集所有 option,无条件调,process.exit(code)
        const code = await runRegenerateCommand({
          projectRoot: process.cwd(),
          role: opts.role,
          apply: opts.apply ?? false,
          api: opts.api ?? false,
          dryRun: opts.dryRun ?? false,
          includeHistorical: opts.includeHistorical ?? false,
          redactReport: opts.redactReport ?? false,
          yes: opts.yes ?? false,
          skipQuality: opts.skipQuality ?? false,
        });
        process.exit(code);
      },
    );

  cmd
    .command('index')
    .description('为每个 anchor 生成 ~100 字 LLM 摘要(决策 #14 Layer 2)')
    .option('--yes', '非 TTY 必须显式 ack')
    .option('--apply', '消费 agent 已写入的结果文件 → 写 index.md(默认 agent 路径第二步)')
    .option('--api', '进程内直接调 Anthropic SDK(跳过 agent 交接;需 ANTHROPIC_API_KEY)')
    .action(async (opts: { yes?: boolean; apply?: boolean; api?: boolean }) => {
      const code = await runIndexCommand({
        projectRoot: process.cwd(),
        apply: opts.apply ?? false,
        api: opts.api ?? false,
      });
      process.exit(code);
    });

  cmd
    .command('sync-check')
    .description('检测 change 影响的老锚点是否需更新 → 5 档差异报告(决策 #5/#19)')
    .option('--change-id <id>', '指定 change-id;默认取最近一次 archive')
    .option('--apply', '消费 agent 已写入的结果文件 → 写 sync-state yaml(默认 agent 路径第二步)')
    .option('--api', '进程内直接调 Anthropic SDK(跳过 agent 交接;需 ANTHROPIC_API_KEY)')
    .action(async (opts: { changeId?: string; apply?: boolean; api?: boolean }) => {
      const code = await runSyncCheckCommand({
        projectRoot: process.cwd(),
        changeId: opts.changeId,
        apply: opts.apply ?? false,
        api: opts.api ?? false,
      });
      process.exit(code);
    });

  cmd
    .command('resolve <change-id>')
    .description('校验 sync-state diffs 全部 ack 后标 resolved(决策 #19)')
    .action(async (changeId: string) => {
      const forgeRoot = join(process.cwd(), 'forge');
      let release: (() => Promise<void>) | undefined;
      try {
        release = await acquireLockByPath(forgeRoot, 'legacy-bridge-resolve', 'legacy-bridge.lock');
      } catch (err) {
        if (err instanceof LockHeldError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_LOCK_HELD);
          return;
        }
        throw err;
      }

      try {
        await resolveSyncState(forgeRoot, changeId);
        console.log(`✓ ${changeId} 全部 diffs 已 ack,sync-state 标 resolved`);
        process.exit(LB_EXIT_OK);
      } catch (err) {
        if (err instanceof ResolveError) {
          console.error(`✗ ${err.message}`);
          if (err.kind === 'invalid-status') process.exit(LB_EXIT_GENERAL_ERROR);
          if (err.kind === 'state-not-found') process.exit(LB_EXIT_GENERAL_ERROR);
          // pending-remaining
          process.exit(LB_EXIT_BUSINESS_RULE_FAIL);
          return;
        }
        throw err;
      } finally {
        if (release) await release();
      }
    });

  cmd
    .command('extract')
    .description('扫全仓库老文档 → LLM 抽需求 + 判实现 → legacy-requirements.yaml(Layer 3b)')
    .option('--apply', '消费 agent 已写入的结果文件 → 产 draft yaml')
    .option('--api', '进程内直接调 Anthropic SDK(需 ANTHROPIC_API_KEY)')
    .option('--finalize', '读 draft → 分配 ID → 转正为 legacy-requirements.yaml')
    .action(async (opts: { apply?: boolean; api?: boolean; finalize?: boolean }) => {
      const code = await runExtractCommand({
        projectRoot: process.cwd(),
        apply: opts.apply ?? false,
        api: opts.api ?? false,
        finalize: opts.finalize ?? false,
      });
      process.exit(code);
    });

  return cmd;
}
