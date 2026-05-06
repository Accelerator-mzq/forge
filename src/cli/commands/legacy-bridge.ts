// forge legacy-bridge 主命令 + 5 子命令骨架 — Plan 7 Phase A
// 各子命令在后续 Phase B-D 填实;本 Task 仅完成骨架 + commander 结构
// spec §2.1 子命令一览 + 决策 #22 LLM opt-in 流程

import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { writeAck } from '../../core/legacy-bridge/ack.js';
import { loadAnchorsFile } from '../../core/legacy-bridge/anchors.js';
import type { ForgeConfig } from '../../core/schema/types.js';

/** 5 子命令通用退出码,与 forge 现有约定一致(spec §4.6) */
export const LB_EXIT_OK = 0;
export const LB_EXIT_GENERAL_ERROR = 1;
export const LB_EXIT_BUSINESS_RULE_FAIL = 2;
export const LB_EXIT_PARTIAL_SUCCESS = 3;
export const LB_EXIT_DATA_CORRUPT = 4;
export const LB_EXIT_LOCK_HELD = 5;

/** 主命令 build:无参数走 help;含 --acknowledge-data-transfer 时进入 ack 流程(Phase B1 填) */
export function buildLegacyBridgeCommand(): Command {
  const cmd = new Command('legacy-bridge')
    .description('Brownfield onboarding:与老文档体系并存 + archive→legacy 单向同步(v0.2)')
    .option('--acknowledge-data-transfer', 'opt-in:ack 数据将被发送到 LLM provider(决策 #22)')
    .option('--acknowledge-customer-data', '同时 ack 含客户数据的 anchor(§4.5 GDPR 二次确认门)');

  cmd.action(
    async (opts: { acknowledgeDataTransfer?: boolean; acknowledgeCustomerData?: boolean }) => {
      // M2 修:--acknowledge-customer-data 必须与 --acknowledge-data-transfer 同用,
      // 单独传不应静默走 help(用户不知 flag 没生效)
      if (opts.acknowledgeCustomerData && !opts.acknowledgeDataTransfer) {
        console.error('✗ --acknowledge-customer-data 必须与 --acknowledge-data-transfer 同时使用');
        process.exit(LB_EXIT_GENERAL_ERROR);
      }
      if (opts.acknowledgeDataTransfer) {
        const forgeRoot = join(process.cwd(), 'forge');
        const configPath = join(forgeRoot, 'config.yaml');
        if (!existsSync(configPath)) {
          console.error('forge/config.yaml 不存在,先跑 forge init 初始化项目');
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        // I1 修:config.yaml 格式损坏时 parseYaml 抛异常,用 try/catch 包装给友好提示
        let config: ForgeConfig;
        try {
          config = parseYaml(await readFile(configPath, 'utf8')) as ForgeConfig;
        } catch (e) {
          console.error(`forge/config.yaml 格式错误:${(e as Error).message}`);
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        if (!config.legacy_bridge?.allow_llm_calls) {
          console.error(
            '✗ forge/config.yaml 未声明 legacy_bridge.allow_llm_calls: true,请先在 config 加该字段',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        // 检 anchors 中是否有 contains_customer_data
        const anchors = await loadAnchorsFile(forgeRoot);
        const hasCustomerData = (anchors?.anchors ?? []).some(
          (a) => a.contains_customer_data === true,
        );
        if (hasCustomerData && !opts.acknowledgeCustomerData) {
          console.error(
            '✗ legacy-anchors.yaml 标有 contains_customer_data=true 的 anchor;\n' +
              '请加 --acknowledge-customer-data 一并确认(§4.5 GDPR)',
          );
          process.exit(LB_EXIT_GENERAL_ERROR);
        }
        await writeAck(forgeRoot, config, hasCustomerData);
        console.log(
          `✓ ack 已写入 forge/.cache/llm-ack.yaml(customer_data_acknowledged=${hasCustomerData})`,
        );
        process.exit(LB_EXIT_OK);
      }
      cmd.help();
    },
  );

  // 5 个子命令骨架(各 Phase 填实)
  cmd
    .command('map')
    .description('扫 docs/ + src/ → LLM 推测 → legacy-anchors-draft.yaml(决策 #4)')
    .option('--merge', '与已存在 anchors.yaml 合并新发现项,保留用户审过部分(默认)', true)
    .option('--overwrite', '全量重生成(覆盖用户改动,需用户确认)')
    .option('--docs-paths <paths>', '逗号分隔的额外 docs 目录(默认扫 docs/ doc/ document/)')
    .option('--redact-report', '输出每条 redact 规则的命中数(决策 #20)')
    .action(async () => {
      // Phase A 骨架,后续 Phase D Task D3 替换为真实实现
      console.error('forge legacy-bridge map:Phase D 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  cmd
    .command('regenerate')
    .description('LLM 复写规范 SRS/HLD/LLD/system-tests + 双 LLM 抽样验证(决策 #14-#16)')
    .option('--role <role>', '仅复写指定 role(默认全 4 role)')
    .option('--dry-run', '不调 LLM,只估算 cost + 列要扫的文件(§4.4)')
    .option('--include-historical', '把 authoritative=false 历史版作背景(默认关)')
    .option('--redact-report', '输出每条 redact 规则的命中数')
    .option('--yes', '非 TTY 必须显式 ack 高 cost 才继续(M-4)')
    .option('--skip-quality', '跳过 quality-judge 双 LLM 抽样(P7-02 默认跑)')
    .action(async () => {
      // Phase A 骨架,后续 Phase B3.2 Task 替换为真实实现
      console.error('forge legacy-bridge regenerate:Phase B2/B3 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  cmd
    .command('index')
    .description('为每个 anchor 生成 ~100 字 LLM 摘要(决策 #14 Layer 2)')
    .option('--yes', '非 TTY 必须显式 ack')
    .action(async () => {
      // Phase A 骨架,后续 Phase D Task D3 替换为真实实现
      console.error('forge legacy-bridge index:Phase D 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  cmd
    .command('sync-check')
    .description('检测 change 影响的老锚点是否需更新 → 5 档差异报告(决策 #5/#19)')
    .option('--change-id <id>', '指定 change-id;默认取最近一次 archive')
    .action(async () => {
      // Phase A 骨架,后续 Phase C Task C4 替换为真实实现
      console.error('forge legacy-bridge sync-check:Phase C 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  cmd
    .command('resolve <change-id>')
    .description('校验 sync-state diffs 全部 ack 后标 resolved(决策 #19)')
    // _changeId 占位:commander 把 positional 传给 action;Phase C Task C4 替换实现时用
    .action(async (_changeId: string) => {
      // Phase A 骨架,后续 Phase C Task C4 替换为真实实现
      console.error('forge legacy-bridge resolve:Phase C 待替换骨架');
      process.exit(LB_EXIT_GENERAL_ERROR);
    });

  return cmd;
}
