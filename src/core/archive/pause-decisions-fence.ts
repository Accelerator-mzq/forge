// src/core/archive/pause-decisions-fence.ts — plan-9c Task 2
// 沿 design §2.1.5 fence 五类业务校验:
//   - CRITICAL 重定向(CRITICAL 应走 forge 强 fence,不应进 pause)
//   - WARNING + 未 ack → 拒签(SUGGESTION 例外)
//   - option=1:target_artifact=proposal.md + target_anchor 包含 'What Changes' + diff 段级校验
//   - option=2:capture 校验(design §6.4):added_task_ref + capture_id + ack-log pause-capture entry
//   - option=3:proposal.md/design.md 含 scope-entries fenced YAML 块 + entry_id 匹配 + non_blocking_rationale 非空
//   - option=4:other_rationale + other_acked_by 非空
//
// 沿 verify-findings-fence.ts 模块化模式;option=2/3 需读 fs 故 async

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseUnifiedDiff, addedLineNumbers } from '../parse/unified-diff.js';
// Task 11:option=2 capture 校验所需 ack-log + tasks 解析
import { readAllAckLogEntries, verifyAckLogChain, type PauseCaptureEntry } from '../ack-log.js';
import { parseTasks } from '../parse/tasks.js';

// promisify execFile 用于 option=1 diff 段级校验(async git diff 调用)
const execFileAsync = promisify(execFile);
import type { PauseDecision } from '../markers/types.js';
import { type ValidationResult, ok, failed, mergeResults } from '../validate/types.js';
// v2 codex MAJOR 7 修订:复用 9b parseFencedYamlBlocks,删除自写 extractYamlFencedBlocks + 直接 parseYaml
import { parseFencedYamlBlocks } from '../parse/fenced-yaml.js';
// v3 codex MAJOR 6 修订:option=3 fence 加 scope-entries schema 子集校验(category/status 等)
// v4 codex NEW-MAJOR B4 修订:不调用整文件 validateScopeEntries(会被同文件其他段坏 YAML 误拦本 pause)
//                              改用 parseMarkdown 找 target_anchor 对应 section,只在该段内跑 schema 子集校验
import { parseMarkdown } from '../parse/markdown.js';
import {
  ANCHOR_TO_CATEGORY,
  isScopeCategory,
  isScopeStatus,
  type ScopeAnchorId,
} from '../schemas/scope-entries.js';

/** option=2 capture 链固化入参(由 archive 层从 verify marker 取出) */
export interface PauseFenceOptions {
  // marker 由 AI 产出,这两字段运行时可能是 string / null / undefined(marker-schema.ts 不校验它们);
  // 类型须含 null,fail-closed 检查方能正确收窄
  verifyAckLogTailHash?: string | null;
  verifyAckLogEntryCount?: number | null;
  changeId?: string;
}

/**
 * pause_decisions fence 五类业务校验(沿 design §2.1.5)
 * @param marker — verify-passed / review-passed 等 marker 对象(Record 形)
 * @param changeDir — change 目录绝对路径(需读 proposal.md / tasks.md / design.md)
 * @param repoRoot — git 仓库根目录绝对路径(Task 5 用于 option=1 `git diff HEAD -- <changeDir>/proposal.md`)
 * @param opts — option=2 capture 链固化入参(Task 11;archive 层从 verify marker 取出)
 * @param file — 可选错误报告用 marker 文件路径
 *
 * v4 codex NEW-MAJOR A6 + B4 联动修订:fence 不再需要 ctx 参数(v3 加 ctx 是为给
 * `validateScopeEntries` 算 finding_hash;但 v4 NEW-MAJOR B4 改用 `parseMarkdown` 局部段
 * 校验后,fence 内部不再调 validateScopeEntries,ctx 自然 unused → 沿 YAGNI 移除)
 * Task 11:加 opts 参数(option=2 capture 链固化值),file 移至第 5 位
 */
