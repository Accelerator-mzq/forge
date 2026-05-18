// src/core/legacy-bridge/runners.ts
// 双路径的两种执行:ApiRunner(--api 进程内调 SDK)/ AgentHandoffRunner(默认 emit manifest)+ readTaskResults
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { buildManifest, writeManifest } from './llm-task.js';
import type { LlmTask, LlmOp, TaskManifest } from './llm-task.js';

/** 一个 task 的 LLM 原始文本结果 */
export interface LlmTaskResult {
  op: LlmOp;
  text: string;
}

/** ApiRunner 所需的最小 client 接口(便于 mock) */
export interface RunnerClient {
  messages: {
    create: (args: Anthropic.Messages.MessageCreateParams) => Promise<Anthropic.Messages.Message>;
  };
}

/** --api 模式:进程内逐个 task 调 Anthropic SDK */
export class ApiRunner {
  constructor(private readonly client: RunnerClient) {}

  async run(tasks: LlmTask[]): Promise<LlmTaskResult[]> {
    const out: LlmTaskResult[] = [];
    for (const t of tasks) {
      const bytes = Buffer.byteLength(t.prompt, 'utf8');
      console.log(
        `→ sending ${bytes} bytes to Anthropic API (provider=anthropic, region: auto, model=${t.model}, op=${t.op})`,
      );
      const result = await this.client.messages.create({
        model: t.model,
        max_tokens: 8192,
        messages: [{ role: 'user', content: t.prompt }],
      });
      const block = result.content.find(
        (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
      );
      if (!block) {
        // API 因 refusal 等 stop_reason 未返回 TextBlock —— 显式 warn,避免静默变空串
        console.warn(
          `⚠ op=${t.op} API 未返回文本块(stop_reason=${result.stop_reason ?? 'unknown'}),以空字符串代替`,
        );
      }
      out.push({ op: t.op, text: block?.text ?? '' });
    }
    return out;
  }
}

/** 默认模式:把当前轮 LlmTask[] 包进 manifest 信封写盘(命令随后退出,等 agent fulfill) */
export class AgentHandoffRunner {
  constructor(
    private readonly forgeRoot: string,
    private readonly forgeVersion: string,
  ) {}

  /** emit 当前轮 manifest;返回 manifest(调用方可读 manifest_hash,如 archive 暂停态) */
  async emit(
    op: LlmOp,
    round: number,
    tasks: LlmTask[],
    meta?: Record<string, unknown>,
  ): Promise<TaskManifest> {
    const manifest = buildManifest({ op, round, tasks, forgeVersion: this.forgeVersion, meta });
    await writeManifest(this.forgeRoot, manifest);
    return manifest;
  }
}

/** agent 路径:读 agent 写在各 task.outputPath 的结果文件 */
export async function readTaskResults(
  forgeRoot: string,
  tasks: LlmTask[],
): Promise<LlmTaskResult[]> {
  const out: LlmTaskResult[] = [];
  for (const t of tasks) {
    const p = isAbsolute(t.outputPath) ? t.outputPath : join(forgeRoot, t.outputPath);
    if (!existsSync(p)) {
      throw new Error(`agent 结果文件缺失:${p};请先 fulfill manifest 再跑 --apply`);
    }
    // 包装裸 SyntaxError —— 结果文件被截断写入时,错误信息要含路径(同 Task 1.2 readManifest 先例)
    let parsed: { text?: string };
    try {
      parsed = JSON.parse(await readFile(p, 'utf8')) as { text?: string };
    } catch (err) {
      throw new Error(
        `agent 结果文件 ${p} JSON 解析失败(文件可能被截断写入):${(err as Error).message}`,
      );
    }
    out.push({ op: t.op, text: parsed.text ?? '' });
  }
  return out;
}

/** 构造 --api 模式的 Anthropic client。
 *  动态加载 forge-eval/load-env(避免 src/ rootDir 静态分析边界限制)。 */
export async function makeForgeApiClient(): Promise<Anthropic> {
  const evalLoadEnvPath = new URL('../../../forge-eval/load-env.js', import.meta.url).href;
  const { loadEnv } = (await import(/* @vite-ignore */ evalLoadEnvPath)) as {
    loadEnv: () => { anthropicApiKey: string };
  };
  const { anthropicApiKey } = loadEnv();
  return new Anthropic({ apiKey: anthropicApiKey });
}
