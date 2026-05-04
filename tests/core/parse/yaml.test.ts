import { describe, it, expect } from 'vitest';
import { parseConfig, ConfigParseError } from '../../../src/core/parse/yaml.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// fixture 目录路径
const fixDir = resolve(__dirname, '../../fixtures/configs');
// 读取 fixture 文件的辅助函数
const load = (name: string) => readFileSync(resolve(fixDir, name), 'utf8');

describe('parseConfig', () => {
  it('parses a valid forge/config.yaml', () => {
    const config = parseConfig(load('valid.yaml'));
    expect(config.schema).toBe('forge-spec-driven/v1');
    expect(config.rules?.proposal).toContain('Include rollback plan');
    expect(config.code_paths?.include).toContain('src/**');
  });

  it('throws ConfigParseError on malformed YAML', () => {
    expect(() => parseConfig(load('malformed.yaml'))).toThrow(ConfigParseError);
  });

  it('throws ConfigParseError when schema field missing', () => {
    expect(() => parseConfig(load('missing-schema.yaml'))).toThrow(/schema/);
  });
});
