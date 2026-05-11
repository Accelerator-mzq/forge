// src/cli/commands/finding.ts — plan-9d Task 4 v4 R-5 修订
// `forge finding hash` CLI:接 stdin JSON(FindingHashPayload 8 字段)→ 输出 finding_hash
// 用途:AI 在 /forge:verify slash 阶段调本 skill 后,通过本 helper 算 finding_hash 写 .verify-passed
// 避免 AI 自己实现 JCS 序列化(复杂且易出错)
//
// 用法:cat <<'JSON' | forge finding hash
//       {"content_hash":"sha256:...","git_head":"...","dimension":"correctness",...}
//       JSON
// stdout: 64-hex finding_hash + 换行
// exit 0 = 成功;exit 1 = JSON 无效 / 缺字段;exit 2 = io 错

import { Command } from 'commander';
import { computeFindingHash } from '../../core/validate/finding-hash.js';
import type { FindingHashPayload } from '../../core/schemas/severity.js';
import { isSeverity } from '../../core/schemas/severity.js';

export function buildFindingCommand(): Command {
  const finding = new Command('finding').description('Finding helper 子命令(verify 阶段用)');

  finding
    .command('hash')
    .description('从 stdin 读 FindingHashPayload JSON,输出 finding_hash(64-hex)')
    .action(async () => {
      try {
        const input = await readStdin();
        let payload: unknown;
        try {
          payload = JSON.parse(input);
        } catch {
          console.error('✗ stdin 不是合法 JSON');
          process.exit(1);
        }
        const validated = validateFindingHashPayload(payload);
        if (!validated) {
          console.error(
            '✗ payload 缺必填字段或类型错(8 字段:content_hash/git_head/dimension/check_type/severity/automated/evidence/recommendation,沿 master §3.12.1)',
          );
          process.exit(1);
        }
        const hash = computeFindingHash(validated);
        process.stdout.write(hash + '\n');
        process.exit(0);
      } catch (err) {
        console.error(`✗ io error: ${(err as Error).message}`);
        process.exit(2);
      }
    });

  return finding;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function validateFindingHashPayload(p: unknown): FindingHashPayload | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  if (typeof o.content_hash !== 'string') return null;
  if (typeof o.git_head !== 'string') return null;
  if (
    o.dimension !== 'completeness' &&
    o.dimension !== 'correctness' &&
    o.dimension !== 'coherence'
  )
    return null;
  if (typeof o.check_type !== 'string') return null;
  if (!isSeverity(o.severity)) return null;
  if (typeof o.automated !== 'boolean') return null;
  if (typeof o.evidence !== 'string') return null;
  if (typeof o.recommendation !== 'string') return null;
  // v5 REG-2 修订:显式构造干净 8 字段 object,丢弃 extra keys
  // 防止 AI 传完整 Finding JSON(含 id/resolved/finding_hash 等)时,
  // 输出 hash 含 extra keys → 与 archive extractHashPayload 8 字段 hash 不一致 → 系统性 hash 不可重现
  return {
    content_hash: o.content_hash,
    git_head: o.git_head,
    dimension: o.dimension,
    check_type: o.check_type,
    severity: o.severity,
    automated: o.automated,
    evidence: o.evidence,
    recommendation: o.recommendation,
  };
}
