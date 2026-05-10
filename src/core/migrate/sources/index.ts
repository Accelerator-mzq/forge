// src/core/migrate/sources/index.ts
// source registry — Plan 8a Task 1.3
// P2 在 openspec.ts 实施后注册 OpenSpecSource;P3 同理 SuperpowersSource

import type { MigrateSource, SourceId } from '../types.js';
import { OpenSpecSource } from './openspec.js';
import { SuperpowersSource } from './superpowers.js';

export const SOURCES: Record<SourceId, MigrateSource> = {
  openspec: new OpenSpecSource(),
  superpowers: new SuperpowersSource(),
};

export function getSource(id: SourceId): MigrateSource {
  const s = SOURCES[id];
  if (!s) {
    throw new Error(`unknown migrate source id: ${id}`);
  }
  return s;
}
