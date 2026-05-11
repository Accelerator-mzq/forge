import { describe, it, expect } from 'vitest';
import {
  parseFencedYamlBlocks,
  FencedYamlParseError,
} from '../../../src/core/parse/fenced-yaml.js';

describe('parseFencedYamlBlocks(plan-9b Task 2)', () => {
  it('抽单个 yaml 块', () => {
    const text = '前言\n\n```yaml\nschema: forge-scope-entries/v1\nentries: []\n```\n\n后文\n';
    const blocks = parseFencedYamlBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      schema: 'forge-scope-entries/v1',
      entries: [],
    });
  });

  it('抽多个 yaml 块,按出现顺序', () => {
    const text = '```yaml\nschema: a\n```\n\n中间\n\n```yaml\nschema: b\n```\n';
    const blocks = parseFencedYamlBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ schema: 'a' });
    expect(blocks[1]).toMatchObject({ schema: 'b' });
  });

  it('忽略非 yaml 的 fenced block(``` 或 ```ts)', () => {
    const text = '```\nplain\n```\n\n```ts\nconst x = 1;\n```\n';
    expect(parseFencedYamlBlocks(text)).toHaveLength(0);
  });

  it('YAML 语法错 → 抛 FencedYamlParseError 含原文位置', () => {
    const text = '```yaml\n: invalid yaml:\n```\n';
    expect(() => parseFencedYamlBlocks(text)).toThrow(FencedYamlParseError);
  });

  it('空文本 → []', () => {
    expect(parseFencedYamlBlocks('')).toEqual([]);
  });
});
