// src/cli/commands/monitor.ts — forge monitor 子命令组(spec §7)
import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { isMonitorEnabled, setMonitorEnabled } from '../../core/monitor/config.js';
import {
  readTrace,
  appendTraceEvent,
  readCliExits,
  monitorDir,
  sessionChangeId,
  readSessionTrace,
} from '../../core/monitor/trace-store.js';
import { MONITOR_STAGES, type TraceEvent, type MonitorStage } from '../../core/monitor/types.js';
import { observeArtifacts } from '../../core/monitor/artifact-observer.js';
import { renderReport } from '../../core/monitor/report-renderer.js';

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
    .option('--change <id>', 'change-id')
    .option('--json <payload>', 'data 负载(JSON)', '{}')
    .action((opts: { stage: string; event: string; change?: string; json: string }) => {
      // 硬约束(spec §7):永远 exit 0;关闭时静默 no-op。
      try {
        const root = process.cwd();
        if (!isMonitorEnabled(root)) return; // 静默 no-op
        // 未传 --change 时自动落 _session-<uuid> 桶(spec §2.4:pre-change brainstorm/explore 事件)
        const changeId = opts.change ?? sessionChangeId(root);
        let data: Record<string, unknown>;
        let event = opts.event; // JSON 解析失败或 stage 非法时降级为 'record_error'
        try {
          data = JSON.parse(opts.json) as Record<string, unknown>;
        } catch (err) {
          // 坏输入降级为 record_error,不报错退出
          event = 'record_error';
          data = { original_event: opts.event, error: (err as Error).message };
        }
        // stage 合法性校验 —— 无效 stage 同样降级为 record_error(与坏 JSON 对称,spec §7「坏输入」)
        if (
          event !== 'record_error' &&
          !(MONITOR_STAGES as readonly string[]).includes(opts.stage)
        ) {
          event = 'record_error';
          data = { original_event: opts.event, error: `invalid stage: ${opts.stage}` };
        }
        const traceEvent: TraceEvent = {
          ts: new Date().toISOString(),
          schema: 'forge-monitor-trace/v1',
          change_id: changeId,
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

  cmd
    .command('report')
    .description('渲染某 change 的监控报告(markdown)')
    .requiredOption('--change <id>', 'change-id')
    .option('--out <path>', '报告输出路径(默认 forge/.monitor/<change>/report.md)')
    .action((opts: { change: string; out?: string }) => {
      // query 命令 —— 出错允许 non-zero exit(spec §7:与 record 不同,report 不强制 exit 0,故不包 try/catch)
      const root = process.cwd();
      // AI trace 事件 + CLI 产物回扫事件 + _session 桶 pre-change 事件合并(spec §2.4/§3.2)
      const aiEvents = readTrace(root, opts.change).events;
      const sessionEvents = readSessionTrace(root); // spec §2.4/§3.2:并入 pre-change _session 桶事件
      const cliEvents = observeArtifacts(root, opts.change);
      // 三源 change_id 不同,sort 合并不去重(同一事件不会重复;附录原始 trace 忠实呈现)
      const all = [...cliEvents, ...aiEvents, ...sessionEvents].sort((a, b) =>
        a.ts.localeCompare(b.ts),
      );
      const cliExits = readCliExits(root);
      const md = renderReport(opts.change, all, cliExits);
      const outPath = opts.out ?? join(monitorDir(root), opts.change, 'report.md');
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, md, 'utf8');
      console.log(md);
      console.error(`报告已写入 ${outPath}`);
    });

  return cmd;
}
