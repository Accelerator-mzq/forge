import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPauseCapture, buildPauseCaptureCommand } from '../../src/cli/commands/pause-capture.js';
import { readAllAckLogEntries, type PauseCaptureEntry } from '../../src/core/ack-log.js';

describe('forge pause-capture', () => {
  it('读 tasks.md 解析 task id,写 pause-capture entry 进 ack-log,返回 capture_id', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'forge-pc-cmd-'));
    try {
      const changeRoot = join(cwd, 'forge', 'changes', 'c1');
      mkdirSync(changeRoot, { recursive: true });
      writeFileSync(
        join(changeRoot, 'tasks.md'),
        '# Tasks\n\n- [x] task-1: baseline\n- [ ] task-2: wip\n',
      );
      const result = await runPauseCapture({
        cwd,
        changeId: 'c1',
        task: 'tasks.md#task-2',
        issue: 'OAuth refresh',
      });
      expect(result.captureId).toMatch(/^[0-9a-f-]{36}$/); // UUID
      const entries = await readAllAckLogEntries(changeRoot);
      const cap = entries.find((e) => e.kind === 'pause-capture') as PauseCaptureEntry;
      expect(cap).toBeDefined();
      expect(cap.capture_id).toBe(result.captureId);
      expect(cap.change_id).toBe('c1');
      expect(cap.task_ref).toBe('tasks.md#task-2');
      expect(cap.tasks_md_task_ids).toEqual(['task-1', 'task-2']);
      expect(cap.pause_issue_summary).toBe('OAuth refresh');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('changeId 对应目录不存在 → 抛错', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'forge-pc-cmd-2-'));
    try {
      await expect(
        runPauseCapture({ cwd, changeId: 'missing', task: 'tasks.md#t', issue: 'x' }),
      ).rejects.toThrow(/tasks\.md|不存在/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

// design §11:CLI 单测须含 help / 参数校验 / unknown command(commander 层)
describe('buildPauseCaptureCommand — commander 层', () => {
  it('--help 信息含子命令名与必填选项', () => {
    const help = buildPauseCaptureCommand().helpInformation();
    expect(help).toMatch(/pause-capture/);
    expect(help).toMatch(/--task/);
    expect(help).toMatch(/--issue/);
  });

  it('缺 required option(--task / --issue)→ commander 报错', async () => {
    // exitOverride 让 commander 抛 CommanderError 而非 process.exit
    const cmd = buildPauseCaptureCommand().exitOverride();
    await expect(cmd.parseAsync(['c1'], { from: 'user' })).rejects.toThrow(
      /required option|--task/,
    );
  });

  it('unknown option → commander 报错', async () => {
    const cmd = buildPauseCaptureCommand().exitOverride();
    await expect(
      cmd.parseAsync(['c1', '--task', 't', '--issue', 'i', '--bogus'], { from: 'user' }),
    ).rejects.toThrow(/unknown option/);
  });
});
