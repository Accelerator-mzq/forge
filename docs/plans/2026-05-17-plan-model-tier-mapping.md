# subagent-driven-discipline 可配置 Model Tier 映射 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `forge:subagent-driven-discipline` 加一个 `forge/config.yaml#model_tiers` 配置,让项目把 §1 的 `haiku`/`sonnet` model tier 重映射到实际派发的模型(默认恒等、零行为变化)。

**Architecture:** 新增 `model-tiers-config.ts`(读取侧 `resolveModelTiers` graceful resolver + 写入侧 `validateModelTierAssignment` fail-fast predicate,共享常量);`forge config` CLI 支持点分键;两个 skill 的 markdown 加治理段 / 改指针;`.claude/` dogfood 副本同步;新增单测 + CLI 测试 + 两副本治理段 parity test。运行时由 controller 读 `forge/config.yaml` 自行解析(M2,无 hook)。

**Tech Stack:** TypeScript / Node ≥ 20.19 / pnpm / vitest / commander / `yaml` 包。

**权威 spec:** `docs/specs/2026-05-17-model-tier-mapping-design.md`(经 7 轮 Codex 对抗性审查定稿)。实现中如遇 spec 未覆盖的细节,以 spec 为准、不要自行扩 scope。

---

## File Structure

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `src/core/schema/types.ts` | `ForgeConfig` 类型 + 默认常量 | 修改:加 `ModelTier` / `model_tiers?` / `DEFAULT_MODEL_TIERS` |
| `src/core/schema/model-tiers-config.ts` | model_tiers 读写规则的单一实现 | 新建 |
| `src/core/schema/index.ts` | schema 模块 re-export | 修改:加一行导出 |
| `tests/core/schema/model-tiers-config.test.ts` | resolver + validator + 常量一致性单测 | 新建 |
| `src/cli/commands/config.ts` | `forge config` 子命令 | 修改:点分键 + model_tiers 校验 |
| `tests/cli/config.test.ts` | `forge config` CLI 集成测试 | 修改:加 model_tiers 用例 |
| `skills/subagent-driven-discipline/SKILL.md` | discipline skill(分发本体) | 修改:加治理段 + Platform Note + version |
| `skills/subagent-driven-discipline/references/codex-tools.md` | Codex harness 映射 | 修改:补一句澄清注 |
| `skills/subagent-driven-discipline/references/opencode-tools.md` | OpenCode harness 映射 | 修改:补一句澄清注 |
| `skills/subagent-driven-development/SKILL.md` | SDD skill | 修改:matrix→指针 等三处 |
| `.claude/skills/subagent-driven-discipline/SKILL.md` | forge-repo 自身 dogfood 副本 | 修改:同步治理段 + Platform Note |
| `tests/core/templates/skills.test.ts` | skill 模板测试 | 修改:加治理段 + Platform Note 修正句 parity test |
| `CHANGELOG.md` | 变更日志 | 修改:加 Added + Changed 条目 |
| `src/core/templates/` | `pnpm build` 反向同步产物 | 由 build 自动生成,随 commit |

---

## Task 1: `model-tiers-config` TS 模块 + 单测

**Files:**
- Modify: `src/core/schema/types.ts`
- Create: `src/core/schema/model-tiers-config.ts`
- Modify: `src/core/schema/index.ts`
- Test: `tests/core/schema/model-tiers-config.test.ts`

- [ ] **Step 1: 给 `types.ts` 加类型与默认常量**

在 `src/core/schema/types.ts` 的 `ForgeConfig` interface 内,`monitor?` 字段旁加 `model_tiers?` 字段:

```ts
  /**
   * model tier 标签 → 实际派发模型的重映射(详见 model-tiers-config.ts)。
   * 只有 haiku / sonnet 两个可重映射键;opus 是 design MANDATORY tier,不设键、恒派 opus。
   * 缺失 / 缺键 = 该 tier 恒等。
   */
  model_tiers?: {
    haiku?: ModelTier;
    sonnet?: ModelTier;
  };
```

在文件**类型定义区顶部**(其它 `export interface` 之前)加 `ModelTier` 类型;在文件**常量区**(`DEFAULT_LIGHT_THRESHOLD` 等常量旁)加默认常量:

```ts
/** 三个 model tier 标签 / 合法模型值 */
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

/** model_tiers 缺失时的恒等默认(resolveModelTiers fallback 用) */
export const DEFAULT_MODEL_TIERS: { haiku: ModelTier; sonnet: ModelTier; opus: ModelTier } = {
  haiku: 'haiku',
  sonnet: 'sonnet',
  opus: 'opus',
};
```

- [ ] **Step 2: 写失败测试 `model-tiers-config.test.ts`**

创建 `tests/core/schema/model-tiers-config.test.ts`:

