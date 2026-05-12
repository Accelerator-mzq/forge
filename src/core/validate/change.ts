// src/core/validate/change.ts — 顶层 validateChange，读取 change 目录，跑所有 artifact 校验，合并结果
// v2 B1 + v3 B1 修订:计算真实运行时 ctx(contentHash + gitHead),不含 ephemeral runId
// v3 B2 修订:fs 错(cannot read X)不标 severity + [fs] message 前缀;business-fail 标 CRITICAL
// plan-9d Task 4 v2 B-2 修订:加 coverage_gap finding 自动产 + test_failure stub warning
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseProposal, parseSpec, parseDesign, parseTasks } from '../parse/index.js';
import { validateProposal } from './proposal.js';
import { validateSpec } from './specs.js';
import { validateTasks } from './tasks.js';
import { validateScopeEntries } from './scope-entries.js';
import { computeContentHash } from '../hash/content.js';
import { type ValidationResult, ok, failed, mergeResults } from './types.js';
// plan-9d Task 4 v2:auto-findings + coverage-gap + test-failure-stub
import { buildAutoCriticalFinding, FindingIdSequence } from './auto-findings.js';
import { scanCoverageGaps } from './coverage-gap.js';
import { checkTestFailureStub } from './test-failure-stub.js';
// plan-9e1 Task 5:scanOrphanTmp 检测孤立 archive_summary.tmp.yaml
import { scanOrphanTmp } from './orphan-tmp.js';

