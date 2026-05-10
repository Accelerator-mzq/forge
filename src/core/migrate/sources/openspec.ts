// src/core/migrate/sources/openspec.ts
// OpenSpecSource detect/scan/classify/prepareCopy 实施 — Plan 8b Task 2.2-2.5
// 实际 transform/listMissingArtifacts 由 P2/P5 继续落实

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
  PlannedSpec,
  PlannedDraft,
  PlannedConfig,
} from '../types.js';
import { walkLines } from '../markdown-aware.js';
import { detectEncoding } from '../utils.js';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, posix as posixPath } from 'node:path';

// 处理 change 子目录：把 proposal.md / tasks.md / design.md / specs/*.md 加入列表
async function addChangeFiles(absDir: string, relDir: string, out: ScannedFile[]): Promise<void> {
  const SCALAR_FILES: Array<{ name: string; kind: ArtifactKind }> = [
    { name: 'proposal.md', kind: 'proposal' },
    { name: 'tasks.md', kind: 'tasks' },
    { name: 'design.md', kind: 'design' },
  ];
  for (const { name, kind } of SCALAR_FILES) {
    const absPath = join(absDir, name);
    if (!existsSync(absPath)) continue;
    const stats = await stat(absPath);
    out.push({
      absPath,
      // relPath 必须 posix slash(逻辑路径 key,classify 阶段会按 '/' 切分)
      relPath: posixPath.join(relDir, name),
      kind,
      size: stats.size,
      mtime: stats.mtime.toISOString(),
      encoding: await detectEncoding(absPath),
    });
  }
  // specs/<area>.md
  const specsSubDir = join(absDir, 'specs');
  if (existsSync(specsSubDir)) {
    const entries = await readdir(specsSubDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() || !e.name.endsWith('.md')) continue;
      const absPath = join(specsSubDir, e.name);
      const stats = await stat(absPath);
      out.push({
        absPath,
        // relPath 必须 posix slash(逻辑路径 key)
        relPath: posixPath.join(relDir, 'specs', e.name),
        kind: 'spec',
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        encoding: await detectEncoding(absPath),
      });
    }
  }
}

// 保留的 slug 列表 — classify 阶段跳过这些
const RESERVED_SLUGS = new Set(['.cache', '.forge-trash', '.forge-ack', 'archive']);

// 判断 slug 是否不安全
function isUnsafeSlug(slug: string): boolean {
  if (slug === '..' || slug === '.') return true;
  if (RESERVED_SLUGS.has(slug)) return true;
  if (slug.includes('/') || slug.includes('\\')) return true;
  return false;
}

export class OpenSpecSource implements MigrateSource {
  readonly id = 'openspec' as const;

  async detect(cwd: string): Promise<DetectResult> {
    // detect 阶段：检查 openspec/ 是否存在
    const root = join(cwd, 'openspec');
    if (!existsSync(root)) {
      return {
        found: false,
        message: `<cwd>/openspec/ 不存在;预期路径:${root}`,
      };
    }
    return { found: true, rootPath: root };
  }

