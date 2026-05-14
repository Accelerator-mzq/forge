// src/core/parse/fenced-yaml.ts
// 从 markdown 文本抽所有 ```yaml ... ``` block 并 YAML.parse;
// plan-9b Task 2 — 被 Task 3(content_hash 排除)/ Task 4(validate)/ Task 5(scope aggregator)复用

import { parse as parseYaml, YAMLParseError } from 'yaml';

/** fenced YAML 块解析失败(语法错或位置不可定位) */
export class FencedYamlParseError extends Error {
  constructor(
    message: string,
    public readonly blockIndex: number, // 0-based,markdown 内 yaml 块序号
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FencedYamlParseError';
  }
}

/**
 * 从 markdown 文本抽所有 ```yaml ... ``` block 并 YAML.parse。
 * - 仅匹配 ```yaml(显式 lang,大小写不敏感),忽略 ``` 或 ```ts 等
 * - 按出现顺序返回
 * - 任一块 YAML 解析失败 → 抛 FencedYamlParseError 含 blockIndex
 *
 * 注:被 Task 3 content_hash 调用时,即使整体 YAML 解析失败,段的剔除逻辑也得继续工作(因为 hash 算的是字面 markdown 不依赖 YAML 内容)。
 * 故 Task 3 调用方应自己 wrap try/catch,YAML 错误下回退到"段存在 → 仍剔除"。
 */
export function parseFencedYamlBlocks(text: string): unknown[] {
  const blocks: unknown[] = [];
  // 匹配 ```yaml ... ``` (非贪婪,跨行);lang 仅接 yaml,大小写不敏感
  const re = /```yaml\s*\n([\s\S]*?)\n?```/gi;
  let idx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[1] ?? '';
    try {
      blocks.push(parseYaml(raw));
    } catch (err) {
      const detail = err instanceof YAMLParseError ? err.message : String(err);
      throw new FencedYamlParseError(`fenced yaml block #${idx} parse error: ${detail}`, idx, err);
    }
    idx++;
  }
  return blocks;
}
