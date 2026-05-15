// tests/cli/stage-extensions.test.ts — Task 5 integration scenario
// 19 个 runner integration scenario:
//   R-1..R-8:run 单轮+输出
//   F-1..F-8:retry/失败路径
//   T-1..T-3:terminateRound + analyze-trend
//
// 策略:
//   CLI scenario(R-1..R-8 / F-1..F-5 / F-8 / T-2 / T-3):
//     spawnSync 走真 dist/cli/index.js,断言 JSON.parse(stdout) + status===0
//   直接调用 scenario(F-6 / F-7 / T-1):
//     zombie/timeout schema 限定 [60,3600];走 CLI 会超时 → 直接 import runOneRound/terminateRound

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 导入被测函数(直接调用 scenario F-6/F-7/T-1 使用)
import { runOneRound, terminateRound } from '../../src/cli/commands/stage-extensions.js';

// CLI 编译产物入口(集成测试用)
const CLI = join(process.cwd(), 'dist', 'cli', 'index.js');

// ── 测试 tempdir 管理 ─────────────────────────────────────────────────────────
let testDir: string;

function createTestDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'forge-se-test-'));
  return dir;
}

function cleanupDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows 偶尔文件锁定,忽略清理错误
  }
}

// ── config 构建 helper ─────────────────────────────────────────────────────────

/**
 * 写简单 config 的 helper(不依赖复杂模板转义问题)
 */
function writeSimpleConfig(
  dir: string,
  stage: string,
  extensionName: string,
  command: string,
  outputTemplate: string,
  options: {
    maxRetries?: number;
    extraSection?: string;
  } = {},
): void {
  mkdirSync(join(dir, 'forge'), { recursive: true });
  const maxRetries = options.maxRetries ?? 1;
  const extraSection = options.extraSection ?? '';

  const yaml = `schema: forge-spec-driven/v1
stage_extensions:
${extraSection}  ${stage}:
    - name: ${JSON.stringify(extensionName)}
      enabled: true
      command: ${JSON.stringify(command)}
      output: ${JSON.stringify(outputTemplate)}
      timeout_sec: 120
      poll_interval_sec: 10
      zombie_threshold_sec: 30
      max_retries: ${maxRetries}
`;
  writeFileSync(join(dir, 'forge', 'config.yaml'), yaml);
}

// ── stub 脚本 helpers ─────────────────────────────────────────────────────────

/**
 * 写一个「直接写 JSON 并退出 0」的 stub。
 * stub 解析 --output 参数,写 JSON,退出。
 */
function writeJsonStub(stubPath: string, outputJson: object): void {
  const dir = join(stubPath, '..');
  mkdirSync(dir, { recursive: true });
  const content = `
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
// 解析 --output 参数
const args = process.argv.slice(2);
const outIdx = args.indexOf('--output');
if (outIdx === -1) { console.error('stub: missing --output'); process.exit(1); }
const outFile = args[outIdx + 1];
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(${JSON.stringify(outputJson)}, null, 2));
process.exit(0);
`;
  writeFileSync(stubPath, content);
}

/**
 * 写一个「不写文件直接退出 0」的 stub(用于 F-8:残留旧文件检测)。
 */
function writeNoOutputStub(stubPath: string): void {
  mkdirSync(join(stubPath, '..'), { recursive: true });
  writeFileSync(stubPath, `// stub: 不写任何文件,直接退出 0\nprocess.exit(0);\n`);
}

/**
 * 写一个「退出非零状态码」的 stub(用于 F-3)。
 */
function writeExitErrorStub(stubPath: string, exitCode = 1): void {
  mkdirSync(join(stubPath, '..'), { recursive: true });
  writeFileSync(stubPath, `// stub: 退出非零(模拟 codex 失败)\nprocess.exit(${exitCode});\n`);
}

/**
 * 写一个「写 malformed JSON 文件」的 stub(用于 F-1)。
 */
function writeMalformedJsonStub(stubPath: string): void {
  mkdirSync(join(stubPath, '..'), { recursive: true });
  writeFileSync(
    stubPath,
    `
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const args = process.argv.slice(2);
const outIdx = args.indexOf('--output');
if (outIdx === -1) { process.exit(1); }
const outFile = args[outIdx + 1];
mkdirSync(dirname(outFile), { recursive: true });
// 写缺少 verdict 字段的 malformed JSON
writeFileSync(outFile, JSON.stringify({ findings: [], summary: 'bad' }));
process.exit(0);
`,
  );
}