```ts
// model-tiers-config:resolveModelTiers + validateModelTierAssignment 单测
// 覆盖 spec §2.1 resolver 六条规则 + validator 三类 reason + 共享常量一致性

import { describe, it, expect } from 'vitest';
import {
  resolveModelTiers,
  validateModelTierAssignment,
  MODEL_TIER_VALUES,
  MODEL_TIER_RANK,
} from '../../../src/core/schema/model-tiers-config.js';
import type { ForgeConfig } from '../../../src/core/schema/types.js';

// 构造最小 ForgeConfig;model_tiers 用 unknown 转型以便测 malformed 输入
function cfg(model_tiers: unknown): ForgeConfig {
  return { schema: 'forge-spec-driven/v1', model_tiers } as unknown as ForgeConfig;
}
const IDENTITY = { haiku: 'haiku', sonnet: 'sonnet', opus: 'opus' };
const noop = () => {};

describe('resolveModelTiers — spec §2.1 六条规则', () => {
  it('规则2 缺失:config undefined / model_tiers 缺失 → 全 identity', () => {
    expect(resolveModelTiers(undefined, noop)).toEqual(IDENTITY);
    expect(resolveModelTiers(cfg(undefined), noop)).toEqual(IDENTITY);
  });

  it('规则2 缺键:只设 haiku → sonnet 保持 identity', () => {
    expect(resolveModelTiers(cfg({ haiku: 'sonnet' }), noop)).toEqual({
      haiku: 'sonnet',
      sonnet: 'sonnet',
      opus: 'opus',
    });
  });

  it('规则1 单次查表:{haiku:sonnet, sonnet:opus} → haiku=sonnet(非递归)', () => {
    // 关键用例:同时设 sonnet → 递归实现会把 haiku 错误地追成 opus
    const r = resolveModelTiers(cfg({ haiku: 'sonnet', sonnet: 'opus' }), noop);
    expect(r.haiku).toBe('sonnet'); // 单次查表 = sonnet;递归会得 opus
    expect(r.sonnet).toBe('opus');
  });

  it('规则3 malformed:model_tiers 非对象 → 全 identity + warn', () => {
    for (const bad of [null, 'x', 42, ['a']]) {
      const warns: string[] = [];
      expect(resolveModelTiers(cfg(bad), (m) => warns.push(m))).toEqual(IDENTITY);
      expect(warns.length).toBeGreaterThan(0);
    }
  });

  it('规则3 未知键(opus / max / 大小写变体 Haiku)→ 忽略 + warn', () => {
    const warns: string[] = [];
    const r = resolveModelTiers(cfg({ opus: 'haiku', max: 'opus', Haiku: 'sonnet' }), (m) =>
      warns.push(m),
    );
    expect(r).toEqual(IDENTITY);
    expect(warns.length).toBe(3);
  });

  it('规则4 非法值 → warn + 该 tier identity', () => {
    const warns: string[] = [];
    expect(resolveModelTiers(cfg({ haiku: 'gpt4' }), (m) => warns.push(m)).haiku).toBe('haiku');
    expect(warns.length).toBe(1);
  });

  it('规则5 升级正确 / 降级被拒(warn + identity)', () => {
    expect(resolveModelTiers(cfg({ haiku: 'opus' }), noop).haiku).toBe('opus');
    expect(resolveModelTiers(cfg({ sonnet: 'opus' }), noop).sonnet).toBe('opus');
    const warns: string[] = [];
    expect(resolveModelTiers(cfg({ sonnet: 'haiku' }), (m) => warns.push(m)).sonnet).toBe('sonnet');
    expect(warns.length).toBe(1);
  });

  it('规则6 opus 恒为 opus(永不被配置影响)', () => {
    expect(resolveModelTiers(cfg({ opus: 'haiku' }), noop).opus).toBe('opus');
    expect(resolveModelTiers(cfg({ haiku: 'opus' }), noop).opus).toBe('opus');
  });

  it('永不抛异常', () => {
    expect(() => resolveModelTiers(cfg(null), noop)).not.toThrow();
    expect(() => resolveModelTiers(cfg({ haiku: 999 }), noop)).not.toThrow();
  });
});

describe('validateModelTierAssignment — 写入侧 fail-fast', () => {
  it('合法:identity 与升级 → ok', () => {
    expect(validateModelTierAssignment('haiku', 'haiku')).toEqual({ ok: true });
    expect(validateModelTierAssignment('haiku', 'sonnet')).toEqual({ ok: true });
    expect(validateModelTierAssignment('haiku', 'opus')).toEqual({ ok: true });
    expect(validateModelTierAssignment('sonnet', 'opus')).toEqual({ ok: true });
  });

  it('invalid-field:tier 非 haiku/sonnet', () => {
    expect(validateModelTierAssignment('opus', 'opus')).toEqual({
      ok: false,
      reason: 'invalid-field',
    });
    expect(validateModelTierAssignment('max', 'sonnet')).toEqual({
      ok: false,
      reason: 'invalid-field',
    });
  });

  it('invalid-value:value 非枚举', () => {
    expect(validateModelTierAssignment('haiku', 'gpt4')).toEqual({
      ok: false,
      reason: 'invalid-value',
    });
  });

  it('downgrade:sonnet→haiku', () => {
    expect(validateModelTierAssignment('sonnet', 'haiku')).toEqual({
      ok: false,
      reason: 'downgrade',
    });
  });

  it('多重非法走优先级:invalid-field 先于 invalid-value', () => {
    expect(validateModelTierAssignment('opus', 'bogus')).toEqual({
      ok: false,
      reason: 'invalid-field',
    });
  });
});

describe('共享常量一致性', () => {
  it('MODEL_TIER_RANK 的键集 == MODEL_TIER_VALUES', () => {
    expect(Object.keys(MODEL_TIER_RANK).sort()).toEqual([...MODEL_TIER_VALUES].sort());
  });
});
```

- [ ] **Step 3: 跑测试,确认失败**

Run: `pnpm vitest run tests/core/schema/model-tiers-config.test.ts`
Expected: FAIL —— 找不到模块 `../../../src/core/schema/model-tiers-config.js`。

- [ ] **Step 4: 写 `model-tiers-config.ts`**

创建 `src/core/schema/model-tiers-config.ts`:

```ts
// model_tiers 配置:读取侧 resolver + 写入侧 validator。
// 读写两侧共享 MODEL_TIER_VALUES / MODEL_TIER_RANK,避免规则漂移。
// 详见 docs/specs/2026-05-17-model-tier-mapping-design.md §2.1。

import type { ForgeConfig, ModelTier } from './types.js';
import { DEFAULT_MODEL_TIERS } from './types.js';

/** 三个合法 model tier 值(单一来源) */
export const MODEL_TIER_VALUES = ['haiku', 'sonnet', 'opus'] as const;

/** tier 强弱序数:升级 = 序数变大;identity = 相等;降级 = 变小 */
export const MODEL_TIER_RANK = { haiku: 0, sonnet: 1, opus: 2 } as const;

/** resolveModelTiers 的返回类型:三档都解析为具体模型 */
export interface ResolvedModelTiers {
  haiku: ModelTier;
  sonnet: ModelTier;
  opus: ModelTier;
}

/** validateModelTierAssignment 的返回类型 */
export type ModelTierAssignmentResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-field' | 'invalid-value' | 'downgrade' };

/** 可重映射的 tier 键(opus 不可重映射,不在内) */
const REMAPPABLE_TIERS = ['haiku', 'sonnet'] as const;

function isModelTier(v: unknown): v is ModelTier {
  return typeof v === 'string' && (MODEL_TIER_VALUES as readonly string[]).includes(v);
}

/**
 * 读取侧:把 ForgeConfig.model_tiers 解析成填满的 { haiku, sonnet, opus }。
 * 永远返回合法值、永不抛异常(配置层 graceful degradation)。
 */
export function resolveModelTiers(
  config: ForgeConfig | undefined,
  warn: (msg: string) => void = (msg) => console.warn(msg),
): ResolvedModelTiers {
  const result: ResolvedModelTiers = { ...DEFAULT_MODEL_TIERS };
  const raw: unknown = config?.model_tiers;

  // 规则2:缺失 → 全 identity(无 warn)
  if (raw === undefined) return result;
  // 规则3:malformed —— model_tiers 不是对象 → 全 identity + warn
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warn('forge config: model_tiers 不是对象,已忽略,全部 tier 按 identity');
    return result;
  }

  const obj = raw as Record<string, unknown>;
  // 规则3:未知键 → 忽略 + warn
  for (const key of Object.keys(obj)) {
    if (key !== 'haiku' && key !== 'sonnet') {
      warn(`forge config: model_tiers.${key} 不是可重映射 tier(仅 haiku/sonnet),已忽略`);
    }
  }

  for (const tier of REMAPPABLE_TIERS) {
    const value = obj[tier];
    if (value === undefined) continue; // 规则2:缺键 → identity
    if (!isModelTier(value)) {
      // 规则4:非法值 → warn + identity
      warn(`forge config: model_tiers.${tier} 值 "${String(value)}" 非法,已按 identity`);
      continue;
    }
    if (MODEL_TIER_RANK[value] < MODEL_TIER_RANK[tier]) {
      // 规则5:降级 → warn + identity
      warn(`forge config: model_tiers.${tier} → ${value} 是降级,已拒绝、按 identity`);
      continue;
    }
    // 规则1:单次查表 —— value 即派发模型,不二次解析
    result[tier] = value;
  }
  // 规则6:result.opus 来自 DEFAULT_MODEL_TIERS,从未被触碰,恒为 'opus'
  return result;
}

/**
 * 写入侧:校验一次 `forge config set model_tiers.<tier> <value>` 赋值。
 * fail-fast —— 不 sanitize。reason 优先级固定:invalid-field → invalid-value → downgrade。
 */
export function validateModelTierAssignment(
  tier: string,
  value: string,
): ModelTierAssignmentResult {
  if (tier !== 'haiku' && tier !== 'sonnet') {
    return { ok: false, reason: 'invalid-field' };
  }
  if (!isModelTier(value)) {
    return { ok: false, reason: 'invalid-value' };
  }
  if (MODEL_TIER_RANK[value] < MODEL_TIER_RANK[tier]) {
    return { ok: false, reason: 'downgrade' };
  }
  return { ok: true };
}
```

- [ ] **Step 5: 在 `index.ts` 导出**

在 `src/core/schema/index.ts` 的 export 列表末尾加一行:

```ts
export * from './model-tiers-config.js';
```

- [ ] **Step 6: 跑测试 + typecheck,确认通过**

Run: `pnpm vitest run tests/core/schema/model-tiers-config.test.ts`
Expected: PASS(全部 it 绿)。

Run: `pnpm typecheck`
Expected: PASS(无类型错误)。

- [ ] **Step 7: Commit**

```bash
git add src/core/schema/types.ts src/core/schema/model-tiers-config.ts src/core/schema/index.ts tests/core/schema/model-tiers-config.test.ts
git commit -m "feat(schema): add model_tiers resolver + validator"
```

---

## Task 2: `forge config` CLI 增强 + CLI 测试

**Files:**
- Modify: `src/cli/commands/config.ts`(整体重写,见 Step 3)
- Test: `tests/cli/config.test.ts`(追加用例)

- [ ] **Step 1: 给 `tests/cli/config.test.ts` 追加 model_tiers 用例**

先把文件顶部的 import 补全(`tests/cli/config.test.ts` 现有 import 只有 `mkdtempSync, rmSync` from `node:fs`),改为:

```ts
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parse as parseYAML } from 'yaml';
```

然后在 `describe('forge config', ...)` 块内、最后一个 `it` 之后追加 Test 4–7:

```ts
  // Test 4: set model_tiers.haiku 写成嵌套结构(不是 flat key)
  it('set model_tiers.haiku 写成嵌套 YAML,get 嵌套读取', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      const s = runCli(['config', 'set', 'model_tiers.haiku', 'sonnet'], d);
      expect(s.exitCode).toBe(0);
      expect(s.stdout).toContain('model_tiers 仅对'); // CC-only 固定提示 substring
      // 关键:验 YAML 是嵌套对象,不是 flat key "model_tiers.haiku"
      // —— 旧 flat 实现会写成 flat key,此断言在 RED 阶段失败
      const parsed = parseYAML(readFileSync(join(d, 'forge', 'config.yaml'), 'utf8')) as Record<
        string,
        unknown
      >;
      expect((parsed.model_tiers as Record<string, unknown> | undefined)?.haiku).toBe('sonnet');
      expect(parsed['model_tiers.haiku']).toBeUndefined();
      const g = runCli(['config', 'get', 'model_tiers.haiku'], d);
      expect(g.exitCode).toBe(0);
      expect(g.stdout).toContain('sonnet');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 5: 三类非法 set —— exit≠0、stderr 含对应 reason、config 文件不变
  it('set model_tiers 非法值 fail-fast(stderr 含 reason、文件 byte-for-byte 不变)', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      runCli(['config', 'set', 'schema', 'forge-spec-driven/v1'], d);
      const cfgPath = join(d, 'forge', 'config.yaml');
      const before = readFileSync(cfgPath);
      const cases: Array<[string, string, string]> = [
        ['model_tiers.opus', 'sonnet', 'invalid-field'],
        ['model_tiers.haiku', 'gpt4', 'invalid-value'],
        ['model_tiers.sonnet', 'haiku', 'downgrade'],
      ];
      for (const [field, value, reason] of cases) {
        const r = runCli(['config', 'set', field, value], d);
        expect(r.exitCode).not.toBe(0);
        expect(r.stderr).toContain(reason); // reason 枚举进 stderr,稳定可断言
      }
      expect(readFileSync(cfgPath).equals(before)).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 6: config.yaml 三类 ConfigParseError 下 set 拒写、文件 byte-for-byte 不变
  it('config.yaml 各类 ConfigParseError 下 set 拒写、文件不变', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      const dir = join(d, 'forge');
      mkdirSync(dir, { recursive: true });
      const cfgPath = join(dir, 'config.yaml');
      // parseConfig 抛 ConfigParseError 的三种情形(见 src/core/parse/yaml.ts)
      const corruptCases = [
        'schema: [unclosed\n  : :\n', // ① YAML 语法错
        'just a scalar string\n', // ② root 非 mapping
        'model_tiers:\n  haiku: sonnet\n', // ③ 缺 schema 字段
      ];
      for (const content of corruptCases) {
        writeFileSync(cfgPath, content);
        const before = readFileSync(cfgPath);
        const r = runCli(['config', 'set', 'model_tiers.haiku', 'sonnet'], d);
        expect(r.exitCode).not.toBe(0);
        expect(readFileSync(cfgPath).equals(before)).toBe(true);
      }
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  // Test 7: get 缺键 → null;损坏 config get 报错;超层/空段点分键 set 拒绝且文件不变
  it('get 缺键 → null;损坏 config get 报错;超层/空段点分键 set 拒绝且文件不变', () => {
    const d = mkdtempSync(join(tmpdir(), 'forge-config-'));
    try {
      runCli(['config', 'set', 'schema', 'forge-spec-driven/v1'], d);
      const cfgPath = join(d, 'forge', 'config.yaml');
      const miss = runCli(['config', 'get', 'model_tiers.haiku'], d);
      expect(miss.exitCode).toBe(0);
      expect(miss.stdout.trim()).toBe('null'); // 缺键 → raw null
      // 超层 / 空段点分键 set 一律拒绝,且 config 文件 byte-for-byte 不变
      const before = readFileSync(cfgPath);
      for (const bad of ['model_tiers.haiku.x', '.haiku', 'model_tiers.']) {
        const r = runCli(['config', 'set', bad, 'sonnet'], d);
        expect(r.exitCode).not.toBe(0);
      }
      expect(readFileSync(cfgPath).equals(before)).toBe(true);
      // 损坏 config → get 照常报错
      writeFileSync(cfgPath, 'schema: [unclosed\n');
      const g = runCli(['config', 'get', 'schema'], d);
      expect(g.exitCode).not.toBe(0);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
```