export async function validatePauseDecisionsFence(
  marker: Record<string, unknown>,
  changeDir: string,
  repoRoot: string,
  opts: PauseFenceOptions = {},
  file?: string,
): Promise<ValidationResult> {
  const decisions = marker.pause_decisions;
  if (!Array.isArray(decisions)) return ok(); // 老 marker 缺 → 通过

  // 主循环之前:收集 option=2 capture_id,检测同 marker 内复用
  const captureIdSeen = new Map<string, number>(); // capture_id → 首次出现的 decision id

  const results: ValidationResult[] = [];
  for (let i = 0; i < decisions.length; i++) {
    const p = decisions[i] as PauseDecision;
    const fieldBase = `pause_decisions[${i}]`;

    // —— 1. CRITICAL 重定向:不应进 pause ——
    if (p.severity === 'CRITICAL') {
      results.push(
        failed({
          artifact: 'marker',
          field: `${fieldBase}.severity`,
          message: `pause_decision id=${p.id} severity=CRITICAL — CRITICAL 应走 forge 强 fence,不应进 Fluid Pause(沿 design §2.1.2)`,
          file,
        }),
      );
      continue; // CRITICAL 拒签后不再校验其他规则(避免 cascade)
    }

    // —— 2. WARNING + 未 ack → 拒签(SUGGESTION 例外) ——
    if (p.severity === 'WARNING') {
      if (!p.severity_acked_by || !p.severity_acked_at) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.severity_acked_by`,
            message: `WARNING pause_decision 必须有 severity_acked_by + severity_acked_at(沿 design §2.1.5)`,
            file,
          }),
        );
      }
    }
    // SUGGESTION + 未 ack → 通过(fence 不要求 ack)

    // —— 3. option 五分支业务校验 ——
    if (p.chosen_option === 1) {
      // option=1 扩 scope:必须改 proposal.md `## What Changes`
      // 字段校验:target_artifact=proposal.md + target_anchor 含 'What Changes'
      // diff 段级校验:跑 git diff HEAD -- <changeDir>/proposal.md,验 ## What Changes 段确有新增行
      // (沿 design §2.1.5 line 262;Task 5 plan-9c 实现)
      if (p.target_artifact !== 'proposal.md') {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.target_artifact`,
            message: `option=1(扩 scope)必须 target_artifact='proposal.md',实际:${p.target_artifact}`,
            file,
          }),
        );
      }
      if (!p.target_anchor.includes('What Changes')) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.target_anchor`,
            message: `option=1(扩 scope)必须 target_anchor 包含 'What Changes',实际:${p.target_anchor}`,
            file,
          }),
        );
      }
      // diff 段级校验:字段校验之后追加(字段校验失败时也继续累积,沿现有 results.push 模式)
      results.push(await checkOption1WhatChangesDiff(changeDir, repoRoot, fieldBase, file));
    } else if (p.chosen_option === 2) {
      // option=2:capture 校验(design §6.4)
      const tasksRes = await checkOption2TaskChecked(
        p,
        changeDir,
        opts,
        captureIdSeen,
        fieldBase,
        file,
      );
      results.push(tasksRes);
    } else if (p.chosen_option === 3) {
      // option=3 转 out-of-scope:scope-entries 有对应 entry + non_blocking_rationale 非空
      if (!p.non_blocking_rationale) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.non_blocking_rationale`,
            message: `option=3(转 out-of-scope)必须 non_blocking_rationale 非空(沿 design §2.1.5)`,
            file,
          }),
        );
      }
      // v4 codex NEW-MAJOR B4 修订:fence 只校验 target_anchor 对应段,不传 ctx 进 checkOption3
      //   (因不再调 validateScopeEntries 整文件,ctx 也不用作 finding_hash 绑定)
      const scopeRes = await checkOption3ScopeEntry(p, changeDir, fieldBase, file);
      results.push(scopeRes);
    } else if (p.chosen_option === 4) {
      // option=4 Other:other_rationale + other_acked_by 必填
      if (!p.other_rationale) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.other_rationale`,
            message: `option=4(Other)必须 other_rationale 非空`,
            file,
          }),
        );
      }
      if (!p.other_acked_by) {
        results.push(
          failed({
            artifact: 'marker',
            field: `${fieldBase}.other_acked_by`,
            message: `option=4(Other)必须 other_acked_by 非空`,
            file,
          }),
        );
      }
    }
  }

  return mergeResults(...results);
}

/**
 * option=1 diff 段级校验:proposal.md 的 git diff 中,`## What Changes` 段须确有新增行。
 * 沿 design §5.3。非 git → N/A 降级(返回 ok);git 项目内 git diff 失败 → fail-closed 拒签。
 */
