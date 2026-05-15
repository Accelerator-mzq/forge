#!/usr/bin/env node
// hooks/monitor-check.mjs — workflow-monitor 开关 gate(spec §9)
// 零依赖:非 bundled plugin 不含 dist/ 与 node_modules,不能 import forge 编译产物或 yaml 包。
// 退出码:0 = monitor enabled;1 = disabled 或任何异常(安全侧默认 disabled)。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const path = join(process.cwd(), 'forge', 'config.yaml');
  if (!existsSync(path)) process.exit(1);
  process.exit(scanMonitorEnabled(readFileSync(path, 'utf8')) ? 0 : 1);
} catch {
  process.exit(1);
}

/**
 * scan 契约(spec §9):
 * - 剔除行内非引号包裹的注释;
 * - 只在顶层(零缩进)monitor: 块内找 enabled:;
 * - 支持块式与 inline flow 式;
 * - 严格匹配裸 boolean true;其它一律 disabled。
 */
function scanMonitorEnabled(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = stripComment(lines[i]);
    const m = /^monitor:\s*(.*)$/.exec(raw);
    if (!m) continue;
    const rest = m[1].trim();
    // inline flow:monitor: { enabled: true }
    if (rest.startsWith('{')) {
      return /\benabled\s*:\s*true\s*[},]/.test(rest + ',');
    }
    // 块式:扫 monitor: 之后的缩进子块
    for (let j = i + 1; j < lines.length; j++) {
      const sub = stripComment(lines[j]);
      if (sub.trim() === '') continue;
      if (!/^\s/.test(sub)) break; // 回到零缩进 → 子块结束
      const e = /^\s+enabled\s*:\s*(\S+)\s*$/.exec(sub);
      if (e) return e[1] === 'true'; // 严格裸 true;"true" / false / 其它 → 否
    }
    return false;
  }
  return false;
}

/** 去掉行内第一个非引号包裹的 # 起的注释 */
function stripComment(line) {
  let inStr = false;
  let quote = '';
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (inStr) {
      if (c === quote) inStr = false;
    } else if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
    } else if (c === '#') {
      return line.slice(0, k);
    }
  }
  return line;
}
