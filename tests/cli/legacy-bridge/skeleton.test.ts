// legacy-bridge CLI 骨架测试 — Plan 7 Phase A
// 验证 5 子命令 + --acknowledge-data-transfer 全部注册到 commander

import { describe, it, expect } from 'vitest';
import { buildLegacyBridgeCommand } from '../../../src/cli/commands/legacy-bridge.js';

describe('legacy-bridge CLI 骨架', () => {
  const cmd = buildLegacyBridgeCommand();

  it('注册 5 个子命令', () => {
    const subNames = cmd.commands.map((c) => c.name());
    expect(subNames).toEqual(['map', 'regenerate', 'index', 'sync-check', 'resolve']);
  });

  it('主命令含 --acknowledge-data-transfer 选项', () => {
    const opts = cmd.options.map((o) => o.long);
    expect(opts).toContain('--acknowledge-data-transfer');
  });

  it('regenerate 子命令含 --dry-run / --yes / --include-historical', () => {
    const regen = cmd.commands.find((c) => c.name() === 'regenerate');
    const opts = regen?.options.map((o) => o.long) ?? [];
    expect(opts).toContain('--dry-run');
    expect(opts).toContain('--yes');
    expect(opts).toContain('--include-historical');
  });

  it('map 子命令含 --merge / --overwrite / --docs-paths', () => {
    const map = cmd.commands.find((c) => c.name() === 'map');
    const opts = map?.options.map((o) => o.long) ?? [];
    expect(opts).toContain('--merge');
    expect(opts).toContain('--overwrite');
    expect(opts).toContain('--docs-paths');
  });
});