async function checkOption1WhatChangesDiff(
  changeDir: string,
  repoRoot: string,
  fieldBase: string,
  file?: string,
): Promise<ValidationResult> {
  // 1. 非 git 项目 → diff 校验 N/A,降级(沿 version-retrograde-fence 先例)
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: repoRoot });
  } catch {
    return ok(); // 非 git → 降级到已通过的字段校验
  }
  // 2. git diff HEAD -- <changeDir>/proposal.md
  const proposalPath = join(changeDir, 'proposal.md');
  let diffText: string;
  try {
    const { stdout } = await execFileAsync('git', ['diff', 'HEAD', '--', proposalPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    diffText = stdout;
  } catch (err) {
    // git 项目内 git diff 失败 → fail-closed(沿 version-retrograde-fence:73-81)
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=1 校验失败:git diff proposal.md 失败(${(err as Error).message})— fail-closed 拒签`,
      file,
    });
  }
  // 3. 求 `## What Changes` 段在 proposal.md 原始文件中的行号区间 [start, end)
  //    直接扫原始文本(不用 parseMarkdown —— 它剥 frontmatter 后行号有偏移,design §5.3)
  const content = await readFile(proposalPath, 'utf8');
  const srcLines = content.split('\n');
  let wcStart = -1;
  // wcEnd 初始 +1:What Changes 是 proposal.md 最后一段(无后续 ## 标题)时,段区间须含
  // 文件最后一行 —— 无尾换行时 srcLines.length 恰为末行号,半开区间会漏掉它(code review)
  let wcEnd = srcLines.length + 1;
  for (let i = 0; i < srcLines.length; i++) {
    // 1-indexed 行号(git diff 行号从 1 开始)
    if (/^##\s+What Changes\s*$/.test(srcLines[i] ?? '')) {
      wcStart = i + 1;
      continue;
    }
    if (wcStart >= 0 && /^##\s/.test(srcLines[i] ?? '') && i + 1 > wcStart) {
      wcEnd = i + 1;
      break;
    }
  }
  if (wcStart < 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=1 校验失败:proposal.md 找不到 \`## What Changes\` 段`,
      file,
    });
  }
  // 4. diff 新增行须有落在 [wcStart, wcEnd) 区间内的
  const added = addedLineNumbers(parseUnifiedDiff(diffText));
  const inSection = added.some((ln) => ln >= wcStart && ln < wcEnd);
  if (!inSection) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=1(扩 scope)校验失败:git diff 中 proposal.md \`## What Changes\` 段无新增行 — marker 声称扩 scope 但实际未改该段(沿 design §2.1.5 line 262)`,
      file,
    });
  }
  return ok();
}

/**
 * option=2 校验(design §6.4):pause 新增 task 真实性的轻量 capture 校验。
 * 一律要求 added_task_ref + capture_id + 匹配的 pause-capture entry(无版本降级,design §8.1)。
 *
 * 【capture-input gap — 已知安全边界,design §9.2 / §9.3】
 * 本校验能挡:option=2 无 capture entry、capture entry 事后被篡改、同 marker 内 capture 复用。
 * 本校验【挡不住】:capture 当下喂假输入(删旧 task → pause-capture → 恢复)、AI 预先攒多条
 * capture 后写 marker 时选择性认领、AI 完全不在 marker 记录 pause_decision。根因是 capture 的
 * 输入(tasks.md)由 AI 控制、且 capture_id↔pause_decision 关联由 AI 写 marker 时决定,forge
 * 没有独立于 AI 的 pre-pause tasks 可信来源。轻量 capture 对"诚实但偷懒"的 AI 有效,对蓄意构造
 * 假输入的攻击者无效 —— 此 gap 无法在当前 forge 架构下消除(完整 hash-chain 方案同样关不掉)。
 */
