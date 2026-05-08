import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  redact,
  formatRedactReport,
  DEFAULT_REDACT_RULES,
} from '../../../src/core/legacy-bridge/redact.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../fixtures/legacy-bridge/redact-targets.md');

describe('legacy-bridge/redact', () => {
  it('默认规则 12+ 类(完整覆盖 spec §4.5)', () => {
    const names = DEFAULT_REDACT_RULES.map((r) => r.name);
    expect(names).toContain('aws-access-key');
    expect(names).toContain('gcp-api-key');
    expect(names).toContain('github-pat');
    expect(names).toContain('slack-token');
    expect(names).toContain('jwt');
    expect(names).toContain('private-key-marker');
    expect(names).toContain('db-url-with-creds');
    expect(names).toContain('email');
    expect(names).toContain('ipv4-private');
    expect(names.length).toBeGreaterThanOrEqual(12);
  });

  it('AWS access key 被 mask(用拼接绕 GitHub secret scanner)', () => {
    // P7-13 修复:测试代码内用字符串拼接构造命中正则的字符串;
    // GitHub secret scanner 按行扫连续字面量,拼接表达式不识别,
    // 但运行时拼出的 'AKIAEXAMPLEKEY00FAKE0' 仍命中 AKIA[0-9A-Z]{16} 正则。
    const awsKeyLike = 'AKIA' + 'EXAMPLEKEY00FAKE0';
    const r = redact(`key=${awsKeyLike} end`);
    expect(r.redactedText).not.toContain(awsKeyLike);
    expect(r.redactedText).toMatch(/<<REDACTED-1>>/);
    expect(r.hitsByRule['aws-access-key']).toBe(1);
  });

  it('多处占位序号递增', () => {
    const r = redact('email1=foo@example.com, email2=bar@example.com');
    expect(r.redactedText).toMatch(/<<REDACTED-1>>.*<<REDACTED-2>>/);
    expect(r.hitsByRule['email']).toBe(2);
  });

  it('用户自补 literal 被 mask', () => {
    const r = redact('connection: INTERNAL-DB-PROD-01', [
      { literal: 'INTERNAL-DB-PROD-01', name: 'internal-host' },
    ]);
    expect(r.redactedText).not.toContain('INTERNAL-DB-PROD-01');
    expect(r.hitsByRule['internal-host']).toBe(1);
  });

  it('用户自补 regex 被 mask', () => {
    const r = redact('account ACME-CUSTOMER-A12 today', [
      { regex: 'ACME-CUSTOMER-[A-Z][0-9]+', name: 'customer-id' },
    ]);
    expect(r.redactedText).not.toContain('ACME-CUSTOMER-A12');
    expect(r.hitsByRule['customer-id']).toBe(1);
  });

  it('正常文本(非敏感)不被误 redact', () => {
    const r = redact('版本号 1.2.3,讨论 redact 设计');
    expect(r.redactedText).toBe('版本号 1.2.3,讨论 redact 设计');
    expect(r.totalReplacements).toBe(0);
  });

  it('git 进版 fixture → 仅自补 literal 命中,默认规则 0 命中(P7-13/P7-14 修复)', async () => {
    const text = await readFile(FIXTURE, 'utf8');
    // 用户在 anchors.yaml 配的自补 literal
    const customRules = [
      { literal: 'INTERNAL-DB-PROD-01', name: 'internal-host' },
      { literal: 'ACME-CUSTOMER-A12', name: 'customer-id' },
      { literal: 'Project-FALCON-2026', name: 'project-codename' },
      { literal: 'internal-srv-payment-prod', name: 'service-alias' },
    ];
    const r = redact(text, customRules);
    // 自补 literal 命中(INTERNAL-DB-PROD-01 重复 1 次 = 2 次)
    expect(r.hitsByRule['internal-host']).toBe(2);
    expect(r.hitsByRule['customer-id']).toBe(1);
    expect(r.hitsByRule['project-codename']).toBe(1);
    expect(r.hitsByRule['service-alias']).toBe(1);
    // 默认规则在该 git-safe fixture 中 0 命中(避免 GitHub secret scanning 阻拦)
    expect(r.hitsByRule['aws-access-key'] ?? 0).toBe(0);
    expect(r.hitsByRule['github-pat'] ?? 0).toBe(0);
    expect(r.hitsByRule['jwt'] ?? 0).toBe(0);
  });

  it('formatRedactReport 包含 0 命中规则', () => {
    const r = redact('hello world');
    const out = formatRedactReport(r);
    expect(out).toContain('aws-access-key');
    expect(out).toContain('0 命中');
    expect(out).toContain('total: 0 项已 mask');
  });

  it('formatRedactReport 含 total 行', () => {
    const r = redact('foo@example.com');
    const out = formatRedactReport(r);
    expect(out).toContain('total: 1 项已 mask');
  });

  // C-1 修验证:literal 是占位字符串子串时不再无限循环
  it('literal 是 "REDACTED" 不无限循环(C-1 修)', () => {
    const r = redact('payload REDACTED inside REDACTED again', [
      { literal: 'REDACTED', name: 'fake-token' },
    ]);
    expect(r.hitsByRule['fake-token']).toBe(2);
    expect(r.redactedText).toContain('<<REDACTED-1>>');
    expect(r.redactedText).toContain('<<REDACTED-2>>');
  });

  it('literal 是 "<<" 不无限循环(C-1 修;占位前缀子串)', () => {
    const r = redact('a << b << c', [{ literal: '<<', name: 'angle' }]);
    expect(r.hitsByRule['angle']).toBe(2);
  });

  // C-2 修验证:semver 10.x.y 不被误判为 IPv4 私网
  it('semver "version 10.1.2" 不被 ipv4-private 误命中(C-2 修)', () => {
    const r = redact('this version 10.1.2 of the SDK');
    expect(r.hitsByRule['ipv4-private'] ?? 0).toBe(0);
    expect(r.redactedText).toBe('this version 10.1.2 of the SDK');
  });

  it('真 10.x.x.x 私网 IP 仍被命中(C-2 修不破坏正常路径)', () => {
    const r = redact('host=10.0.5.42');
    expect(r.hitsByRule['ipv4-private']).toBe(1);
  });

  // C-3 修验证:无效 custom regex 抛带上下文的错
  it('无效 custom regex 抛 Error 含 rule name + raw regex(C-3 修)', () => {
    expect(() => redact('hello', [{ regex: '[invalid', name: 'bad-rule' }])).toThrow(
      /bad-rule.*\[invalid/,
    );
  });

  // I-1 修验证:长 TLD 完整 mask(.coffee / .museum / .technology)
  it('长 TLD email(.coffee / .museum)被完整 mask(I-1 修)', () => {
    const r = redact('contact a@x.coffee or b@y.museum or c@z.technology');
    expect(r.redactedText).not.toContain('@x.coffee');
    expect(r.redactedText).not.toContain('@y.museum');
    expect(r.redactedText).not.toContain('@z.technology');
    expect(r.hitsByRule['email']).toBe(3);
  });
});
