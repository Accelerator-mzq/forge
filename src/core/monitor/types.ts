// src/core/monitor/types.ts — workflow-monitor 全模块共享类型(spec §3.2 / §6 / §10)

/** 受监控的工作阶段;主流程 6 步 + explore 可进三方对比,forge 专属命令仅 CLI 层 */
export type MonitorStage =
  | 'brainstorm'
  | 'propose'
  | 'apply'
  | 'review'
  | 'verify'
  | 'archive'
  | 'explore'
  | 'ack-confirm'
  | 'upgrade'
  | 'codex-adversarial'
  | 'unknown';

/** 可与 OpenSpec/superpowers 三方对比的阶段(spec §1.3:forge 专属命令不进对比) */
export const COMPARABLE_STAGES = [
  'brainstorm',
  'propose',
  'apply',
  'review',
  'verify',
  'archive',
  'explore',
] as const satisfies readonly MonitorStage[];

/** trace 事件的层:cli = CLI 产物/exit 观察;ai = AI 主代理上报 */
export type TraceLayer = 'cli' | 'ai';

/** trace.jsonl 里的一条事件(spec §3.2) */
export interface TraceEvent {
  ts: string; // ISO 8601 UTC
  schema: 'forge-monitor-trace/v1';
  change_id: string; // 真实 change-id 或 '_session-<uuid>'
  stage: MonitorStage;
  layer: TraceLayer;
  event: string;
  data: Record<string, unknown>;
}

/** cli-exits.jsonl 里的一条记录(spec §4 约束 6) */
export interface CliExitRecord {
  ts: string;
  command: string[];
  cwd: string;
  exit_code: number;
}

/** 差异映射表里的一个对比场景(spec §6.2) */
export interface DivergenceScenario {
  stage: MonitorStage;
  scenario_id: string;
  desc: string;
  openspec: string;
  superpowers: string;
  forge: string;
  rationale: string;
  regression_signal: string;
}

/** 差异映射表(spec §6.1;数据以 TS const 形式存在,非独立 yaml) */
export interface DivergenceMap {
  meta: {
    schema: 'forge-monitor-divergence-map/v1';
    synced_against: {
      openspec: string; // 挖掘时 OpenSpec 仓的 commit / 版本号
      superpowers: string; // 挖掘时 superpowers 仓的 commit / 版本号
    };
    synced_at: string; // YYYY-MM-DD
  };
  scenarios: DivergenceScenario[];
}

/** 健康裁决等级(spec §10) */
export type VerdictLevel = 'ok' | 'regression' | 'anomaly';

/** 健康裁决里的一条命中项 */
export interface VerdictItem {
  kind: 'regression' | 'anomaly';
  stage: MonitorStage;
  detail: string;
  evidence: string;
}

/** 单次健康检查的完整裁决结果(spec §10) */
export interface HealthVerdict {
  level: VerdictLevel;
  items: VerdictItem[];
}
