// src/core/migrate/sources/superpowers.ts
// SuperpowersSource detect/scan/classify/prepareCopy — Plan 8c Task 3.2-3.5

import type {
  MigrateSource,
  DetectResult,
  ScanResult,
  ClassificationPlan,
  ClassifyCtx,
  CopyOp,
  ArtifactKind,
  MissingArtifact,
  ScannedFile,
  PlannedChange,
  PlannedDraft,
} from '../types.js';
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, posix as posixPath, basename } from 'node:path';
import { execSync } from 'node:child_process';
import { detectEncoding } from '../utils.js';
import { detectArchive } from '../archive-detect.js';
import { walkLines } from '../markdown-aware.js';

// 保留 slug 集合 — 这些名字不允许作为 slug
const RESERVED_SLUGS_SP = new Set(['..', '.', '.cache', '.forge-trash', '.forge-ack', 'archive']);

// 从文件名取 slug:'2026-01-01-add-auth' → 'add-auth'(锚定 ISO 日期前缀)
function extractSlug(filename: string, suffix: '-design.md' | '-plan.md'): string | null {
  if (!filename.endsWith(suffix)) return null;
  const stem = filename.slice(0, -suffix.length);
  const m = stem.match(/^\d{4}-\d{2}-\d{2}-(.+)$/);
  return m?.[1] ?? null;
}

// 判断 slug 是否不安全(含路径穿越字符 / 保留名)
function isUnsafeSlug(slug: string): boolean {
  if (RESERVED_SLUGS_SP.has(slug)) return true;
  if (slug.includes('/') || slug.includes('\\')) return true;
  if (slug.includes('..')) return true;
  return false;
}

export class SuperpowersSource implements MigrateSource {
  readonly id = 'superpowers' as const;

  async detect(cwd: string): Promise<DetectResult> {
    // detect 阶段：检查 docs/superpowers/ 是否存在
    const root = join(cwd, 'docs', 'superpowers');
    if (!existsSync(root)) {
      return { found: false, message: `<cwd>/docs/superpowers/ 不存在;预期路径:${root}` };
    }
    return { found: true, rootPath: root };
  }

  async scan(rootPath: string): Promise<ScanResult> {
    // scan 阶段：扫描 specs/ + plans/ 做配对算法
    const files: ScannedFile[] = [];
    const paired: Array<{ slug: string; designPath?: string; planPath?: string }> = [];
    const unrecognized: string[] = [];
    const unsafeSlug: string[] = [];

    // key → ScannedFile 映射（供配对用）
    const designByKey = new Map<string, ScannedFile>();
    const planByKey = new Map<string, ScannedFile>();

    // specs/ 扫描（-design.md 文件）
    const specsDir = join(rootPath, 'specs');
    if (existsSync(specsDir)) {
      const entries = await readdir(specsDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() || !e.name.endsWith('.md')) continue;
        const slug = extractSlug(e.name, '-design.md');
        const absPath = join(specsDir, e.name);
        const stats = await stat(absPath);
        const sf: ScannedFile = {
          absPath,
          // relPath 必须 posix slash（P2 critical bug 教训！）
          relPath: posixPath.join('specs', e.name),
          kind: 'design',
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          encoding: await detectEncoding(absPath),
        };
        if (!slug) {
          unrecognized.push(sf.relPath);
          continue;
        }
        if (isUnsafeSlug(slug)) {
          unsafeSlug.push(sf.relPath);
          continue;
        }
        designByKey.set(slug, sf);
        files.push(sf);
      }
    }

