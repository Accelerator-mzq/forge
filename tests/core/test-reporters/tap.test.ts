// tests/core/test-reporters/tap.test.ts — plan-9g Task 2.3
import { describe, it, expect } from 'vitest';
import { parseTAP } from '../../../src/core/test-reporters/tap.js';

describe('parseTAP', () => {
  it('Case 1: node:test TAP basic(2 pass 1 fail)', async () => {
    const tap = `TAP version 13
1..3
ok 1 - login pass
not ok 2 - login fail
  ---
  message: 'expected true to be false'
  type: assertion
  ...
ok 3 - logout
`;
    const result = await parseTAP(tap);
    expect(result.totalCount).toBe(3);
    expect(result.passCount).toBe(2);
    expect(result.failCount).toBe(1);
    expect(result.tests[1]?.failure_type).toBe('assertion');
  });

  it('Case 2: TAP with skip + todo', async () => {
    const tap = `TAP version 13
1..3
ok 1 - t1
ok 2 - t2 # SKIP not yet
ok 3 - t3 # TODO impl later
`;
    const result = await parseTAP(tap);
    expect(result.totalCount).toBe(3);
    expect(result.skipCount).toBe(2);
  });

  it('Case 3: TAP with diag expected/actual → failure_type=assertion', async () => {
    const tap = `TAP version 13
1..1
not ok 1 - check
  ---
  expected: 5
  actual: 3
  ...
`;
    const result = await parseTAP(tap);
    expect(result.failCount).toBe(1);
    expect(result.tests[0]?.failure_type).toBe('assertion');
  });
});
