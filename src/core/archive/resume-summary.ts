// src/core/archive/resume-summary.ts — plan-9e1 Task 5(v2 BLOCKER 5)
// forge archive --resume-summary <archive-id> 子流程实施
// 四场景(v1 三场景 → v2 BLOCKER 5 +1 corrupt 路径):
//   1. archive 目录有 .tmp 无正式 .yaml + .tmp 内容合法 → rename(ok)
//   2. archive 目录有 .tmp 无正式 .yaml + .tmp 内容损坏 → 拒签(corrupt,沿 master §3.12.3 exit 3)
//   3. 都存在 → 拒签(conflict,无法判断 ground truth)
//   4. 都不存在 → 报错(missing,状态损坏 / 无 summary 需要 resume)

import { rename, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { validateArchiveSummarySchema } from '../validate/archive-summary-schema.js';

/** resume-summary 结果 — caller(archive 命令)根据 kind 决定 exit code */
export type ResumeSummaryResult =
  | { kind: 'ok'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'missing'; message: string }
  | { kind: 'corrupt'; message: string }; // v2 BLOCKER 5 新增

/**
 * 处理 archive 目录半完成状态的 .tmp summary
 *
 * @param forgeRoot <project>/forge/ 绝对路径
 * @param archiveId archive 子目录名(`YYYY-MM-DD-<id>`)
 */
export async function resumeArchiveSummary(
  forgeRoot: string,
  archiveId: string,
): Promise<ResumeSummaryResult> {
  const archiveDir = join(forgeRoot, 'changes', 'archive', archiveId);
  const tmpPath = join(archiveDir, 'archive_summary.tmp.yaml');
  const finalPath = join(archiveDir, 'archive_summary.yaml');

  const hasTmp = existsSync(tmpPath);
  const hasFinal = existsSync(finalPath);

  if (hasTmp && !hasFinal) {
    // v2 BLOCKER 5:rename 前 readFile + parseYaml + schema 校验
    let parsed: unknown;
    try {
      const content = await readFile(tmpPath, 'utf8');
      parsed = parseYaml(content);
    } catch (err) {
      return {
        kind: 'corrupt',
        message: `✗ archive_summary.tmp.yaml YAML 解析失败(${tmpPath}):${(err as Error).message}`,
      };
    }
    const schemaResult = validateArchiveSummarySchema(parsed, tmpPath);
    if (!schemaResult.valid) {
      const errMessages = schemaResult.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      return {
        kind: 'corrupt',
        message: `✗ archive_summary.tmp.yaml schema 校验失败(${tmpPath}):${errMessages}`,
      };
    }
    // 场景 1:校验通过 → 正常 rename
    await rename(tmpPath, finalPath);
    return {
      kind: 'ok',
      message: `✓ archive_summary.tmp.yaml → archive_summary.yaml (${archiveDir})`,
    };
  }
  if (hasTmp && hasFinal) {
    // 场景 3:冲突,无法判断 ground truth
    return {
      kind: 'conflict',
      message: `✗ 两个 archive_summary 都存在(${archiveDir}/archive_summary.{tmp.,}yaml),无法判断哪个是 ground truth — 用户需手动检查后删一个再重跑(沿 design §2.4.5 .tmp 生命周期表)`,
    };
  }
  // 场景 4:都不存在
  return {
    kind: 'missing',
    message: `✗ 找不到 archive_summary.{tmp.,}yaml(${archiveDir});该 archive 可能从未生成 summary(v0.4 老归档),或目录损坏`,
  };
}
