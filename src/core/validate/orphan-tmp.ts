// src/core/validate/orphan-tmp.ts — plan-9e1 Task 5
// scanOrphanTmp:检测 active change 目录残留 archive_summary.tmp.yaml 或 archive_summary.yaml → WARNING
//
// v3 MAJOR 3 修订:同时扫两个文件名 — active change 目录正常情况下都不应有 archive_summary.*
// 因为 archive 成功 → source 已 Move 到 archive 目录(整个 change 不再存在);
// archive 失败 → 回滚链 unlink(v2 MAJOR 1)
// 故 active change 目录中任何 archive_summary.* 都是"rollback 残留 / 手动复制 / 异常 crash"信号

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type ValidationResult, ok, type ValidationWarning } from './types.js';

/**
 * 扫描 change 目录是否含孤立 archive_summary.tmp.yaml 或 archive_summary.yaml
 *
 * 设计语义(v3 MAJOR 3 修订):active change 目录正常不该有 summary 文件:
 *   - archive 成功 → change 目录被 Move 到 archive 目录(active 不存在)
 *   - archive 失败 → 回滚链 unlink summary(沿 v2 MAJOR 1)
 *   - 残留 = "rollback 残留(unlink 失败极罕见)/ 用户手动复制 / 异常 crash"信号
 *
 * 沿 design §2.4.5 line 759"孤立 .tmp"行,扩展为 .tmp + .yaml 两者
 */
export async function scanOrphanTmp(changeDir: string): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];
  const candidates = [
    {
      name: 'archive_summary.tmp.yaml',
      hint:
        `若该 change 已 archive 过,跑 'forge archive --resume-summary <YYYY-MM-DD-id>' 或手动 rm 清理;` +
        `若 archive 仍在进行,等待 archive 完成`,
    },
    {
      name: 'archive_summary.yaml',
      hint:
        `active change 目录不该有正式 archive_summary.yaml(应只在 archive 目录);` +
        `若该 change 已 archive 过,该文件可能是上一次 archive 回滚残留(rollback unlink 失败);` +
        `手动 rm 后重试 archive`,
    },
  ];
  for (const c of candidates) {
    const p = join(changeDir, c.name);
    if (!existsSync(p)) continue;
    warnings.push({
      artifact: 'change',
      field: c.name,
      message: `孤立 ${c.name}(active change 目录残留 ${p});${c.hint}`,
      file: p,
    });
  }
  return ok(warnings);
}
