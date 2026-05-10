// src/core/migrate/sources/openspec.ts
// OpenSpecSource 空骨架 — Plan 8a Task 1.4
// 实际 scan/classify/transform/listMissingArtifacts 由 plan-8b(Phase 2)落实

import type {
  MigrateSource,
  DetectResult,
  ScanResult,
  ClassificationPlan,
  ClassifyCtx,
  CopyOp,
  ArtifactKind,
  MissingArtifact,
} from '../types.js';

export class OpenSpecSource implements MigrateSource {
  readonly id = 'openspec' as const;

  async detect(_cwd: string): Promise<DetectResult> {
    throw new Error('OpenSpecSource.detect not implemented (plan-8b)');
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
