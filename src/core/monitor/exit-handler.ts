// src/core/monitor/exit-handler.ts — exit 处理器逻辑(spec §4)
import { isMonitorEnabled } from './config.js';
import { recordCliExit } from './trace-store.js';

/**
 * exit 处理器的可测逻辑:config 守卫 + 跳过自身 + 绝不抛(spec §4 约束 1/3/4)。
 * `process.on('exit')` 注册体只调本函数。
 */
export function maybeRecordCliExit(projectRoot: string, argv: string[], exitCode: number): void {
  try {
    if (!Array.isArray(argv)) return;
    if (argv[0] === 'monitor') return; // 跳过自身,避免噪声/递归
    if (!isMonitorEnabled(projectRoot)) return; // config 守卫:关闭即返回
    recordCliExit(projectRoot, {
      ts: new Date().toISOString(),
      command: argv,
      cwd: projectRoot,
      exit_code: exitCode,
    });
  } catch {
    // 绝不抛 —— 'exit' 处理器抛异常会污染进程退出
  }
}
