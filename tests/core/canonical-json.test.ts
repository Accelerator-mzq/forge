import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalHash } from '../../src/core/canonical-json.js';

describe('canonical-json', () => {
  it('serializes object with sorted keys (JCS RFC 8785)', () => {
    const obj = { z: 1, a: 2, m: 3 };
    expect(canonicalize(obj)).toBe('{"a":2,"m":3,"z":1}');
  });

  it('produces same canonical form for differently-ordered same-content objects', () => {
    const a = { x: 1, y: 2 };
    const b = { y: 2, x: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it('produces deterministic SHA256 hash', () => {
    const obj = { foo: 'bar', n: 42 };
    const h1 = canonicalHash(obj);
    const h2 = canonicalHash(obj);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles nested objects + arrays', () => {
    const obj = {
      items: [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ],
    };
    const expected = '{"items":[{"a":1,"b":2},{"c":3,"d":4}]}';
    expect(canonicalize(obj)).toBe(expected);
  });

  it('rejects non-JSON values (Date, undefined, function)', () => {
    expect(() => canonicalize({ d: new Date() })).toThrow(/non-JSON/i);
  });
});
