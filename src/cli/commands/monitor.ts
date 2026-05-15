// src/cli/commands/monitor.ts — forge monitor 子命令组(spec §7)
import { Command } from 'commander';
import { isMonitorEnabled, setMonitorEnabled } from '../../core/monitor/config.js';
import { readTrace, appendTraceEvent } from '../../core/monitor/trace-store.js';
import type { TraceEvent, MonitorStage } from '../../core/monitor/types.js';

// 构建 monitor 子命令
export function buildMonitorCommand(): Command {
  const cmd = new Command('monitor').description('workflow-monitor:观察并报告 forge 工作流');

  cmd
    .command('enable')
    .description('开启 workflow-monitor(写 config.yaml#monitor.enabled)')
    .action(() => {
      // 在当前工作目录启用 monitor
      setMonitorEnabled(process.cwd(), true);
      console.log('✓ workflow-monitor 已开启 —— AI trace 层下次会话生效,CLI 层下次 forge 调用生效');
    });

  cmd
    .command('disable')
    .description('关闭 workflow-monitor')
    .action(() => {
      // 在当前工作目录禁用 monitor
      setMonitorEnabled(process.cwd(), false);
      console.log('✓ workflow-monitor 已关闭');
    });

  cmd
    .command('status')
    .description('查看开关状态 + 活动 change 的 trace 摘要')
    .option('--change <id>', '指定 change-id')
    .action((opts: { change?: string }) => {
      // 查询当前工作目录的 monitor 状态
      const root = process.cwd();
      console.log(`workflow-monitor: ${isMonitorEnabled(root) ? '已开启' : '已关闭'}`);
      if (opts.change) {
        // 读取指定 change 的 trace 摘要
        const { events, corruptLines } = readTrace(root, opts.change);
        console.log(`change ${opts.change}: ${events.length} 条 trace 事件,${corruptLines} 行损坏`);
      }
    });

  cmd
    .command('record')
    .description('记录一条 AI 层 trace 事件(由 workflow-monitor 注入内容指示 AI 调用)')
    .requiredOption('--stage <stage>', '工作阶段')
    .requiredOption('--event <event>', '事件类型(stage_enter|decision|hardening_step|stage_exit)')
    .option('--change <id>', 'change-id', '_session')
    .option('--json <payload>', 'data 负载(JSON)', '{}')
    .action((opts: { stage: string; event: string; change: string; json: string }) => {
      // 硬约束(spec §7):永远 exit 0;关闭时静默 no-op。
      try {
        const root = process.cwd();
        if (!isMonitorEnabled(root)) return; // 静默 no-op
        let data: Record<string, unknown>;
        let event = opts.event;
        try {
          data = JSON.parse(opts.json) as Record<string, unknown>;
        } catch (err) {
          // 坏输入降级为 record_error,不报错退出
          event = 'record_error';
          data = { original_event: opts.event, error: (err as Error).message };
        }
        const traceEvent: TraceEvent = {
          ts: new Date().toISOString(),
          schema: 'forge-monitor-trace/v1',
          change_id: opts.change,
          stage: opts.stage as MonitorStage,
          layer: 'ai',
          event,
          data,
        };
        appendTraceEvent(root, traceEvent);
      } catch {
        // 永不破坏工作流 —— 吞掉一切异常
      }
    });

  return cmd;
}
