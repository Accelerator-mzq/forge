// src/core/upgrade/resign-markers.ts — plan-9j Task 2
// `forge upgrade --resign-markers <changeId>` option flag 主流程(沿 v3 BLOCKER 1 — 不是 subcommand)
// 沿 design §3.4.4 行为表 + §2.3.5 简码迁移 + §3.4.4.1 精确豁免

// v6 BLOCKER 2 修订:补齐所有 import(v5 stash 路径用 copyFile/mkdir/rm + basename 但没 import)
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { spawnSync } from 'node:child_process';
import { appendAckLog } from '../ack-log.js';

/** resign-markers 单 marker 处理结果 */
export interface ResignResult {
  kind: 'resigned' | 'skipped-already-v1' | 'needs-c-propose' | 'failed';
  message: string;
  markerPath?: string;
  pendingPaths?: string[]; // C 简码 propose 后写的 pending file 路径
}

/** 一次性入口 — 对 change 目录两 marker(.verify-passed + .review-passed)处理
 *
 * v7 BLOCKER 1 修订:加 forgeCliPath 参数(沿调用链传到 proposeForCSimcode 真调 ack CLI)
 * caller(upgrade.ts action handler)需传 dist/cli/index.js 真实路径;测试可注入 mock CLI 路径
 */
export async function resignChangeMarkers(
  forgeRoot: string,
  changeId: string,
  forgeCliPath: string,
  cliVersion: string = '1.0.0',
): Promise<ResignResult[]> {
  const changeDir = join(forgeRoot, 'changes', changeId);
  const results: ResignResult[] = [];
  for (const markerName of ['.verify-passed', '.review-passed']) {
    const markerPath = join(changeDir, markerName);
    if (!existsSync(markerPath)) continue;
    // v3 MAJOR 4:传 forgeRoot 入,resignOneMarker 用 forgeRoot 拼 stash 路径
    // v7 BLOCKER 1:传 forgeCliPath 入,resignOneMarker → proposeForCSimcode spawn 真 ack CLI
    results.push(
      await resignOneMarker(markerPath, changeDir, changeId, forgeRoot, forgeCliPath, cliVersion),
    );
  }
  return results;
}

