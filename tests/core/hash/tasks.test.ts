import { describe, it, expect } from 'vitest';
import { computeTasksHash } from '../../../src/core/hash/index.js';

describe('computeTasksHash', () => {
  it('returns deterministic sha256 for same input', () => {
    const a = computeTasksHash('hello');
    const b = computeTasksHash('hello');
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('normalizes line endings (CRLF → LF)', () => {
    const lf = computeTasksHash('a\nb\nc\n');
    const crlf = computeTasksHash('a\r\nb\r\nc\r\n');
    expect(lf).toBe(crlf);
  });

  it('normalizes trailing whitespace per line', () => {
    const trimmed = computeTasksHash('a\nb\n');
    const padded = computeTasksHash('a   \nb\t\n');
    expect(trimmed).toBe(padded);
  });

  it('different content → different hash', () => {
    const a = computeTasksHash('hello');
    const b = computeTasksHash('world');
    expect(a).not.toBe(b);
  });
});
