// forge validate 子命令 — 验证 change 目录
// v2 B2 修订:exit 0/1/2 三档(沿 master §3.12.3 freeze)
// exit 0 = 全 PASS;exit 1 = CRITICAL findings 存在;exit 2 = fs/config 错
// plan-9g Task 5.4:加 --verify-process flag(单独跑 process_evidence 子检)

import { Command } from 'commander';
import { join } from 'node:path';
import { validateChange } from '../../core/validate/index.js';
import { crossCuttingFenceCheck } from '../../core/archive/fence.js';

export function buildValidateCommand(): Command {
  return new Command('validate')
    .argument('<changeId>', 'change directory id (e.g., add-login)')
    .description('Validate a change directory')
    .option(
      '--verify-process',
      'plan-9g:单独跑 process_evidence 子检(14 不变量 fence;不跑其他 validate 步骤)',
    )
    .action(async (changeId: string, opts: { verifyProcess?: boolean }) => {
      // 构建 change 目录路径: <cwd>/forge/changes/<changeId>
      const changeDir = join(process.cwd(), 'forge', 'changes', changeId);

      // --verify-process:仅跑 crossCuttingFenceCheck process_evidence 子检
      if (opts.verifyProcess) {
        let fenceResult;
        try {
          fenceResult = await crossCuttingFenceCheck(changeDir);
        } catch (err) {
          console.error(
            `✗ process_evidence fence error: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(2);
        }
        if (fenceResult.ok) {
          console.log(`✓ ${changeId}: process_evidence fence PASS (14 invariants)`);
          process.exit(0);
        }
        console.error(`✗ ${changeId}: process_evidence fence FAIL`);
        for (const r of fenceResult.results) {
          if (!r.ok) console.error(`  - ${r.invariant}: ${r.reason}`);
        }
        process.exit(1);
      }

      const result = await validateChange(changeDir);

      if (result.valid) {
        // 验证成功 → stdout + exit 0
        console.log(`✓ ${changeId}: valid`);
        // v4 D-3 修订:打印 warnings(stub 提示等),让 CI 用户看到 not_implemented 信号
        for (const w of result.warnings) {
          const prefix = w.message.startsWith('[stub]') ? '⚠' : 'ℹ';
          console.warn(`  ${prefix} [${w.artifact}] ${w.message}`);
        }
        process.exit(0);
      }

      // v2 B2 修订:exit 1 if any CRITICAL,否则 exit 2(fs/config 类错)
      const hasCritical = result.errors.some((e) => e.severity === 'CRITICAL');
      const exitCode = hasCritical ? 1 : 2;
      console.error(`✗ ${changeId}: ${result.errors.length} errors`);
      for (const e of result.errors) {
        // 输出加 severity prefix + finding_hash suffix
        const sevPrefix = e.severity ? `[${e.severity}] ` : '';
        const hashSuffix = e.finding_hash ? ` (finding_hash=${e.finding_hash.slice(0, 8)}...)` : '';
        console.error(
          `  - ${sevPrefix}[${e.artifact}] ${e.field ?? ''}: ${e.message}${e.file ? ` (${e.file}${e.line ? `:${e.line}` : ''})` : ''}${hashSuffix}`,
        );
      }
      // v4 D-3:invalid 也输出 warnings
      for (const w of result.warnings) {
        console.warn(`  ⚠ [${w.artifact}] ${w.message}`);
      }
      process.exit(exitCode);
    });
}
