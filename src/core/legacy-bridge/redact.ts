// 发 LLM 前敏感数据 mask — Plan 7 Phase B1
// spec §4.5 12 类默认规则 + 用户自补 + <<REDACTED-{n}>> 占位 + --redact-report 命中数

import type { RedactRule } from './types.js';

/** 内置默认规则(12+ 类,spec §4.5 完整列表) */
export const DEFAULT_REDACT_RULES: ReadonlyArray<{ name: string; regex: string }> = [
  // 云厂商 secret
  { name: 'aws-access-key', regex: 'AKIA[0-9A-Z]{16}' },
  { name: 'gcp-api-key', regex: 'AIza[0-9A-Za-z_-]{35}' },
  {
    name: 'azure-conn-string',
    regex: 'DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9+/=]+',
  },
  // 代码托管 / 协作工具 token
  { name: 'github-pat', regex: 'gh[poursr]_[A-Za-z0-9]{36,}' },
  { name: 'gitlab-pat', regex: 'glpat-[A-Za-z0-9_-]{20,}' },
  { name: 'slack-token', regex: 'xox[bpoa]-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{20,}' },
  { name: 'oauth-bearer-basic', regex: '(Bearer|Basic)\\s+[A-Za-z0-9._~+/=-]{20,}' },
  // 身份验证
  { name: 'jwt', regex: 'eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+' },
  {
    name: 'private-key-marker',
    regex: '-----BEGIN (RSA|EC|OPENSSH|DSA|ENCRYPTED) PRIVATE KEY-----',
  },
  // 数据库连接
  {
    name: 'db-url-with-creds',
    regex: '(postgres|mysql|mongodb|redis)(\\+[a-z]+)?://[^:\\s]+:[^@\\s]+@[^/\\s]+',
  },
  // 通用 PII
  // I-1 修:TLD 上限放到 24(覆盖 .museum/.travel/.coffee/.solutions/.technology/.westeurope 等现代 TLD;ICANN 上限 24)
  { name: 'email', regex: '[\\w.-]+@[\\w.-]+\\.[a-z]{2,24}' },
  // C-2 修:三分支拆开,各自要求完整 4 段 IP;原 regex `(?:..)\.\d.\d(?:\.\d)?` 让 `10.x.y` 也命中,
  // brownfield 文档中 semver `version 10.1.2` 会被误报。修后只匹配真 IPv4 私网地址。
  {
    name: 'ipv4-private',
    regex:
      '(?:10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}|192\\.168\\.\\d{1,3}\\.\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])\\.\\d{1,3}\\.\\d{1,3})',
  },
];

/** redact 输出含命中数(用于 --redact-report) */
export interface RedactReport {
  /** 每条规则命中次数(name -> count) */
  hitsByRule: Record<string, number>;
  /** 总占位数 */
  totalReplacements: number;
  /** mask 后的文本 */
  redactedText: string;
}

/**
 * 对 input 跑 redact,返回 mask 后文本 + 命中数。
 *
 * 占位格式:`<<REDACTED-{n}>>`(n 从 1 起递增)。同一规则匹配多处 → n 也递增,
 * 让 LLM 能区分多处占位但不暴露原值(spec §4.5)。
 *
 * @param input  原始文本
 * @param custom 用户自补规则(legacy-anchors.yaml 的 redact 字段)
 */
export function redact(input: string, custom: ReadonlyArray<RedactRule> = []): RedactReport {
  const allRules: { name: string; regex?: RegExp; literal?: string }[] = [];

  // 默认规则在前(模块顶层 string;此处编译为 RegExp 实例)
  for (const r of DEFAULT_REDACT_RULES) {
    allRules.push({ name: r.name, regex: new RegExp(r.regex, 'g') });
  }
  // 用户自补;C-3 修:无效 regex 抛 SyntaxError 时包装上下文(rule name + raw regex)
  for (const r of custom) {
    if ('regex' in r) {
      const ruleName = r.name ?? 'custom-regex';
      let compiled: RegExp;
      try {
        compiled = new RegExp(r.regex, 'g');
      } catch (err) {
        throw new Error(
          `[redact] custom rule "${ruleName}" 含非法 regex "${r.regex}":${(err as Error).message}`,
        );
      }
      allRules.push({ name: ruleName, regex: compiled });
    } else {
      allRules.push({ name: r.name ?? 'custom-literal', literal: r.literal });
    }
  }

  const hitsByRule: Record<string, number> = {};
  let counter = 0;
  let text = input;

  for (const rule of allRules) {
    if (rule.regex) {
      text = text.replace(rule.regex, () => {
        counter += 1;
        hitsByRule[rule.name] = (hitsByRule[rule.name] ?? 0) + 1;
        return `<<REDACTED-${counter}>>`;
      });
    } else if (rule.literal) {
      // C-1 修:用 split + reduce 替代 while+includes+replace。
      // 原写法在 literal 是占位字符串子串(如 'REDACTED' / '<<' / 'ED')时无限循环 —
      // match 后产生的 '<<REDACTED-N>>' 又含 literal,while 永真。
      // split 一次性切分,从根本不再扫描已替换的 placeholder。
      const literal = rule.literal;
      if (literal && text.includes(literal)) {
        const parts = text.split(literal);
        const stitched: string[] = [parts[0] ?? ''];
        for (let i = 1; i < parts.length; i += 1) {
          counter += 1;
          hitsByRule[rule.name] = (hitsByRule[rule.name] ?? 0) + 1;
          stitched.push(`<<REDACTED-${counter}>>`, parts[i] ?? '');
        }
        text = stitched.join('');
      }
    }
  }

  return {
    hitsByRule,
    totalReplacements: counter,
    redactedText: text,
  };
}

/** 把 RedactReport 渲染为 stdout 可读形式(--redact-report) */
export function formatRedactReport(report: RedactReport): string {
  const lines: string[] = [];
  // hitsByRule 仅在 match 时 +1 写入,值最小 1;所以无需 0 跳过判断(M-1 修:删死代码)
  for (const [name, count] of Object.entries(report.hitsByRule)) {
    lines.push(`[redact] ${name.padEnd(24)} ${count} 命中`);
  }
  // 0 命中规则也列(用户能验证规则真生效)
  for (const r of DEFAULT_REDACT_RULES) {
    if (!(r.name in report.hitsByRule)) {
      lines.push(`[redact] ${r.name.padEnd(24)} 0 命中`);
    }
  }
  lines.push(`total: ${report.totalReplacements} 项已 mask 为 <<REDACTED-N>>`);
  return lines.join('\n');
}
