// src/core/legacy-bridge/llm-task.ts
// 双路径执行模型核心:LlmTask + TaskManifest 信封 + canonical hash
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

/** 可走双路径的 LLM 操作类型 */
export type LlmOp =
  | 'map'
  | 'index'
  | 'regenerate'
  | 'extract-facts'
  | 'quality-judge'
  | 'sync-check'
  | 'extract';

/** 一条已 redact 的输入 */
export interface LlmTaskInput {
  source: string; // 输入来源标识(文件路径 / anchor path / 'change-context')
  content: string; // 已 redact 的内容
}

/** 一个待执行的 LLM 任务(O 仅作输出类型标记,运行时不用) */
export interface LlmTask<O = unknown> {
  op: LlmOp;
  inputs: LlmTaskInput[];
  prompt: string;
  model: string; // 建议模型;agent 模式仅参考
  outputSchema: string; // 输出 JSON schema 描述,供 agent 自校验
  outputPath: string; // agent 把结果写到哪
  __outputType?: O;
}

/** agent 路径的交接信封 */
export interface TaskManifest {
  forge_version: string;
  op: LlmOp;
  round: number; // 当前轮次(单轮命令恒为 1;regenerate 为 1 或 2)
  tasks: LlmTask[];
  meta?: Record<string, unknown>; // op 专属上下文(如 sync-check 的 gate_context)
  manifest_hash: string; // SHA256,覆盖本结构除 manifest_hash 外全部字段
}

/** JCS 式稳定序列化:递归按键名排序后 JSON.stringify(数组保序) */
export function canonicalize(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[k] = norm((v as Record<string, unknown>)[k]);
      }
      return sorted;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

/** 算 manifest_hash:覆盖除 manifest_hash 外的全部字段 */
export function computeManifestHash(m: Omit<TaskManifest, 'manifest_hash'>): string {
  return createHash('sha256').update(canonicalize(m), 'utf8').digest('hex');
}

/** 组装 manifest 并填好 manifest_hash */
export function buildManifest(args: {
  op: LlmOp;
  round: number;
  tasks: LlmTask[];
  forgeVersion: string;
  meta?: Record<string, unknown>;
}): TaskManifest {
  const base: Omit<TaskManifest, 'manifest_hash'> = {
    forge_version: args.forgeVersion,
    op: args.op,
    round: args.round,
    tasks: args.tasks,
    ...(args.meta ? { meta: args.meta } : {}),
  };
  return { ...base, manifest_hash: computeManifestHash(base) };
}

/** 重算并比对 manifest_hash;任一字段被篡改即失败 */
export function verifyManifest(m: TaskManifest): { ok: true } | { ok: false; reason: string } {
  const { manifest_hash, ...rest } = m;
  const expected = computeManifestHash(rest);
  if (expected !== manifest_hash) {
    return {
      ok: false,
      reason: `manifest_hash 不匹配(可能被篡改或跨版本):期望 ${expected.slice(0, 12)}…,实得 ${manifest_hash.slice(0, 12)}…`,
    };
  }
  return { ok: true };
}

/** manifest 文件路径:forge/.cache/legacy-bridge-task-<op>.json */
export function manifestPath(forgeRoot: string, op: LlmOp): string {
  return join(forgeRoot, '.cache', `legacy-bridge-task-${op}.json`);
}

/** 写 manifest(创建 .cache 目录) */
export async function writeManifest(forgeRoot: string, m: TaskManifest): Promise<void> {
  await mkdir(join(forgeRoot, '.cache'), { recursive: true });
  await writeFile(manifestPath(forgeRoot, m.op), JSON.stringify(m, null, 2), 'utf8');
}

/** 读 manifest;不存在返回 null;JSON 损坏 / hash 校验失败抛错 */
export async function readManifest(forgeRoot: string, op: LlmOp): Promise<TaskManifest | null> {
  const p = manifestPath(forgeRoot, op);
  let raw: string;
  try {
    raw = await readFile(p, 'utf8');
  } catch (err) {
    // 文件不存在 → 返回 null;其他 IO 错误(权限等)向上抛
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let m: TaskManifest;
  try {
    m = JSON.parse(raw) as TaskManifest;
  } catch (err) {
    throw new Error(`manifest ${p} 解析失败(文件可能损坏或截断写入):${(err as Error).message}`);
  }
  const v = verifyManifest(m);
  if (!v.ok) throw new Error(`manifest ${p} 校验失败:${v.reason}`);
  return m;
}

/** 消费(移除)manifest —— --apply 成功后调用 */
export async function consumeManifest(forgeRoot: string, op: LlmOp): Promise<void> {
  await rm(manifestPath(forgeRoot, op), { force: true });
}