export async function validateChange(changeDir: string): Promise<ValidationResult> {
  const results: ValidationResult[] = [];
  // plan-9d Task 4 v2 m-2:独立 id 计数器,避免 fs error 也算进 finding id 跳号
  const findingIds = new FindingIdSequence();

  // v2 B1 + v3 B1 修订:计算真实稳定运行时 ctx(不含 ephemeral runId)
  // 用于 validateScopeEntries 的 finding_hash 绑定
  let ctx: { contentHash: string; gitHead: string };
  try {
    ctx = {
      contentHash: await computeContentHash(changeDir),
      gitHead: getGitHead() ?? 'no-git-head',
    };
  } catch {
    // computeContentHash 抛错(罕见 — 仅 specs/ 非 ENOENT 类 IO 错)
    // 退化为 'no-content-hash' 让校验仍能跑(scope finding 仍可产但 hash 弱化)
    ctx = { contentHash: 'no-content-hash', gitHead: 'no-git-head' };
  }

  // 校验 proposal.md
  const proposalPath = join(changeDir, 'proposal.md');
  try {
    const text = await readFile(proposalPath, 'utf8');
    // 校验 proposal 结构
    results.push(validateProposal(parseProposal(text), proposalPath));
    // plan-9b Task 4:同时校验 proposal.md 中 scope anchor 三段 YAML block
    const scopeP = validateScopeEntries(text, proposalPath, ctx);
    if (!scopeP.valid) {
      for (const e of scopeP.errors) results.push({ valid: false, errors: [e], warnings: [] });
    }
  } catch (err) {
    // v3 B2 修订:fs 错不标 severity(走 exit 2);message 加 '[fs]' 前缀
    results.push(
      failed({
        artifact: 'proposal',
        message: `[fs] cannot read proposal.md: ${(err as Error).message}`,
        file: proposalPath,
      }),
    );
  }

  // 校验 design.md（只检测能否读取/解析，没有专门 validator）
  const designPath = join(changeDir, 'design.md');
  try {
    const text = await readFile(designPath, 'utf8');
    void parseDesign(text); // 只需检测 throw，不使用返回值
    // plan-9b Task 4:同时校验 design.md 中 scope anchor 三段 YAML block
    const scopeD = validateScopeEntries(text, designPath, ctx);
    if (!scopeD.valid) {
      for (const e of scopeD.errors) results.push({ valid: false, errors: [e], warnings: [] });
    }
  } catch (err) {
    // v3 B2 修订:fs 错不标 severity(走 exit 2);message 加 '[fs]' 前缀
    results.push(
      failed({
        artifact: 'design',
        message: `[fs] cannot read design.md: ${(err as Error).message}`,
        file: designPath,
      }),
    );
  }

  // 校验 tasks.md
  const tasksPath = join(changeDir, 'tasks.md');
  try {
    const text = await readFile(tasksPath, 'utf8');
    results.push(validateTasks(parseTasks(text), tasksPath));
  } catch (err) {
    // v3 B2 修订:fs 错不标 severity(走 exit 2);message 加 '[fs]' 前缀
    results.push(
      failed({
        artifact: 'tasks',
        message: `[fs] cannot read tasks.md: ${(err as Error).message}`,
        file: tasksPath,
      }),
    );
  }

  // 校验 specs/*.md 目录下所有 spec 文件
  const specsDir = join(changeDir, 'specs');
  try {
    const entries = await readdir(specsDir);
    const mdFiles = entries.filter((n) => n.endsWith('.md'));
    if (mdFiles.length === 0) {
      // v3 B2 修订 + plan-9d Task 4:specs/ 存在但空 — 产 spec-files-missing CRITICAL finding(含 finding_hash)
      const finding = buildAutoCriticalFinding({
        id: findingIds.next(),
        dimension: 'completeness',
        check_type: 'spec-files-missing',
        evidence: `specs/ 目录存在但 0 个 .md 文件 (${specsDir})`,
        recommendation: '在 specs/ 下添加至少一个 spec .md 文件,或修订 proposal 移除 specs 需求',
        contentHash: ctx.contentHash,
        gitHead: ctx.gitHead,
      });
      results.push(
        failed({
          artifact: 'specs',
          message: 'no spec files in specs/',
          file: specsDir,
          severity: 'CRITICAL',
          finding_hash: finding.finding_hash,
        }),
      );
    }
    for (const name of mdFiles) {
      const path = join(specsDir, name);
      const text = await readFile(path, 'utf8');
      results.push(validateSpec(parseSpec(text), path));
    }
  } catch (err) {
    // v3 B2 修订:fs 错不标 severity(走 exit 2);message 加 '[fs]' 前缀
    results.push(
      failed({
        artifact: 'specs',
        message: `[fs] cannot read specs/: ${(err as Error).message}`,
        file: specsDir,
      }),
    );
  }

  // plan-9d Task 4 v2 B-2 修订:coverage_gap 扫描(spec Requirement grep 0 命中 → CRITICAL finding)
  // 从 changeDir 推断 codebase root:forge/changes/<id>/ 上两级 = cwd
  const codebaseRoot = changeDir.includes('forge/changes/')
    ? (changeDir.split('forge/changes/')[0] ?? process.cwd())
    : process.cwd();
  try {
    const gaps = await scanCoverageGaps(changeDir, codebaseRoot);
    for (const gap of gaps) {
      const finding = buildAutoCriticalFinding({
        id: findingIds.next(),
        dimension: 'completeness',
        check_type: 'spec-coverage',
        evidence: `spec ${gap.spec_file} 的 Requirement '${gap.requirement_id}' 在 codebase 完全 0 命中(keywords: ${gap.searched_keywords.join(', ')}, results: ${JSON.stringify(gap.grep_results)})`,
        recommendation: `实施该 Requirement,或修订 spec 移除/拆分该项;或确认 keyword 抽取不够准(在 spec 标题用更具体的实施关键词)`,
        contentHash: ctx.contentHash,
        gitHead: ctx.gitHead,
      });
      results.push(
        failed({
          artifact: 'specs',
          field: `requirement.${gap.requirement_id}`,
          message: `coverage_gap: spec Requirement '${gap.requirement_id}' 在 codebase 完全 0 命中(candidate_type=coverage_gap,沿 design line 446)`,
          file: gap.spec_file,
          severity: 'CRITICAL',
          finding_hash: finding.finding_hash,
        }),
      );
    }
  } catch (err) {
    // coverage_gap 扫描异常不阻断;记录 fs 警告
    results.push(
      failed({
        artifact: 'specs',
        message: `[fs] coverage_gap 扫描失败: ${(err as Error).message}`,
      }),
    );
  }

  // plan-9d Task 4 v2 B-2 修订:test_failure stub(9g 完成后接 reporter parser)
  const testStub = await checkTestFailureStub();
  if (testStub.status === 'not_implemented') {
    // stub 不产 finding,只在 ValidationResult.warnings 标记
    results.push({
      valid: true,
      errors: [],
      warnings: [
        {
          artifact: 'change',
          message: `[stub] ${testStub.message}`,
        },
      ],
    });
  }

  // plan-9e1 Task 5:扫描孤立 archive_summary.tmp.yaml(active change 目录残留)
  // 沿 design §2.4.5 line 759 "孤立 .tmp" 行,给 WARNING + 提示
  const orphanResult = await scanOrphanTmp(changeDir);
  if (orphanResult.warnings.length > 0) {
    results.push(orphanResult);
  }

  // 没有任何结果表示空目录，直接返回 ok；否则合并所有结果
  return results.length === 0 ? ok() : mergeResults(...results);
}

/**
 * 获取当前 git HEAD commit SHA(40-char hex)。
 * 非 git 仓库或 git 命令不可用时返回 null。
 */
function getGitHead(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