- [ ] **Step 2: 构建并跑测试,确认失败**

Run: `pnpm build && pnpm vitest run tests/cli/config.test.ts`
Expected: FAIL —— 旧 `config.ts` 是 flat set/get,以下用例在 RED 阶段失败:**Test 4**(旧 `set` 把 `model_tiers.haiku` 写成 flat key → `parsed.model_tiers` 为 `undefined`,且无 CC-only 提示);**Test 5**(旧 `set` 无校验 → 非法值不被拒、stderr 无 reason);**Test 7 的「超层/空段点分键 set 应拒绝」**(旧 flat `set` 把它们当 flat key 写入、exit 0)。
> 注:**Test 6**(三类 `ConfigParseError` 下 `set` 拒写)与 **Test 7 的「缺键→null」「损坏 config→get 报错」**在旧实现下**本就通过**(旧 `set`/`get` 已先调 `parseConfig`)—— 它们是**回归守护**用例,不作为 RED 驱动。

- [ ] **Step 3: 重写 `src/cli/commands/config.ts`**

把 `src/cli/commands/config.ts` 整体替换为:

```ts
// forge config 子命令 — 管理 forge/config.yaml
// 支持 get/set;支持一层点分嵌套键(如 model_tiers.haiku);model_tiers.* 走 fail-fast 校验

import { Command } from 'commander';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../../core/parse/index.js';
import { validateModelTierAssignment } from '../../core/schema/index.js';
import { stringify as stringifyYAML } from 'yaml';

type FieldPath = { kind: 'flat'; key: string } | { kind: 'nested'; ns: string; leaf: string };

/**
 * 把 field 解析为 flat 或一层嵌套键。
 * 用 indexOf/slice(而非 split)—— slice 返回 string,规避 tsconfig 的 noUncheckedIndexedAccess。
 * 超过一层(`a.b.c`)、空段(`.haiku` / `model_tiers.` / `model_tiers..x`)、空 field → 抛错 fail-fast。
 */
function parseField(field: string): FieldPath {
  const dot = field.indexOf('.');
  if (dot === -1) {
    if (field.length === 0) throw new Error('forge config: field 不能为空');
    return { kind: 'flat', key: field };
  }
  const ns = field.slice(0, dot);
  const leaf = field.slice(dot + 1);
  if (ns.length === 0 || leaf.length === 0 || leaf.includes('.')) {
    throw new Error(`forge config: 非法的点分键 (${field}) —— 只支持一层、且段不可为空`);
  }
  return { kind: 'nested', ns, leaf };
}

export function buildConfigCommand(): Command {
  const cmd = new Command('config').description('Manage forge/config.yaml');

  // forge config get <field> —— 支持一层点分嵌套键的 raw 读取
  cmd
    .command('get <field>')
    .description(
      'Read a config field (supports one-level dotted keys, e.g. model_tiers.haiku). ' +
        'A missing key prints null; null means unset/identity.',
    )
    .action(async (field: string) => {
      const path = join(process.cwd(), 'forge', 'config.yaml');
      if (!existsSync(path)) throw new Error(`forge/config.yaml not found at ${path}`);
      // parse 失败 → parseConfig 抛 ConfigParseError → 照常报错(get 是诊断命令)
      const config = parseConfig(await readFile(path, 'utf8')) as unknown as Record<
        string,
        unknown
      >;
      const fp = parseField(field);
      let value: unknown;
      if (fp.kind === 'flat') {
        value = config[fp.key];
      } else {
        const ns = config[fp.ns];
        value =
          ns && typeof ns === 'object' && !Array.isArray(ns)
            ? (ns as Record<string, unknown>)[fp.leaf]
            : undefined;
      }
      console.log(JSON.stringify(value ?? null, null, 2));
    });

  // forge config set <field> <value> —— 一层点分嵌套键;model_tiers.* 走 fail-fast 校验
  cmd
    .command('set <field> <value>')
    .description('Write a config field (supports one-level dotted keys, e.g. model_tiers.haiku)')
    .action(async (field: string, value: string) => {
      const dir = join(process.cwd(), 'forge');
      const path = join(dir, 'config.yaml');

      // 阶段①:先 parse 现有 config —— parse 失败 → ConfigParseError 抛出 → fail-fast,文件不动
      // (spec §2.1:config parse 优先于 field 校验)
      let config: Record<string, unknown>;
      if (existsSync(path)) {
        config = parseConfig(await readFile(path, 'utf8')) as unknown as Record<string, unknown>;
      } else {
        config = { schema: 'forge-spec-driven/v1' };
      }

      // 阶段②:parse 成功后才解析 field(空段 / 超过一层 → 抛错 fail-fast)
      const fp = parseField(field);

      // model_tiers 必须用 model_tiers.<tier> 二段形式;作 flat key → 拒绝
      if (fp.kind === 'flat' && fp.key === 'model_tiers') {
        throw new Error('forge config set: model_tiers 必须用 model_tiers.<tier> 形式');
      }
      // 阶段②:model_tiers.<leaf> 赋值 → 写入侧 fail-fast 校验
      let isModelTierKey = false;
      if (fp.kind === 'nested' && fp.ns === 'model_tiers') {
        isModelTierKey = true;
        const check = validateModelTierAssignment(fp.leaf, value);
        if (!check.ok) {
          throw new Error(
            `forge config set: model_tiers.${fp.leaf} = ${value} 非法 (${check.reason})`,
          );
        }
      }

      // 写入
      await mkdir(dir, { recursive: true });
      if (fp.kind === 'nested') {
        const cur = config[fp.ns];
        const nsObj =
          cur && typeof cur === 'object' && !Array.isArray(cur)
            ? (cur as Record<string, unknown>)
            : {};
        nsObj[fp.leaf] = value;
        config[fp.ns] = nsObj;
      } else {
        config[fp.key] = value;
      }
      await writeFile(path, stringifyYAML(config), 'utf8');
      console.log(`set ${field} = ${value}`);
      if (isModelTierKey) {
        console.log(
          'note: model_tiers 仅对直接传 model 参数的 harness(如 Claude Code)生效;OpenCode/Codex 请改 agent 定义。',
        );
      }
    });

  return cmd;
}
```