/** 单 marker resign — 三步:简码映射 / 字段添加 / ack-log 写入(v3 MAJOR 4 + v7 BLOCKER 1:加 forgeRoot + forgeCliPath 参数) */
async function resignOneMarker(
  markerPath: string,
  changeDir: string,
  changeId: string,
  forgeRoot: string,
  forgeCliPath: string,
  cliVersion: string,
): Promise<ResignResult> {
  const text = await readFile(markerPath, 'utf8');
  const marker = parseYaml(text) as Record<string, unknown>;

  // 步骤 0:若已 resigned(`resigned_by_tool_version` 字段存在)或原生 v1.0.0+ → skip
  // v3 BLOCKER 3 修订:判定依据是 `resigned_by_tool_version` 字段(沿 v2 选项 C),
  // 不再用 `created_by_tool_version >= 1.0.0` 判定(原 v1 逻辑覆写 created,v3 改保留)
  const alreadyResigned = typeof marker.resigned_by_tool_version === 'string';
  // v9 round 2 修(plan-9j code quality reviewer I-1):用 SEMVER 严格判定 + major 比较,防 invalid string 误 skip
  // 沿 marker-schema.ts:29 SEMVER_RE 同模式,只取 major 部分
  const SEMVER_MAJOR_RE = /^(\d+)\./;
  const createdRaw = marker.created_by_tool_version;
  const createdMatch = typeof createdRaw === 'string' ? SEMVER_MAJOR_RE.exec(createdRaw) : null;
  const isNativeV10 = createdMatch !== null && parseInt(createdMatch[1]!, 10) >= 1;
  if (alreadyResigned || isNativeV10) {
    return {
      kind: 'skipped-already-v1',
      message: `${markerPath}: 已是 v1.0+(resigned=${marker.resigned_by_tool_version ?? '<none>'} / created=${marker.created_by_tool_version ?? '<none>'}),无需 resign`,
      markerPath,
    };
  }

  // 步骤 1:review_outcomes 简码映射(沿 design §2.3.5)
  let needsCPropose = false;
  const pendingPaths: string[] = [];
  if (Array.isArray(marker.review_outcomes)) {
    const outcomes = marker.review_outcomes as Array<Record<string, unknown>>;
    for (let i = 0; i < outcomes.length; i++) {
      const o = outcomes[i] as Record<string, unknown>;
      if (o.severity === 'S') {
        o.severity = 'CRITICAL';
      } else if (o.severity === 'L') {
        o.severity = 'SUGGESTION';
      } else if (o.severity === 'C' || o.severity === 'blocking') {
        // C 简码 / blocking 字符串 → 走 ack.ts propose 路径(交互式询问 target severity)
        // v7 BLOCKER 1 修订:传 forgeCliPath(从 resignChangeMarkers 接收的参数),不是 changeDir
        needsCPropose = true;
        // exitCode 此处不用(propose 写 pending 后 exit 1 是预期行为,caller 检查 needsCPropose 标志)
        const { pendingDirAfter } = await proposeForCSimcode(forgeCliPath, changeId, i);
        pendingPaths.push(pendingDirAfter);
      }
    }
  }
  if (needsCPropose) {
    return {
      kind: 'needs-c-propose',
      message:
        `${markerPath}: 含 C 简码 review_outcome,已写 pending file 到 ${pendingPaths.length} 个;\n` +
        `请运行 \`forge ack confirm <changeId> <findingId>\` 或 \`/forge:ack-confirm\` slash 命令处理后重跑 resign-markers`,
      markerPath,
      pendingPaths,
    };
  }

  // v3 BLOCKER 5 + v3 MAJOR 4:阶段事务 stash/rollback — 用 forgeRoot 拼 stash 路径
  // 沿 upgrade.ts:95 现有 STASH 模式(projectRoot/.cache),保持模块入口接收 forgeRoot 参数
  // 而非 changeDir 相对路径(避免 `..`/`..` 跳出 changeDir 后路径 fragile)
  const stashDir = join(forgeRoot, '.cache', `resign-markers-stash-${process.pid}`);
  await mkdir(stashDir, { recursive: true });
  const stashPath = join(stashDir, basename(markerPath));
  await copyFile(markerPath, stashPath);

  // 步骤 2:加 resigned_by_tool_version 字段(superset additive),保留 created 不变
  // v3 BLOCKER 2 修订:不覆写原 created_by_tool_version(保留原值),加 resigned_by_tool_version 新字段
  // 沿 design §3.4.4:resign 后 marker 区分 created(原始)vs resigned(升级时机)
  // 老 marker 缺 created 字段时,只设 resigned 字段(created 隐含 <1.0.0)
  marker.resigned_by_tool_version = cliVersion;

  // 步骤 3:改标 process_evidence_unavailable_legacy meta(不自动填空 verify_findings/pause_decisions/process_evidence)
  // 沿 design §3.4.4 + §3.4.4.1 — 填空 = 工具帮 AI 伪造证据,违反 AI 反向加固
  marker.process_evidence_unavailable_legacy = true;

  // 步骤 4:写回 marker(v3 BLOCKER 5:try/catch 包裹 — ack-log 失败时 restore stash)
  try {
    await writeFile(markerPath, stringifyYaml(marker), 'utf8');
  } catch (writeErr) {
    // writeFile 失败 → restore stash 直接抛
    await copyFile(stashPath, markerPath).catch(() => {});
    await rm(stashDir, { recursive: true, force: true }).catch(() => {});
    throw writeErr;
  }

  // 步骤 5:写 ack-log 一行 action=resign — 失败时回滚 writeFile
  const gitHead = getGitHeadOrNull(changeDir);
  try {
    await appendAckLog(changeDir, {
      schema: 'forge-ack-log/v1',
      kind: 'ack',
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      action: 'resign',
      change_id: changeId,
      finding_id: null,
      user: 'cli-upgrade',
      rationale: `forge upgrade --resign-markers: ${cliVersion}`,
      git_head: gitHead,
      finding_hash: null,
      extra: { markerPath, originalVersion: '<1.0.0', targetVersion: cliVersion },
    });
  } catch (ackErr) {
    // v3 BLOCKER 5:ack-log 写失败 → restore stash 让 marker 字段未变
    await copyFile(stashPath, markerPath).catch(() => {});
    await rm(stashDir, { recursive: true, force: true }).catch(() => {});
    throw ackErr;
  }

  // 全成功 → 清理 stash
  await rm(stashDir, { recursive: true, force: true }).catch(() => {});

  return {
    kind: 'resigned',
    message: `${markerPath}: resigned to ${cliVersion}(原 created_by_tool_version 保留)+ legacy meta`,
    markerPath,
  };
}

/**
 * C 简码 propose — **真调** `forge ack propose` CLI(沿 v6 BLOCKER 1 修订 + v3 BLOCKER 4 数字 findingId)
 *
 * v6 BLOCKER 1:不再自写 pending YAML — 真 spawn forge ack propose 子命令(沿 9a propose/confirm 协议)
 * 让 ack-log + pending file 完全走 9a 现状路径,plan-9j 仅提供 changeId + findingId + action,
 * --target-severity 由 user 在后续 ack confirm 时指定(Task 6.1 已扩 9a 加该 flag)
 */
async function proposeForCSimcode(
  forgeCliPath: string, // dist/cli/index.js 路径(测试可注入 mock)
  changeId: string,
  outcomeIndex: number,
): Promise<{ exitCode: number; pendingDirAfter: string }> {
  // v3 BLOCKER 4:findingId 用数字索引(Windows 路径合规 + 9a listPending 正则匹配)
  const findingId = String(outcomeIndex);
  // v9 round 2 修(plan-9j code quality reviewer I-2):显式 cwd 绑定,消除父子 cwd 隐式继承依赖
  const cwd = process.cwd();
  // v6 BLOCKER 1:真 spawn forge ack propose(CI=false 让 propose 不被 9a CI 拒绝)
  const res = spawnSync(
    'node',
    [
      forgeCliPath,
      'ack',
      'propose',
      changeId,
      '--finding',
      findingId,
      '--action',
      'resign-c-simcode',
      '--rationale',
      `forge upgrade --resign-markers: C 简码需 user 判定 target severity`,
    ],
    { encoding: 'utf8', env: { ...process.env, CI: 'false' }, cwd },
  );
  return {
    exitCode: res.status ?? -1,
    pendingDirAfter: join(cwd, 'forge', 'changes', changeId, '.evidence', 'pending-acks'),
  };
}

/** 获取 git HEAD(沿 archive.ts:isProjectActuallyGit 同模式) */
function getGitHeadOrNull(cwd: string): string | null {
  try {
    return spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .stdout.toString()
      .trim();
  } catch {
    return null;
  }
}
