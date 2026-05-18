// Layer 3b:forge-legacy-requirements/v1 schema + load + finalize(spec §3 / §6.2)
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

/** 需求实现状态(spec §3,D1 二值) */
export type LegacyRequirementStatus = 'implemented' | 'unimplemented';
/** 审核态(spec §3) */
export type LegacyRequirementReview = 'pending' | 'confirmed';
/** 来源类别(spec §3,D3) */
export type LegacyRequirementKind = 'srs' | 'backlog-file' | 'issue-export';
/** LLM 判定置信度 */
export type LegacyRequirementConfidence = 'high' | 'medium' | 'low';
/** 优先级(用户填) */
export type LegacyRequirementPriority = 'critical' | 'high' | 'medium' | 'low' | null;

const STATUS_VALUES = new Set<string>(['implemented', 'unimplemented']);
const REVIEW_VALUES = new Set<string>(['pending', 'confirmed']);
const KIND_VALUES = new Set<string>(['srs', 'backlog-file', 'issue-export']);
const CONFIDENCE_VALUES = new Set<string>(['high', 'medium', 'low']);
const PRIORITY_VALUES = new Set<string>(['critical', 'high', 'medium', 'low']);

/** 来源定位 */
export interface LegacyRequirementSource {
  /** 来源文件,相对仓库根 */
  document: string;
  /** 章节锚 / 标题;无则空字符串 */
  section: string;
  kind: LegacyRequirementKind;
}

/** 单条 legacy requirement(legacy-requirements.yaml#requirements[]) */
export interface LegacyRequirement {
  /** 稳定 ID 'LR-NNNN';draft 里新条目为空字符串 */
  id: string;
  title: string;
  description: string;
  status: LegacyRequirementStatus;
  source: LegacyRequirementSource;
  /** implemented 的代码依据;unimplemented 时为空数组 */
  evidence: string[];
  confidence: LegacyRequirementConfidence;
  priority: LegacyRequirementPriority;
  review: LegacyRequirementReview;
  notes: string;
}

/** legacy-requirements.yaml 顶层结构 */
export interface LegacyRequirementsFile {
  schema: 'forge-legacy-requirements/v1';
  requirements: LegacyRequirement[];
}

/** 文件名常量(确认产物 + draft 态) */
export const LEGACY_REQUIREMENTS_FILE = 'legacy-requirements.yaml';
export const LEGACY_REQUIREMENTS_DRAFT_FILE = 'legacy-requirements-draft.yaml';
export const LEGACY_REQUIREMENTS_DRAFT_MD = 'legacy-requirements-draft.md';

/** 校验任意对象是否合法 LegacyRequirementsFile;非法即抛错 */
export function validateLegacyRequirementsFile(obj: unknown): LegacyRequirementsFile {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('legacy-requirements:顶层不是对象');
  }
  const o = obj as Record<string, unknown>;
  if (o.schema !== 'forge-legacy-requirements/v1') {
    throw new Error(
      `legacy-requirements:schema 字段须为 forge-legacy-requirements/v1,实得 ${String(o.schema)}`,
    );
  }
  if (!Array.isArray(o.requirements)) {
    throw new Error('legacy-requirements:requirements 须为数组');
  }
  o.requirements.forEach((r, i) => validateRequirement(r, i));
  return obj as LegacyRequirementsFile;
}

/** 校验单条 requirement;非法即抛错(i 用于错误定位) */
function validateRequirement(r: unknown, i: number): void {
  if (typeof r !== 'object' || r === null) throw new Error(`requirement[${i}]:不是对象`);
  const o = r as Record<string, unknown>;
  const at = `requirement[${i}]`;
  if (typeof o.id !== 'string') throw new Error(`${at}.id 须为字符串(新条目用空串)`);
  if (typeof o.title !== 'string' || o.title === '') throw new Error(`${at}.title 须为非空字符串`);
  if (typeof o.description !== 'string') throw new Error(`${at}.description 须为字符串`);
  if (!STATUS_VALUES.has(o.status as string))
    throw new Error(`${at}.status 越界:${String(o.status)}`);
  if (!REVIEW_VALUES.has(o.review as string))
    throw new Error(`${at}.review 越界:${String(o.review)}`);
  if (!CONFIDENCE_VALUES.has(o.confidence as string)) {
    throw new Error(`${at}.confidence 越界:${String(o.confidence)}`);
  }
  if (o.priority !== null && !PRIORITY_VALUES.has(o.priority as string)) {
    throw new Error(`${at}.priority 越界:${String(o.priority)}`);
  }
  if (!Array.isArray(o.evidence) || !o.evidence.every((x) => typeof x === 'string')) {
    throw new Error(`${at}.evidence 须为 string[]`);
  }
  if (typeof o.notes !== 'string') throw new Error(`${at}.notes 须为字符串`);
  const src = o.source as Record<string, unknown> | undefined;
  if (typeof src !== 'object' || src === null) throw new Error(`${at}.source 须为对象`);
  if (typeof src.document !== 'string') throw new Error(`${at}.source.document 须为字符串`);
  if (typeof src.section !== 'string') throw new Error(`${at}.source.section 须为字符串(无则空串)`);
  if (!KIND_VALUES.has(src.kind as string))
    throw new Error(`${at}.source.kind 越界:${String(src.kind)}`);
}

/** 读 forge/legacy-requirements.yaml;文件不存在返回 null;损坏或非法 schema 抛错 */
export async function loadLegacyRequirements(
  forgeRoot: string,
): Promise<LegacyRequirementsFile | null> {
  const path = join(forgeRoot, LEGACY_REQUIREMENTS_FILE);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new Error(`legacy-requirements.yaml 解析失败:${(err as Error).message}`);
  }
  return validateLegacyRequirementsFile(parsed);
}

/** 从 'LR-0042' 取数字 42;非法格式返回 0 */
function parseLrNumber(id: string): number {
  const m = /^LR-(\d{4,})$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/** 'LR-' + 4 位零填充 */
function formatLrId(n: number): string {
  return `LR-${String(n).padStart(4, '0')}`;
}

/**
 * --finalize 纯逻辑(spec §6.2):
 * 给 id 为空的条目按 max(既有所有 LR-NNNN)+1 顺序分配;整表 review 置 confirmed。
 * 不读盘/不写盘 —— 调用方(CLI)负责 IO。
 */
export function finalizeLegacyRequirements(draft: LegacyRequirement[]): LegacyRequirementsFile {
  let maxNum = 0;
  for (const r of draft) {
    if (r.id !== '') maxNum = Math.max(maxNum, parseLrNumber(r.id));
  }
  const requirements = draft.map((r) => ({
    ...r,
    id: r.id === '' ? formatLrId(++maxNum) : r.id,
    review: 'confirmed' as LegacyRequirementReview,
  }));
  return { schema: 'forge-legacy-requirements/v1', requirements };
}