> 设计要点:① `parseField` 用 `indexOf`/`slice` 而非 `split` —— `slice` 返回 `string`,不触发 `noUncheckedIndexedAccess`(`tsconfig.json` 已开)的 `string|undefined`;② `parseField` 对超过一层(`a.b.c`)、空段(`.x` / `model_tiers.` / `model_tiers..x`)、空 `field` 一律 fail-fast 抛错;`model_tiers` 当 flat key 也拒绝;合法的 `model_tiers.<tier>` 才拆 leaf 交 `validateModelTierAssignment`(`tier` 非 `haiku`/`sonnet` → `invalid-field`),错误来源单一;③ **`set` 严格两阶段(spec §2.1):先 `parseConfig`(`config.yaml` 损坏 → 抛 `ConfigParseError` → fail-fast,文件不动),parse 成功后才 `parseField` + `validateModelTierAssignment`** —— 全部在 `writeFile` 之前;④ `throw new Error` 在 commander action 里 → exit 非 0 + stderr 含错误信息(其中含 `reason`;沿现有 `get` 报「not found」同款行为)。

- [ ] **Step 4: 构建并跑测试,确认通过**

Run: `pnpm build && pnpm vitest run tests/cli/config.test.ts`
Expected: PASS(Test 1–7 全绿)。

Run: `pnpm typecheck`
Expected: PASS(`parseField` 用 `slice` 取值,无 `noUncheckedIndexedAccess` 报错)。

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/config.ts tests/cli/config.test.ts
git commit -m "feat(cli): forge config 支持点分键 + model_tiers 校验"
```

---

## Task 3: discipline SKILL.md —— 治理段 + Platform Note + references + 同步 build

**Files:**
- Modify: `skills/subagent-driven-discipline/SKILL.md`
- Modify: `skills/subagent-driven-discipline/references/codex-tools.md`
- Modify: `skills/subagent-driven-discipline/references/opencode-tools.md`

- [ ] **Step 1: 插入 `## Model Tier 映射` 治理段**

在 `skills/subagent-driven-discipline/SKILL.md` 中,「何时启用」段之后那条 `---` 与 `## §1 Subagent Scenario Taxonomy` 之间,插入下面整段(注意:这段会原样进 SKILL.md,**不含**任何指向本设计文档的引用):

````markdown
## Model Tier 映射(`haiku`/`sonnet`/`opus` 是 tier 标签)

本 skill §1 taxonomy 与 §2 playbook 用 `haiku` / `sonnet` / `opus` 标注每个 task 子类的 model tier。**这三个词是 tier 标签**(cheap / standard / most-capable 三档),默认对应同名 Claude 模型,但 `haiku` / `sonnet` 两档实际派发哪个模型可被项目配置重映射。

**实际模型的解析(controller 在 dispatch subagent 前必做)**:

- 读取项目 `forge/config.yaml` 的 `model_tiers` 段:
  ```yaml
  model_tiers:
    haiku: sonnet # haiku 档改用 sonnet 模型派发
  ```
- §1 标 `haiku` / `sonnet` 的子类 → 实际传 `model_tiers` 解析后的模型;§1 标 `opus` 的子类**恒派 `opus`**(`opus` 不可重映射)。
- **单次查表**:`model_tiers.haiku` 的值是要派发的*具体模型*,不再二次解析(`{haiku: sonnet}` → haiku 档派 `sonnet` 模型)。
- `model_tiers` 整段缺失、某键缺失、`forge/config.yaml` 不存在或无法解析 → 该 tier **恒等**(标签即模型,等于现状)。
- **遇非法值、降级映射(如 `sonnet: haiku`)、或 malformed `model_tiers`** → 该 tier **回退恒等派发**,并在回复里**明确提示用户该配置项无效**(否则用户会以为生效、难以排查)。
- 「把 cheap 档统一抬到 standard」(成本换质量的常见诉求)→ `model_tiers: { haiku: sonnet }`。

**操作化 4 步**(dispatch 前):① 读 `forge/config.yaml` 的 `model_tiers`;② §1 标 `haiku`/`sonnet` 的子类查表得实际模型,§1 标 `opus` 的子类恒 `opus`;③ 配置项无效 / 降级 / malformed / 文件不存在或无法解析 → 用 identity 并向用户提示;④ dispatch 时把解析出的模型传给 `model` 参数。

**按 harness 的差异**:

- **Claude Code** 等直接给 Task/Agent 工具传 `model` 参数的 harness —— `model_tiers` 在此生效;取值限 `haiku`/`sonnet`/`opus`(该工具仅这三个 Claude 模型)。
- **OpenCode / Codex** 等 subagent 由独立 agent 定义携带 `model:` 的 harness —— controller 不传 model 参数,`model_tiers` config 在此**不生效**;重映射直接在 agent 定义文件里改 `model:`。

**约束**:`opus`(§1.1.4 / §1.1.5 等 design 类的 MANDATORY tier)**不可重映射,恒派 `opus`** —— design 任务不可降级是 §1 绝对原则。`haiku` / `sonnet` 的重映射**只允许 identity 或升级**(保持原档,或 `haiku`→更强档、`sonnet`→`opus`),不允许降级(`sonnet`→`haiku` 会让 §1.3.4 等 MANDATORY-sonnet 子类失守)。§2「Haiku Reliability Playbook」各节的严格 prompt 纪律,对 tier 解析后的实际模型继续适用。

recovery / case study / catalog 等历史记录章节里出现的模型名是过去实际跑过的事实档案,不受 `model_tiers` 影响、不改写。
````

> 实现者:上面 ````markdown ... ```` 之间的内容是要插入的最终文本(从 `## Model Tier 映射` 标题行起,到末尾 `不改写。` 句止)。该段须与 **Task 5 Step 3** 插入 `.claude/` 副本的文本**逐字一致**(Task 5 的 parity test 会自动校验)。

- [ ] **Step 2: 修正 `## Platform Note`**

在 `skills/subagent-driven-discipline/SKILL.md` 的 `## Platform Note` 段,找到这一句:

```
§1 28-subtype taxonomy, §3.2 cross-verify, §4 recovery, §5 case studies, §6 pattern catalog are **platform-independent** and apply verbatim on every harness. Only the dispatch / file / shell tool names differ.
```

替换为:

```
§1 28-subtype taxonomy, §3.2 cross-verify, §4 recovery, §5 case studies, §6 pattern catalog 的**任务分类结构与 prompt 纪律**跨 harness、跨模型 provider 通用,apply verbatim on every harness —— 只有 dispatch / file / shell 工具名不同。**注**:§1 的 model tier 列 `haiku`/`sonnet`/`opus` 是 **tier 标签**(默认对应同名 Claude 模型),标签到具体模型的解析按 harness / `model_tiers` 配置不同 —— 详见 `## Model Tier 映射` 段。即:tier *分类结构* 跨 harness 跨 provider 通用,tier *标签→具体模型* 的对应才是 per-harness/per-config 的。
```

- [ ] **Step 3: 给两个 references 文件补澄清注**

两个 references 文件都有一段 `## What still works exactly as written`,正文是一个段落、以 `... apply verbatim.`(codex-tools.md)/ `... apply verbatim on OpenCode.`(opencode-tools.md)结尾。在**每个文件**那个段落之后(下一个 `## ` 标题之前;codex-tools.md 中该段落是文件最后内容)**另起一行**插入同一句澄清注:

```
> 注:此处「platform-independent」指跨 *harness* 通用;§1 的 model tier 列 `haiku`/`sonnet`/`opus` 是 tier 标签,默认对应同名 Claude 模型,实际派发模型按 harness / `forge/config.yaml#model_tiers` 解析(见 SKILL.md `## Model Tier 映射` 段)。
```

具体锚点:
- `codex-tools.md` —— 追加在 `... and apply verbatim.` 这一行之后(该行是文件正文末行)。
- `opencode-tools.md` —— 追加在 `... and apply verbatim on OpenCode.` 这一行之后、`## OpenCode-specific advantages this skill exploits` 标题之前。

- [ ] **Step 4: 升 discipline frontmatter version**

在 `skills/subagent-driven-discipline/SKILL.md` 的 frontmatter `metadata:` 块,把:

```
  version: '1.0-generic'
```

改为:

```
  version: '1.1-generic'
```

- [ ] **Step 5: `pnpm build` 同步模板**

Run: `pnpm build`
Expected: 成功;`scripts/copy-templates.mjs` 把 `skills/subagent-driven-discipline/` 反向同步到 `src/core/templates/skills/` 与 `dist/`。

- [ ] **Step 6: 验证治理段 / Platform Note / references 改动都已落地 + 模板测试 + format**

用 `rg` 核验(`grep` 在 Win/PowerShell 不一定可用 —— forge 生态默认 `rg`):

```bash
# ① 治理段在源 + build 同步后的模板里都在
rg "## Model Tier 映射" skills/subagent-driven-discipline/SKILL.md src/core/templates/skills/subagent-driven-discipline.md
# ② Platform Note 已改成新句
rg "per-harness/per-config" skills/subagent-driven-discipline/SKILL.md
# ③ 旧 Platform Note 句已消失(下面这条应无任何输出)
rg "Only the dispatch / file / shell tool names differ" skills/subagent-driven-discipline/SKILL.md
# ④ 两个 references 文件都插入了澄清注
rg "forge/config.yaml#model_tiers" skills/subagent-driven-discipline/references/codex-tools.md skills/subagent-driven-discipline/references/opencode-tools.md
```

Expected:① 两文件各有匹配行;② 有匹配;③ **无输出**(旧句已被替换);④ 两个 references 文件各有匹配。任一不符 → 对应改动漏做或漏 build。

Run: `pnpm vitest run tests/core/templates/skills.test.ts`
Expected: PASS(frontmatter / references 镜像校验通过)。

Run: `pnpm format:check`
Expected: PASS(prettier;CI 硬门槛)。若失败:**只**对本 task 改的源文件跑
`pnpm exec prettier --write skills/subagent-driven-discipline/SKILL.md skills/subagent-driven-discipline/references/codex-tools.md skills/subagent-driven-discipline/references/opencode-tools.md`
(**不要**跑全仓 `pnpm format`,以免把本 task 范围外的文件格式化改动卷进 commit),然后**重跑 `pnpm build`**(让模板反映格式化后的源),再 `pnpm format:check`。

- [ ] **Step 7: Commit**

```bash
git add skills/subagent-driven-discipline/ src/core/templates/skills/subagent-driven-discipline.md src/core/templates/skills/subagent-driven-discipline/
git commit -m "feat(discipline): 加 Model Tier 映射治理段 + 修 Platform Note"
```

