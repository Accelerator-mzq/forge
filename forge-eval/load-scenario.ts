// 从 forge-eval/scenarios/<skill>.yaml 加载并校验 scenario 文件
// spec §5.5.3 合约:judge_rubric 必需,assertions 可选

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { Scenario, ScenarioFile, Turn } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, 'scenarios');

/** 读取并解析单个 skill 的 scenario YAML 文件 */
export async function loadScenarioFile(skillName: string): Promise<ScenarioFile> {
  const path = join(SCENARIOS_DIR, `${skillName}.yaml`);
  if (!existsSync(path)) {
    throw new Error(`scenario 文件不存在: ${path}`);
  }
  const raw = await readFile(path, 'utf8');
  const data = parseYaml(raw) as ScenarioFile;
  validateScenarioFile(data, path);
  return data;
}

/** 把 ScenarioFile 展开为 Scenario[](每个 scenario 带顶层的 skill/model 字段) */
export function flattenScenarios(file: ScenarioFile): Scenario[] {
  return file.scenarios.map((s) => ({
    skill: file.skill,
    description: file.description,
    model: file.model ?? 'claude-sonnet-4-6',
    ...s,
  }));
}

/** 校验 ScenarioFile 合约(spec §5.5.3) */
export function validateScenarioFile(data: ScenarioFile, path: string): void {
  if (!data.skill) throw new Error(`${path}: 缺 skill 字段`);
  if (!Array.isArray(data.scenarios) || data.scenarios.length === 0) {
    throw new Error(`${path}: scenarios 字段为空`);
  }
  for (const s of data.scenarios) {
    if (!s.id) throw new Error(`${path}: scenario 缺 id`);
    if (!Array.isArray(s.turns) || s.turns.length === 0) {
      throw new Error(`${path}: scenario ${s.id} turns 为空`);
    }
    for (const [idx, turn] of s.turns.entries()) {
      validateTurn(turn, `${path}::${s.id}::turn-${idx}`);
    }
  }
}

/** 校验单 turn 合约(spec §5.5.3:user + judge_rubric 必需) */
export function validateTurn(turn: Turn, ctx: string): void {
  if (!turn.user || typeof turn.user !== 'string') {
    throw new Error(`${ctx}: user 字段缺失或非字符串`);
  }
  // spec §5.5.3:judge_rubric 必需,空 rubric 视为合约错误
  if (!turn.judge_rubric || typeof turn.judge_rubric !== 'string' || !turn.judge_rubric.trim()) {
    throw new Error(`${ctx}: judge_rubric 必需(spec §5.5.3 合约)`);
  }
  // assertions 可选
  if (turn.assertions) {
    if (turn.assertions.must_match) {
      for (const item of turn.assertions.must_match) {
        if (typeof item.regex !== 'string') {
          throw new Error(`${ctx}: must_match[].regex 必须是字符串`);
        }
      }
    }
    if (turn.assertions.must_not_match) {
      for (const item of turn.assertions.must_not_match) {
        if (typeof item.regex !== 'string') {
          throw new Error(`${ctx}: must_not_match[].regex 必须是字符串`);
        }
      }
    }
  }
}
