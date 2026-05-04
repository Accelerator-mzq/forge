// 应用 deltas 到 forge/specs/

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { SpecDelta } from './deltas.js';

/**
 * 将 deltas 逐个应用到 currentSpecsDir。
 * create/replace:写入文件(自动创建父目录)。
 * delete:v0.2 待实现,当前直接抛出错误。
 */
export async function applyDeltas(currentSpecsDir: string, deltas: SpecDelta[]): Promise<void> {
  for (const d of deltas) {
    const path = join(currentSpecsDir, `${d.name}.md`);
    if (d.operation === 'create' || d.operation === 'replace') {
      // content 为 null 时跳过(防御性处理)
      if (d.content === null) continue;
      // 确保目标目录存在
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, d.content, 'utf8');
    } else if (d.operation === 'delete') {
      // v0.2 实现
      throw new Error(`delete operation not yet implemented (v0.2)`);
    }
  }
}