async function checkOption2TaskChecked(
  p: PauseDecision,
  changeDir: string,
  opts: PauseFenceOptions,
  captureIdSeen: Map<string, number>,
  fieldBase: string,
  file?: string,
): Promise<ValidationResult> {
  // 1. added_task_ref + capture_id 非空
  if (!p.added_task_ref) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.added_task_ref`,
      message: 'option=2 必须有 added_task_ref(pause 新增的 task)',
      file,
    });
  }
  if (!p.capture_id) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.capture_id`,
      message: 'option=2 必须有 capture_id(关联 pause-capture entry)',
      file,
    });
  }
  // 5(提前查):capture_id 同 marker 内不被多个 pause_decision 复用
  const prevId = captureIdSeen.get(p.capture_id);
  if (prevId !== undefined) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.capture_id`,
      message: `option=2 校验失败:capture_id=${p.capture_id} 已被 pause_decision id=${prevId} 引用,不可复用`,
      file,
    });
  }
  captureIdSeen.set(p.capture_id, p.id);

  // 2. verify marker 须有 ack_log_tail_hash + entry_count(design §6.2 line 132 fail-closed 契约)
  //    用 == null 同时挡 undefined(字段缺失)与 null —— marker-schema.ts 不校验这两字段,
  //    AI 可手写 marker 注入 `ack_log_tail_hash: null`,且 evidence.ts freeze 在空 ack-log 时本身
  //    也会写 null。null 不是有效固化值:verifyAckLogChain 收到 null 会跳过行数/尾 hash 校验、
  //    退化为仅链内自洽 → 挡不住"重写整条 ack-log"(design §6.2 line 124)→ 必须 fail-closed。
  if (opts.verifyAckLogTailHash == null || opts.verifyAckLogEntryCount == null) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.capture_id`,
      message:
        'option=2 校验失败:verify marker 缺 ack_log_tail_hash / ack_log_entry_count(或为 null),链保护不成立 — fail-closed 拒签',
      file,
    });
  }
  // 3. 读 ack-log + verifyAckLogChain(用 verify marker 的 tail/count)
  let entries;
  try {
    entries = await readAllAckLogEntries(changeDir);
  } catch (err) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.capture_id`,
      message: `option=2 校验失败:ack-log.jsonl 读取/解析失败(${(err as Error).message})`,
      file,
    });
  }
  const chain = verifyAckLogChain(entries, opts.verifyAckLogTailHash, opts.verifyAckLogEntryCount);
  if (!chain.ok) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.capture_id`,
      message: `option=2 校验失败:ack-log 链校验失败(${chain.reason ?? 'unknown'})`,
      file,
    });
  }
  // 4. 定位 capture entry:kind + capture_id + change_id + task_ref 全匹配
  const captures = entries.filter(
    (e): e is PauseCaptureEntry =>
      e.kind === 'pause-capture' &&
      (e as PauseCaptureEntry).capture_id === p.capture_id &&
      (e as PauseCaptureEntry).change_id === (opts.changeId ?? '') &&
      (e as PauseCaptureEntry).task_ref === p.task_ref,
  );
  if (captures.length !== 1) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.capture_id`,
      message: `option=2 校验失败:ack-log 中匹配 capture_id=${p.capture_id} + change_id + task_ref 的 pause-capture entry 数=${captures.length}(应 exactly 1)— fail-closed 拒签`,
      file,
    });
  }
  const capture = captures[0]!;

  // 取 added_task_ref 末段
  const addedKey = p.added_task_ref.split('#').pop() ?? '';
  if (!addedKey) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:added_task_ref 末段为空(${p.added_task_ref})`,
      file,
    });
  }
  // 6. added_task_ref 末段 ∉ capture 快照(pause 时不存在)
  if (capture.tasks_md_task_ids.includes(addedKey)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:task ${addedKey} 在 pause capture 时刻已存在于 tasks.md(非新增)— 沿 design §2.1.5 line 263`,
      file,
    });
  }
  // 7. added_task_ref 末段 ∈ 当前 tasks.md 且勾选(用 parseTasks,design §6.4 step 8)
  const tasksPath = join(changeDir, 'tasks.md');
  if (!existsSync(tasksPath)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:tasks.md 不存在(${tasksPath})`,
      file,
    });
  }
  const parsed = parseTasks(await readFile(tasksPath, 'utf8'));
  const item = parsed.items.find((t) => t.id === addedKey);
  if (!item) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:当前 tasks.md 找不到 task ${addedKey}(需 \`- [x] ${addedKey}: ...\` 格式)`,
      file,
    });
  }
  if (!item.checked) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.added_task_ref`,
      message: `option=2 校验失败:task ${addedKey} 未勾选 [x]`,
      file,
    });
  }
  return ok();
}

/**
 * option=3 校验:proposal.md / design.md 含 scope-entries fenced YAML 块 +
 *   通过 `triggered_by.source='pause_decisions' AND triggered_by.id=<pause.id>` 反向查找匹配 entry
 *   (沿 9b §2.6 scope-entries schema TriggeredByRef 字段)
 *
 * v2 codex MAJOR 6:不再把 task_ref 末段当 scope entry id;用 triggered_by 反向查找
 * v2 codex MAJOR 7:复用 9b parseFencedYamlBlocks,YAML parse 失败抛 FencedYamlParseError → 拒签
 * v3 codex MAJOR 6(新):option=3 fence 加 scope-entries schema 子集校验
 *                       (反向加固 — 防止用户在 propose 后篡改 scope-entries YAML 块)
 * v3 codex MAJOR 7(新):限制 target_artifact ∈ {'proposal.md', 'design.md'} +
 *                       target_anchor 白名单 ∈ {'## Out of Scope', '## Future Work'}
 * v3 codex MINOR 8:triggered_by.id 用 String() normalize 比较,避免 string '1' vs number 1 漏拒
 * v4 codex NEW-MAJOR B4(新):只校验 target_anchor 对应那段(不跑整 artifact validateScopeEntries),
 *                            避免同文件其他段坏 YAML 误拦本 pause
 */
async function checkOption3ScopeEntry(
  p: PauseDecision,
  changeDir: string,
  fieldBase: string,
  file?: string,
): Promise<ValidationResult> {
  // v3 MAJOR 7:target_artifact 白名单
  if (p.target_artifact !== 'proposal.md' && p.target_artifact !== 'design.md') {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_artifact`,
      message: `option=3 校验失败:target_artifact 必须 ∈ {'proposal.md', 'design.md'},实际 ${p.target_artifact}`,
      file,
    });
  }
  // v3 MAJOR 7:target_anchor 白名单
  if (p.target_anchor !== '## Out of Scope' && p.target_anchor !== '## Future Work') {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:target_anchor 必须 ∈ {'## Out of Scope', '## Future Work'},实际 ${p.target_anchor}`,
      file,
    });
  }

  const artifactPath = join(changeDir, p.target_artifact);
  if (!existsSync(artifactPath)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_artifact`,
      message: `option=3 校验失败:${p.target_artifact} 不存在`,
      file,
    });
  }
  const content = await readFile(artifactPath, 'utf8');

  // v4 codex NEW-MAJOR B4:用 parseMarkdown 找 target_anchor 对应 section,只在该段内校验
  //   (不调 validateScopeEntries 整文件,避免被同文件其他段坏 YAML 误拦本 pause)
  const md = parseMarkdown(content);
  const targetAnchorId: ScopeAnchorId =
    p.target_anchor === '## Out of Scope' ? 'forge-oos' : 'forge-future-work';
  const targetSection = md.sections.find((sec) => sec.anchor === targetAnchorId);
  if (!targetSection) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:${p.target_artifact} 找不到 {#${targetAnchorId}} anchor 段(target_anchor=${p.target_anchor})`,
      file,
    });
  }

  // v2 MAJOR 7:用 9b parseFencedYamlBlocks 只对该段 body 抽 YAML 块
  let yamlBlocks: unknown[];
  try {
    yamlBlocks = parseFencedYamlBlocks(targetSection.body);
  } catch (err) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_artifact`,
      message: `option=3 校验失败:${p.target_artifact} 段 ${p.target_anchor} YAML 块解析失败(${(err as Error).message})`,
      file,
    });
  }
  if (yamlBlocks.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:${p.target_artifact} 段 ${p.target_anchor} 内无 scope-entries fenced YAML 块`,
      file,
    });
  }

  // v3 MAJOR 6(新)+ v4 NEW-MAJOR B4:仅校验本段 scope-entries 子集 schema(不跑整 artifact)
  const block = yamlBlocks[0] as Record<string, unknown>;
  if (block.schema !== 'forge-scope-entries/v1') {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:段 ${p.target_anchor} 内 YAML 块 schema 非 forge-scope-entries/v1(实际:${String(block.schema)})`,
      file,
    });
  }
  if (block.anchor_id !== targetAnchorId) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:段 ${p.target_anchor} 内 YAML 块 anchor_id (${String(block.anchor_id)}) ≠ enclosing section anchor (${targetAnchorId})`,
      file,
    });
  }
  const entries = block.entries;
  if (!Array.isArray(entries)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.target_anchor`,
      message: `option=3 校验失败:段 ${p.target_anchor} 内 entries 不是数组`,
      file,
    });
  }

  // v2 MAJOR 6:反向查找 — 遍历本段 entries,找 triggered_by 匹配本 pause_decision.id
  // v3 MINOR 8:用 String() normalize 比较,接受 yaml 中 id 是 number 或 string 两种形式
  // v5 codex MAJOR 1+3 修订:补 id / description / reason 字段校验对齐 9b validateScopeEntries
  //                          完整不变量(scope-entries.ts:120-128)。**找到 triggered_by 匹配的 entry**
  //                          后才校验该 entry 的字段完整性 — 不匹配的 entry 不校验(避免误拦其他 entry)
  // v6 codex MAJOR B2 修订:v5 在匹配第一个 entry 后 `return ok()`,后续 entry 不校验。
  //                          但 design 语义 pause id ↔ scope entry 一对一,出现多条 triggered_by 引用
  //                          同一 pause.id 是数据异常(可能篡改/逻辑错)→ **exactly one 否则拒签**:
  //                          先收集所有匹配 entry,数量 ≠ 1 直接拒签;数量 = 1 才做完整字段校验
  const expectedCategory = ANCHOR_TO_CATEGORY[targetAnchorId];
  const matchedEntries: Record<string, unknown>[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const triggeredBy = e.triggered_by as Record<string, unknown> | null;
    if (
      !triggeredBy ||
      triggeredBy.source !== 'pause_decisions' ||
      String(triggeredBy.id) !== String(p.id) // v3 MINOR 8:normalize 类型
    ) {
      continue;
    }
    matchedEntries.push(e);
  }
  // v6 MAJOR B2:exactly one
  if (matchedEntries.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:${p.target_artifact} scope-entries 段 ${p.target_anchor} 内无 entry.triggered_by={source:'pause_decisions', id:${p.id}} 反向引用本 pause_decision(沿 9b §2.6 TriggeredByRef)`,
      file,
    });
  }
  if (matchedEntries.length > 1) {
    // v6 codex B4 NIT 修订:缺 id 或非 string 时输出占位,避免 'undefined' 误导
    const matchedIds = matchedEntries
      .map((e) => (typeof e.id === 'string' && e.id.length > 0 ? e.id : '<missing-id>'))
      .join(', ');
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:${p.target_artifact} 段 ${p.target_anchor} 内有 ${matchedEntries.length} 条 entry triggered_by 引用本 pause id=${p.id}(应 exactly one,实际 entry ids: [${matchedIds}])— 数据异常,拒签(v6 codex MAJOR B2 修订)`,
      file,
    });
  }
  // 唯一匹配 entry — 做完整字段校验(对齐 9b validateScopeEntries 不变量)
  // matchedEntries.length === 1 已由上方 exactly-one 检查保证,但 TS 不推断,需显式 guard
  const e = matchedEntries[0] as Record<string, unknown>;
  if (typeof e.id !== 'string' || e.id.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry 缺 id(non-empty string)(沿 9b scope-entries.ts:121)`,
      file,
    });
  }
  if (typeof e.description !== 'string' || e.description.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry id=${e.id} 缺 description(non-empty string)(沿 9b scope-entries.ts:125)`,
      file,
    });
  }
  if (typeof e.reason !== 'string' || e.reason.length === 0) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry id=${e.id} 缺 reason 必填论证(沿 9b scope-entries.ts:129 + design §2.6.3)`,
      file,
    });
  }
  if (!isScopeCategory(e.category) || e.category !== expectedCategory) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry id=${e.id} category=${String(e.category)} ≠ anchor ${targetAnchorId} 默认映射 ${expectedCategory}(沿 9b scope-entries.ts:133)`,
      file,
    });
  }
  if (!isScopeStatus(e.status)) {
    return failed({
      artifact: 'marker',
      field: `${fieldBase}.id`,
      message: `option=3 校验失败:匹配的 scope entry id=${e.id} status=${String(e.status)} 非合法(沿 9b scope-entries.ts:142)`,
      file,
    });
  }
  return ok();
}
