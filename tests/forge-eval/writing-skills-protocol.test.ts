// writing-skills-protocol.test.ts
// 验证 forge-eval/scenarios/writing-skills.yaml 通过现有 schema 合约
// + bootstrap_exception 元数据声明可见(yaml 顶层注释或 description,runner 忽略未识别 yaml key)

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScenarioFile } from '../../forge-eval/load-scenario.js';

// 计算当前文件目录,用于定位 YAML 文件路径
const __dirname = dirname(fileURLToPath(import.meta.url));
const YAML_PATH = join(__dirname, '../../forge-eval/scenarios/writing-skills.yaml');

describe('writing-skills.yaml protocol compliance', () => {
  // 测试 writing-skills.yaml 通过 forge-eval loadScenarioFile schema 校验
  it('passes forge-eval loadScenarioFile schema (skill + scenarios + turns + judge_rubric)', async () => {
    const file = await loadScenarioFile('writing-skills');
    // 确认 skill 字段值
    expect(file.skill).toBe('writing-skills');
    // 至少 2 个场景
    expect(file.scenarios.length).toBeGreaterThanOrEqual(2);
    for (const s of file.scenarios) {
      // 每个 scenario 必须有 id
      expect(s.id).toBeTruthy();
      // 每个 scenario 至少 1 个 turn
      expect(s.turns.length).toBeGreaterThanOrEqual(1);
      for (const t of s.turns) {
        // 每个 turn 必须有 user 和 judge_rubric(spec §5.5.3 合约)
        expect(t.user).toBeTruthy();
        expect(t.judge_rubric).toBeTruthy();
      }
    }
  });

  // 验证 yaml 文件中声明了 bootstrap_exception 元数据(顶层注释或 description 字段内)
  it('declares bootstrap_exception in yaml metadata (description or comment)', async () => {
    const raw = await readFile(YAML_PATH, 'utf8');
    // bootstrap_exception 是文档元数据,可在 yaml 顶层注释 OR description 字段内文字标注
    expect(raw).toMatch(/bootstrap[_-]exception/i);
  });

  // 验证 writing-skills 已注册在 SKILL_NAMES 中
  it('writing-skills is registered in SKILL_NAMES', async () => {
    const { SKILL_NAMES } = await import('../../src/core/templates/skills/index.js');
    expect(SKILL_NAMES).toContain('writing-skills');
  });

  // 验证每个 scenario id 唯一(无重复)
  it('every scenario has unique id', async () => {
    const file = await loadScenarioFile('writing-skills');
    const ids = file.scenarios.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
