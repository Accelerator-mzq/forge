// src/core/migrate/sources/superpowers.ts
// SuperpowersSource 空骨架 — Plan 8a Task 1.5
// 实际 scan/classify/transform/listMissingArtifacts 由 plan-8c(Phase 3)落实

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

export class SuperpowersSource implements MigrateSource {
  readonly id = 'superpowers' as const;

  async detect(_cwd: string): Promise<DetectResult> {
    throw new Error('SuperpowersSource.detect not implemented (plan-8c)');
  }

  async scan(_rootPath: string): Promise<ScanResult> {
    throw new Error('SuperpowersSource.scan not implemented (plan-8c)');
  }

  async classify(_scan: ScanResult, _ctx: ClassifyCtx): Promise<ClassificationPlan> {
    throw new Error('SuperpowersSource.classify not implemented (plan-8c)');
  }

  prepareCopy(_plan: ClassificationPlan, _target: string): CopyOp[] {
    throw new Error('SuperpowersSource.prepareCopy not implemented (plan-8c)');
  }

  transform(content: string, _kind: ArtifactKind): string {
    return content;
  }

  listMissingArtifacts(_plan: ClassificationPlan): MissingArtifact[] {
    return [];
  }
}
