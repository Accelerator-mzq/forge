import { describe, it, expect } from 'vitest';
import {
  validateAnchorsFile,
  getAuthoritativeAnchors,
  groupAnchorsByRole,
  LegacyAnchorsError,
} from '../../../src/core/legacy-bridge/anchors.js';

describe('legacy-bridge/anchors', () => {
  it('合法 legacy-anchors.yaml 解析成功', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        { role: 'requirements', path: 'docs/legacy/SRS.md', authoritative: true },
        { role: 'high-level-design', path: 'docs/legacy/HLD.md', authoritative: true },
      ],
    };
    const file = validateAnchorsFile(data, 'test');
    expect(file.anchors).toHaveLength(2);
  });

  it('schema 字段错误 → 抛错', () => {
    const data = { schema: 'wrong/v1', anchors: [] };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(LegacyAnchorsError);
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/forge-legacy-anchor\/v1/);
  });

  it('role 非预定义 → 抛错', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [{ role: 'unknown', path: 'a.md', authoritative: true }],
    };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/非预定义角色/);
  });

  it('同 role 多 authoritative=true → 抛错(决策 #10)', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [
        { role: 'requirements', path: 'srs-v1.md', authoritative: true },
        { role: 'requirements', path: 'srs-v2.md', authoritative: true },
      ],
    };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/2 个 authoritative=true/);
  });

  it('getAuthoritativeAnchors 仅返回当前版', () => {
    const file = validateAnchorsFile(
      {
        schema: 'forge-legacy-anchor/v1',
        anchors: [
          { role: 'requirements', path: 'srs-v1.md', authoritative: false },
          { role: 'requirements', path: 'srs-v2.md', authoritative: true },
        ],
      },
      'test',
    );
    const auth = getAuthoritativeAnchors(file);
    expect(auth).toHaveLength(1);
    expect(auth[0]?.path).toBe('srs-v2.md');
  });

  it('groupAnchorsByRole 正确分组', () => {
    const file = validateAnchorsFile(
      {
        schema: 'forge-legacy-anchor/v1',
        anchors: [
          { role: 'requirements', path: 'srs.md', authoritative: true },
          { role: 'high-level-design', path: 'hld.md', authoritative: true },
          { role: 'low-level-design', path: 'lld.md', authoritative: true },
        ],
      },
      'test',
    );
    const grouped = groupAnchorsByRole(file);
    expect(grouped.size).toBe(3);
    expect(grouped.get('requirements')).toHaveLength(1);
  });

  it('path 字段缺失 → 抛错', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [{ role: 'requirements', authoritative: true }],
    };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/path 字段缺失/);
  });

  it('外部 URL → 抛错(决策 #12 / P7-04)', () => {
    const data = {
      schema: 'forge-legacy-anchor/v1',
      anchors: [{ role: 'requirements', path: 'https://notion.so/srs', authoritative: true }],
    };
    expect(() => validateAnchorsFile(data, 'test')).toThrow(/外部 URL/);
  });

  it('扩展名不在白名单(.docx / .pdf)→ 抛错(决策 #13 / P7-04)', () => {
    for (const bad of ['srs.docx', 'srs.pdf', 'srs.html']) {
      const data = {
        schema: 'forge-legacy-anchor/v1',
        anchors: [{ role: 'requirements', path: bad, authoritative: true }],
      };
      expect(() => validateAnchorsFile(data, 'test')).toThrow(/扩展名不在白名单/);
    }
  });

  it('扩展名 .md / .txt / .csv / .xlsx 全通过', () => {
    for (const ok of ['srs.md', 'tests.csv', 'spec.txt', 'cases.xlsx']) {
      const data = {
        schema: 'forge-legacy-anchor/v1',
        anchors: [{ role: 'requirements', path: ok, authoritative: true }],
      };
      expect(() => validateAnchorsFile(data, 'test')).not.toThrow();
    }
  });
});
