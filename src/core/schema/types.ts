// spec-driven schema 类型定义 — 对应 forge/config.yaml + 默认 schema

/**
 * forge/config.yaml 的解析结果类型。
 * 详见 spec §2.2.1。
 */
export interface ForgeConfig {
  schema: string; // e.g., 'forge-spec-driven/v1'
  context?: string;
  rules?: {
    proposal?: string[];
    specs?: string[];
    design?: string[];
    tasks?: string[];
  };
  code_paths?: {
    include?: string[];
    exclude?: string[];
  };
}

/**
 * 默认 spec-driven schema 的 artifact 列表(决定哪些文件构成一个 change)。
 */
export const DEFAULT_ARTIFACTS = ['proposal', 'specs', 'design', 'tasks'] as const;
export type ArtifactKind = (typeof DEFAULT_ARTIFACTS)[number];

/**
 * code_paths.exclude 的默认值(不可关闭,与用户声明合并使用)。
 * 详见 spec §3.4 hash 计算规则。
 */
export const DEFAULT_CODE_EXCLUDE = [
  'forge/**',
  '**/*.md',
  '**/.verify-passed',
  '**/.review-passed',
  '**/.verify-failed',
  '**/.review-failed',
  '**/.evidence/**',
] as const;