> `pnpm build` 把 discipline SKILL.md 同步成 `src/core/templates/skills/subagent-driven-discipline.md`,把 `references/` 同步成 `src/core/templates/skills/subagent-driven-discipline/references/` —— 两处都要 `git add`。`dist/` 是 gitignore 产物,不提交。

---

## Task 4: SDD SKILL.md —— matrix→指针 + Companion 分支 + dispatch 注释 + 同步 build

**Files:**
- Modify: `skills/subagent-driven-development/SKILL.md`

- [ ] **Step 1: `model 选型 matrix` 替换为指针**

在 `skills/subagent-driven-development/SKILL.md` 的 `## How to Dispatch` 段,找到这块(`**model 选型 matrix**` 起、`opus` 那条 bullet 止):

```
**model 选型 matrix**(沿 forge:subagent-driven-discipline §1 taxonomy):

- **`haiku`** — Mechanical tasks(完整 inline code + 全 fence test 名 + commit message 模板;无 design judgment)
- **`sonnet`** — Multi-file integration / Pattern-matching / 所有 review(spec_reviewer + code_quality_reviewer + adversarial review)
- **`opus`** — Architectural / 跨子系统 / 新 ABC / design 类(MANDATORY,绝对原则)
```

整块替换为:

```
**model 选型**:每个 task 的 model tier 依据 `forge:subagent-driven-discipline` §1 task-type taxonomy。§1 的 `haiku`/`sonnet`/`opus` 是 tier 标签 —— 在 Claude Code 等直接传 `model` 参数的 harness 上,实际模型经 discipline 的 `model_tiers` 配置解析(默认恒等);在 OpenCode/Codex 等 harness 上,经 subagent agent 定义的 `model:` 解析。本 skill 不单列 model tier 摘要,以免与 discipline §1 漂移。粗粒度直觉见上方 `## Model Selection`。
```

- [ ] **Step 2: 更新 `## Companion Skill` 的「若不存在」分支**

在 `## Companion Skill` 段找到「若不存在」那条 bullet:

```
- **若不存在** → 本 skill 内联的 model 选型 matrix / cross-verify 五类 / decision tree 已自足;仅凭本 skill 继续执行即可。
```

替换为:

```
- **若不存在** → model tier 选型回退到本 skill `## Model Selection` 的粗粒度直觉(cheap↔`haiku` / standard↔`sonnet` / most-capable↔`opus`);cross-verify 五类与 decision tree 仍由本 skill 内联段自足(这两段本就 harness/模型无关)。仅凭本 skill 继续执行即可。
```

- [ ] **Step 3: 补 dispatch 代码块注释**

在 `## How to Dispatch` 的 dispatch 代码块,找到这一行:

```
  model: <haiku | sonnet | opus>  # 按 task subtype 选;不传则 inherit 父 session 浪费 cost
```

替换为:

```
  model: <haiku | sonnet | opus>  # 按 task subtype 选(实际模型见 forge:subagent-driven-discipline 的「Model Tier 映射」段);不传则 inherit 父 session 浪费 cost
```

> SDD frontmatter 无 `version` 字段(只有 `name` + `description`)—— 不新增、不动。spec §3 提到的 version 升级仅适用于有该字段的 discipline(Task 3 已做)。

- [ ] **Step 4: `pnpm build` 同步模板 + 验证文案改动 + 测试 + format**

Run: `pnpm build`
Expected: 成功(`skills/subagent-driven-development/SKILL.md` 同步到 `src/core/templates/skills/subagent-driven-development.md`)。

用 `rg` 核验改动落地(模板结构测试不会抓 SDD 文案删改,须显式核验):

```bash
# 指针已替换 matrix(新句在)
rg "本 skill 不单列 model tier 摘要" skills/subagent-driven-development/SKILL.md
# 旧的 model 选型 matrix 标题已消失(下面这条应无输出)
rg "model 选型 matrix" skills/subagent-driven-development/SKILL.md
```

Expected:第一条有匹配;第二条**无输出**(`model 选型 matrix` 段已被指针替换)。

Run: `pnpm vitest run tests/core/templates/skills.test.ts`
Expected: PASS。

Run: `pnpm format:check`
Expected: PASS。若失败:只对 `skills/subagent-driven-development/SKILL.md` 跑 `pnpm exec prettier --write skills/subagent-driven-development/SKILL.md`,然后重跑 `pnpm build`,再 `pnpm format:check`。

- [ ] **Step 5: Commit**

```bash
git add skills/subagent-driven-development/ src/core/templates/skills/subagent-driven-development.md
git commit -m "refactor(sdd): model 选型 matrix 改为指向 discipline §1"
```

---

## Task 5: 两副本治理段 parity test + `.claude/` 副本同步

**Files:**
- Modify: `tests/core/templates/skills.test.ts`
- Modify: `.claude/skills/subagent-driven-discipline/SKILL.md`

- [ ] **Step 1: 在 `skills.test.ts` 加 parity test**

在 `tests/core/templates/skills.test.ts` 末尾(最后一个 `describe` 之后)追加。先确认文件顶部已 import `readFileSync`(from `node:fs`)、`join`(from `node:path`)(若缺则补);然后加:

