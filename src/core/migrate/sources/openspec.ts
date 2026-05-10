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
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

// 编码探测：读前 4 字节识别 UTF-8 / BOM / 非 UTF-8
async function detectEncoding(
  absPath: string
): Promise<'utf8' | 'utf8-bom' | 'non-utf8'> {
  try {
    const fs = await import('node:fs');
    const buf = Buffer.alloc(4);
    const fh = await fs.promises.open(absPath, 'r');
    const { bytesRead } = await fh.read(buf, 0, 4, 0);
    await fh.close();

    if (bytesRead >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf)
      return 'utf8-bom';
    if (bytesRead >= 2 && buf[0] === 0xff && buf[1] === 0xfe)
      return 'non-utf8'; // UTF-16-LE BOM
    if (bytesRead >= 2 && buf[0] === 0xfe && buf[1] === 0xff)
      return 'non-utf8'; // UTF-16-BE BOM
    // 简单启发：含 0x00 字节多半是 UTF-16
    for (let i = 0; i < bytesRead; i++) {
      if (buf[i] === 0x00) return 'non-utf8';
    }
    return 'utf8';
  } catch {
    return 'utf8'; // 打开失败默认 utf8
  }
}

// 处理 change 子目录：把 proposal.md / tasks.md / design.md / specs/*.md 加入列表
async function addChangeFiles(
  absDir: string,
  relDir: string,
  out: ScannedFile[]
): Promise<void> {
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
      relPath: join(relDir, name),
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
        relPath: join(relDir, 'specs', e.name),
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
          relPath: join('specs', d.name, 'spec.md'),
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
              join('changes', 'archive', ae.name),
              files
            );
          }
        } else {
          await addChangeFiles(
            changeRoot,
            join('changes', changeName),
            files
          );
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
          relPath: join('explorations', e.name),
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
        change.artifacts[f.kind] = f;
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
      for (const [kind, f] of Object.entries(c.artifacts)) {
        if (!f) continue;
        const fileName =
          kind === 'spec' ? f.relPath.split('/').pop()! : `${kind}.md`;
        const targetPath =
          kind === 'spec' ? join(baseDir, 'specs', fileName) : join(baseDir, fileName);
        ops.push({
          source: f.absPath,
          target: targetPath,
          kind: kind as ArtifactKind,
          changeSlug: c.slug,
        });
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

  transform(content: string, _kind: ArtifactKind): string {
    // P2 实施 markdown-aware transformer;本骨架原样返回
    return content;
  }

  listMissingArtifacts(_plan: ClassificationPlan): MissingArtifact[] {
    return []; // OpenSpec 缺件少;P2 / P5 细化
  }
}
