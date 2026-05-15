// src/cli/commands/stage-extensions.ts — plan-stage-extensions Task 5
// runner CLI 子命令:
//   forge stage-extensions run   — 单轮执行器(spawn + watch + parse + judge + retry)
//   forge stage-extensions analyze-trend — 趋势分析(机械计算)
//
// 架构:CLI/AI 职责分层。CLI 只做机械操作(spawn / retry / 收敛判定);
// 多轮 loop / askUser / dispatchFixSubagent 由 §8 AI 协议驱动,不在此处。
// CLI 永远 exit 0(loose,不阻塞 forge 主流程)。

import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';

import {
  judgeConvergence,
  ThreadMap,
  watchProcess,
  isFailureOutcome,
  analyzeTrend,
} from '../../core/stage-extensions/index.js';
import type {
  RoundOutcome,
  ConvergenceResult,
  SeverityMap,
  CodexReviewOutput,
  CodexFinding,
} from '../../core/stage-extensions/index.js';
import { validateStageExtensionsConfig } from '../../core/schema/stage-extensions-config.js';
import type {
  NormalizedStageExtensionEntry,
  NormalizedStageExtensionsConfig,
  ConvergenceConfig,
} from '../../core/schema/types.js';
import { parseConfig } from '../../core/parse/yaml.js';

// ── 本地类型定义 ──────────────────────────────────────────────────────────────

/** stage 名称联合类型(config 五个 stage) */
type StageName = 'brainstorming' | 'propose' | 'apply_critical_plan_review' | 'review' | 'verify';

/** run 子命令参数 */
interface RunArgs {
  stage: StageName;
  changeId: string;
  extension: string;
  round: number;
  threadId: string | null;
}

