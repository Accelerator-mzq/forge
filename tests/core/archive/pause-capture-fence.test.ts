import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validatePauseDecisionsFence } from '../../../src/core/archive/pause-decisions-fence.js';
import {
  appendAckLog,
  readAllAckLogEntries,
  type PauseCaptureEntry,
} from '../../../src/core/ack-log.js';
import { canonicalHash } from '../../../src/core/canonical-json.js';

// 在 changeDir 写 tasks.md + 一条 pause-capture entry;返回 verify marker tail/count
async function setupCapture(opts: {
  tasksMd: string;
  captureTaskIds: string[];
  captureId: string;
  taskRef: string;
}): Promise<{ changeDir: string; tailHash: string; count: number }> {
  const changeDir = mkdtempSync(join(tmpdir(), 'forge-opt2-'));
  writeFileSync(join(changeDir, 'tasks.md'), opts.tasksMd);
  const entry: PauseCaptureEntry = {
    schema: 'forge-ack-log/v1',
    kind: 'pause-capture',
    timestamp: '2026-05-12T14:25:00Z',
    capture_id: opts.captureId,
    change_id: 'c1',
    task_ref: opts.taskRef,
    pause_issue_summary: 'x',
    tasks_md_task_ids: opts.captureTaskIds,
    git_head: null,
    extra: {},
  };
  await appendAckLog(changeDir, entry);
  const all = await readAllAckLogEntries(changeDir);
  return { changeDir, tailHash: canonicalHash(all[all.length - 1]!), count: all.length };
}

function opt2Marker(captureId: string, addedTaskRef: string, tailHash: string, count: number) {
  return {
    ack_log_tail_hash: tailHash,
    ack_log_entry_count: count,
    pause_decisions: [
      {
        id: 1,
        paused_at: '2026-05-12T14:25:00Z',
        task_ref: 'tasks.md#task-1',
        issue_summary: 'x',
        severity: 'WARNING',
        severity_acked_by: 'msc',
        severity_acked_at: '2026-05-12T14:27:00Z',
        chosen_option: 2,
        target_artifact: 'tasks.md',
        target_anchor: '- task-3',
        non_blocking_rationale: null,
        other_rationale: null,
        other_acked_by: null,
        added_task_ref: addedTaskRef,
        capture_id: captureId,
      },
    ],
  };
}

describe('checkOption2TaskChecked — capture 校验', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('happy path:added_task_ref ∉ capture 快照、∈ 当前 tasks.md 且勾选 → 通过', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: pause 新增\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash,
      verifyAckLogEntryCount: count,
      changeId: 'c1',
    });
    expect(result.valid).toBe(true);
  });

  it('attack:added_task_ref 出现在 capture 快照里(非新增)→ 拒签', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: 旧 task\n',
      captureTaskIds: ['task-1', 'task-3'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash,
      verifyAckLogEntryCount: count,
      changeId: 'c1',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /capture|新增/.test(e.message))).toBe(true);
  });

  it('capture entry 缺失(capture_id 找不到)→ fail-closed 拒签', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-MISSING', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash,
      verifyAckLogEntryCount: count,
      changeId: 'c1',
    });
    expect(result.valid).toBe(false);
  });

  it('marker 缺 ack_log_tail_hash → 拒签', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: undefined,
      verifyAckLogEntryCount: undefined,
      changeId: 'c1',
    });
    expect(result.valid).toBe(false);
  });

  it('added_task_ref 在 tasks.md 未勾选 → 拒签', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [ ] task-3: 未勾选\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash,
      verifyAckLogEntryCount: count,
      changeId: 'c1',
    });
    expect(result.valid).toBe(false);
  });

  it('同一 capture_id 被两个 pause_decision 复用 → 拒签(design §6.4 step 5)', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n- [x] task-4: t\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    (marker.pause_decisions as Record<string, unknown>[]).push({
      ...marker.pause_decisions[0],
      id: 2,
      added_task_ref: 'tasks.md#task-4',
    });
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash,
      verifyAckLogEntryCount: count,
      changeId: 'c1',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /复用|capture_id/.test(e.message))).toBe(true);
  });

  it('ack-log 链坏(篡改 capture entry)→ fail-closed 拒签(design §10)', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const logPath = join(changeDir, '.evidence', 'ack-log.jsonl');
    const logLines = readFileSync(logPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim());
    const tampered = JSON.parse(logLines[logLines.length - 1]!);
    tampered.pause_issue_summary = 'TAMPERED';
    logLines[logLines.length - 1] = JSON.stringify(tampered);
    writeFileSync(logPath, logLines.join('\n') + '\n');
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash,
      verifyAckLogEntryCount: count,
      changeId: 'c1',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /链校验|chain|tail|mismatch/.test(e.message))).toBe(true);
  });

  it('capture entry 的 task_ref 与 pause_decision 不匹配 → fail-closed 拒签(design §10)', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-9',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash,
      verifyAckLogEntryCount: count,
      changeId: 'c1',
    });
    expect(result.valid).toBe(false);
  });

  it('capture entry 的 change_id 与 changeId 不匹配 → fail-closed 拒签(design §10)', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: tailHash,
      verifyAckLogEntryCount: count,
      changeId: 'other',
    });
    expect(result.valid).toBe(false);
  });

  it('marker ack_log_tail_hash / entry_count 为 null → fail-closed 拒签(B-1:挡 null,非只挡 undefined)', async () => {
    const { changeDir, tailHash, count } = await setupCapture({
      tasksMd: '# Tasks\n\n- [x] task-1: a\n- [x] task-3: t\n',
      captureTaskIds: ['task-1'],
      captureId: 'cap-1',
      taskRef: 'tasks.md#task-1',
    });
    dirs.push(changeDir);
    const marker = opt2Marker('cap-1', 'tasks.md#task-3', tailHash, count);
    const result = await validatePauseDecisionsFence(marker, changeDir, changeDir, {
      verifyAckLogTailHash: null,
      verifyAckLogEntryCount: null,
      changeId: 'c1',
    });
    expect(result.valid).toBe(false);
  });
});
