// forge legacy-bridge 主命令 + 5 子命令骨架 — Plan 7 Phase A
// 各子命令在后续 Phase B-D 填实;本 Task 仅完成骨架 + commander 结构
// spec §2.1 子命令一览 + 决策 #22 LLM opt-in 流程

import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import Anthropic from '@anthropic-ai/sdk';
import { acquireLockByPath, LockHeldError } from '../../core/archive/lock.js';
import {
  loadAnchorsFile,
  getAuthoritativeAnchors,
  LegacyAnchorsError,
} from '../../core/legacy-bridge/anchors.js';
import { writeAck, checkAck, renderOptinPrompt } from '../../core/legacy-bridge/ack.js';
import { formatRedactReport, redact, type RedactReport } from '../../core/legacy-bridge/redact.js';
import { runSyncCheck, type SyncCheckClient } from '../../core/legacy-bridge/sync-check.js';
import {
  renderDiffMarkdown,
  renderDiffYaml,
  hasCriticalPending,
} from '../../core/legacy-bridge/diff-report.js';
import { resolveSyncState, ResolveError } from '../../core/legacy-bridge/resolve.js';
import {
  regenerateRole,
  REGEN_FILENAMES,
  RegenOutputError,
  METADATA_ONLY_ROLES,
} from '../../core/legacy-bridge/regenerator.js';
import {
  stratifiedSample,
  judgeAllFacts,
  formatQualityReport,
  extractFactsFromOriginal,
} from '../../core/legacy-bridge/quality-judge.js';
import {
  estimateRegenerateCost,
  REGEN_WARN_USD,
  checkBudgetGate,
  countdown,
} from '../../core/legacy-bridge/budget.js';
import { computeAnchorHash } from '../../core/legacy-bridge/hash-anchor.js';
import { readAnchorFile, readAnchorAsText } from '../../core/legacy-bridge/encoding.js';
import { runMapper, writeMapperDraft, type MapperClient } from '../../core/legacy-bridge/mapper.js';
import {
  buildIndex,
  renderIndexMarkdown,
  type IndexerClient,
} from '../../core/legacy-bridge/indexer.js';
import { FORGE_VERSION } from '../../index.js';
import type { ForgeConfig } from '../../core/schema/types.js';
import type { LegacyAnchorRole, RegenQualityFile } from '../../core/legacy-bridge/types.js';
import type { RegenerateClient } from '../../core/legacy-bridge/regenerator.js';
import type { JudgeClient } from '../../core/legacy-bridge/quality-judge.js';

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
  const anchors = await loadAnchorsFile(forgeRoot).catch(() => null);
  const ack = await checkAck(
    forgeRoot,
    config,
    anchors ?? { schema: 'forge-legacy-anchor/v1', anchors: [] },
  );
  if (!ack.ok)
    return {
      ok: false,
      graceful: false,
      reason: `LLM 数据传输 ack 未就绪:${ack.reason};跑 forge legacy-bridge --acknowledge-data-transfer`,
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
    .option('--overwrite', '全量重生成(覆盖用户改动,需用户确认)')
    .option('--docs-paths <paths>', '逗号分隔的额外 docs 目录(默认扫 docs/ doc/ document/)')
    .option('--redact-report', '输出每条 redact 规则的命中数(决策 #20)')
    .action(
      async (opts: {
        merge?: boolean;
        overwrite?: boolean;
        docsPaths?: string;
        redactReport?: boolean;
      }) => {
        const projectRoot = process.cwd();
        const forgeRoot = join(projectRoot, 'forge');
        const configPath = join(forgeRoot, 'config.yaml');
        if (!existsSync(configPath)) {
          console.error('forge/config.yaml 不存在,先跑 forge init');
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
        const existingAnchors = await loadAnchorsFile(forgeRoot).catch(() => null);

        // mode 决策(M-2):--overwrite 优先;否则 merge(默认)
        const mode: 'merge' | 'overwrite' = opts.overwrite ? 'overwrite' : 'merge';
        if (mode === 'overwrite' && existingAnchors) {
          console.warn(
            '⚠ --overwrite 将覆盖现有 legacy-anchors.yaml(用户审过的部分会丢);确认请按 Enter,Ctrl-C 取消',
          );
          if (process.stdout.isTTY) {
            await new Promise<void>((resolve) => process.stdin.once('data', () => resolve()));
          }
        }

        // ack 检查(决策 #22 LLM opt-in)
        const ack = await checkAck(forgeRoot, config, existingAnchors);
        if (!ack.ok) {
          console.error(renderOptinPrompt(ack.reason, ack.customerDataPaths));
          process.exit(LB_EXIT_GENERAL_ERROR);
        }

        // 锁
        let release: (() => Promise<void>) | undefined;
        try {
          release = await acquireLockByPath(forgeRoot, 'legacy-bridge-map', 'legacy-bridge.lock');
        } catch (err) {
          if (err instanceof LockHeldError) {
            console.error(`✗ ${err.message}`);
            process.exit(LB_EXIT_LOCK_HELD);
          }
          throw err;
        }

        try {
          // 动态加载 forge-eval/load-env(同 regenerate / sync-check 子命令)
          const evalLoadEnvPath = new URL('../../../forge-eval/load-env.js', import.meta.url).href;
          const { loadEnv } = (await import(/* @vite-ignore */ evalLoadEnvPath)) as {
            loadEnv: () => { anthropicApiKey: string };
          };
          const { anthropicApiKey } = loadEnv();
          // Anthropic overload signature 与 MapperClient 单签名接口不兼容,需 double-cast
          const client = new Anthropic({ apiKey: anthropicApiKey }) as unknown as MapperClient;
          const docsPaths = opts.docsPaths
            ? opts.docsPaths.split(',').map((s) => s.trim())
            : undefined;
          const out = await runMapper(client, {
            projectRoot,
            docsPaths,
            scanSrc: true,
            mode,
            existing: existingAnchors ?? undefined,
          });
          const { yamlPath, mdPath } = await writeMapperDraft(forgeRoot, out);
          console.log(`✓ wrote ${yamlPath}`);
          console.log(`✓ wrote ${mdPath}`);
          console.log(
            `   新增 ${out.newAnchors.length} 个 anchor(merge 保留 ${out.preservedAnchors.length});unmatched ${out.unmatched.length} 个文件需用户审`,
          );
          console.log(
            '下一步:审改 legacy-anchors-draft.yaml 后跑 mv legacy-anchors-draft.yaml legacy-anchors.yaml',
          );
          process.exit(LB_EXIT_OK);
        } finally {
          if (release) await release();
        }
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
    .action(
      async (opts: {
        role?: LegacyAnchorRole;
        dryRun?: boolean;
        includeHistorical?: boolean;
        redactReport?: boolean;
        yes?: boolean;
        skipQuality?: boolean;
      }) => {
        const forgeRoot = join(process.cwd(), 'forge');
        const configPath = join(forgeRoot, 'config.yaml');
        if (!existsSync(configPath)) {
          console.error('forge/config.yaml 不存在,先跑 forge init');
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        let config: ForgeConfig;
        try {
          config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
        } catch (e) {
          console.error(`forge/config.yaml 格式错误:${(e as Error).message}`);
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        const anchors = await loadAnchorsFile(forgeRoot).catch((err) => {
          if (err instanceof LegacyAnchorsError) {
            console.error(`✗ ${err.message}`);
            process.exit(LB_EXIT_GENERAL_ERROR);
          }
          throw err;
        });
        if (!anchors) {
          console.error(
            '✗ legacy-anchors.yaml 不存在;请先跑 forge legacy-bridge map 生成 draft 后审改',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }

        // ack 检查(决策 #22)
        const ackResult = await checkAck(forgeRoot, config, anchors);
        if (!ackResult.ok) {
          console.error(renderOptinPrompt(ackResult.reason, ackResult.customerDataPaths));
          process.exit(LB_EXIT_GENERAL_ERROR);
        }

        // 估算 cost + budget gate
        // P7-03 修复:过滤掉 metadata-only role(spec §7 line 909)
        const authoritativeAnchors = getAuthoritativeAnchors(anchors)
          .filter((a) => !METADATA_ONLY_ROLES.includes(a.role))
          .filter((a) => !opts.role || a.role === opts.role);
        if (authoritativeAnchors.length === 0) {
          console.error(
            opts.role
              ? `✗ role '${opts.role}' 在 legacy-anchors.yaml 无 authoritative anchor`
              : '✗ legacy-anchors.yaml 无任何 authoritative=true 的 anchor',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        const estimated = estimateRegenerateCost(authoritativeAnchors.length);
        const gate = checkBudgetGate(estimated, REGEN_WARN_USD, opts.yes ?? false);
        console.error(gate.message);
        if (!gate.proceed) {
          process.exit(gate.exitCode);
        }
        if (gate.requiresCountdown && !opts.dryRun) {
          await countdown(5);
        }

        if (opts.dryRun) {
          // §4.4 dry-run:不调 LLM,但会真读 anchor + 跑 redact;
          // Phase F follow-up:让 --dry-run --redact-report 可独立验证 redact 规则真生效
          // (release-gate-checklist §2.4.2 期望的输出路径)
          // xlsx 路径走 readAnchorAsText 真过 exceljs 解析;不支持特性时抛 ExcelParseError
          // 让 §2.4.6 也能在不调 LLM 的前提下端到端验证 Excel 解析
          // 全局 redact 规则 = anchors 文件级 redact + 每 anchor 自身 redact(redact() 内部合并)
          const globalRules = anchors.redact ?? [];
          // 累加汇总每 anchor 的命中数(redactedText 在 dry-run 不需要,仅占位)
          const totalReport: RedactReport = {
            hitsByRule: {},
            totalReplacements: 0,
            redactedText: '',
          };
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
          process.exit(LB_EXIT_OK);
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
          if (err instanceof LockHeldError) {
            console.error(`✗ ${err.message}`);
            // I-fix:即使一把已 acquired,catch 路径要释放它
            if (releaseArchive) await releaseArchive();
            process.exit(LB_EXIT_LOCK_HELD);
          }
          throw err;
        }

        try {
          // 运行时动态加载 forge-eval/load-env(避免 src/ rootDir 静态分析边界限制;
          // 使用 Function constructor 跳过 TS static import trace)
          const evalLoadEnvPath = new URL('../../../forge-eval/load-env.js', import.meta.url).href;
          const { loadEnv } = (await import(/* @vite-ignore */ evalLoadEnvPath)) as {
            loadEnv: () => { anthropicApiKey: string };
          };
          const { anthropicApiKey } = loadEnv();
          // RegenerateClient / JudgeClient 结构相同;Anthropic overload signature 与单签名接口不兼容,需 double-cast
          const client = new Anthropic({
            apiKey: anthropicApiKey,
          }) as unknown as RegenerateClient & JudgeClient;

          const regenLicense = config.legacy_bridge?.regen_license ?? 'derived-from-source';
          const docsDir = join(forgeRoot, 'docs', 'regenerated');
          await mkdir(docsDir, { recursive: true });

          // P7-02 修复:跨 role 汇总 quality 状态;循环结束后统一 exit 2(决策 #16:无 retry)
          let anyQualityFailed = false;

          for (const anchor of authoritativeAnchors) {
            console.log(`→ regenerating role=${anchor.role} (model=claude-sonnet-4-6)`);
            // I-3 修:--include-historical 时收集同 role 的 authoritative=false anchors 作背景输入
            const historical = opts.includeHistorical
              ? (anchors.anchors ?? []).filter(
                  (a) => a.role === anchor.role && a.authoritative === false,
                )
              : undefined;

            const out = await regenerateRole(
              {
                role: anchor.role,
                authoritative: anchor,
                historical,
                forgeVersion: FORGE_VERSION,
                regenLicense,
                globalRedactRules: anchors.redact,
              },
              client,
            );

            if (opts.redactReport) {
              console.log(formatRedactReport(out.redactReport));
            }

            // P7-02 修复:regenerate 内置双 LLM 抽样验证(spec §3.1 line 336-339 / 决策 #16)
            // 默认走 quality-judge;--skip-quality 时跳过(性能 / 调试用)
            const outPath = join(docsDir, REGEN_FILENAMES[anchor.role]);
            const partialPath = `${outPath}.partial`;
            const qualityYamlPath = `${outPath}.partial.yaml`;
            if (!opts.skipQuality) {
              const originalText = (await readAnchorFile(anchor.path)).text;
              console.log(`→ extracting key facts from ${anchor.path} (model B)`);
              const facts = await extractFactsFromOriginal(client, originalText);
              if (facts.length === 0) {
                console.warn(
                  `⚠ 无法从原文抽取 key facts(LLM 输出非合法 JSON);quality-judge 跳过此 role`,
                );
              } else {
                const sampling = stratifiedSample({ allFacts: facts });
                const quality = await judgeAllFacts(client, out.body, sampling);
                if (!quality.passed) {
                  anyQualityFailed = true;
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
                  console.error(
                    `✗ 已写 ${partialPath} 与 ${qualityYamlPath};用户决策:接受 .partial / 重写 prompt 重跑 / 手补`,
                  );
                  // 不立即 exit,完成所有 role 后统一 exit 2(决策 #16:无 retry)
                  continue;
                }
                console.log(
                  `✓ quality 达标:total=${(quality.total_rate * 100).toFixed(1)}%, critical=${(quality.critical_rate * 100).toFixed(1)}%`,
                );
              }
            }

            // 写产物
            await writeFile(outPath, out.fullMarkdown, 'utf8');
            console.log(
              `✓ wrote ${outPath} (${out.tokensUsed} tokens, ~$${out.estimatedCost.toFixed(3)})`,
            );

            // 更新 anchor 的 hash + last_regenerated(写回 yaml)
            const hash = await computeAnchorHash(anchor.path);
            anchor.hash = hash ?? anchor.hash;
            anchor.last_regenerated = new Date().toISOString();
          }

          // 写回 anchors.yaml(更新 hash + last_regenerated)
          await writeFile(join(forgeRoot, 'legacy-anchors.yaml'), stringifyYaml(anchors), 'utf8');
          console.log(`✓ legacy-anchors.yaml hash + last_regenerated 已更新`);

          // P7-02 修复:任一 role 不达标 → exit 2(决策 #16 / spec §3.1 line 339,无 retry)
          // 注:process.exit 在 try 块内调用,但 finally 仍会跑(Node 行为);
          // anyQualityFailed 路径锁释放由 finally 负责(release 函数 idempotent,二次 rm 不存在文件不抛)
          if (anyQualityFailed) {
            process.exit(LB_EXIT_BUSINESS_RULE_FAIL);
          }
        } catch (err) {
          // 捕获 RegenOutputError / 其他;先释放锁再抛
          if (err instanceof RegenOutputError) {
            console.error(`✗ ${err.message}`);
            // 释放锁并设 undefined → finally 块因此跳过重复释放(避免 idempotent 依赖)
            if (releaseLb) await releaseLb();
            if (releaseArchive) await releaseArchive();
            releaseLb = undefined;
            releaseArchive = undefined;
            process.exit(LB_EXIT_BUSINESS_RULE_FAIL);
          }
          throw err;
        } finally {
          if (releaseLb) await releaseLb();
          if (releaseArchive) await releaseArchive();
        }
      },
    );

  cmd
    .command('index')
    .description('为每个 anchor 生成 ~100 字 LLM 摘要(决策 #14 Layer 2)')
    .option('--yes', '非 TTY 必须显式 ack')
    .action(async (_opts: { yes?: boolean }) => {
      const forgeRoot = join(process.cwd(), 'forge');
      const configPath = join(forgeRoot, 'config.yaml');
      if (!existsSync(configPath)) {
        console.error('forge/config.yaml 不存在,先跑 forge init');
        process.exit(LB_EXIT_GENERAL_ERROR);
      }
      const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
      const anchors = await loadAnchorsFile(forgeRoot).catch((err) => {
        if (err instanceof LegacyAnchorsError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        throw err;
      });
      if (!anchors) {
        console.error('✗ legacy-anchors.yaml 不存在;先跑 forge legacy-bridge map 生成 draft');
        process.exit(LB_EXIT_GENERAL_ERROR);
      }
      const ack = await checkAck(forgeRoot, config, anchors);
      if (!ack.ok) {
        console.error(renderOptinPrompt(ack.reason, ack.customerDataPaths));
        process.exit(LB_EXIT_GENERAL_ERROR);
      }

      // 锁(同 regenerate:archive + legacy-bridge 双锁)
      let releaseLb: (() => Promise<void>) | undefined;
      let releaseArchive: (() => Promise<void>) | undefined;
      try {
        releaseArchive = await acquireLockByPath(forgeRoot, 'legacy-bridge-index', 'archive.lock');
        releaseLb = await acquireLockByPath(forgeRoot, 'legacy-bridge-index', 'legacy-bridge.lock');
      } catch (err) {
        if (err instanceof LockHeldError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_LOCK_HELD);
        }
        throw err;
      }

      try {
        const evalLoadEnvPath = new URL('../../../forge-eval/load-env.js', import.meta.url).href;
        const { loadEnv } = (await import(/* @vite-ignore */ evalLoadEnvPath)) as {
          loadEnv: () => { anthropicApiKey: string };
        };
        const { anthropicApiKey } = loadEnv();
        // double-cast 同 mapper 子命令
        const client = new Anthropic({ apiKey: anthropicApiKey }) as unknown as IndexerClient;
        const entries = await buildIndex(client, anchors);
        const md = renderIndexMarkdown(entries);
        const indexPath = join(forgeRoot, 'docs', 'index.md');
        await mkdir(join(forgeRoot, 'docs'), { recursive: true });
        await writeFile(indexPath, md, 'utf8');
        console.log(`✓ wrote ${indexPath} (${entries.length} entries)`);
        process.exit(LB_EXIT_OK);
      } finally {
        if (releaseLb) await releaseLb();
        if (releaseArchive) await releaseArchive();
      }
    });

  cmd
    .command('sync-check')
    .description('检测 change 影响的老锚点是否需更新 → 5 档差异报告(决策 #5/#19)')
    .option('--change-id <id>', '指定 change-id;默认取最近一次 archive')
    .action(async (opts: { changeId?: string }) => {
      const forgeRoot = join(process.cwd(), 'forge');
      const configPath = join(forgeRoot, 'config.yaml');
      if (!existsSync(configPath)) {
        console.error('forge/config.yaml 不存在,先跑 forge init');
        process.exit(LB_EXIT_GENERAL_ERROR);
      }
      const config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
      const anchors = await loadAnchorsFile(forgeRoot).catch((err) => {
        if (err instanceof LegacyAnchorsError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        throw err;
      });
      // 决策 #11:无 anchors → graceful skip(exit 0)
      if (!anchors) {
        console.log('no legacy anchors configured, skipping sync-check');
        process.exit(LB_EXIT_OK);
        return;
      }
      // ack 检查(若 allow_llm_calls=false 也 graceful skip,决策 #22)
      const ackResult = await checkAck(forgeRoot, config, anchors);
      if (!ackResult.ok && ackResult.reason === 'allow_llm_calls=false') {
        console.log('legacy_bridge.allow_llm_calls=false, sync-check skipped');
        process.exit(LB_EXIT_OK);
        return;
      }
      if (!ackResult.ok) {
        console.error(renderOptinPrompt(ackResult.reason, ackResult.customerDataPaths));
        process.exit(LB_EXIT_GENERAL_ERROR);
        return;
      }

      // 拼 change context(读 proposal.md + specs/)
      const changeId = opts.changeId ?? '(latest-archive)';
      const changesDir = join(forgeRoot, 'changes', changeId);
      let changeContext = '';
      const affectedModules: string[] = [];
      if (existsSync(join(changesDir, 'proposal.md'))) {
        changeContext += await readFile(join(changesDir, 'proposal.md'), 'utf8');
      }
      if (existsSync(join(changesDir, 'specs'))) {
        const { readdir } = await import('node:fs/promises');
        const files = await readdir(join(changesDir, 'specs'));
        for (const f of files) {
          const txt = await readFile(join(changesDir, 'specs', f), 'utf8');
          changeContext += `\n## specs/${f}\n${txt}`;
          // 推测 module:文件名去 .md 即可(简化)
          affectedModules.push(f.replace(/\.md$/, ''));
        }
      }

      // 锁(legacy-bridge-sync-check 单锁,不与 archive 双重持锁)
      let release: (() => Promise<void>) | undefined;
      try {
        release = await acquireLockByPath(
          forgeRoot,
          'legacy-bridge-sync-check',
          'legacy-bridge.lock',
        );
      } catch (err) {
        if (err instanceof LockHeldError) {
          console.error(`✗ ${err.message}`);
          process.exit(LB_EXIT_LOCK_HELD);
          return;
        }
        throw err;
      }

      try {
        // 运行时动态加载 forge-eval/load-env(避免 src/ rootDir 静态分析边界限制)
        const evalLoadEnvPath = new URL('../../../forge-eval/load-env.js', import.meta.url).href;
        const { loadEnv } = (await import(/* @vite-ignore */ evalLoadEnvPath)) as {
          loadEnv: () => { anthropicApiKey: string };
        };
        const { anthropicApiKey } = loadEnv();
        // Anthropic overload 与单签名接口不兼容,double-cast(与 regenerate 一致)
        const client = new Anthropic({ apiKey: anthropicApiKey }) as unknown as SyncCheckClient;
        const out = await runSyncCheck(
          client,
          {
            changeId,
            changeContext,
            affectedModules,
            anchors,
            autoResolveCrossAnchor: config.legacy_bridge?.auto_resolve_cross_anchor ?? false,
            mtimeOf: (p) => {
              try {
                return Math.floor(statSync(p).mtimeMs / 1000);
              } catch {
                return 0;
              }
            },
          },
          async (path) => (await readAnchorFile(path)).text,
        );

        // 写 markdown + yaml 双栈
        const stateDir = join(forgeRoot, 'legacy-sync-state');
        await mkdir(stateDir, { recursive: true });
        await writeFile(
          join(stateDir, `${changeId}.md`),
          renderDiffMarkdown(out.syncState),
          'utf8',
        );
        await writeFile(join(stateDir, `${changeId}.yaml`), renderDiffYaml(out.syncState), 'utf8');

        const counts = out.syncState.diffs.length;
        const critPending = hasCriticalPending(out.syncState);
        console.log(`⚠ ${counts} 项老文档可能需更新 — 详见 forge/legacy-sync-state/${changeId}.md`);

        // hash 过期 warn(决策 §4.3)
        for (const h of out.hashChecks) {
          if (h.state === 'stale') {
            console.warn(
              `⚠ anchor ${h.anchor.path} 已改动(用户改了 docs/legacy/);复写产物可能脱节`,
            );
          }
        }

        // enforce_sync 已在 archive preflight 处理,sync-check 命令本身不阻塞(spec §2.5 post-archive)
        if (critPending) {
          console.error(
            `⚠ 含 critical 未 resolve 项;在 enforce_sync=true 模式下,下次 archive 前请跑 forge legacy-bridge resolve ${changeId}`,
          );
        }
        process.exit(LB_EXIT_OK);
      } finally {
        if (release) await release();
      }
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

  return cmd;
}
