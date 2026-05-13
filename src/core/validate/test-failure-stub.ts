// src/core/validate/test-failure-stub.ts — plan-9d Task 4 v2 B-2 修订
// test_failure candidate validator 接口预留 — 实际实现委托给 9g reporter parser
// (沿 plan-9a §3.1 archive fence stub 合约同模式;9g 完成后 stub 移除,接 reporter parser)

export interface TestFailureCheckResult {
  status: 'not_implemented' | 'pass' | 'fail';
  /** 9g 完成前总是 not_implemented;9g 完成后从 reporter 输出抽取 */
  failed_tests?: Array<{ test_file: string; test_name: string; reason: string }>;
  /** 9g 完成前为 stub 提示 */
  message: string;
}

/**
 * test_failure candidate validator — stub(9g 完成前)
 *
 * 沿 design line 443:`test_failure` 验证算法 = "worktree 重跑 evidence 中指定的 test_file + test_name,取 exit_code"
 * 9g 完成前:返回 status='not_implemented',validate CLI 输出 stderr warning 但不阻断
 * 9g 完成后:接入 worktree.ts + reporter parser,真实跑测试 + 抽 failed test
 *
 * 注:本 stub 不阻断 validate CLI exit code(不产 CRITICAL finding);
 * 仅 stderr 提示用户"test_failure 类 finding 待 9g 接入"
 */
export async function checkTestFailureStub(): Promise<TestFailureCheckResult> {
  return {
    status: 'not_implemented',
    message:
      'test_failure candidate validator 待 plan-9g(process_evidence + reporter parser)接入。' +
      '当前 validate 不自动检测 test failure;依赖 verify slash 阶段 AI 调 forge:verifying-three-dimensions skill 手动判定。',
  };
}