/** runOneRound 所有输入参数 */
export interface RunOneRoundParams {
  command: string;
  promptFile: string | null;
  threadId: string | null;
  /** change ID(用于 ${CHANGE_ID} 模板变量替换;M-1 fix:此前硬编码空串) */
  changeId: string;
  outputFile: string;
  spawnStartMs: number;
  poll_interval_sec: number;
  zombie_threshold_sec: number;
  timeout_sec: number;
  convergenceConfig: ConvergenceConfig;
  severityMap: SeverityMap;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

/**
 * 将单个 JSON 对象写入 stdout。
 * AI 主代理通过解析 stdout JSON 驱动多轮协议(§8)。
 */
function emitJson(obj: object): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

/**
 * 写日志到 stderr(不影响 stdout JSON 结构化输出)。
 */
function log(msg: string): void {
  process.stderr.write('[stage-extensions] ' + msg + '\n');
}

/**
 * 对 Promise 加 ms 超时限制。
 * 超时时 reject(Error('timeout'))。
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * no-op cancelCodexJob stub。
 * 未来 remote codex job 预留接口;当前直接 spawn codex CLI 无 remote job 概念,
 * jobId 永远 null,terminateRound 的 `if(jobId !== null)` 守卫使本函数实际永不被调用。
 */
async function cancelCodexJob(_jobId: string): Promise<void> {
  // no-op
}

/**
 * 推导 FORGE_HELPER_DIR。
 * 编译后文件位于 dist/cli/commands/,上溯到 repo root 再 /scripts。
 * 开发时 src/cli/commands/,同样上溯到 repo root。
 */
function resolveForgeHelperDir(): string {
  // import.meta.url 是当前文件的 file:// URL
  const __filename = fileURLToPath(import.meta.url);
  // 上溯 3 层: commands/ → cli/ → dist(or src)/ → repo root
  const repoRoot = join(dirname(__filename), '..', '..', '..');
  return join(repoRoot, 'scripts');
}

/**
 * 解析 output 路径模板。
 * 模板变量:${CHANGE_ID} ${ROUND} ${ATTEMPT}。
 * F1-v7 硬性要求:同一 (round, attempt) 组合必须唯一 → attempt 维度保证不同 attempt 用不同文件。
 */
function resolveOutputPath(
  template: string,
  changeId: string,
  round: number,
  attempt: number,
): string {
  return template
    .replace(/\$\{CHANGE_ID\}/g, changeId)
    .replace(/\$\{ROUND\}/g, String(round))
    .replace(/\$\{ATTEMPT\}/g, String(attempt));
}

/**
 * I-1 fix:命令注入面防护。
 * substituteVars 把变量值原样插入命令字符串,spawn 又用 shell:true —— 若变量值
 * 含 shell 元字符(`;` `|` `&` `$` 反引号 等)会造成命令注入。
 * `changeId`(目录名式 ID)与 `threadId`(codex session ID)正常都在 `[A-Za-z0-9._-]`
 * 字符集内。这里不无脑包引号(会与 config 模板作者自己加的引号冲突),改为输入校验:
 * 含非白名单字符即视为非法 token,调用方拒绝执行(loose:config_error / invalid_output)。
 *
 * @param value  待校验值;null/空串视为合法(对应「首轮无 thread-id」等场景)
 * @returns      true=合法 / false=含危险字符
 */
function isSafeShellToken(value: string | null): boolean {
  if (value === null || value === '') {
    return true;
  }
  // 受限白名单:字母/数字/点/下划线/连字符;长度上限防滥用
  return /^[A-Za-z0-9._-]{1,256}$/.test(value);
}

/**
 * 对命令字符串做模板变量替换。
 * 变量:${FORGE_HELPER_DIR} ${PROMPT_FILE} ${THREAD_ID} ${OUTPUT_FILE} ${CHANGE_ID} ${TS}。
 * ${THREAD_ID} 首轮为 null 时替换为空字符串(spawn 时传空参数,codex CLI 忽略)。
 *
 * 注:调用方须先用 isSafeShellToken 校验 changeId/threadId(I-1 注入面防护);
 * forgeHelperDir/outputFile/promptFile 是程序自身构造的受控路径,不经此校验。
 */
function substituteVars(
  template: string,
  vars: {
    forgeHelperDir: string;
    promptFile: string | null;
    threadId: string | null;
    outputFile: string;
    changeId: string;
    ts: string;
  },
): string {
  return template
    .replace(/\$\{FORGE_HELPER_DIR\}/g, vars.forgeHelperDir)
    .replace(/\$\{PROMPT_FILE\}/g, vars.promptFile ?? '')
    .replace(/\$\{THREAD_ID\}/g, vars.threadId ?? '')
    .replace(/\$\{OUTPUT_FILE\}/g, vars.outputFile)
    .replace(/\$\{CHANGE_ID\}/g, vars.changeId)
    .replace(/\$\{TS\}/g, vars.ts);
}

/**
 * 运行 build_prompt 命令生成 prompt 文件。
 * 若 entry 无 build_prompt 字段则返回 null(codex review 模式无需 prompt)。
 */
async function buildPromptFile(
  entry: NormalizedStageExtensionEntry,
  stage: string,
  changeId: string,
): Promise<string | null> {
  if (!entry.build_prompt) {
    return null;
  }

  const forgeHelperDir = resolveForgeHelperDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const promptFile = join(dirname(entry.output), `prompt-${stage}-${changeId}-${ts}.md`);

  const cmd = substituteVars(entry.build_prompt, {
    forgeHelperDir,
    promptFile,
    threadId: null,
    outputFile: '',
    changeId,
    ts,
  });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, [], { shell: true, stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`build_prompt exited with code ${code}`));
      } else {
        resolve();
      }
    });
    proc.on('error', reject);
  });

  return promptFile;
}

/**
 * markdown 输出解析:adversarial mode(codex exec + adversarial-default.md)。
 * 格式:## Summary / ## Findings(### [SEVERITY] Title + ...) / ## Verdict。
 * severity 是 BLOCKER/MAJOR/MINOR/NIT → 反映射回 critical/high/medium/low。
 * 宽容但不猜:Verdict/Findings 段缺失即 throw。
 */
