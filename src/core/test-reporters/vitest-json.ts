// src/core/test-reporters/vitest-json.ts — plan-9g Task 2.3
// Vitest --reporter=json 原生 JSON.parse + schema
// 沿 Vitest 4.x 的 json reporter schema(2026 锁定 — brainstorm spec §9.5 留)

import type { ReporterResult, TestCaseResult } from './index.js';

/**
 * Vitest JSON reporter schema(精简版 — 仅本 plan 用到的字段)
 *
 * { numTotalTests, numPassedTests, numFailedTests, numPendingTests,
 *   testResults: [{
 *     name: filepath,
 *     assertionResults: [{
 *       fullName, status: 'passed'|'failed'|'pending'|'skipped',
 *       failureMessages?: string[]
 *     }]
 *   }]
 * }
 */
interface VitestJsonAssertionResult {
  fullName: string;
  status: 'passed' | 'failed' | 'pending' | 'skipped';
  failureMessages?: string[];
}

interface VitestJsonTestResult {
  name: string; // file path
  assertionResults: VitestJsonAssertionResult[];
}

interface VitestJsonDoc {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  testResults?: VitestJsonTestResult[];
}

/**
 * parseVitestJSON — 解析 Vitest JSON reporter 字符串
 * @param jsonContent Vitest --reporter=json 输出
 * @returns ReporterResult
 */
export function parseVitestJSON(jsonContent: string): ReporterResult {
  let doc: VitestJsonDoc;
  try {
    doc = JSON.parse(jsonContent) as VitestJsonDoc;
  } catch (e) {
    throw new Error(`Vitest JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const tests: TestCaseResult[] = [];
  for (const file of doc.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const test: TestCaseResult = {
        test_file: file.name,
        test_name: assertion.fullName,
        status:
          assertion.status === 'passed' ? 'pass' : assertion.status === 'failed' ? 'fail' : 'skip',
      };
      if (test.status === 'fail') {
        const msgs = assertion.failureMessages ?? [];
        test.message = msgs.join('\n');
        const msgLower = test.message.toLowerCase();
        if (msgLower.includes('assertionerror') || msgLower.includes('expect')) {
          test.failure_type = 'assertion';
        } else if (msgLower.includes('timeout')) {
          test.failure_type = 'timeout';
        } else if (msgLower.includes('not implemented')) {
          test.failure_type = 'not-implemented';
        } else {
          test.failure_type = 'error';
        }
      }
      tests.push(test);
    }
  }

  const passCount = tests.filter((t) => t.status === 'pass').length;
  const failCount = tests.filter((t) => t.status === 'fail').length;
  const skipCount = tests.filter((t) => t.status === 'skip').length;

  return {
    tests,
    totalCount: tests.length,
    passCount,
    failCount,
    skipCount,
  };
}
