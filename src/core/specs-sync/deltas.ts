// specs-sync deltas 解析 — change/<id>/specs/ 下的 md 是要应用到 forge/specs/ 的"增量"
// 当前模型:每个 md 文件代表"应替换 forge/specs/<name>"。未来可加"删除"语义(用空文件或 frontmatter 标记)。

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SpecDelta {
  /** spec 名(不含 .md) */
  name: string;
  /** create / replace / delete */
  operation: 'create' | 'replace' | 'delete';
  /** 内容(delete 时为 null) */
  content: string | null;
}

/**
 * 读 changeDir/specs/ 下所有 .md,与 currentSpecsDir 下已有的对比,产出 deltas。
 * 当前实现:简单替换(若 already exists → replace,否则 create)。
 * delete 语义未实现(留 v0.2)。
 */
export async function readDeltas(
  changeSpecsDir: string,
  currentSpecsDir: string,
): Promise<SpecDelta[]> {
  // 读取 change specs 目录下所有文件,目录不存在时返回空数组
  const newEntries = await readdir(changeSpecsDir).catch(() => []);
  // 读取当前 forge specs 目录,构建已有文件集合
  const existing = new Set(await readdir(currentSpecsDir).catch(() => []));

  const deltas: SpecDelta[] = [];
  for (const name of newEntries) {
    // 只处理 .md 文件
    if (!name.endsWith('.md')) continue;
    const content = await readFile(join(changeSpecsDir, name), 'utf8');
    // 根据是否已存在决定操作类型
    const op: SpecDelta['operation'] = existing.has(name) ? 'replace' : 'create';
    deltas.push({ name: name.replace(/\.md$/, ''), operation: op, content });
  }

  return deltas;
}
