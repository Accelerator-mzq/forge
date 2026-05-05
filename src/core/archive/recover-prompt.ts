// case C 交互式二选一 prompt — Plan 6
// 用 node:readline 封装,导出可注入函数便于测试 mock

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

/** 用户对 case C 的选择 */
export type RecoverChoice = 'complete-archive' | 'undo-archive';

/**
 * 提示用户在 case C 状态下二选一。
 *
 * 默认实现:用 node:readline 从 stdin 读取数字 1/2,直到输入合法。
 * 测试可注入自定义实现(例如直接返回固定值)。
 */
export async function promptRecoverChoice(
  customPrompt?: () => Promise<RecoverChoice>,
): Promise<RecoverChoice> {
  if (customPrompt) return customPrompt();

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (
        await rl.question('请输入 [1] 完成归档(重跑 Sync) 或 [2] 撤销归档(从 backup 还原):')
      ).trim();
      if (answer === '1') return 'complete-archive';
      if (answer === '2') return 'undo-archive';
      console.log('无效输入,请输入 1 或 2');
    }
  } finally {
    rl.close();
  }
}
