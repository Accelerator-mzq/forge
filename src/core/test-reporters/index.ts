// src/core/test-reporters/index.ts — plan-9g Task 2.3
// parseReporter(path, type) factory + ReporterResult 统一类型
// 沿 brainstorm spec 决策点 1:三档各引独立 npm 包
//
// 三档:
//   - junit  → fast-xml-parser wrap(vitest/jest/mocha 通用)
//   - tap    → tap-parser wrap(node:test)
//   - vitest-json → 原生 JSON.parse + Vitest schema

import { readFile } from 'node:fs/promises';
import { parseJUnit } from './junit.js';
import { parseTAP } from './tap.js';
import { parseVitestJSON } from './vitest-json.js';

/** Reporter 类型 union(沿 ForgeConfig['test'].reporter) */
export type ReporterType = 'junit' | 'tap' | 'vitest-json';

/** 单 test case 解析结果 */
export interface TestCaseResult {
  /** 相对 repo 根的测试文件路径(可能为空字符串若 reporter 不提供) */
  test_file: string;
  /** 测试名(对应 describe/it 嵌套全名) */
  test_name: string;
  /** 'pass' | 'fail' | 'skip' */
  status: 'pass' | 'fail' | 'skip';
  /** 若 fail,失败类型(对应 ExpectedFailure.failure_type) */
  failure_type?: 'assertion' | 'timeout' | 'error' | 'not-implemented';
  /** 错误消息(若 fail) */
  message?: string;
}

/** 完整 reporter 解析结果 */
export interface ReporterResult {
  /** 所有 test case */
  tests: TestCaseResult[];
  /** 总数 */
  totalCount: number;
  /** pass 计数 */
  passCount: number;
  /** fail 计数 */
  failCount: number;
  /** skip 计数 */
  skipCount: number;
}

/**
 * parseReporter — 根据 reporter 类型 dispatch 解析
 *
 * @param reportPath — reporter 文件绝对路径
 * @param type — reporter 类型('junit' | 'tap' | 'vitest-json')
 * @returns Promise<ReporterResult> 统一格式
 * @throws Error 若文件不存在 / 解析失败
 */
export async function parseReporter(
  reportPath: string,
  type: ReporterType,
): Promise<ReporterResult> {
  const content = await readFile(reportPath, 'utf8');
  switch (type) {
    case 'junit':
      return parseJUnit(content); // 注:parseJUnit 返 ReporterResult 同步,await 不影响
    case 'tap':
      return parseTAP(content); // async Promise(M-1 修:去 await,no-return-await rule)
    case 'vitest-json':
      return parseVitestJSON(content);
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown reporter type: ${String(_exhaustive)}`);
    }
  }
}

export { parseJUnit } from './junit.js';
export { parseTAP } from './tap.js';
export { parseVitestJSON } from './vitest-json.js';
