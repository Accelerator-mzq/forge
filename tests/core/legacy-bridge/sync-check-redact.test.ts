// tests/core/legacy-bridge/sync-check-redact.test.ts
import { describe, it, expect } from 'vitest';
import { buildSyncCheckTask } from '../../../src/core/legacy-bridge/sync-check.js';
import type { LegacyAnchorsFile } from '../../../src/core/legacy-bridge/types.js';

const anchors: LegacyAnchorsFile = {
  schema: 'forge-legacy-anchor/v1',
  anchors: [
    { role: 'requirements', path: 'docs/SRS.md', authoritative: true, modules: ['payment'] },
  ],
};

describe('buildSyncCheckTask redact 覆盖 changeContext', () => {
  it('changeContext 里的 secret 在 task.prompt 中被 mask', async () => {
    const task = await buildSyncCheckTask(
      {
        changeId: 'add-pay',
        changeContext: '本次 change 用 token AKIA1234567890ABCDEF',
        affectedModules: ['payment'],
        anchors,
        autoResolveCrossAnchor: false,
        mtimeOf: () => 0,
      },
      async () => '锚点正文',
    );
    expect(task).not.toBeNull();
    expect(task!.prompt).not.toContain('AKIA1234567890ABCDEF'); // 现状盲区:此前会失败
    expect(task!.prompt).toContain('<<REDACTED');
    // inputs 里的 change-context 条目同样会写进 manifest 交给 agent —— 也必须已 mask
    const ctxInput = task!.inputs.find((i) => i.source === 'change-context');
    expect(ctxInput).toBeTruthy();
    expect(ctxInput!.content).not.toContain('AKIA1234567890ABCDEF');
    expect(ctxInput!.content).toContain('<<REDACTED');
  });
});