    // plans/ 扫描（-plan.md 文件）
    const plansDir = join(rootPath, 'plans');
    if (existsSync(plansDir)) {
      const entries = await readdir(plansDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() || !e.name.endsWith('.md')) continue;
        const slug = extractSlug(e.name, '-plan.md');
        const absPath = join(plansDir, e.name);
        const stats = await stat(absPath);
        const sf: ScannedFile = {
          absPath,
          // relPath 必须 posix slash（P2 critical bug 教训！）
          relPath: posixPath.join('plans', e.name),
          kind: 'tasks',
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          encoding: await detectEncoding(absPath),
        };
        if (!slug) {
          unrecognized.push(sf.relPath);
          continue;
        }
        if (isUnsafeSlug(slug)) {
          unsafeSlug.push(sf.relPath);
          continue;
        }
        planByKey.set(slug, sf);
        files.push(sf);
      }
    }

    // 配对算法：取 designByKey + planByKey 的 union keys
    const allKeys = new Set([...designByKey.keys(), ...planByKey.keys()]);
    for (const k of allKeys) {
      paired.push({
        slug: k,
        designPath: designByKey.get(k)?.absPath,
        planPath: planByKey.get(k)?.absPath,
      });
    }

    return {
      isEmpty: files.length === 0,
      files,
      pairings: { paired, unrecognized, unsafeSlug },
    };
  }

  async classify(scan: ScanResult, ctx: ClassifyCtx): Promise<ClassificationPlan> {
    // classify 阶段：对每个 paired slug 调 detectArchive 推测 archive/active
    const changes: PlannedChange[] = [];
    const drafts: PlannedDraft[] = [];
    const skipped: ClassificationPlan['skipped'] = [];

    // unsafe-slug ≥ 50% 阈值检查（spec §3.1 — 触发 exit 4）
    const totalCount =
      (scan.pairings?.paired.length ?? 0) +
      (scan.pairings?.unsafeSlug.length ?? 0) +
      (scan.pairings?.unrecognized.length ?? 0);
    const unsafeRatio = totalCount > 0 ? (scan.pairings?.unsafeSlug.length ?? 0) / totalCount : 0;
    if (unsafeRatio >= 0.5) {
      skipped.push({
        source: '__GLOBAL__',
        reason: `[unsafe-slug-ratio-too-high: ${(unsafeRatio * 100).toFixed(0)}%]`,
      });
    }

    // 处理每个配对 slug
    for (const p of scan.pairings?.paired ?? []) {
      const designFile = scan.files.find((f) => f.absPath === p.designPath);
      const planFile = scan.files.find((f) => f.absPath === p.planPath);

      // 读取 planContent 用于 archive-detect
      const planContent = planFile ? await readFile(planFile.absPath, 'utf8') : '';
      const hasArchivedMarker = planContent.includes('<!-- forge:archived -->');

      // 获取 git log 该 plan 文件的 commit messages（仅在 git repo 中）
      let gitLogCommits: string[] = [];
      if (ctx.inGitRepo && planFile) {
        try {
          const out = execSync(`git log --follow --pretty=format:%s -- "${planFile.absPath}"`, {
            cwd: ctx.cwd,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          gitLogCommits = out.split('\n').filter((s) => s.trim());
        } catch {
          // 忽略 git log 错误（不在 repo / 文件未追踪 / git 命令找不到）
        }
      }

      // 计算 mtime 距今天数（仅展示，archive-detect 用于弱信号）
      const mtimeAgeDays = planFile
        ? Math.floor((Date.now() - new Date(planFile.mtime).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // 调用 archive-detect 推测 archive/active
      const detect = detectArchive({
        slug: p.slug,
        planContent,
        gitLogCommits,
        mtimeAgeDays,
        hasArchivedMarker,
        inGitRepo: ctx.inGitRepo,
      });

      const change: PlannedChange = {
        slug: p.slug,
        classification: detect.recommended,
        classificationReason: detect.reasons.join('; '),
        artifacts: {},
      };
      if (designFile) change.artifacts.design = designFile;
      if (planFile) change.artifacts.tasks = planFile;
      changes.push(change);
    }

    // unsafe-slug / unrecognized 逐文件加入 skipped 列表
    for (const u of scan.pairings?.unsafeSlug ?? []) {
      skipped.push({ source: u, reason: '[unsafe-slug]' });
    }
    for (const u of scan.pairings?.unrecognized ?? []) {
      skipped.push({ source: u, reason: '[unrecognized-filename]' });
    }

    return { changes, specs: [], drafts, configFiles: [], skipped };
  }

  prepareCopy(plan: ClassificationPlan, target: string): CopyOp[] {
    // prepareCopy 阶段：计划 → 具体复制操作
    // 落点表：active → forge/changes/<slug>/{design,tasks}.md
    //        archive → forge/changes/archive/<slug>/{design,tasks}.md
    //        draft  → forge/drafts/<原文件名>（扁平保留）
    const ops: CopyOp[] = [];

    for (const c of plan.changes) {
      if (c.classification === 'skip') continue;

      if (c.classification === 'draft') {
        // draft：扁平保留（原文件名）
        if (c.artifacts.design) {
          ops.push({
            source: c.artifacts.design.absPath,
            target: join(target, 'drafts', basename(c.artifacts.design.absPath)),
            kind: 'draft',
          });
        }
        if (c.artifacts.tasks) {
          ops.push({
            source: c.artifacts.tasks.absPath,
            target: join(target, 'drafts', basename(c.artifacts.tasks.absPath)),
            kind: 'draft',
          });
        }
        continue;
      }

      // active / archive：目标目录 baseDir
      const baseDir =
        c.classification === 'archive'
          ? join(target, 'changes', 'archive', c.slug)
          : join(target, 'changes', c.slug);

      if (c.artifacts.design) {
        ops.push({
          source: c.artifacts.design.absPath,
          target: join(baseDir, 'design.md'),
          kind: 'design',
          changeSlug: c.slug,
        });
      }
      if (c.artifacts.tasks) {
        // plan.md → tasks.md（只改名；内容由 transform 改）
        ops.push({
          source: c.artifacts.tasks.absPath,
          target: join(baseDir, 'tasks.md'),
          kind: 'tasks',
          changeSlug: c.slug,
        });
      }
    }

    return ops;
  }

  transform(content: string, kind: ArtifactKind): string {
    // Task 3.6 实施 5 条 transform 规则；tasks kind 时执行 plan→tasks 转换
    if (kind === 'tasks') return this.transformPlan(content);
    // design kind 不 transform(spec §2.6)
    return content;
  }

  // 中文注释：处理 **Step N****: → task-N: 的转换规则
  // 支持 5 条规则：英文冒号、中文冒号、嵌套、大小写不敏感、代码块跳过
  private transformPlan(content: string): string {
    return walkLines(content, (line, ctx) => {
      // inFenced 或 table-row 时不处理
      if (ctx.inFenced || ctx.isTableRow) return;

      // 匹配 **[Ss][Tt][Ee][Pp] N** + [:：] 的规则
      // 正则支持：
      // - 大小写不敏感 STEP/step/Step
      // - 一至三层数字 \d+(?:\.\d+){0,2}
      // - 英文冒号 : 和中文冒号 ：都支持
      const m = line.match(
        /^(\s*)- \[([ x])\] \*\*[Ss][Tt][Ee][Pp]\s+(\d+(?:\.\d+){0,2})\*\*\s*[:：]\s*(.+)$/,
      );
      if (!m) return;

      const indent = m[1] ?? '';
      const checked = m[2] ?? ' ';
      const num = m[3] ?? '';
      const rest = m[4] ?? '';

      // 将点号 . 替换为短横线 - 形成 task-1-1 格式
      const taskId = `task-${num.replace(/\./g, '-')}`;
      return `${indent}- [${checked}] ${taskId}: ${rest}`;
    });
  }

  listMissingArtifacts(_plan: ClassificationPlan): MissingArtifact[] {
    // Task 3.7 实施 M15 facts 目标分桶；当前返回空
    return [];
  }
}
