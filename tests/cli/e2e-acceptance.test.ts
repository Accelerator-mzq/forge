// e2e 验收测试:forge init 部署的真模板能否在 Claude Code 里触发 brainstorming
// 与 spike/RESULTS.md 对照(spike 用 superpowers 源文件;此处用 forge 真产物)
// 仅当 CLAUDE_BIN 与 ANTHROPIC_API_KEY 均已设置时跑;CI 默认无,自动 skip
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from './helpers.js';

const CLAUDE_BIN = process.env.CLAUDE_BIN; // 例如 "claude"(在 PATH 里)
const HAS_API = !!process.env.ANTHROPIC_API_KEY;
const ENABLED = !!CLAUDE_BIN && HAS_API;

describe.skipIf(!ENABLED)('e2e brainstorming acceptance', () => {
  it('forge init + claude -p "我想做个 todo list" → 触发 brainstorming(问题信号 ≥ 2 + 无 code block)', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-acceptance-'));
    try {
      // 1. forge init
      const initR = runCli(['init', '--harness=claude'], d);
      expect(initR.exitCode).toBe(0);
      expect(existsSync(join(d, '.claude/skills/forge-using-forge/SKILL.md'))).toBe(true);
      expect(existsSync(join(d, '.claude/skills/forge-brainstorming/SKILL.md'))).toBe(true);

      // 2. 跑 claude -p "我想做个 todo list",cwd 是 init 后的 tmpdir
      // 注:用 spawnSync,捕获 stdout;超时 90 秒(brainstorming 多轮可能慢)
      const result = spawnSync(CLAUDE_BIN!, ['-p', '我想做个 todo list 应用'], {
        cwd: d,
        encoding: 'utf8',
        timeout: 90_000,
        env: { ...process.env, NO_COLOR: '1' },
      });
      const out = (result.stdout ?? '') + (result.stderr ?? '');

      // 3. 断言:含至少 2 个问题信号(中文问号或英文问号)
      const questionCount = (out.match(/[??]/g) ?? []).length;
      expect(
        questionCount,
        `期望至少 2 个问题信号,实际 ${questionCount}\n响应:\n${out}`,
      ).toBeGreaterThanOrEqual(2);

      // 4. 断言:不含代码 block(brainstorming 阶段不应该写代码)
      expect(out).not.toMatch(/```[a-z]/i);

      // 5. 可选:断言提到 forge/drafts/(brainstorming skill 末尾会引用)
      // 此项不强制,某些响应轮次可能尚未到设计阶段
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }, 120_000); // vitest 测试超时 120 秒
});