function parseMarkdownOutput(raw: string): CodexReviewOutput {
  // severity 反映射(BLOCKER → critical 等)
  const REVERSE_SEVERITY: Record<string, CodexFinding['severity']> = {
    BLOCKER: 'critical',
    MAJOR: 'high',
    MINOR: 'medium',
    NIT: 'low',
  };

  // 提取 ## Verdict 段
  // C-1 fix:JS 正则无 \Z 锚(`\Z` 是字面字符 Z)。## Verdict 按 adversarial 模板永远
  // 是末段,后面无 `^##`,原 `(?=^##\s|\Z)` 恒不匹配 → verdictMatch 恒 null。
  // 改为直接吃到字符串结尾 `([\s\S]+)`。
  const verdictMatch = raw.match(/^##\s+Verdict\s*\n([\s\S]+)/im);
  if (!verdictMatch) {
    throw new Error('parseCodexOutput: markdown 缺少 ## Verdict 段');
  }
  const verdictText = (verdictMatch[1] ?? '').trim().toLowerCase();
  let verdict: 'approve' | 'needs-attention';
  if (verdictText.includes('needs-attention') || verdictText.includes('needs_attention')) {
    verdict = 'needs-attention';
  } else if (verdictText.includes('approve')) {
    verdict = 'approve';
  } else {
    throw new Error(`parseCodexOutput: 无法识别 verdict: ${verdictText.substring(0, 80)}`);
  }

  // 提取 ## Summary 段
  const summaryMatch = raw.match(/^##\s+Summary\s*\n([\s\S]*?)(?=^##\s)/im);
  const summary = summaryMatch ? (summaryMatch[1] ?? '').trim() : '';

  // 提取 ## Findings 段
  // C-1 fix:Findings 段后跟 ## Verdict,用 `(?=^##\s)` 即可(去掉无效 `\Z`)。
  const findingsBlockMatch = raw.match(/^##\s+Findings\s*\n([\s\S]*?)(?=^##\s)/im);
  const findings: CodexFinding[] = [];

  if (findingsBlockMatch) {
    const findingsBlock = findingsBlockMatch[1] ?? '';
    // 每个 finding 以 ### [SEVERITY] Title 开始。
    // C-1/I-3 fix:原正则 `(.+?)\s*$([\s\S]*?)(?=^###\s+\[|$)` 有两处 bug:
    //   1. `m` flag 下 `(.+?)\s*$` 后接 `([\s\S]*?)` 在第一行尾就让 body 非贪婪匹配空串;
    //   2. 终止锚 `$` 在 `m` flag 下匹配每个行尾 → body 被截断到 title 那一行。
    // 修:title 用 `([^\n]+)` 取到行尾,显式 `\n` 分隔后 body 用 `[\s\S]*?`,
    // 终止锚用 `$(?![\s\S])`(真正的字符串结尾,替代 JS 不支持的 `\Z`)。
    const findingRegex = /^###\s+\[([A-Z]+)\]\s+([^\n]+)\n([\s\S]*?)(?=^###\s+\[|$(?![\s\S]))/gim;
    let match: RegExpExecArray | null;

    while ((match = findingRegex.exec(findingsBlock)) !== null) {
      const rawSeverity = (match[1] ?? '').toUpperCase();
      const title = (match[2] ?? '').trim();
      const body = match[3] ?? '';

      // severity 反映射
      const severity = REVERSE_SEVERITY[rawSeverity];
      if (!severity) {
        // 未知 severity 用 low fallback
        log(`parseMarkdownOutput: 未知 severity ${rawSeverity},fallback 为 low`);
      }
      const normalizedSeverity: CodexFinding['severity'] = severity ?? 'low';

      // 提取 Location
      const locationMatch = body.match(/\*\*Location\*\*:\s*`?([^\n`]+)`?/i);
      const location = locationMatch ? (locationMatch[1] ?? '').trim() : '';

      // 提取 Confidence(缺失默认 0.8)
      const confidenceMatch = body.match(/\*\*Confidence\*\*:\s*([\d.]+)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1] ?? '0.8') : 0.8;

      // 提取 Body
      const bodyMatch = body.match(/\*\*Body\*\*:\s*([\s\S]*?)(?=\*\*Recommendation\*\*:|$)/i);
      const bodyText = bodyMatch ? (bodyMatch[1] ?? '').trim() : '';

      // 提取 Recommendation
      const recMatch = body.match(/\*\*Recommendation\*\*:\s*([\s\S]*?)(?=---|$)/i);
      const recommendation = recMatch ? (recMatch[1] ?? '').trim() : '';

      // 解析 Location 为 file:line 形式
      const locParts = location.split(':');
      const file = locParts[0] ?? location;
      const lineStart = parseInt(locParts[1] ?? '0', 10) || 0;

      findings.push({
        severity: normalizedSeverity,
        title,
        body: bodyText,
        file,
        line_start: lineStart,
        line_end: lineStart,
        confidence,
        recommendation,
      });
    }
  }

  return {
    verdict,
    summary,
    findings,
    next_steps: [],
  };
}

/**
 * 解析 codex 输出文件为 CodexReviewOutput。
 * 策略:先尝试 JSON(code-review mode);非 JSON 落 markdown 解析(adversarial mode)。
 * 解析失败 → throw(runOneRound 的 try/catch 兜底 → invalid_output → retry)。
 */
function parseCodexOutput(outputFile: string): CodexReviewOutput {
  const raw = readFileSync(outputFile, 'utf-8').trim();

  // 1. 优先尝试 JSON(code-review mode)
  try {
    const json = JSON.parse(raw) as unknown;
    if (
      json &&
      typeof json === 'object' &&
      typeof (json as Record<string, unknown>).verdict === 'string' &&
      Array.isArray((json as Record<string, unknown>).findings)
    ) {
      return json as CodexReviewOutput;
    }
  } catch {
    // 非 JSON,落 markdown 解析
  }

  // 2. markdown 解析(adversarial mode)
  return parseMarkdownOutput(raw);
}

// ── runOneRound ───────────────────────────────────────────────────────────────

/**
 * 执行单轮 codex review:spawn + watch + parse + judge。
 * 导出供 F-6/F-7 直接调用测试(绕过 schema 校验的 timeout 下限限制)。
 */
export async function runOneRound(params: RunOneRoundParams): Promise<RoundOutcome> {
  const forgeHelperDir = resolveForgeHelperDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  // I-1 fix:spawn(shell:true) 前校验插入命令字符串的 changeId/threadId 不含 shell 元字符。
  // 非法 → invalid_output(失败态,顶层 retry 耗尽后 → failed,loose exit 0)。
  if (!isSafeShellToken(params.changeId)) {
    return { kind: 'invalid_output', reason: `changeId 含非法 shell 字符: ${params.changeId}` };
  }
  if (!isSafeShellToken(params.threadId)) {
    return { kind: 'invalid_output', reason: `threadId 含非法 shell 字符: ${params.threadId}` };
  }

  // 变量替换后的最终命令字符串(M-1 fix:changeId 此前硬编码空串,${CHANGE_ID} 静默坏)
  const finalCommand = substituteVars(params.command, {
    forgeHelperDir,
    promptFile: params.promptFile,
    threadId: params.threadId,
    outputFile: params.outputFile,
    changeId: params.changeId,
    ts,
  });

  // 1. spawn codex(Windows 用 shell:true,避免 .cmd wrapper ENOENT)
  let proc: ChildProcess;
  try {
    proc = spawn(finalCommand, [], {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return { kind: 'spawn_failed', error: error as Error };
  }

  // 2. 监控进程和输出文件
  const watchResult = await watchProcess(proc, params.outputFile, {
    poll_interval_sec: params.poll_interval_sec,
    zombie_threshold_sec: params.zombie_threshold_sec,
    timeout_sec: params.timeout_sec,
  });

  // 3. zombie/timeout → 终结进程 + 返回对应 outcome
  if (watchResult.kind === 'zombie' || watchResult.kind === 'timeout') {
    await terminateRound(proc, watchResult.jobId);
    return { kind: watchResult.kind, jobId: watchResult.jobId };
  }

  // 4. 进程自然退出(done)
  if (watchResult.exitCode !== 0) {
    return { kind: 'attempt_failed', reason: `codex exit ${watchResult.exitCode}` };
  }

  // 5. F1-v7 fix:校验 output 文件确实是本次 spawn 产出
  if (!existsSync(params.outputFile)) {
    return { kind: 'invalid_output', reason: 'codex exit 0 但未写 output 文件' };
  }
  if (statSync(params.outputFile).mtimeMs < params.spawnStartMs) {
    return { kind: 'invalid_output', reason: 'output 文件 mtime 早于本次 spawn —— 疑似残留旧文件' };
  }

  // 6. 解析 codex 输出
  let codexOutput: CodexReviewOutput;
  try {
    codexOutput = parseCodexOutput(params.outputFile);
  } catch (error) {
    return { kind: 'invalid_output', reason: (error as Error).message };
  }

  // 7. 收敛判断(F5 fix:block 桶空才算 converged,即使 verdict=approve)
  const convergence = judgeConvergence(codexOutput, params.convergenceConfig, params.severityMap);

  if (convergence.blockFindings.length === 0) {
    return { kind: 'converged', convergence };
  }
  return { kind: 'unconverged', convergence };
}

// ── terminateRound ────────────────────────────────────────────────────────────

/**
 * 终结 zombie/timeout 轮次进程。
 * v4/v5 逻辑:
 * 0. M-3 fix:进程已自然退出 → 直接 return(避免白等 6s + 减少 SIGKILL warning 噪声)
 * 1. 入口先订阅 close 事件(避免错过)
 * 2. 先 proc.kill(SIGTERM)
 * 3. jobId 非 null → best-effort cancelCodexJob(5s 上限)
 * 4. 等 SIGTERM close(3s);超时 → SIGKILL → 再次等 close(3s)
 * 导出供 T-1 直接调用测试。
 *
 * @param cancelJob  远程 cancel 实现;默认用模块内 no-op stub。
 *   仅作可注入接缝供 T-1 测试 cancelCodexJob reject 吞错路径 —— 生产调用
 *   `terminateRound(proc, jobId)` 不传此参,默认行为完全不变。
 */
export async function terminateRound(
  proc: ChildProcess,
  jobId: string | null,
  cancelJob: (jobId: string) => Promise<void> = cancelCodexJob,
): Promise<void> {
  // 0. M-3 fix:进程已自然退出(exitCode/signalCode 非 null)→ 无需 kill/等待,直接返回。
  //    避免对已死进程白等 3s+3s 才打 SIGKILL warning(也减少 Windows 噪声)。
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }

  // 1. 提前订阅 close 事件(proc 已 spawn,close 可能任意时刻派发)
  const closePromise: Promise<void> = once(proc, 'close').then(() => undefined);

  // 2. 先本地 SIGTERM kill
  try {
    proc.kill();
  } catch {
    // 进程可能已退出,忽略
  }

  // 3. best-effort 远程 cancel(jobId=null 时跳过)
  if (jobId !== null) {
    try {
      await withTimeout(cancelJob(jobId), 5000);
    } catch (err) {
      log(
        `[terminateRound] cancelCodexJob(${jobId}) 失败(已本地 kill,忽略):${(err as Error).message}`,
      );
    }
  }

  // 4. 等 SIGTERM 后 close;超时 → SIGKILL → 再次等 close(F2-v4 fix)
  try {
    await withTimeout(closePromise, 3000);
    return; // SIGTERM 后正常 close
  } catch {
    proc.kill('SIGKILL');
  }
  try {
    await withTimeout(closePromise, 3000); // SIGKILL 后再次等 close
  } catch {
    // 极端情况:SIGKILL 后仍未 close(内核态僵死进程)
    log(
      `[terminateRound] ⚠️ 进程 ${proc.pid} SIGKILL 后仍未确认 close — 无法确认终止;retry 风险标记`,
    );
  }
}

// ── runStageExtensionRound ────────────────────────────────────────────────────

/**
 * run 子命令主流程:单轮执行器。
 * 1. 加载并校验 config(F1-v5 顶层 try/catch — 非法 config 走 loose)
 * 2. attempt loop(retry 是机械的,留 CLI)
 * 3. 每 attempt:buildPromptFile → spawn → watch → parse → judge
 * 4. 输出结构化 JSON + exit 0
 */
async function runStageExtensionRound(args: RunArgs): Promise<number> {
  let entry: NormalizedStageExtensionEntry | undefined;
  let config: NormalizedStageExtensionsConfig;

  // I-1 fix:用户传入的 --change-id / --thread-id 会经 substituteVars 插入 shell:true 命令,
  // 提前校验拒绝含 shell 元字符的输入(注入面防护)。非法 → config_error,loose exit 0。
  if (!isSafeShellToken(args.changeId)) {
    emitJson({ kind: 'config_error', message: `--change-id 含非法 shell 字符: ${args.changeId}` });
    return 0;
  }
  if (!isSafeShellToken(args.threadId)) {
    emitJson({ kind: 'config_error', message: `--thread-id 含非法 shell 字符: ${args.threadId}` });
    return 0;
  }

  // F1-v5 fix:顶层 try/catch — config 加载/校验失败走 loose
  try {
    const configPath = join(process.cwd(), 'forge', 'config.yaml');
    if (!existsSync(configPath)) {
      emitJson({ kind: 'no_extension' });
      return 0;
    }
    const forgeConfig = parseConfig(readFileSync(configPath, 'utf-8'));
    const raw = forgeConfig.stage_extensions;
    if (!raw) {
      emitJson({ kind: 'no_extension' });
      return 0;
    }
    config = validateStageExtensionsConfig(raw);
    entry = config[args.stage].find((e) => e.name === args.extension && e.enabled);
  } catch (err) {
    emitJson({ kind: 'config_error', message: (err as Error).message });
    return 0;
  }

  if (!entry) {
    emitJson({ kind: 'no_extension' });
    return 0;
  }

  // attempt loop:F2 retry 计数器(round budget 移到 §8 AI 协议)
  const maxAttempts = 1 + entry.max_retries;
  let lastFailure = '';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // buildPromptFile:若无 build_prompt 返回 null
    const promptFile = await buildPromptFile(entry, args.stage, args.changeId);

    // F1-v7 fix:output 文件名带 attempt 维度保证唯一性
    const outputFile = resolveOutputPath(entry.output, args.changeId, args.round, attempt);

    // F1-v7 fix:spawn 前删除可能残留的同名文件(双保险)
    if (existsSync(outputFile)) {
      rmSync(outputFile);
    }
    // 确保 output 目录存在
    mkdirSync(dirname(outputFile), { recursive: true });

    const spawnStartMs = Date.now();

    const outcome = await runOneRound({
      command: entry.command,
      promptFile,
      threadId: args.threadId,
      changeId: args.changeId, // M-1 fix:透传 changeId 供 ${CHANGE_ID} 替换
      outputFile,
      spawnStartMs,
      poll_interval_sec: entry.poll_interval_sec,
      zombie_threshold_sec: entry.zombie_threshold_sec,
      timeout_sec: entry.timeout_sec,
      convergenceConfig: entry.convergence,
      severityMap: config.severity_map,
    });

    // 失败态 → 记录并 retry
    if (isFailureOutcome(outcome)) {
      const failureKind = outcome.kind;
      if (failureKind === 'spawn_failed') {
        lastFailure = `spawn_failed: ${(outcome as { kind: 'spawn_failed'; error: Error }).error.message}`;
      } else if (failureKind === 'invalid_output') {
        lastFailure = `invalid_output: ${(outcome as { kind: 'invalid_output'; reason: string }).reason}`;
      } else if (failureKind === 'attempt_failed') {
        lastFailure = `attempt_failed: ${(outcome as { kind: 'attempt_failed'; reason: string }).reason}`;
      } else {
        lastFailure = `${failureKind}: ${JSON.stringify(outcome)}`;
      }
      continue;
    }

    // converged / unconverged — 写 thread-map + 输出 JSON
    const conv: ConvergenceResult = (
      outcome as { kind: 'converged' | 'unconverged'; convergence: ConvergenceResult }
    ).convergence;

    // 写 thread-map 记录
    const threadMap = new ThreadMap(args.changeId, join(process.cwd(), 'forge'));
    await threadMap.load();
    threadMap.recordRound(args.stage, entry.name, {
      // F2-v3 fix:codex 本轮缺 thread_id → 保留传入的 --thread-id 旧值
      thread_id: conv.threadId ?? args.threadId,
      round: args.round,
      last_verdict: conv.verdict,
      last_finding_count: conv.blockFindings.length + conv.ignoreFindings.length,
      last_round_at: new Date().toISOString(),
    });
    await threadMap.save();

    // 输出结构化 JSON
    emitJson({
      kind: outcome.kind,
      threadId: conv.threadId ?? args.threadId,
      verdict: conv.verdict,
      blockFindings: conv.blockFindings,
      ignoreFindings: conv.ignoreFindings,
      droppedByConfidence: conv.droppedByConfidence,
      // F1-v8 fix:unconverged 时额外输出 effectiveConvergence + userInteraction
      // 供 §8 AI 协议设 roundLimit / max_rounds_on_exceed / block_unconverged
      ...(outcome.kind === 'unconverged'
        ? {
            effectiveConvergence: entry.convergence,
            userInteraction: config.user_interaction,
          }
        : {}),
    });
    return 0;
  }

  // retry 耗尽
  emitJson({ kind: 'failed', reason: lastFailure });
  return 0;
}

// ── runAnalyzeTrend ───────────────────────────────────────────────────────────

/**
 * analyze-trend 子命令:趋势分析(机械计算)。
 * 解析 --history JSON 数组,调用 analyzeTrend 输出 TrendAdvice。
 */
function runAnalyzeTrend(historyJson: string): number {
  let history: Array<{ round: number; block_count: number }>;
  try {
    history = JSON.parse(historyJson) as Array<{ round: number; block_count: number }>;
  } catch {
    // 非法 JSON → 输出 data_insufficient(loose)
    emitJson({
      trend: 'data_insufficient',
      recommendation: 'invalid --history JSON',
      recommended_option: 1,
    });
    return 0;
  }
  emitJson(analyzeTrend(history));
  return 0;
}

// ── buildStageExtensionsCommand ───────────────────────────────────────────────

/**
 * 构建 `forge stage-extensions` 子命令组。
 * 沿现有 buildXxxCommand() 模式注册 commander 子命令。
 */
export function buildStageExtensionsCommand(): Command {
  const cmd = new Command('stage-extensions').description(
    'stage extensions runner — 单轮 codex review 执行 + 趋势分析(plan-stage-extensions §7)',
  );

  // ── run 子命令 ──
  cmd
    .command('run')
    .description('单轮执行器:spawn codex review + 监控 + 解析 + 收敛判定 + retry')
    .requiredOption(
      '--stage <stage>',
      'stage 名称(brainstorming|propose|apply_critical_plan_review|review|verify)',
    )
    .requiredOption('--change-id <id>', 'change ID(用于 thread-map + output 路径)')
    .requiredOption(
      '--extension <name>',
      'config stage_extensions.<stage>[].name 中的 extension 名称',
    )
    .option('--round <n>', '当前轮次(默认 1)', '1')
    .option('--thread-id <id>', 'codex resume thread id(首轮省略)')
    .action(
      (opts: {
        stage: string;
        changeId: string;
        extension: string;
        round: string;
        threadId?: string;
      }) => {
        // CLI 顶层 loose 兜底:任何未捕获异常 → emitJson failed + exit 0
        const args: RunArgs = {
          stage: opts.stage as StageName,
          changeId: opts.changeId,
          extension: opts.extension,
          round: parseInt(opts.round, 10) || 1,
          threadId: opts.threadId ?? null,
        };
        runStageExtensionRound(args).then(
          () => process.exit(0),
          (err: unknown) => {
            emitJson({ kind: 'failed', reason: err instanceof Error ? err.message : String(err) });
            process.exit(0);
          },
        );
      },
    );

  // ── analyze-trend 子命令 ──
  cmd
    .command('analyze-trend')
    .description('趋势分析:计算收敛历史趋势,输出 TrendAdvice JSON')
    .requiredOption('--history <json>', '轮次历史 JSON 数组:[{"round":1,"block_count":5},...]')
    .action((opts: { history: string }) => {
      try {
        runAnalyzeTrend(opts.history);
        process.exit(0);
      } catch (err: unknown) {
        emitJson({ kind: 'failed', reason: err instanceof Error ? err.message : String(err) });
        process.exit(0);
      }
    });

  return cmd;
}
