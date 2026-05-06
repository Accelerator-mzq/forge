// legacy-anchors.yaml 解析 + 校验(forge-legacy-anchor/v1)
// spec §2.2 / §4.1 / 决策 #9-10 / §4.3 不变量

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { LegacyAnchorsFile, LegacyAnchor, LegacyAnchorRole } from './types.js';

// `as const satisfies` 让数组元素被 LegacyAnchorRole 收窄,加新元素时 TS 类型层报错
const VALID_ROLES = [
  'requirements',
  'high-level-design',
  'low-level-design',
  'system-tests',
  'acceptance-report',
  'rationale',
  'glossary',
] as const satisfies readonly LegacyAnchorRole[];

/** 自定义异常:legacy-anchors.yaml 解析或校验失败(供 CLI 转 exit 1) */
export class LegacyAnchorsError extends Error {
  constructor(
    message: string,
    public readonly path?: string,
  ) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'LegacyAnchorsError';
  }
}

/** 读 legacy-anchors.yaml + 校验;不存在时返回 null(供 graceful skip) */
export async function loadAnchorsFile(forgeRoot: string): Promise<LegacyAnchorsFile | null> {
  const path = `${forgeRoot}/legacy-anchors.yaml`;
  if (!existsSync(path)) return null;
  // 包装 IO 错误(EACCES / EISDIR / ENOENT race / EMFILE)统一抛 LegacyAnchorsError,
  // caller 不必区分 LegacyAnchorsError vs raw NodeJS.ErrnoException(C1 修复)
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    throw new LegacyAnchorsError(
      `读取失败:${(err as NodeJS.ErrnoException).message}`,
      path,
    );
  }
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    // §4.1:YAML 解析失败 — 行号 + 错误描述,不擅自修复
    throw new LegacyAnchorsError(`YAML 解析失败:${(err as Error).message}`, path);
  }
  return validateAnchorsFile(parsed, path);
}

/** 校验 LegacyAnchorsFile 结构 */
export function validateAnchorsFile(data: unknown, ctx: string): LegacyAnchorsFile {
  if (!data || typeof data !== 'object') {
    throw new LegacyAnchorsError('legacy-anchors.yaml 顶层必须是对象', ctx);
  }
  const file = data as Partial<LegacyAnchorsFile>;
  if (file.schema !== 'forge-legacy-anchor/v1') {
    throw new LegacyAnchorsError(
      `schema 字段必须为 'forge-legacy-anchor/v1',实际:${String(file.schema)}`,
      ctx,
    );
  }
  if (!Array.isArray(file.anchors)) {
    throw new LegacyAnchorsError('anchors 字段必须是数组', ctx);
  }

  // 校验每条 anchor
  for (const [idx, a] of file.anchors.entries()) {
    validateAnchor(a, `${ctx}#anchors[${idx}]`);
  }

  // §4.1 + 决策 #10:同 role 多个 authoritative=true → 抛错
  const authByRole = new Map<LegacyAnchorRole, number>();
  for (const a of file.anchors) {
    if (a.authoritative) {
      authByRole.set(a.role, (authByRole.get(a.role) ?? 0) + 1);
    }
  }
  for (const [role, count] of authByRole.entries()) {
    if (count > 1) {
      throw new LegacyAnchorsError(
        `role '${role}' 有 ${count} 个 authoritative=true;每 role 仅允许 1 个(决策 #10)`,
        ctx,
      );
    }
  }

  return file as LegacyAnchorsFile;
}

/** 允许的文件扩展名(决策 #13 + P7-04 修复:加白名单硬校验) */
const ALLOWED_EXTENSIONS = ['.md', '.txt', '.csv', '.xlsx'] as const;

function validateAnchor(a: unknown, ctx: string): asserts a is LegacyAnchor {
  if (!a || typeof a !== 'object') {
    throw new LegacyAnchorsError('anchor 必须是对象', ctx);
  }
  const an = a as Partial<LegacyAnchor>;
  if (typeof an.role !== 'string' || !VALID_ROLES.includes(an.role as LegacyAnchorRole)) {
    throw new LegacyAnchorsError(
      `role '${String(an.role)}' 非预定义角色;可选:${VALID_ROLES.join(', ')}`,
      ctx,
    );
  }
  if (typeof an.path !== 'string' || !an.path.trim()) {
    throw new LegacyAnchorsError('path 字段缺失或非字符串', ctx);
  }
  // P7-04 修复:决策 #12 拒绝外部 URL
  if (/^(https?|ftp|s3|gs|ssh|file):\/\//i.test(an.path)) {
    throw new LegacyAnchorsError(
      `path '${an.path}' 是外部 URL;v0.2 仅支持 git 内文件(决策 #12),先 export 到 git`,
      ctx,
    );
  }
  // P7-04 修复:决策 #13 文件格式白名单(.md / .txt / .csv / .xlsx)
  const lower = an.path.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    throw new LegacyAnchorsError(
      `path '${an.path}' 扩展名不在白名单 ${ALLOWED_EXTENSIONS.join('/')};Word/PDF 先 pandoc 转 markdown(决策 #13)`,
      ctx,
    );
  }
  if (typeof an.authoritative !== 'boolean') {
    throw new LegacyAnchorsError('authoritative 字段必须是 boolean', ctx);
  }
}

/** 取所有 authoritative=true 的 anchor(用于 regenerate / sync-check 仅用当前版,决策 #10) */
export function getAuthoritativeAnchors(file: LegacyAnchorsFile): LegacyAnchor[] {
  return file.anchors.filter((a) => a.authoritative);
}

/** 按 role 分组(用于跨 role 一致性判定,决策 #18) */
export function groupAnchorsByRole(file: LegacyAnchorsFile): Map<LegacyAnchorRole, LegacyAnchor[]> {
  const m = new Map<LegacyAnchorRole, LegacyAnchor[]>();
  for (const a of file.anchors) {
    const arr = m.get(a.role) ?? [];
    arr.push(a);
    m.set(a.role, arr);
  }
  return m;
}
