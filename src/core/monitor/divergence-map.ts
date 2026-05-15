// src/core/monitor/divergence-map.ts — 静态差异映射表(spec §6;数据即 TS const,随 tsc 进 dist)
import type { DivergenceMap, DivergenceScenario } from './types.js';

export const DIVERGENCE_MAP: DivergenceMap = {
  meta: {
    schema: 'forge-monitor-divergence-map/v1',
    // 挖掘时两上游仓的实际 commit(git -C ../OpenSpec / ../superpowers rev-parse --short HEAD)
    synced_against: { openspec: '435458b', superpowers: 'e7a2d16' },
    synced_at: '2026-05-16',
  },
  scenarios: [
    // ── brainstorm ────────────────────────────────────────────────────────
    {
      stage: 'brainstorm',
      scenario_id: 'brainstorm-one-line-need',
      desc: '用户给一句话需求(如「加个 todo list」),要不要先问澄清问题再动手?',
      openspec: 'openspec change new 仅 scaffold 出 change 目录骨架,无强制澄清问答,直接进产物起草',
      superpowers:
        'brainstorming skill 有 HARD-GATE + 逐个澄清问答 checklist,但属 skill 行为约束,无机器 fence 兜底',
      forge:
        'forge:brainstorming skill 强制逐个提问 + 「禁止行为」明令即使用户说「我想清楚了」也不许跳过问答,产物只能落 forge/drafts/',
      rationale: '反向加固 —— 防 AI 拿一句话需求当完整 spec、跳过澄清直接写代码',
      regression_signal:
        'brainstorm 阶段 trace 无 clarifying-question 事件、直接出现 draft/artifact 写入 → forge 塌回 OpenSpec 无澄清基线',
    },
    // ── propose ───────────────────────────────────────────────────────────
    {
      stage: 'propose',
      scenario_id: 'propose-artifact-completeness',
      desc: 'proposal 写完了,specs/design/tasks 还没补齐,要不要就这样进 apply?',
      openspec:
        'openspec 产物按 artifact-graph 逐件生成,validate 做结构校验但不阻塞流程推进,缺件可继续',
      superpowers:
        'writing-plans skill 产计划文档并自检 placeholder,但无四件套强校验,scope 解耦靠人把关',
      forge:
        'propose 末尾强制跑 forge validate <id> 校验 proposal+specs+design+tasks 四件套齐全 + 三段 scope anchor,失败回补不留半成品',
      rationale: '反向加固 —— 防 AI 只写 proposal 就推进、留不完整产物拖到后续阶段',
      regression_signal:
        'propose 阶段 trace 无 forge-validate 通过事件、或 validate exit_code≠0 仍进 apply → forge 塌回 OpenSpec 弱校验基线',
    },
    // ── apply ─────────────────────────────────────────────────────────────
    {
      stage: 'apply',
      scenario_id: 'apply-out-of-scope-finding',
      desc: '子代理实施中发现一个本 change 没覆盖、但相关的需求,要不要顺手做掉?',
      openspec:
        'openspec 无子代理派发协议,实施由单一代理顺序跑,scope 外发现多半被就地吸收进当前改动',
      superpowers:
        'subagent-driven-development 派 fresh 子代理逐 task 实施,但 scope 外发现的处置靠主代理判断,无强制四选项',
      forge:
        'apply 的 Fluid Pause:子代理报非 CRITICAL concern 时主代理停下走 AskUserQuestion 四选项(扩 scope/加 task/转 out-of-scope/Other),决策写 marker pause_decisions',
      rationale: '反向加固 —— 防 AI 子代理擅自扩 scope、把计划外改动悄悄塞进当前 change',
      regression_signal:
        'apply 阶段 trace 出现 scope 外 commit 但无 fluid-pause / pause_decision 事件 → forge 塌回 superpowers 无强制暂停基线',
    },
    // ── review ────────────────────────────────────────────────────────────
    {
      stage: 'review',
      scenario_id: 'review-finding-severity-ack',
      desc: 'review 子代理报了一条意见,主代理觉得不重要,要不要直接略过?',
      openspec:
        'openspec 无独立 review 阶段,正确性靠 validate + 人工把关,review finding 无 severity 分级与签收',
      superpowers:
        'requesting-code-review 派 code-reviewer 子代理并分 Critical/Important/Minor,但接受/反驳由主代理自由裁量,无存档强制',
      forge:
        'review finding 带严重度分级,主代理逐条判接受/拒绝,拒绝须证据存档;仅「无未存档拒绝 + 接受项全实现测试通过 + 本轮无新 task」三条件齐才打 .review-passed',
      rationale: '反向加固 —— 防 AI 主代理无证据略过 review 意见、草率打 review-passed marker',
      regression_signal:
        'review 阶段 trace 有 reviewer finding 但无对应 accept/reject 记录,或 .review-passed 在仍有 finding 未处置时落地 → forge 塌回 superpowers 自由裁量基线',
    },
    // ── verify ────────────────────────────────────────────────────────────
    {
      stage: 'verify',
      scenario_id: 'verify-tests-green',
      desc: '测试全 pass,要不要继续深挖?',
      openspec: '无强 verify 阶段,验证靠 review,≈ 弱/无对应',
      superpowers: 'verification-before-completion:跑验证命令、确认输出;pass 即可声明完成',
      forge:
        'verifying-three-dimensions:测试 pass 只是 Correctness 一维;还需 Completeness + Coherence',
      rationale: '反向加固 —— 防 AI 拿「测试绿」当完工',
      regression_signal:
        'verify 阶段 trace 只有 Correctness 维度 record,缺 Completeness/Coherence → forge 塌回 superpowers 基线',
    },
    // ── archive ───────────────────────────────────────────────────────────
    {
      stage: 'archive',
      scenario_id: 'archive-unresolved-warning',
      desc: 'review 留了个未解决 WARNING,要不要归档?',
      openspec: 'openspec archive 无 severity 分级 fence → 多半放行',
      superpowers: 'finishing-a-development-branch:给 merge/PR/cleanup 选项,不强制 finding 解决',
      forge: '三级 fence:WARNING 未 resolve 且无 ack → 拒签 exit 1',
      rationale: '反向加固 —— 强 fence 防偷懒归档',
      regression_signal: 'archive 在有未 ack WARNING 时 cli_exit.exit_code=0 → 回归',
    },
    // ── explore ───────────────────────────────────────────────────────────
    {
      stage: 'explore',
      scenario_id: 'explore-capture-conclusion',
      desc: '一轮探索想出了结论,要不要顺手把结论写进 design/proposal 产物?',
      openspec: 'openspec 探索能力弱,无显式 explore 阶段;探索心得多半直接被吸收进产物或散落上下文',
      superpowers:
        'superpowers 无 exploring skill,非线性探索靠 brainstorming/systematic-debugging 边角覆盖,结论落点无约束',
      forge:
        'forge:exploring skill 强制末尾输出 ## Exploration Summary 收尾、capture offer 必须给具体 file:section,且禁止 explore turn 内直接 Write/Edit 改 forge/changes/* 产物',
      rationale: '反向加固 —— 防 AI 探索完无结论、或绕开用户确认直接把探索改动塞进产物',
      regression_signal:
        'explore 阶段 trace 出现 forge/changes/* 产物写入但无 capture-offer + 用户确认事件,或无 exploration-summary 收尾 → forge 塌回上游无约束基线',
    },
  ],
};

/** 按 scenario_id 查询 */
export function findScenario(id: string): DivergenceScenario | undefined {
  return DIVERGENCE_MAP.scenarios.find((s) => s.scenario_id === id);
}