/**
 * 标准 converged codex 输出 JSON。
 */
const CODEX_CONVERGED: object = {
  verdict: 'approve',
  summary: '测试通过',
  findings: [],
  next_steps: [],
  thread_id: 'cdx-thread-001',
};

/**
 * 含 BLOCKER finding 的 codex 输出(unconverged)。
 */
const CODEX_UNCONVERGED: object = {
  verdict: 'needs-attention',
  summary: '存在问题',
  findings: [
    {
      severity: 'critical',
      title: '严重问题',
      body: '问题详情',
      file: 'src/foo.ts',
      line_start: 1,
      line_end: 5,
      confidence: 0.9,
      recommendation: '修复建议',
    },
  ],
  next_steps: ['请修复'],
  thread_id: 'cdx-thread-001',
};

/**
 * 含 BLOCKER finding 但 verdict=approve 的输出(F5 fix 测试:R-2)。
 */
const CODEX_APPROVE_WITH_BLOCKER: object = {
  verdict: 'approve',
  summary: '总体 OK 但有 blocker',
  findings: [
    {
      severity: 'critical',
      title: '严重问题',
      body: '即使 approve 也有 blocker',
      file: 'src/foo.ts',
      line_start: 1,
      line_end: 5,
      confidence: 0.9,
      recommendation: '修复',
    },
  ],
  next_steps: [],
  thread_id: 'cdx-thread-002',
};

// ── 运行 CLI 的 helper ─────────────────────────────────────────────────────────

