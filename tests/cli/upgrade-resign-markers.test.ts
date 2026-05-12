// upgrade-resign-markers.test.ts — plan-9j Task 2 单测
// 10 case 覆盖:S/L 自动 / C 走 propose / 不自动填空 / legacy 标记 / ack-log 写 /
//             阶段事务回滚 / 干净状态跳过 / CI 模式拒绝

import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

const FORGE_CLI = resolve(process.cwd(), 'dist/cli/index.js');

interface MarkerFixtureOpts {
  schema: string;
  severity?: string; // for review_outcomes severity (S/L/C)
  hasC?: boolean;
}

// helper:在 tmpdir 搭 forge 骨架 + change 目录 + v0.4 marker
function setupV04Marker(opts: MarkerFixtureOpts): { tmpRoot: string; changeDir: string } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9j-resign-'));
  const changeDir = join(tmpRoot, 'forge', 'changes', 'add-x');
  mkdirSync(join(changeDir, 'specs'), { recursive: true });
  mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
  writeFileSync(
    join(tmpRoot, 'forge', 'config.yaml'),
    'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
    'utf8',
  );
  writeFileSync(join(changeDir, 'proposal.md'), '# X\n## Why\nr\n', 'utf8');
  writeFileSync(join(changeDir, 'design.md'), '# Design\n', 'utf8');
  writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n- [x] t1\n', 'utf8');
  writeFileSync(join(changeDir, 'specs', 'x.md'), '# X Spec\n', 'utf8');
  // v0.4 marker — 含简码 + 无 created_by_tool_version 字段
  const reviewMarker = `schema: forge-review/v1
reviewed_at: 2025-08-01T10:00:00Z
reviewed_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
git:
  is_git_repo: false
review_outcomes:
  - severity: ${opts.severity ?? 'S'}
    accepted: true
    resolved: false
    rationale: legacy v0.4 marker
`;
  writeFileSync(join(changeDir, '.review-passed'), reviewMarker, 'utf8');
  const verifyMarker = `schema: forge-verify/v1
verified_at: 2025-08-01T10:00:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
evidence: []
`;
  writeFileSync(join(changeDir, '.verify-passed'), verifyMarker, 'utf8');
  return { tmpRoot, changeDir };
}

function runResign(
  tmpRoot: string,
  changeId: string,
): { code: number; stderr: string; stdout: string } {
  // v3 BLOCKER 1:option 形态 — `forge upgrade --resign-markers <changeId>`(对齐 spec line 1763 / master line 503)
  const res = spawnSync('node', [FORGE_CLI, 'upgrade', '--resign-markers', changeId], {
    cwd: tmpRoot,
    encoding: 'utf8',
    env: { ...process.env, CI: 'false' }, // 显式关 CI 模式
  });
  return { code: res.status ?? -1, stderr: res.stderr, stdout: res.stdout };
}

