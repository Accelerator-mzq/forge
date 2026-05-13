// tests/core/test-reporters/vitest-json.test.ts — plan-9g Task 2.3
import { describe, it, expect } from 'vitest';
import { parseVitestJSON } from '../../../src/core/test-reporters/vitest-json.js';

describe('parseVitestJSON', () => {
  it('Case 1: Vitest JSON basic(1 pass 1 fail 1 skip)', () => {
    const json = JSON.stringify({
      numTotalTests: 3,
      numPassedTests: 1,
      numFailedTests: 1,
      numPendingTests: 1,
      testResults: [
        {
          name: '/abs/path/src/auth.test.ts',
          assertionResults: [
            { fullName: 'login pass', status: 'passed' },
            {
              fullName: 'login fail',
              status: 'failed',
              failureMessages: ['AssertionError: expected true to be false\n at ...'],
            },
            { fullName: 'logout', status: 'pending' },
          ],
        },
      ],
    });
    const result = parseVitestJSON(json);
    expect(result.totalCount).toBe(3);
    expect(result.passCount).toBe(1);
    expect(result.failCount).toBe(1);
    expect(result.skipCount).toBe(1);
    expect(result.tests[1]?.failure_type).toBe('assertion');
  });

  it('Case 2: Vitest JSON 多文件多 assertion', () => {
    const json = JSON.stringify({
      testResults: [
        { name: 'a.test.ts', assertionResults: [{ fullName: 'a1', status: 'passed' }] },
        {
          name: 'b.test.ts',
          assertionResults: [{ fullName: 'b1', status: 'failed', failureMessages: ['timeout 5s'] }],
        },
      ],
    });
    const result = parseVitestJSON(json);
    expect(result.totalCount).toBe(2);
    expect(result.tests[1]?.failure_type).toBe('timeout');
  });

  it('Case 3: Vitest JSON 空 testResults', () => {
    const json = JSON.stringify({ testResults: [] });
    const result = parseVitestJSON(json);
    expect(result.totalCount).toBe(0);
  });
});
