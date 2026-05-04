import { describe, it, expect } from 'vitest';
import { parseTasks } from '../../../src/core/parse/tasks.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixture = readFileSync(resolve(__dirname, '../../fixtures/valid-change/tasks.md'), 'utf8');

describe('parseTasks', () => {
  it('parses checkbox items with id and description', () => {
    const r = parseTasks(fixture);
    expect(r.items).toHaveLength(6);
    expect(r.items[0]).toMatchObject({
      id: 'task-1',
      checked: true,
      description: 'Set up users table migration',
    });
    expect(r.items[2]).toMatchObject({
      id: 'task-3',
      checked: false,
    });
  });

  it('captures section context for verify-fix items', () => {
    const r = parseTasks(fixture);
    const fix = r.items.find((t) => t.id === 'verify-fix-1');
    expect(fix?.section).toBe('Verify-failed (auto-added)');
  });

  it('parses applied_commits list when present', () => {
    const r = parseTasks(fixture);
    expect(r.appliedCommits).toEqual([
      { taskId: 'task-1', hash: 'a1b2c3d4e5f67890' },
      { taskId: 'task-2', hash: 'f0e9d8c7b6a54321' },
    ]);
    expect(r.finalHead).toBe('deadbeef00112233');
  });

  it('returns undefined applied_commits when absent', () => {
    const minimal = '# Tasks\n\n- [ ] task-1: do thing\n';
    const r = parseTasks(minimal);
    expect(r.appliedCommits).toBeUndefined();
    expect(r.finalHead).toBeUndefined();
  });
});