```ts
describe('Model Tier 映射 —— discipline 两副本 parity', () => {
  const repoRoot = join(__dirname, '../../../skills/subagent-driven-discipline/SKILL.md');
  const dogfood = join(__dirname, '../../../.claude/skills/subagent-driven-discipline/SKILL.md');

  // 抽取 `## Model Tier 映射` 段:从该二级标题行(含)起,到下一个二级标题(`## `)或文件末尾止
  function extractGovernanceSection(filePath: string): string {
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith('## Model Tier 映射'));
    if (start === -1) return ''; // 抽不到 → 空串,断言必失败(预期的 drift 告警)
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        end = i;
        break;
      }
    }
    return lines.slice(start, end).join('\n').trimEnd();
  }

  // 抽取 Platform Note 里以 "§1 28-subtype taxonomy" 开头的那一行(修正前后都以此开头)
  function extractPlatformNoteLine(filePath: string): string {
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
    return lines.find((l) => l.startsWith('§1 28-subtype taxonomy')) ?? '';
  }

  it('两副本的 `## Model Tier 映射` 治理段逐字一致', () => {
    // 标题层级 / 重命名导致抽取不到 → 测试硬失败,即预期的 drift 告警,须人工对齐
    const a = extractGovernanceSection(repoRoot);
    const b = extractGovernanceSection(dogfood);
    expect(a.length).toBeGreaterThan(0); // repo-root 必须含治理段
    expect(b).toBe(a); // .claude/ 副本逐字一致
  });

  it('两副本的 Platform Note 修正句逐字一致、且确为修正后的新句', () => {
    const a = extractPlatformNoteLine(repoRoot);
    const b = extractPlatformNoteLine(dogfood);
    expect(a.length).toBeGreaterThan(0); // repo-root 必须含该句
    // 确认 repo-root 确为修正后的新句 —— 否则两副本同为旧句时 b===a 也会误绿
    expect(a).toContain('per-harness/per-config');
    expect(a).not.toContain('Only the dispatch / file / shell tool names differ');
    expect(b).toBe(a); // .claude/ 副本逐字一致
  });
});
```

> `__dirname` 在 `tests/core/templates/` 下,`../../../` 回到仓库根 —— `tests/cli/helpers.ts` 已证实 forge 测试文件可直接用 `__dirname`。
> Platform Note 那一行修正前在两副本里本就 byte-identical(已核实);故 Task 3 修了 repo-root、Task 5 Step 3 未修 `.claude/` 之间,该 parity `it` 会失败 —— 正是 Task 5 的 RED。

- [ ] **Step 2: 跑 parity test,确认失败**

Run: `pnpm vitest run tests/core/templates/skills.test.ts -t "discipline 两副本 parity"`
Expected: 两个 `it` 都 FAIL —— 治理段:`.claude/` 副本尚无 `## Model Tier 映射`,`extractGovernanceSection` 返回空串;Platform Note:Task 3 已把 repo-root 的修正句改成新句,`.claude/` 仍是旧句,`expect(b).toBe(a)` 失败。

- [ ] **Step 3: 把治理段 + Platform Note 修正同步进 `.claude/` 副本**

`.claude/skills/subagent-driven-discipline/SKILL.md` 是 forge-repo 自身 dogfood 工作副本(与 generic 版有意分叉,不在 `pnpm build` 管线内)。对它做**且仅做**两处改动:

1. **插入 `## Model Tier 映射` 治理段** —— 文本与 Task 3 Step 1 的 ````markdown```` 块**逐字一致**。插入位置:在「核心立场 / 何时启用」段之后那条 `---` 与 `## §1` 之间。
2. **修正 `## Platform Note`** —— 该副本里待改的那一行与 repo-root **byte-identical**(已核实,原文为):

   ```
   §1 28-subtype taxonomy, §3.2 cross-verify, §4 recovery, §5 case studies, §6 pattern catalog are **platform-independent** and apply verbatim on every harness. Only the dispatch / file / shell tool names differ.
   ```

   **应用与 Task 3 Step 2 完全相同的替换** —— 把上面这行换成 Task 3 Step 2 给出的同一条新句(逐字相同)。

其 §1 表格、§5 case study 等其它内容**一律不动**;该副本无 SDD 配套,不涉及 Task 4 的改动。两处改动后,Task 5 Step 1 的两个 parity `it` 都应转绿。

- [ ] **Step 4: 跑 parity test,确认通过**

Run: `pnpm vitest run tests/core/templates/skills.test.ts`
Expected: PASS(parity test 绿 + 原有模板测试不回归)。

- [ ] **Step 5: Commit**

```bash
git add tests/core/templates/skills.test.ts .claude/skills/subagent-driven-discipline/SKILL.md
git commit -m "test(templates): 加治理段 parity test + 同步 .claude/ 副本"
```

---

## Task 6: CHANGELOG + 全量 CI 验证

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: 加 CHANGELOG 条目**

在 `CHANGELOG.md` 的未发布段(`## [Unreleased]` 或仓库现用的等价段;若无则按 Keep a Changelog 格式新建该段),在 `### Added` 下加一条、`### Changed` 下加一条(无对应子段则新建):

`### Added`:

```
- `forge/config.yaml` 新增 `model_tiers` 配置:把 `forge:subagent-driven-discipline` §1 的 `haiku`/`sonnet` model tier 重映射到实际派发模型(默认恒等、不改变现状)。`forge config set model_tiers.<tier> <model>` 写入。**仅对直接传 `model` 参数的 harness(如 Claude Code)生效**;把 `haiku`/`sonnet` 档映射到更强模型会抬高 token / 调用成本。`opus` 档不可重映射。
```

`### Changed`:

```
- `forge:subagent-driven-development` 的 model 选型不再内联 matrix,改为指向 `forge:subagent-driven-discipline` §1 + `model_tiers` 配置(消除两 skill 的 model tier 摘要漂移)。`forge:subagent-driven-discipline` 的 §1 `haiku`/`sonnet`/`opus` 明确为 tier 标签,`## Platform Note` 措辞修正(区分跨 harness 与跨模型 provider)。
```

- [ ] **Step 2: 全量跑 CI 五步,确认全绿**

按 CI 顺序依次跑(任一失败即停下排查,不要继续):

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm build
pnpm test
```

Expected: 五步全绿。`pnpm test` 含新加的 `model-tiers-config.test.ts`、`config.test.ts` 新用例、`skills.test.ts` parity test。

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): 记录 model_tiers 配置"
```

---

## 验收证据(实现完成后整理)

按 spec §5 步骤 7,验收报告附:
- `resolveModelTiers` / `validateModelTierAssignment` 测试输出;
- `tests/cli` model_tiers 用例结果摘录(Test 4 nested 结构 / Test 5 三类 reason / Test 6 三类 `ConfigParseError`(YAML 语法错 / root 非 mapping / 缺 schema)下 set 文件不变 / Test 7 缺键 null);
- 两副本 parity test 结果(治理段 + Platform Note 修正句各一个 `it`);
- discipline 治理段最终文本、Platform Note diff(repo-root **与** `.claude/` 副本各一份,人工确认两份修正一致)、SDD 指针 diff、`.claude/` 副本治理段 diff;
- `pnpm build` 与 `pnpm test` 输出。
- **负面证据(必写)**:本次未做「controller 在某 `model_tiers` 配置下实际派对模型」的自动化行为验证 —— 这是 advisory skill 的固有边界(spec §5 步骤 6 / §6),不得让「`pnpm test` 全绿」被误读为端到端功能已验证。