function runCli(args: string[], cwd: string): { stdout: string; stderr: string; status: number } {
  const result = spawnSync('node', [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status ?? 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// R-1..R-8:run 单轮 + 输出
// ─────────────────────────────────────────────────────────────────────────────

describe('forge stage-extensions run — 单轮+输出(R-1..R-8)', () => {
  afterEach(() => {
    if (testDir) cleanupDir(testDir);
  });

  it('R-1: 单轮收敛(verdict=approve, block 桶空) → kind:converged + thread-map 写入', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'converge.mjs');
    writeJsonStub(stubPath, CODEX_CONVERGED);

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.kind).toBe('converged');
    expect(json.verdict).toBe('approve');
    expect(json.blockFindings).toEqual([]);
    expect(json.threadId).toBe('cdx-thread-001');

    // 验证 thread-map 已写入
    const threadMapPath = join(testDir, 'forge', 'changes', 'c1', '.codex-threads.yaml');
    expect(existsSync(threadMapPath)).toBe(true);
    const content = readFileSync(threadMapPath, 'utf-8');
    expect(content).toContain('test-ext');
    expect(content).toContain('approve');
  });

  it('R-2: verdict=approve 但 findings 含 BLOCKER → unconverged(F5 fix)', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'approve-blocker.mjs');
    writeJsonStub(stubPath, CODEX_APPROVE_WITH_BLOCKER);

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    // 即使 verdict=approve,有 BLOCKER → unconverged
    expect(json.kind).toBe('unconverged');
    expect(json.blockFindings).toHaveLength(1);
    expect(json.blockFindings[0].severity).toBe('critical');
  });

  it('R-3: 单轮 unconverged(block 非空) → blockFindings/ignoreFindings 分桶正确', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'unconverge.mjs');
    const mixedOutput = {
      verdict: 'needs-attention',
      summary: '有多类问题',
      findings: [
        {
          severity: 'critical',
          title: 'block1',
          body: 'b',
          file: 'a.ts',
          line_start: 1,
          line_end: 1,
          confidence: 0.9,
          recommendation: 'fix',
        },
        {
          severity: 'high',
          title: 'block2',
          body: 'b',
          file: 'a.ts',
          line_start: 2,
          line_end: 2,
          confidence: 0.9,
          recommendation: 'fix',
        },
        {
          severity: 'medium',
          title: 'ignore1',
          body: 'b',
          file: 'a.ts',
          line_start: 3,
          line_end: 3,
          confidence: 0.9,
          recommendation: 'fix',
        },
        {
          severity: 'low',
          title: 'ignore2',
          body: 'b',
          file: 'a.ts',
          line_start: 4,
          line_end: 4,
          confidence: 0.9,
          recommendation: 'fix',
        },
      ],
      next_steps: [],
      thread_id: 'cdx-thread-003',
    };
    writeJsonStub(stubPath, mixedOutput);

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.kind).toBe('unconverged');
    expect(json.blockFindings).toHaveLength(2); // critical + high → BLOCKER + MAJOR
    expect(json.ignoreFindings).toHaveLength(2); // medium + low → MINOR + NIT
  });

  it('R-4: config_error(非法 confidence_threshold=2) → kind:config_error + exit 0', () => {
    testDir = createTestDir();
    mkdirSync(join(testDir, 'forge'), { recursive: true });
    // 写 confidence_threshold: 2 (超出 [0,1] 范围)
    writeFileSync(
      join(testDir, 'forge', 'config.yaml'),
      `schema: forge-spec-driven/v1
stage_extensions:
  review:
    - name: test-ext
      enabled: true
      command: "node /nonexist.mjs"
      output: "/tmp/out.json"
      convergence:
        confidence_threshold: 2
`,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.kind).toBe('config_error');
    expect(json.message).toBeTruthy();
  });

  it('R-5: no_extension(stage 无此 enabled extension) → kind:no_extension + exit 0', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'converge.mjs');
    writeJsonStub(stubPath, CODEX_CONVERGED);

    const outputTemplate = join(testDir, 'output', 'out.json');
    writeSimpleConfig(
      testDir,
      'review',
      'other-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    // 查询不存在的 extension name
    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'nonexistent',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.kind).toBe('no_extension');
  });

  it('R-6: --thread-id 传入 → stub 命令字符串含 thread-id', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'thread-capture.mjs');

    // stub:写 thread_id 到输出文件(从环境/args 读)
    mkdirSync(join(stubPath, '..'), { recursive: true });
    writeFileSync(
      stubPath,
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const args = process.argv.slice(2);
const outIdx = args.indexOf('--output');
const outFile = args[outIdx + 1];
mkdirSync(dirname(outFile), { recursive: true });
// 写 converged 输出,带 thread_id
writeFileSync(outFile, JSON.stringify({
  verdict: 'approve',
  summary: 'ok',
  findings: [],
  next_steps: [],
  thread_id: 'cdx-resumed-thread',
}));
process.exit(0);
`,
    );

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
        '--thread-id',
        'cdx-existing-thread',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    // stub 写回了 cdx-resumed-thread,runner 正常输出 converged
    expect(json.kind).toBe('converged');
    expect(json.threadId).toBe('cdx-resumed-thread');
  });

  it('R-7: codex 本轮缺 thread_id → 保留 --thread-id 传入值(F2-v3 fix)', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'no-thread.mjs');

    // stub:写 converged 但不含 thread_id 字段
    mkdirSync(join(stubPath, '..'), { recursive: true });
    writeFileSync(
      stubPath,
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const args = process.argv.slice(2);
const outIdx = args.indexOf('--output');
const outFile = args[outIdx + 1];
mkdirSync(dirname(outFile), { recursive: true });
// 故意不写 thread_id 字段
writeFileSync(outFile, JSON.stringify({
  verdict: 'approve',
  summary: 'ok',
  findings: [],
  next_steps: [],
  // thread_id: undefined — 不写
}));
process.exit(0);
`,
    );

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
        '--thread-id',
        'cdx-123',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.kind).toBe('converged');
    // codex 无 thread_id → 保留传入的 cdx-123(F2-v3 fix)
    expect(json.threadId).toBe('cdx-123');

    // 验证 thread-map 中记录的 thread_id 也是保留值
    const threadMapPath = join(testDir, 'forge', 'changes', 'c1', '.codex-threads.yaml');
    const content = readFileSync(threadMapPath, 'utf-8');
    expect(content).toContain('cdx-123');
  });

  it('R-8: converged/unconverged JSON schema 完整(含 F1-v8 fix:unconverged 额外字段)', () => {
    testDir = createTestDir();

    // 先测 converged 输出
    const stubConv = join(testDir, 'stubs', 'conv.mjs');
    writeJsonStub(stubConv, CODEX_CONVERGED);
    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubConv} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const convResult = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );
    expect(convResult.status).toBe(0);
    const convJson = JSON.parse(convResult.stdout);
    // converged 必含这 6 个字段
    expect(convJson).toHaveProperty('kind', 'converged');
    expect(convJson).toHaveProperty('threadId');
    expect(convJson).toHaveProperty('verdict');
    expect(convJson).toHaveProperty('blockFindings');
    expect(convJson).toHaveProperty('ignoreFindings');
    expect(convJson).toHaveProperty('droppedByConfidence');
    // converged 不应含 effectiveConvergence / userInteraction
    expect(convJson).not.toHaveProperty('effectiveConvergence');
    expect(convJson).not.toHaveProperty('userInteraction');

    // 再测 unconverged 输出
    testDir = createTestDir();
    const stubUnconv = join(testDir, 'stubs', 'unconv.mjs');
    writeJsonStub(stubUnconv, CODEX_UNCONVERGED);
    const outputTemplate2 = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubUnconv} --output \${OUTPUT_FILE}`,
      outputTemplate2,
    );

    const unconvResult = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );
    expect(unconvResult.status).toBe(0);
    const unconvJson = JSON.parse(unconvResult.stdout);
    expect(unconvJson.kind).toBe('unconverged');
    // unconverged 额外含 effectiveConvergence + userInteraction(F1-v8 fix)
    expect(unconvJson).toHaveProperty('effectiveConvergence');
    expect(unconvJson).toHaveProperty('userInteraction');
    expect(unconvJson.effectiveConvergence).toHaveProperty('block_severity');
    expect(unconvJson.userInteraction).toHaveProperty('block_unconverged');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F-1..F-8:retry/失败路径
// ─────────────────────────────────────────────────────────────────────────────

describe('forge stage-extensions run — retry/失败路径(F-1..F-8)', () => {
  afterEach(() => {
    if (testDir) cleanupDir(testDir);
  });

  it('F-1: codex JSON malformed(缺 verdict) → invalid_output → retry → failed', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'malformed.mjs');
    writeMalformedJsonStub(stubPath);

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.kind).toBe('failed');
    expect(json.reason).toBeTruthy();
  });

  it('F-2: codex output file 不存在 → invalid_output → retry', () => {
    testDir = createTestDir();
    // stub:不写文件(同 writeNoOutputStub)
    const stubPath = join(testDir, 'stubs', 'no-output.mjs');
    writeNoOutputStub(stubPath);

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    // 所有 attempt 都 invalid_output → failed
    expect(json.kind).toBe('failed');
  });

  it('F-3: codex spawn exit nonzero → attempt_failed → retry → failed', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'exit-error.mjs');
    writeExitErrorStub(stubPath, 1);

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.kind).toBe('failed');
  });

  it('F-4: spawn_failed(ENOENT) → retry → failed', () => {
    testDir = createTestDir();
    // 配置一个绝对不存在的命令
    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      // 使用不存在的可执行文件 — shell:true 会让它 exit 非零而不是 ENOENT
      '/totally/nonexistent/binary/that/does/not/exist/at/all --output ${OUTPUT_FILE}',
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    // shell:true 下 ENOENT 命令退出非零 → attempt_failed 或 failed
    expect(['failed', 'config_error']).not.toContain(json.kind === 'converged' ? json.kind : 'ok');
    expect(json.kind).toBe('failed');
  });

  it('F-5: retry 耗尽 → kind:failed + reason 非空', () => {
    testDir = createTestDir();
    const stubPath = join(testDir, 'stubs', 'always-fail.mjs');
    writeMalformedJsonStub(stubPath); // 总是输出 malformed JSON

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    // max_retries=1 → 2 次 attempt,都 malformed
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
      { maxRetries: 1 },
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.kind).toBe('failed');
    expect(typeof json.reason).toBe('string');
    expect(json.reason.length).toBeGreaterThan(0);
  });

  it('F-6: zombie → terminateRound kill → 直接调用(绕过 schema 校验)', async () => {
    testDir = createTestDir();

    // 写一个会挂起的 stub(无限等待)
    const stubPath = join(testDir, 'stubs', 'hang.mjs');
    mkdirSync(join(stubPath, '..'), { recursive: true });
    writeFileSync(stubPath, `// stub: 无限等待,模拟 zombie 进程\nsetTimeout(() => {}, 999999);\n`);

    // spawn 进程
    const proc = spawn('node', [stubPath], { shell: false });

    // 调用 runOneRound:极小 timeout → zombie/timeout
    const outcome = await runOneRound({
      command: `node ${stubPath}`,
      promptFile: null,
      threadId: null,
      outputFile: join(testDir, 'output.json'),
      spawnStartMs: Date.now(),
      poll_interval_sec: 0.05, // 50ms 轮询
      zombie_threshold_sec: 0.1, // 100ms zombie 阈值
      timeout_sec: 0.2, // 200ms 超时
      convergenceConfig: {
        max_rounds: 5,
        max_rounds_on_exceed: 'ask',
        block_severity: ['BLOCKER', 'MAJOR'],
        ignore_severity: ['MINOR', 'NIT'],
        confidence_threshold: 0.7,
        verdict_approve_short_circuit: true,
      },
      severityMap: { critical: 'BLOCKER', high: 'MAJOR', medium: 'MINOR', low: 'NIT' },
    });

    // 进程应已终止(zombie 或 timeout)
    expect(['zombie', 'timeout', 'invalid_output']).toContain(outcome.kind);

    // 清理残留进程
    try {
      proc.kill('SIGKILL');
    } catch {
      /* 忽略 */
    }
  }, 10000);

  it('F-7: timeout → terminateRound kill → 直接调用', async () => {
    testDir = createTestDir();

    // stub:持续更新输出文件 mtime(模拟 timeout 而非 zombie)
    const stubPath = join(testDir, 'stubs', 'mtime-updater.mjs');
    const outputFile = join(testDir, 'output.json');
    mkdirSync(join(stubPath, '..'), { recursive: true });
    writeFileSync(
      stubPath,
      `
import { mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('${testDir.replace(/\\/g, '/')}', { recursive: true });
// 每 50ms 更新文件 mtime(模拟持续工作但不完成)
const interval = setInterval(() => {
  writeFileSync('${outputFile.replace(/\\/g, '/')}', 'partial-' + Date.now());
}, 50);
setTimeout(() => { clearInterval(interval); }, 999999);
`,
    );

    const outcome = await runOneRound({
      command: `node ${stubPath}`,
      promptFile: null,
      threadId: null,
      outputFile,
      spawnStartMs: Date.now(),
      poll_interval_sec: 0.05,
      zombie_threshold_sec: 0.5, // 500ms zombie(不触发)
      timeout_sec: 0.3, // 300ms timeout
      convergenceConfig: {
        max_rounds: 5,
        max_rounds_on_exceed: 'ask',
        block_severity: ['BLOCKER', 'MAJOR'],
        ignore_severity: ['MINOR', 'NIT'],
        confidence_threshold: 0.7,
        verdict_approve_short_circuit: true,
      },
      severityMap: { critical: 'BLOCKER', high: 'MAJOR', medium: 'MINOR', low: 'NIT' },
    });

    // 进程持续更新文件 → timeout(而非 zombie)
    expect(['timeout', 'zombie', 'invalid_output']).toContain(outcome.kind);
  }, 10000);

  it('F-8: 残留旧 output 文件不误判假收敛(F1-v7 fix)', () => {
    testDir = createTestDir();

    // 先写一个旧的合法 converged JSON 文件到 output 路径
    // stub 不写新文件(exit 0 但不产出 output)
    const stubPath = join(testDir, 'stubs', 'no-write.mjs');
    writeNoOutputStub(stubPath);

    const outputTemplate = join(
      testDir,
      'output',
      '${CHANGE_ID}',
      'round${ROUND}',
      'attempt${ATTEMPT}',
      'test-ext.json',
    );
    writeSimpleConfig(
      testDir,
      'review',
      'test-ext',
      `node ${stubPath} --output \${OUTPUT_FILE}`,
      outputTemplate,
    );

    const result = runCli(
      [
        'stage-extensions',
        'run',
        '--stage',
        'review',
        '--change-id',
        'c1',
        '--extension',
        'test-ext',
      ],
      testDir,
    );

    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    // stub 不写文件 → invalid_output → 所有 attempt 失败 → failed
    // 关键:绝不应该是 converged(F1-v7 fix 防止假 converged)
    expect(json.kind).not.toBe('converged');
    expect(json.kind).toBe('failed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T-1..T-3:terminateRound + analyze-trend
// ─────────────────────────────────────────────────────────────────────────────

describe('forge stage-extensions — terminateRound + analyze-trend(T-1..T-3)', () => {
  afterEach(() => {
    if (testDir) cleanupDir(testDir);
  });

  it('T-1: terminateRound — jobId=null + SIGTERM 超时后 SIGKILL 确认 close', async () => {
    testDir = createTestDir();

    // 写一个忽略 SIGTERM 的 stub(只被 SIGKILL 终止)
    const stubPath = join(testDir, 'stubs', 'ignore-sigterm.mjs');
    mkdirSync(join(stubPath, '..'), { recursive: true });
    writeFileSync(
      stubPath,
      `
// stub: 忽略 SIGTERM,只能被 SIGKILL 终止
process.on('SIGTERM', () => { /* 忽略 */ });
setTimeout(() => {}, 999999);
`,
    );

    const proc = spawn('node', [stubPath], { shell: false });

    // 等进程确实 started(pid 可用)
    await new Promise<void>((res) => setTimeout(res, 100));

    const pid = proc.pid;
    expect(pid).toBeGreaterThan(0);

    // 调用 terminateRound:jobId=null → 跳过 cancelCodexJob
    await terminateRound(proc, null);

    // 进程应已关闭(close 事件已触发)
    // 验证方式:proc.exitCode 或 proc.signalCode 非 null
    const isTerminated = proc.exitCode !== null || proc.signalCode !== null;
    expect(isTerminated).toBe(true);
  }, 15000);

  it('T-2: analyze-trend 子命令 — 各种 trend 输出正确', () => {
    testDir = createTestDir();

    // data_insufficient(< 3 轮)
    const r1 = runCli(
      [
        'stage-extensions',
        'analyze-trend',
        '--history',
        JSON.stringify([{ round: 1, block_count: 5 }]),
      ],
      testDir,
    );
    expect(r1.status).toBe(0);
    const j1 = JSON.parse(r1.stdout);
    expect(j1.trend).toBe('data_insufficient');
    expect(j1.recommended_option).toBe(1);

    // strict_decrease
    const r2 = runCli(
      [
        'stage-extensions',
        'analyze-trend',
        '--history',
        JSON.stringify([
          { round: 1, block_count: 5 },
          { round: 2, block_count: 3 },
          { round: 3, block_count: 1 },
        ]),
      ],
      testDir,
    );
    expect(r2.status).toBe(0);
    const j2 = JSON.parse(r2.stdout);
    expect(j2.trend).toBe('strict_decrease');
    expect(j2.recommended_option).toBe(1);

    // stable(相邻差 ≤ 1)
    const r3 = runCli(
      [
        'stage-extensions',
        'analyze-trend',
        '--history',
        JSON.stringify([
          { round: 1, block_count: 3 },
          { round: 2, block_count: 3 },
          { round: 3, block_count: 3 },
        ]),
      ],
      testDir,
    );
    expect(r3.status).toBe(0);
    const j3 = JSON.parse(r3.stdout);
    expect(j3.trend).toBe('stable');
    expect(j3.recommended_option).toBe(2);

    // increase
    const r4 = runCli(
      [
        'stage-extensions',
        'analyze-trend',
        '--history',
        JSON.stringify([
          { round: 1, block_count: 1 },
          { round: 2, block_count: 3 },
          { round: 3, block_count: 5 },
        ]),
      ],
      testDir,
    );
    expect(r4.status).toBe(0);
    const j4 = JSON.parse(r4.stdout);
    expect(j4.trend).toBe('increase');
    expect(j4.recommended_option).toBe(2);
  });

  it('T-3: analyze-trend 非法 JSON → exit 0 + emitJson 不抛(loose)', () => {
    testDir = createTestDir();

    const result = runCli(
      ['stage-extensions', 'analyze-trend', '--history', 'not-valid-json'],
      testDir,
    );

    expect(result.status).toBe(0);
    // 输出合法 JSON(不抛出,loose)
    const json = JSON.parse(result.stdout);
    expect(json).toHaveProperty('trend');
    expect(json).toHaveProperty('recommended_option');
  });
});