describe('forge upgrade --resign-markers', () => {
  const cleanupDirs: string[] = [];
  afterAll(() => {
    for (const d of cleanupDirs) rmSync(d, { recursive: true, force: true });
  });

  it('S 简码 → 自动映射 CRITICAL + 加 resigned_by_tool_version=1.0.0(保留 created,v3 BLOCKER 2/3)', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    // 验证 .review-passed 已 resign:severity S → CRITICAL,resigned 字段加上;created 保留(原 v0.4 marker 缺,沿用 undefined 或 0.4.0)
    const reviewText = readFileSync(join(ctx.changeDir, '.review-passed'), 'utf8');
    const review = parseYaml(reviewText) as Record<string, unknown>;
    expect(review.resigned_by_tool_version).toBe('1.0.0'); // v3 BLOCKER 2:resign 加新字段
    // v3 BLOCKER 2:created_by_tool_version 保留(若原 v0.4 marker 含字段则不变;若原缺则仍缺)
    // v0.4 marker fixture 不写 created_by_tool_version 字段 → resign 后仍是 undefined(sparse-add)
    const outcomes = review.review_outcomes as Array<Record<string, string>>;
    expect(outcomes[0]?.severity).toBe('CRITICAL');
  });

  it('L 简码 → 自动映射 SUGGESTION', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'L' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    const review = parseYaml(readFileSync(join(ctx.changeDir, '.review-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect((review.review_outcomes as Array<Record<string, string>>)[0]?.severity).toBe(
      'SUGGESTION',
    );
  });

  it('C 简码 → 走 ack.ts propose 路径 + exit 1 提示 user 走 confirm', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'C' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/C 简码|clarification|forge ack confirm|propose/);
    // pending file 已写到 .evidence/pending-acks/(沿 9a 协议)
    const pendingDir = join(ctx.changeDir, '.evidence', 'pending-acks');
    expect(existsSync(pendingDir)).toBe(true);
  });

  it('不自动填空 verify_findings / pause_decisions / process_evidence — 改标 legacy', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    const verify = parseYaml(readFileSync(join(ctx.changeDir, '.verify-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(verify.verify_findings).toBeUndefined(); // 不自动填空
    expect(verify.pause_decisions).toBeUndefined();
    expect(verify.process_evidence_unavailable_legacy).toBe(true); // 改标
  });

  it('ack-log.jsonl 写入 action=resign 行', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    runResign(ctx.tmpRoot, 'add-x');
    const ackLogPath = join(ctx.changeDir, '.evidence', 'ack-log.jsonl');
    expect(existsSync(ackLogPath)).toBe(true);
    const lines = readFileSync(ackLogPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const resignLine = lines.find((l) => l.action === 'resign');
    expect(resignLine).toBeDefined();
    expect(resignLine.change_id).toBe('add-x');
  });

  it('干净状态(无 v0.4 marker)→ stdout 含 "无需 resign"(exit 0)', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    // 先跑一次 resign 后 marker 已是 v1.0.0
    runResign(ctx.tmpRoot, 'add-x');
    // 再跑一次应 skip
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/无需 resign|already v1\.0\.0|skip/i);
  });

  it('CI 模式拒绝(env CI=true)→ exit 2', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'C' });
    cleanupDirs.push(ctx.tmpRoot);
    const res = spawnSync('node', [FORGE_CLI, 'upgrade', '--resign-markers', 'add-x'], {
      cwd: ctx.tmpRoot,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
    });
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/CI mode|拒绝/);
  });

  it('阶段事务回滚:模拟 ack-log 写失败 → marker 字段未改', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'S' });
    cleanupDirs.push(ctx.tmpRoot);
    // 让 .evidence 目录 readonly,模拟 ack-log 写失败
    if (process.platform !== 'win32') {
      const { chmodSync } = require('node:fs');
      mkdirSync(join(ctx.changeDir, '.evidence'), { recursive: true });
      chmodSync(join(ctx.changeDir, '.evidence'), 0o555);
      const r = runResign(ctx.tmpRoot, 'add-x');
      expect(r.code).toBeGreaterThan(0); // 失败
      // 验证 marker 未改(因事务回滚)
      const review = parseYaml(
        readFileSync(join(ctx.changeDir, '.review-passed'), 'utf8'),
      ) as Record<string, unknown>;
      expect(review.created_by_tool_version).toBeUndefined(); // 没被加
      // 复原权限以便 cleanup
      chmodSync(join(ctx.changeDir, '.evidence'), 0o755);
    }
  });

  // v5 BLOCKER 2 + B3:补 +2 case 凑 10 case
  it('S 简码 + 原 marker 含 created_by_tool_version=0.4.0 → resign 后 created 保留 0.4.0(v3 BLOCKER 2)', () => {
    // 自定义 fixture:不用 default setupV04Marker(它写 created 缺失);此 case 显式 init created=0.4.0
    const tmpRoot = mkdtempSync(join(tmpdir(), 'forge-9j-resign-created-'));
    cleanupDirs.push(tmpRoot);
    const changeDir = join(tmpRoot, 'forge', 'changes', 'add-x');
    mkdirSync(join(changeDir, 'specs'), { recursive: true });
    mkdirSync(join(tmpRoot, 'forge', '.cache'), { recursive: true });
    writeFileSync(
      join(tmpRoot, 'forge', 'config.yaml'),
      'schema: forge-spec-driven/v1\nharness:\n  - claude\n',
      'utf8',
    );
    writeFileSync(join(changeDir, 'proposal.md'), '# X\n## Why\nr\n', 'utf8');
    writeFileSync(join(changeDir, 'design.md'), '# Design\n', 'utf8');
    writeFileSync(join(changeDir, 'tasks.md'), '# Tasks\n- [x] t1\n', 'utf8');
    writeFileSync(join(changeDir, 'specs', 'x.md'), '# X Spec\n', 'utf8');
    writeFileSync(
      join(changeDir, '.review-passed'),
      `schema: forge-review/v1
reviewed_at: 2025-08-01T10:00:00Z
reviewed_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
created_by_tool_version: '0.4.0'
git:
  is_git_repo: false
review_outcomes:
  - severity: S
    accepted: true
    resolved: false
    rationale: legacy v0.4 marker with created field
`,
      'utf8',
    );
    writeFileSync(
      join(changeDir, '.verify-passed'),
      `schema: forge-verify/v1
verified_at: 2025-08-01T10:00:00Z
verified_by: ai-agent
tasks_hash: sha256:placeholder
content_hash: sha256:placeholder
created_by_tool_version: '0.4.0'
evidence: []
`,
      'utf8',
    );
    const r = runResign(tmpRoot, 'add-x');
    expect(r.code).toBe(0);
    const review = parseYaml(readFileSync(join(changeDir, '.review-passed'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(review.created_by_tool_version).toBe('0.4.0'); // **保留不变**
    expect(review.resigned_by_tool_version).toBe('1.0.0'); // 加上
  });

  it('C 简码 propose 真调 9a ack CLI 路径(不自写 pending YAML,v3 BLOCKER 4)', () => {
    const ctx = setupV04Marker({ schema: 'forge-review/v1', severity: 'C' });
    cleanupDirs.push(ctx.tmpRoot);
    const r = runResign(ctx.tmpRoot, 'add-x');
    expect(r.code).toBe(1);
    // 验证 pending file 名为数字 findingId(沿 v3 BLOCKER 4:String(outcomeIndex)),不是 review-outcome:0 含冒号
    const pendingDir = join(ctx.changeDir, '.evidence', 'pending-acks');
    expect(existsSync(pendingDir)).toBe(true);
    const { readdirSync } = require('node:fs');
    const files = readdirSync(pendingDir) as string[];
    // pending file 名应是数字 findingId 开头(如 '0-<timestamp>.yaml'),不含冒号
    expect(files.some((f) => /^\d+-/.test(f))).toBe(true);
    expect(files.every((f) => !f.includes(':'))).toBe(true); // Windows 路径合规
  });
});