  async scan(rootPath: string): Promise<ScanResult> {
    // scan 阶段：枚举源目录产物(specs / changes / explorations / config.yaml)
    const files: ScannedFile[] = [];

    // 1. specs/<n>/spec.md
    const specsDir = join(rootPath, 'specs');
    if (existsSync(specsDir)) {
      const dirs = await readdir(specsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const specPath = join(specsDir, d.name, 'spec.md');
        if (!existsSync(specPath)) continue;
        const stats = await stat(specPath);
        const encoding = await detectEncoding(specPath);
        files.push({
          absPath: specPath,
          // relPath 必须 posix slash(逻辑路径 key)
          relPath: posixPath.join('specs', d.name, 'spec.md'),
          kind: 'spec',
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          encoding,
        });
      }
    }

    // 2. changes/<n>/(active 与 archive)
    const changesDir = join(rootPath, 'changes');
    if (existsSync(changesDir)) {
      const entries = await readdir(changesDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const changeName = e.name;
        const isArchive = changeName === 'archive';
        const changeRoot = join(changesDir, changeName);

        if (isArchive) {
          // archive 子目录：再 readdir 一层
          const archiveEntries = await readdir(changeRoot, {
            withFileTypes: true,
          });
          for (const ae of archiveEntries) {
            if (!ae.isDirectory()) continue;
            await addChangeFiles(
              join(changeRoot, ae.name),
              // relDir 走 posix(addChangeFiles 内会继续 posix 拼接)
              posixPath.join('changes', 'archive', ae.name),
              files,
            );
          }
        } else {
          // relDir 走 posix(addChangeFiles 内会继续 posix 拼接)
          await addChangeFiles(changeRoot, posixPath.join('changes', changeName), files);
        }
      }
    }

    // 3. explorations/*.md
    const explorationsDir = join(rootPath, 'explorations');
    if (existsSync(explorationsDir)) {
      const entries = await readdir(explorationsDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory() || !e.name.endsWith('.md')) continue;
        const absPath = join(explorationsDir, e.name);
        const stats = await stat(absPath);
        const encoding = await detectEncoding(absPath);
        files.push({
          absPath,
          // relPath 必须 posix slash(逻辑路径 key)
          relPath: posixPath.join('explorations', e.name),
          kind: 'draft',
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          encoding,
        });
      }
    }

    // 4. config.yaml
    const configPath = join(rootPath, 'config.yaml');
    if (existsSync(configPath)) {
      const stats = await stat(configPath);
      files.push({
        absPath: configPath,
        relPath: 'config.yaml',
        kind: 'config',
        size: stats.size,
        mtime: stats.mtime.toISOString(),
        encoding: await detectEncoding(configPath),
      });
    }

