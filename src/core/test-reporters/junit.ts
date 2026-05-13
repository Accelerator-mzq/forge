// src/core/test-reporters/junit.ts — plan-9g Task 2.3
// JUnit XML reporter 解析(沿 vitest/jest/mocha 通用 schema)
// fast-xml-parser ^4 wrap

import { XMLParser } from 'fast-xml-parser';
import type { ReporterResult, TestCaseResult } from './index.js';

/**
 * JUnit XML schema(简化版,沿 vitest/jest/mocha 通用部分)
 *
 * <testsuites>
 *   <testsuite name="..." tests="N" failures="M">
 *     <testcase name="..." classname="..." file="..." time="...">
 *       <failure message="..." type="...">...</failure>
 *       <skipped/>
 *     </testcase>
 *   </testsuite>
 * </testsuites>
 *
 * 注:某些 framework 直接顶层 <testsuite>(无 <testsuites> 包裹);
 *     parser 需兼容两种形态
 */

interface JUnitFailureNode {
  '@_message'?: string;
  '@_type'?: string;
  '#text'?: string;
}

interface JUnitTestCaseNode {
  '@_name': string;
  '@_classname'?: string;
  '@_file'?: string;
  '@_time'?: string;
  failure?: JUnitFailureNode | JUnitFailureNode[];
  error?: JUnitFailureNode | JUnitFailureNode[];
  skipped?: object;
}

interface JUnitTestSuiteNode {
  '@_name'?: string;
  '@_tests'?: string;
  '@_failures'?: string;
  testcase?: JUnitTestCaseNode | JUnitTestCaseNode[];
}

interface JUnitDoc {
  testsuites?: { testsuite?: JUnitTestSuiteNode | JUnitTestSuiteNode[] };
  testsuite?: JUnitTestSuiteNode | JUnitTestSuiteNode[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  isArray: (name) => name === 'testsuite' || name === 'testcase',
});

/**
 * parseJUnit — 解析 JUnit XML 字符串
 * @param xmlContent JUnit XML 字符串
 * @returns ReporterResult
 */
export function parseJUnit(xmlContent: string): ReporterResult {
  let doc: JUnitDoc;
  try {
    doc = parser.parse(xmlContent) as JUnitDoc;
  } catch (e) {
    throw new Error(`JUnit XML parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 兼容 <testsuites> 包裹 vs 直接 <testsuite>
  const suites: JUnitTestSuiteNode[] = doc.testsuites?.testsuite
    ? Array.isArray(doc.testsuites.testsuite)
      ? doc.testsuites.testsuite
      : [doc.testsuites.testsuite]
    : doc.testsuite
      ? Array.isArray(doc.testsuite)
        ? doc.testsuite
        : [doc.testsuite]
      : [];

  const tests: TestCaseResult[] = [];
  for (const suite of suites) {
    if (!suite.testcase) continue;
    const cases = Array.isArray(suite.testcase) ? suite.testcase : [suite.testcase];
    for (const tc of cases) {
      const test: TestCaseResult = {
        test_file: tc['@_file'] ?? tc['@_classname'] ?? '',
        test_name: tc['@_name'],
        status: 'pass',
      };
      if (tc.skipped !== undefined) {
        test.status = 'skip';
      } else if (tc.failure !== undefined || tc.error !== undefined) {
        const failNode = tc.failure
          ? Array.isArray(tc.failure)
            ? (tc.failure[0] ?? { '@_message': '', '#text': '', '@_type': '' })
            : tc.failure
          : Array.isArray(tc.error!)
            ? ((tc.error as JUnitFailureNode[])[0] ?? {
                '@_message': '',
                '#text': '',
                '@_type': '',
              })
            : (tc.error as JUnitFailureNode);
        test.status = 'fail';
        test.message = failNode['@_message'] ?? failNode['#text'] ?? '';
        // failure type 映射(JUnit 标准 type 字段 → ExpectedFailure.failure_type)
        const rawType = (failNode['@_type'] ?? '').toLowerCase();
        if (rawType.includes('assertion') || rawType.includes('expect')) {
          test.failure_type = 'assertion';
        } else if (rawType.includes('timeout')) {
          test.failure_type = 'timeout';
        } else if (rawType.includes('notimplemented') || rawType.includes('skip')) {
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
