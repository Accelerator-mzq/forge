// src/core/migrate/types.ts
// MigrateSource 接口 + 全部公共 type — Plan 8a Task 1.2
// 对应 spec §1.3 接口契约 / §2.2 落点表 / §3.4 trace schema

/** 源 artifact 种类(决定 transform 走哪条规则) */
export type ArtifactKind = 'spec' | 'proposal' | 'tasks' | 'design' | 'config' | 'draft';

/** 源类型 ID */
export type SourceId = 'openspec' | 'superpowers';

/** detect() 返回:源是否存在 + 源根路径 */
export interface DetectResult {
  found: boolean;
  /** 找到时:绝对路径(如 /abs/proj/openspec/) */
  rootPath?: string;
  /** found=false 时给 caller 的提示文本 */
  message?: string;
}

/** scan() 返回:原始产物清单(尚未分类) */
export interface ScanResult {
  /** 是否完全空 — runMigrate 会 exit 2 */
  isEmpty: boolean;
  /** 已发现的所有源文件(绝对路径) */
  files: ScannedFile[];
  /** 配对 / 不识别 / unsafe-slug 的 meta */
  pairings?: SuperpowersPairings;
}

export interface ScannedFile {
  /** 源绝对路径 */
  absPath: string;
  /** 相对源根的路径 */
  relPath: string;
  /** 推测 kind(初判;classify 阶段可改) */
  kind: ArtifactKind;
  /** 文件大小(byte;给 budget 用) */
  size: number;
  /** mtime ISO(给 archive-detect 弱信号 + report meta 用) */
  mtime: string;
  /** 编码探测(non-utf8 在 scan 阶段标 [skip:encoding-not-utf8]) */
  encoding?: 'utf8' | 'utf8-bom' | 'non-utf8';
}

/** superpowers 专属:配对 / unrecognized / unsafe-slug 列表 */
export interface SuperpowersPairings {
  paired: Array<{ slug: string; designPath?: string; planPath?: string }>;
  unrecognized: string[];
  unsafeSlug: string[];
}

/** classify() 输出:每个 PlannedChange/Spec/Draft 的归类结果 */
export interface ClassificationPlan {
  changes: PlannedChange[];
  specs: PlannedSpec[];
  drafts: PlannedDraft[];
  configFiles: PlannedConfig[];
  /** classify 阶段的 [unsafe-slug] / [ambiguous-slug] / [skip:read-fail] / [skip:encoding-not-utf8] 标记 */
  skipped: Array<{ source: string; reason: string }>;
}

/** PlannedChange.artifacts:每 kind 单文件,specs 单独用数组(支持 changes/<n>/specs/ 多 area) */
export interface PlannedChangeArtifacts {
  proposal?: ScannedFile;
  tasks?: ScannedFile;
  design?: ScannedFile;
  /** changes/<n>/specs/ 下多个 area.md(spec §2.1 允许) */
  specs?: ScannedFile[];
}

export interface PlannedChange {
  slug: string;
  classification: 'active' | 'archive' | 'draft' | 'skip';
  /** classify 推测信号(report 显示) */
  classificationReason?: string;
  /** 关联的源文件;specs 是数组,其余各 kind 单文件 */
  artifacts: PlannedChangeArtifacts;
  /** M13:archive 但缺件时 LLM 需补哪些 kind(--regenerate 用) */
  missingArtifacts?: ArtifactKind[];
}

export interface PlannedSpec {
  /** spec 的相对路径(如 'foo/spec.md') */
  relPath: string;
  source: ScannedFile;
}

export interface PlannedDraft {
  /** 目标 forge/drafts 下的文件名 */
  targetName: string;
  source: ScannedFile;
}

export interface PlannedConfig {
  source: ScannedFile;
  /** 'fresh' = forge/config.yaml 不存在;'imported' = 写到 .imported(可能再撞 .imported-N) */
  strategy: 'fresh' | 'imported';
  /** strategy='imported' 时分配的最终目标文件名(如 config.yaml.imported-2) */
  targetName: string;
}

/** prepareCopy() 输出:具体的 cp 操作 */
export interface CopyOp {
  /** 源绝对路径(若是从零生成,则 source 为 null) */
  source: string | null;
  /** 目标绝对路径 */
  target: string;
  kind: ArtifactKind;
  /** 关联的 PlannedChange.slug(若属于 change) */
  changeSlug?: string;
  /** 'imported--N' rename 历史(给 report 用) */
  renamedFrom?: string;
}

/** --regenerate 时枚举每个 change 缺哪些件 */
export interface MissingArtifact {
  changeSlug: string;
  kind: 'proposal' | 'specs';
  /** 期望目标路径(如 forge/changes/<slug>/proposal.md 或 forge/changes/<slug>/specs/<area>.md) */
  targetPath: string;
  /** facts 来源策略(M15 v3 目标分桶) */
  factsSource: 'design' | 'tasks' | 'self';
  /** 'self' 路径:facts source 文件的绝对路径(spec/proposal 等已有件;C2 修) */
  sourceAbsPath?: string;
}

/** classify() 上下文(传给 source.classify 的 ctx) */
export interface ClassifyCtx {
  cwd: string;
  /** 用户传入的 --archive-list 文件路径(若有) */
  archiveListPath?: string;
  /** 是否在 git 仓库内(影响 archive-detect 信号 2) */
  inGitRepo: boolean;
}

/** runMigrate() 选项 */
export interface MigrateOptions {
  source: SourceId;
  noRegenerate?: boolean;
  dryRun?: boolean;
  force?: boolean;
  archiveList?: string;
  noInteractive?: boolean;
  redactRules?: string;
}

/** MigrateSource 接口契约(spec §1.3) */
export interface MigrateSource {
  readonly id: SourceId;
  detect(cwd: string): Promise<DetectResult>;
  scan(rootPath: string): Promise<ScanResult>;
  classify(scan: ScanResult, ctx: ClassifyCtx): Promise<ClassificationPlan>;
  prepareCopy(plan: ClassificationPlan, target: string): CopyOp[];
  /** markdown-aware transformer(走 markdown-aware.ts walker) */
  transform(content: string, kind: ArtifactKind): string;
  /** --regenerate 时枚举缺件 */
  listMissingArtifacts(plan: ClassificationPlan): MissingArtifact[];
}

/** trace.json v1 schema(spec §3.4) */
export interface MigrateTrace {
  version: 1;
  source: SourceId;
  sourceRoot: string;
  ts: string;
  ackToken?: string;
  ops: TraceOp[];
  conflicts: Array<{ target: string; rename: string }>;
  downgrades: Array<{ change: string; from: string; to: string; reason: string }>;
  cleanupHint: string;
}

export interface TraceOp {
  from: string | null;
  to: string;
  kind: ArtifactKind;
  transform: string[];
  /** 'ok' | 'needs-fix: <msg>' | 'skip:<reason>' */
  validate: string;
  regen: { model: string; facts: number; passed: number; threshold: number } | null;
  writtenAt: string;
  /** journal 状态机(M14 v4 三步走 + crash 恢复) */
  status?: 'pending' | 'committed';
}
