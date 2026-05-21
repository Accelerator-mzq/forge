// src/cli/commands/preflight.ts — plan-9h Task 1 / plan-v1.1 P-9 refactor
// 实施前置 check 子命令组(首个 preflight 命令组,commander 嵌套 addCommand)
// 沿 spec §2.8.3 C 实施码 + spec §2.8.5 第 3 项 CLI helper 设计
// plan-v1.1 P-9:git 探测 helper(isGitRepo / getCurrentBranch)抽出到 src/core/git/utils.ts
// (plan-9h Q8 YAGNI 因 2+ 复用点解锁 — preflight.ts + migrate/index.ts:65-72)

import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/yaml.js';
import { DEFAULT_PROTECTED_BRANCHES } from '../../core/schema/types.js';
import { isGitRepo, getCurrentBranch } from '../../core/git/utils.js';

/**
 * 构建 `forge preflight` 子命令组(沿 spec §2.8.5 第 3 项)。
 * 当前含一个子命令 `branch-check`;后续 v1.1+ 可扩(git clean check / evidence fresh check 等)。
 */
export function buildPreflightCommand(): Command {
  const cmd = new Command('preflight').description('实施前置 check(分支保护等;plan-9h §2.8)');

  cmd
    .command('branch-check [changeId]')
    .description('check current branch vs protected_branches config(沿 design §2.8.3 C)')
    .option('--allow-protected-branch', '显式覆盖保护(stderr 留 warning,exit 0)')
    .action((changeId: string | undefined, opts: { allowProtectedBranch?: boolean }) => {
      const cwd = process.cwd();

      // 非 git 项目:graceful skip(沿 v0.4 降级模式 + design §2.8.3 C line 1443)
      if (!isGitRepo(cwd)) {
        return; // exit 0
      }

      // 读 protected_branches:优先 forge/config.yaml,缺失 fallback DEFAULT_PROTECTED_BRANCHES
      const configPath = join(cwd, 'forge', 'config.yaml');
      let protectedBranches: readonly string[] = DEFAULT_PROTECTED_BRANCHES;
      if (existsSync(configPath)) {
        try {
          const config = parseConfig(readFileSync(configPath, 'utf-8'));
          if (Array.isArray(config.protected_branches)) {
            protectedBranches = config.protected_branches;
          }
        } catch (err) {
          // parse 失败 → 视为 config 错误,exit 2(沿 §3.12.3 freeze)
          console.error(`forge preflight: 解析 forge/config.yaml 失败: ${(err as Error).message}`);
          process.exit(2);
        }
      }

      const currentBranch = getCurrentBranch(cwd);

      // 非保护分支 → 通过
      if (!protectedBranches.includes(currentBranch)) {
        return; // exit 0
      }

      // 在保护分支:有 --allow-protected-branch flag → exit 0 + stderr warning
      if (opts.allowProtectedBranch) {
        console.error(
          `forge preflight: 当前分支 '${currentBranch}' 是保护分支,` +
            `用户传 --allow-protected-branch 显式覆盖。build/CI 风险自负。`,
        );
        return; // exit 0
      }

      // 默认拒签 → exit 2 + stderr 具体建议
      const suggestedBranch = changeId ? `feature/${changeId}` : `feature/<your-change-id>`;
      console.error(
        `forge preflight: 当前分支 '${currentBranch}' 是保护分支,拒绝在保护分支实施。\n` +
          `建议: git checkout -b ${suggestedBranch},或加 --allow-protected-branch 覆盖`,
      );
      process.exit(2);
    });

  // stage-extensions-check:扫 forge/config.yaml#stage_extensions 配置常见漏洞
  // - adversarial entry 漏 --user-focus / --target-label → codex 失焦扫整个 working tree
  // - adversarial 模式 entry 漏 build_prompt → helper run 立即失败
  // - defaults 过松(timeout > 900 / max_rounds > 3)→ 易 15+ 分钟 hang
  // loose 模式:发现问题只 emit stderr,exit 0 不阻塞;沿 codex stage-extensions 整体 loose 哲学
  cmd
    .command('stage-extensions-check')
    .description(
      '扫 forge/config.yaml#stage_extensions 配置常见漏洞(user-focus 缺失 / defaults 过松等)',
    )
    .action(() => {
      const cwd = process.cwd();
      const configPath = join(cwd, 'forge', 'config.yaml');

      // 没 config 文件 → graceful skip(新项目初始化前跑此命令不算错)
      if (!existsSync(configPath)) {
        return; // exit 0
      }

      // parse 失败 → 同 branch-check 走 exit 2(config 错)
      let config: Record<string, unknown>;
      try {
        config = parseConfig(readFileSync(configPath, 'utf-8')) as unknown as Record<
          string,
          unknown
        >;
      } catch (err) {
        console.error(`forge preflight: 解析 forge/config.yaml 失败: ${(err as Error).message}`);
        process.exit(2);
      }

      const se = config.stage_extensions as Record<string, unknown> | undefined;
      // 没 stage_extensions 段 → 不报警(用户没用此特性)
      if (!se || typeof se !== 'object') {
        return; // exit 0
      }

      const findings: string[] = [];
      const stages = [
        'brainstorming',
        'propose',
        'apply_critical_plan_review',
        'review',
        'verify',
      ] as const;

      // 逐 stage 扫 entry
      for (const stage of stages) {
        const entries = se[stage];
        if (!Array.isArray(entries)) continue;

        for (const entry of entries as Array<Record<string, unknown>>) {
          // 显式 disabled 跳过(不扫已停用的 entry)
          if (entry.enabled === false) continue;
          const name = typeof entry.name === 'string' ? entry.name : '?';

          // R1:adversarial build_prompt 含 helper 但缺 --user-focus / --target-label
          if (typeof entry.build_prompt === 'string') {
            const bp = entry.build_prompt;
            // 用两次 includes 检测,容忍 helper 路径用引号包裹("${FORGE_HELPER_DIR}/codex-review-helper.mjs" build-prompt)
            if (bp.includes('codex-review-helper.mjs') && bp.includes('build-prompt')) {
              if (!bp.includes('--user-focus')) {
                findings.push(
                  `[WARN] stage_extensions.${stage}[${name}].build_prompt 漏 --user-focus → ` +
                    `codex 会用字面 'Focus: (none provided)' 失焦扫整个 working tree,` +
                    `可能 surface 无关 finding`,
                );
              }
              if (!bp.includes('--target-label')) {
                findings.push(
                  `[WARN] stage_extensions.${stage}[${name}].build_prompt 漏 --target-label → ` +
                    `codex review 报告 target 显示字面 'current branch' 不精确`,
                );
              }
            }
          }

          // R4:command 含 --mode adversarial 但 entry 无 build_prompt
          if (typeof entry.command === 'string' && entry.command.includes('--mode adversarial')) {
            const hasBp =
              typeof entry.build_prompt === 'string' && entry.build_prompt.trim() !== '';
            if (!hasBp) {
              findings.push(
                `[WARN] stage_extensions.${stage}[${name}] command 用 --mode adversarial 但 entry 无 build_prompt → ` +
                  `helper 的 run --mode adversarial 强制 --prompt-file,缺会立即失败`,
              );
            }
          }
        }
      }

      // R2/R3:defaults 收紧建议(默认值实测易 hang)
      const defaults = se.defaults as Record<string, unknown> | undefined;
      const timeout =
        typeof defaults?.timeout_sec === 'number' ? (defaults.timeout_sec as number) : 900;
      if (timeout > 900) {
        findings.push(
          `[SUGGESTION] stage_extensions.defaults.timeout_sec=${timeout} > 900,实测 codex 偶尔 ` +
            `15+ 分钟无输出 hang;建议 600`,
        );
      }
      const convergence = defaults?.convergence as Record<string, unknown> | undefined;
      const maxRounds =
        typeof convergence?.max_rounds === 'number' ? (convergence.max_rounds as number) : 10;
      if (maxRounds > 3) {
        findings.push(
          `[SUGGESTION] stage_extensions.defaults.convergence.max_rounds=${maxRounds} > 3,` +
            `多轮重跑成本大;建议 1(loose 模式不需要收敛 loop)`,
        );
      }

      // 输出 summary
      if (findings.length === 0) {
        console.error(`forge preflight stage-extensions-check: ✓ 配置完整,无已知问题`);
        return; // exit 0
      }

      console.error(
        `forge preflight stage-extensions-check: ${findings.length} 项建议改进(loose,不阻塞)`,
      );
      for (const f of findings) {
        console.error(`  ${f}`);
      }
      console.error(`\n详:docs/migration/setup-stage-extensions.md`);
      return; // exit 0(loose,不阻塞;CI 想 strict 可用 grep 自检)
    });

  return cmd;
}
