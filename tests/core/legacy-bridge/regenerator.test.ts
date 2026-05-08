import { describe, it, expect } from 'vitest';
import {
  regenerateRole,
  validateRegenOutput,
  RegenOutputError,
  REGEN_FILENAMES,
  type RegenerateClient,
} from '../../../src/core/legacy-bridge/regenerator.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../../fixtures/legacy-bridge');

/** 创建 mock LLM client,返回固定文本 */
function makeMock(
  text: string,
  usage = { input_tokens: 1000, output_tokens: 500 },
): RegenerateClient {
  return {
    messages: {
      create: async () =>
        ({
          content: [{ type: 'text', text }],
          usage,
        }) as never,
    },
  };
}

describe('legacy-bridge/regenerator', () => {
  it('REGEN_FILENAMES 含 4 个核心 role 文件名', () => {
    expect(REGEN_FILENAMES.requirements).toBe('SRS.md');
    expect(REGEN_FILENAMES['high-level-design']).toBe('HLD.md');
    expect(REGEN_FILENAMES['low-level-design']).toBe('LLD.md');
    expect(REGEN_FILENAMES['system-tests']).toBe('system-tests.md');
  });

  it('regenerateRole happy path → 加 frontmatter + disclaimer', async () => {
    const mock = makeMock(
      '# 需求规格\n\n## 1. 订单\nOrder 表 user_id 字段非空。\n\n## 2. 支付\n所有支付接口必须使用 Idempotency-Key 头部。',
    );
    const out = await regenerateRole(
      {
        role: 'requirements',
        authoritative: {
          role: 'requirements',
          path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
          authoritative: true,
        },
        forgeVersion: '0.2.0',
        regenLicense: 'derived-from-source',
      },
      mock,
    );
    const parsed = matter(out.fullMarkdown);
    expect(parsed.data['generated-by']).toBe('forge-legacy-bridge');
    expect(parsed.data['license']).toBe('derived-from-source');
    expect(parsed.data['forge-version']).toBe('0.2.0');
    // sources 字段;Windows 路径反斜杠在 yaml 里可能不同,所以用文件名 substring 断言
    expect(JSON.stringify(parsed.data['sources'])).toContain('需求规格说明书.md');
    expect(parsed.content).toContain('此文档由 forge 自动生成');
    expect(parsed.content).toContain('Order 表');
    expect(out.body).toContain('Order 表');
  });

  it('redact 在发 LLM 前生效(原文 token 不被发送)', async () => {
    // redact-targets.md 含 5 处自补 literal 目标(INTERNAL-DB-PROD-01 / ACME-CUSTOMER-A12 等);
    // 默认规则 0 命中(P7-13 修复,见 plan 顶部测试策略)。
    // 测试通过传 globalRedactRules 让自补规则命中,验证 redact 整条流程通了。
    const mock = makeMock('# 复写\n## 1. abc\n' + 'x'.repeat(200));
    const out = await regenerateRole(
      {
        role: 'requirements',
        authoritative: {
          role: 'requirements',
          path: join(FIXTURE_DIR, 'redact-targets.md'),
          authoritative: true,
        },
        // 传自补 literal 规则,让 fixture 中的 INTERNAL-DB-PROD-01(出现 2 次)命中
        globalRedactRules: [{ literal: 'INTERNAL-DB-PROD-01', name: 'internal-db' }],
        forgeVersion: '0.2.0',
        regenLicense: 'derived-from-source',
      },
      mock,
    );
    // 至少 2 处命中(fixture 里 INTERNAL-DB-PROD-01 出现 2 次,验证 redact 真生效)
    expect(out.redactReport.totalReplacements).toBeGreaterThanOrEqual(2);
  });

  it('disclaimer 含 license 字段(决策 #21)', async () => {
    const mock = makeMock('# 复写\n## 1. 内容\n' + 'foo bar baz qux '.repeat(20));
    const out = await regenerateRole(
      {
        role: 'requirements',
        authoritative: {
          role: 'requirements',
          path: join(FIXTURE_DIR, 'chinese-anchor/需求规格说明书.md'),
          authoritative: true,
        },
        forgeVersion: '0.2.0',
        regenLicense: 'derived-from-source',
      },
      mock,
    );
    expect(out.fullMarkdown).toContain('许可:`derived-from-source`');
  });

  it('validateRegenOutput LLM 输出过短 → 抛 RegenOutputError', () => {
    expect(() => validateRegenOutput('短', 'requirements')).toThrow(RegenOutputError);
    expect(() => validateRegenOutput('短', 'requirements')).toThrow(/复写产物为空或过短/);
  });

  it('validateRegenOutput LLM 输出 frontmatter → 抛错', () => {
    const bad = `---\ngenerated-by: hack\n---\n\n# 内容\n${'.'.repeat(100)}`;
    expect(() => validateRegenOutput(bad, 'requirements')).toThrow(/含 frontmatter 字段/);
  });

  it('validateRegenOutput code block 不闭合 → 抛错', () => {
    const bad = `# 复写\n## 1. \n\`\`\`js\nconst x = 1;\n${'.'.repeat(100)}`;
    expect(() => validateRegenOutput(bad, 'requirements')).toThrow(/code block 不闭合/);
  });

  it('validateRegenOutput 合法 markdown 通过', () => {
    const good = `# 复写\n## 1. 章节\n${'a'.repeat(100)}\n\n\`\`\`js\nconst x = 1;\n\`\`\`\n`;
    expect(() => validateRegenOutput(good, 'requirements')).not.toThrow();
  });

  it('validateRegenOutput LLM 输出以 --- 开头但非 frontmatter(thematic break + 标题)→ 通过(I-1 false positive 修复)', () => {
    // gray-matter 对 `---\n\n# 标题` 会把 data 解析成 100+ 数字键 → 修后只在真 frontmatter delimiter 时检测
    const goodWithThematicBreak = `---\n\n# 复写\n## 1. 章节\n${'a'.repeat(100)}`;
    expect(() => validateRegenOutput(goodWithThematicBreak, 'requirements')).not.toThrow();
  });

  it('xlsx anchor 也能复写(走 sheetToMarkdown)', async () => {
    const mock = makeMock('# 测试用例\n## TC-001\n登录测试 ' + 'x'.repeat(200));
    const out = await regenerateRole(
      {
        role: 'system-tests',
        authoritative: {
          role: 'system-tests',
          path: join(FIXTURE_DIR, 'excel-test-cases.xlsx'),
          authoritative: true,
          sheet: 'TestCases',
        },
        forgeVersion: '0.2.0',
        regenLicense: 'derived-from-source',
      },
      mock,
    );
    expect(out.fullMarkdown).toContain('登录测试');
  });
});
