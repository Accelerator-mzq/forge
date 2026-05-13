// src/core/test-reporters/tap.ts — plan-9g Task 2.3
// TAP stream reporter 解析(node:test --reporter=tap 用)
// tap-parser ^15 wrap
//
// Observation(plan latent bug #2):plan line 1825 写 `import Parser from 'tap-parser'`,
//   但 tap-parser v15 无 default export;自修为 `import { Parser } from 'tap-parser'`

import { Parser } from 'tap-parser';
import type { ReporterResult, TestCaseResult } from './index.js';

/** TAP assert 事件数据类型(对应 tap-parser Result 类型) */
interface TapAssertEvent {
  id: number;
  name: string;
  ok: boolean;
  skip?: string | boolean;
  todo?: string | boolean;
  diag?: {
    message?: string;
    type?: string;
    expected?: unknown;
    actual?: unknown;
  } | null;
}

/**
 * parseTAP — 解析 TAP stream 字符串
 *
 * TAP 格式:
 *   TAP version 13
 *   1..N
 *   ok 1 - testname
 *   not ok 2 - testname2
 *     ---
 *     message: 'assertion failed'
 *     ...
 *
 * @param tapContent TAP stream 字符串
 * @returns Promise<ReporterResult>
 */
export function parseTAP(tapContent: string): Promise<ReporterResult> {
  return new Promise<ReporterResult>((resolve, reject) => {
    const tests: TestCaseResult[] = [];
    const parser = new Parser();

    parser.on('assert', (assert: TapAssertEvent) => {
      const test: TestCaseResult = {
        test_file: '', // TAP 不含 test_file 信息
        test_name: assert.name,
        status: 'pass',
      };
      if (assert.skip || assert.todo) {
        test.status = 'skip';
      } else if (!assert.ok) {
        test.status = 'fail';
        const diag = assert.diag ?? {};
        test.message = diag.message ?? '';
        const rawType = (diag.type ?? '').toLowerCase();
        if (rawType.includes('assertion')) {
          test.failure_type = 'assertion';
        } else if (rawType.includes('timeout')) {
          test.failure_type = 'timeout';
        } else if (diag.expected !== undefined || diag.actual !== undefined) {
          test.failure_type = 'assertion';
        } else {
          test.failure_type = 'error';
        }
      }
      tests.push(test);
    });

    parser.on('complete', () => {
      const passCount = tests.filter((t) => t.status === 'pass').length;
      const failCount = tests.filter((t) => t.status === 'fail').length;
      const skipCount = tests.filter((t) => t.status === 'skip').length;
      resolve({
        tests,
        totalCount: tests.length,
        passCount,
        failCount,
        skipCount,
      });
    });

    parser.on('error', (e: Error) => reject(new Error(`TAP parse failed: ${e.message}`)));

    parser.write(tapContent);
    parser.end();
  });
}