    return { isEmpty: files.length === 0, files };
  }

  async classify(scan: ScanResult, _ctx: ClassifyCtx): Promise<ClassificationPlan> {
    // classify 阶段：为 scan 结果分类并判定目标位置
    const changesMap = new Map<string, PlannedChange>();
    const specs: PlannedSpec[] = [];
    const drafts: PlannedDraft[] = [];
    const configFiles: PlannedConfig[] = [];
    const skipped: ClassificationPlan['skipped'] = [];

    for (const f of scan.files) {
      // 编码检查：非 UTF-8 直接跳过
      if (f.encoding === 'non-utf8') {
        skipped.push({ source: f.relPath, reason: '[skip:encoding-not-utf8]' });
        continue;
      }

      // spec 顶层(specs/<n>/spec.md)
      if (f.kind === 'spec' && f.relPath.startsWith('specs/')) {
        specs.push({
          relPath: f.relPath.replace(/^specs\//, ''),
          source: f,
        });
        continue;
      }

      // change(active 或 archive)
      if (f.relPath.startsWith('changes/')) {
        const parts = f.relPath.split('/');
        const isArchive = parts[1] === 'archive';
        const slug = isArchive ? parts[2] : parts[1];
        if (!slug) continue;
        if (isUnsafeSlug(slug)) {
          skipped.push({
            source: f.relPath,
            reason: `[unsafe-slug: ${slug}]`,
          });
          continue;
        }
        let change = changesMap.get(slug);
        if (!change) {
          change = {
            slug,
            classification: isArchive ? 'archive' : 'active',
            artifacts: {},
          };
          changesMap.set(slug, change);
        }
        // spec 文件累积到数组(支持多 area.md);其余 kind 单文件赋值
        if (f.kind === 'spec') {
          change.artifacts.specs = [...(change.artifacts.specs ?? []), f];
        } else if (f.kind === 'proposal' || f.kind === 'tasks' || f.kind === 'design') {
          change.artifacts[f.kind] = f;
        }
        // config / draft 的 kind 不进 change.artifacts
        continue;
      }

      // draft(explorations/)
      if (f.kind === 'draft') {
        drafts.push({
          targetName: f.relPath.replace(/^explorations\//, ''),
          source: f,
        });
        continue;
      }

      // config.yaml
      if (f.kind === 'config') {
        configFiles.push({
          source: f,
          strategy: 'fresh',
          targetName: 'config.yaml',
        });
        continue;
      }
    }

    return {
      changes: Array.from(changesMap.values()),
      specs,
      drafts,
      configFiles,
      skipped,
    };
  }

  prepareCopy(plan: ClassificationPlan, target: string): CopyOp[] {
    // prepareCopy 阶段：计划 → 具体复制操作
    const ops: CopyOp[] = [];

    // changes（分 active 与 archive）
    for (const c of plan.changes) {
      const baseDir =
        c.classification === 'archive'
          ? join(target, 'changes', 'archive', c.slug)
          : join(target, 'changes', c.slug);

      // proposal / tasks / design 单文件各自 kind.md
      for (const kind of ['proposal', 'tasks', 'design'] as const) {
        const f = c.artifacts[kind];
        if (!f) continue;
        ops.push({
          source: f.absPath,
          target: join(baseDir, `${kind}.md`),
          kind,
          changeSlug: c.slug,
        });
      }

      // specs 多文件:relPath 是 posix slash,split('/').pop() 安全取文件名
      if (c.artifacts.specs) {
        for (const f of c.artifacts.specs) {
          const fileName = f.relPath.split('/').pop() ?? 'spec.md';
          ops.push({
            source: f.absPath,
            target: join(baseDir, 'specs', fileName),
            kind: 'spec',
            changeSlug: c.slug,
          });
        }
      }
    }

    // specs
    for (const s of plan.specs) {
      ops.push({
        source: s.source.absPath,
        target: join(target, 'specs', s.relPath),
        kind: 'spec',
      });
    }

    // drafts
    for (const d of plan.drafts) {
      ops.push({
        source: d.source.absPath,
        target: join(target, 'drafts', d.targetName),
        kind: 'draft',
      });
    }

    // config
    for (const cf of plan.configFiles) {
      ops.push({
        source: cf.source.absPath,
        target: join(target, cf.targetName),
        kind: 'config',
      });
    }

    return ops;
  }

  transform(content: string, kind: ArtifactKind): string {
    // Task 2.6-2.8 实施三套规则 transform
    if (kind === 'spec') return this.transformSpec(content);
    if (kind === 'proposal') return this.transformProposal(content);
    if (kind === 'tasks') return this.transformTasks(content);
    return content; // design / config / draft 不 transform
  }

  // Task 2.6 spec.md 规则:### Requirement → ## Requirement / #### Scenario → ## Scenario / list-prefix WHEN/THEN/GIVEN → **When**/... / 多行续行合并
  private transformSpec(content: string): string {
    // 第一步:单次 walker 收集每行的 (line, ctx) 信息数组,后续 stage 复用
    const rows: Array<{ line: string; inFenced: boolean; isTableRow: boolean }> = [];
    walkLines(content, (line, ctx) => {
      rows.push({ line, inFenced: ctx.inFenced, isTableRow: ctx.isTableRow });
    });

    // 第二步:stage1 行替换(只在 !inFenced && !isTableRow 行)
    const stage1Lines = rows.map((r) => {
      if (r.inFenced || r.isTableRow) return r.line;
      let l = r.line;
      // ### Requirement → ## Requirement
      l = l.replace(/^### Requirement:/, '## Requirement:');
      // #### Scenario → ## Scenario
      l = l.replace(/^#### Scenario:/, '## Scenario:');
      // list-prefix WHEN/THEN/GIVEN/AND/BUT → **When**/**Then**/...
      const m = l.match(/^(\s*)- \*\*(WHEN|THEN|GIVEN|AND|BUT)\*\*\s+(.+)$/i);
      if (m) {
        const [, indent, kw, rest] = m;
        // 标题大小写:首字母大写,其余小写
        const titleCase = (kw ?? '').charAt(0).toUpperCase() + (kw ?? '').slice(1).toLowerCase();
        l = `${indent ?? ''}**${titleCase}** ${rest ?? ''}`;
      }
      return l;
    });

    // 第三步:fence-aware 多行续行合并 — fenced 内不合并(C #1 fix)
    const out: string[] = [];
    for (let i = 0; i < stage1Lines.length; i++) {
      const cur = stage1Lines[i] ?? '';
      const isFenced = rows[i]?.inFenced;
      const isStep = !isFenced && /^(\s*)\*\*(When|Then|Given|And|But)\*\*\s/.test(cur);
      if (isStep) {
        let merged = cur;
        // 续行:2+ 空格缩进 + 非 `-` 起始 + 非 heading + 非空 + 非 fenced
        while (i + 1 < stage1Lines.length) {
          const next = stage1Lines[i + 1] ?? '';
          const nextFenced = rows[i + 1]?.inFenced;
          if (!nextFenced && /^\s{2,}[^-#\s]/.test(next) && next.trim().length > 0) {
            merged += ' ' + next.trim();
            i++;
          } else break;
        }
        out.push(merged);
      } else {
        out.push(cur);
      }
    }
    return out.join('\n');
  }

  // Task 2.7 proposal.md 规则:## Problem → ## Why / ## Proposed Solution → ## What
  private transformProposal(content: string): string {
    // 加 isTableRow 检查,与 transformSpec / transformTasks 保持一致(spec §2.5 / Minor 7 fix)
    return walkLines(content, (line, ctx) => {
      if (ctx.inFenced || ctx.isTableRow) return;
      if (line === '## Problem') return '## Why';
      if (line === '## Proposed Solution') return '## What';
    });
  }

  // Task 2.8 tasks.md 规则:数字编号 → task-N: / 三层 1.2.3 → task-1-2-3:
  private transformTasks(content: string): string {
    return walkLines(content, (line, ctx) => {
      if (ctx.inFenced || ctx.isTableRow) return;
      // 匹配 `- [x] N.M.K. text` 格式(最多三层编号)
      const m = line.match(/^(\s*)- \[([ x])\] (\d+(?:\.\d+){0,2})\.\s+(.+)$/);
      if (!m) return;
      const [, indent, checked, num, rest] = m;
      // 将 `1.2.3` 变为 `task-1-2-3`
      const taskId = `task-${(num ?? '').replace(/\./g, '-')}`;
      return `${indent ?? ''}- [${checked ?? ' '}] ${taskId}: ${rest ?? ''}`;
    });
  }

  listMissingArtifacts(plan: ClassificationPlan): MissingArtifact[] {
    // 枚举 Plan 中缺件的 artifacts;for each change,检查 proposal + spec(specs) 是否齐全
    // C2 修:用目标分桶(proposal 优先 design,fallback tasks/'self';specs 优先 tasks,fallback design/'self')
    const missing: MissingArtifact[] = [];
    for (const c of plan.changes) {
      const archivePrefix = c.classification === 'archive' ? 'archive/' : '';

      // 检查 proposal — facts source 优先 design,fallback tasks,最后 self(附 sourceAbsPath)
      if (!c.artifacts.proposal) {
        let factsSource: 'design' | 'tasks' | 'self';
        let sourceAbsPath: string | undefined;
        if (c.artifacts.design) {
          factsSource = 'design';
        } else if (c.artifacts.tasks) {
          factsSource = 'tasks';
        } else {
          // 都没有 — 用 specs 数组第一个(若有)作 self 路径
          factsSource = 'self';
          sourceAbsPath = c.artifacts.specs?.[0]?.absPath;
        }
        missing.push({
          changeSlug: c.slug,
          kind: 'proposal',
          targetPath: `forge/changes/${archivePrefix}${c.slug}/proposal.md`,
          factsSource,
          sourceAbsPath,
        });
      }

      // 检查 specs 数组 — facts source 优先 tasks,fallback design,最后 self(附 sourceAbsPath)
      if (!c.artifacts.specs || c.artifacts.specs.length === 0) {
        let factsSource: 'design' | 'tasks' | 'self';
        let sourceAbsPath: string | undefined;
        if (c.artifacts.tasks) {
          factsSource = 'tasks';
        } else if (c.artifacts.design) {
          factsSource = 'design';
        } else {
          // 都没有 — 用 proposal(若有)作 self 路径
          factsSource = 'self';
          sourceAbsPath = c.artifacts.proposal?.absPath;
        }
        missing.push({
          changeSlug: c.slug,
          kind: 'specs',
          targetPath: `forge/changes/${archivePrefix}${c.slug}/specs/${c.slug}.md`,
          factsSource,
          sourceAbsPath,
        });
      }
    }
    return missing;
  }
}
