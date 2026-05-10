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

  async scan(_rootPath: string): Promise<ScanResult> {
    throw new Error('OpenSpecSource.scan not implemented (plan-8b)');
  }

  async classify(_scan: ScanResult, _ctx: ClassifyCtx): Promise<ClassificationPlan> {
    throw new Error('OpenSpecSource.classify not implemented (plan-8b)');
  }

  prepareCopy(_plan: ClassificationPlan, _target: string): CopyOp[] {
    throw new Error('OpenSpecSource.prepareCopy not implemented (plan-8b)');
  }

  transform(content: string, _kind: ArtifactKind): string {
    // P2 实施 markdown-aware transformer;本骨架原样返回
    return content;
  }

  listMissingArtifacts(_plan: ClassificationPlan): MissingArtifact[] {
    return []; // OpenSpec 缺件少;P2 / P5 细化
  }
}
