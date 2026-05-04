import { describe, it, expect } from 'vitest';
import { validateTasks } from '../../../src/core/validate/index.js';

describe('validateTasks', () => {
  it('accepts a valid task list', () => {
    const r = validateTasks({
      title: 'X',
      items: [
        { id: 't1', description: 'a', checked: false, lineNumber: 1 },
        { id: 't2', description: 'b', checked: true, lineNumber: 2 },
      ],
    });
    expect(r.valid).toBe(true);
  });

  it('rejects empty task list', () => {
    const r = validateTasks({ title: 'X', items: [] });
    expect(r.valid).toBe(false);
  });

  it('rejects duplicate id', () => {
    const r = validateTasks({
      title: 'X',
      items: [
        { id: 't1', description: 'a', checked: false, lineNumber: 1 },
        { id: 't1', description: 'b', checked: false, lineNumber: 2 },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]?.message).toMatch(/duplicate/);
  });
});
