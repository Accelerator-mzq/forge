// brownfield onboarding 全模块共享类型 — Plan 7
// 对应 spec §2 架构 + §3 数据流 + §4.3 不变量 + §5.1 quality-judge schema

/** 老锚点的角色(决策 #9 用户显式声明 + LLM 推测草稿) */
export type LegacyAnchorRole =
  | 'requirements' // SRS / PRD / 需求规格
  | 'high-level-design' // HLD / 概要设计 / Architecture
  | 'low-level-design' // LLD / 详细设计 / Module Spec
  | 'system-tests' // 系统测试用例 / testcases / .xlsx
  | 'acceptance-report' // 验收报告(决策 #8 metadata-only)
  | 'rationale' // 设计决策 / 历史背景
  | 'glossary'; // 术语表

/** 单个老锚点配置项(legacy-anchors.yaml#anchors[] 数组项) */
export interface LegacyAnchor {
  /** 角色(决策 #9) */
  role: LegacyAnchorRole;
  /** 文件路径(支持 glob) */
  path: string;
  /** 当前权威版(决策 #10);同 role 多版本只 1 项可为 true */
  authoritative: boolean;
  /** Excel 文件可选指明 sheet(测试用例常见) */
  sheet?: string;
  /** 文件版本号(可选,用户填) */
  version?: string;
  /** 模块边界(用于 sync-check 反查影响) */
  modules?: string[];
  /** SHA256 hash(由 regenerate / sync-check 写入,用于过期检测) */
  hash?: string;
  /** 上次复写时间(ISO) */
  last_regenerated?: string;
  /** 上次 sync-check 时间(ISO) */
  last_sync_at?: string;
  /** 决策 #20 redact 配置(可选,若缺则用默认 12 类规则) */
  redact?: RedactRule[];
  /** §4.5 GDPR:此文件含客户数据,启用 LLM 时额外 ack(决策 #22) */
  contains_customer_data?: boolean;
}

/** legacy-anchors.yaml 顶层结构 */
export interface LegacyAnchorsFile {
  schema: 'forge-legacy-anchor/v1';
  anchors: LegacyAnchor[];
  /** 全局 redact 规则(与每 anchor 的 redact 合并) */
  redact?: RedactRule[];
}

/** redact 规则(决策 #20) */
export type RedactRule = { regex: string; name?: string } | { literal: string; name?: string };

/** 5 档差异严重度(决策 #5) */
export type DiffSeverity = 'critical' | 'major' | 'minor' | 'style' | 'info';

/** sync-state YAML 中的单条 diff 项 */
export interface SyncStateDiff {
  /** 数字 id(在 yaml 内唯一) */
  id: number;
  /** 差异严重度(决策 #5) */
  severity: DiffSeverity;
  /** 受影响的 anchor 路径 */
  anchor_path: string;
  /** 哪段需要更新(章节锚) */
  section?: string;
  /** 描述本次差异 */
  description: string;
  /** 用户处理状态(决策 #19) */
  status: 'pending' | 'resolved-by-doc-update' | 'false-positive' | 'skipped';
  /** 用户填的理由(false-positive / skipped 时) */
  reason?: string;
}

/** sync-state YAML 顶层结构 */
export interface SyncStateFile {
  schema: 'forge-legacy-sync/v1';
  change_id: string;
  generated_at: string;
  diffs: SyncStateDiff[];
  /** 跨 anchor 冲突默认入 diff(决策 #18 修订);auto_resolve_cross_anchor=true 时此字段为空 */
  cross_anchor_conflicts?: SyncStateDiff[];
  /** 产生此 sync-state 的 sync-check manifest 的 manifest_hash(双路径 resume gate 复核用,Spec A §4.5) */
  produced_from?: string;
}

/** llm-ack.yaml 顶层结构(决策 #22) */
export interface LlmAckFile {
  schema: 'forge-llm-ack/v1';
  acknowledged_at: string;
  /** 用户当时的 forge/config.yaml#legacy_bridge 段 hash;若 config 改了,要求重新 ack */
  config_hash: string;
  /** §4.5 GDPR:用户 ack 已处理含客户数据的 anchor(决策 #22) */
  customer_data_acknowledged?: boolean;
}

/** key fact:scenario YAML 标注的关键事实(决策 #16 分层抽样) */
export interface KeyFact {
  text: string;
  section: string;
  /** critical 必抽必保留(分层抽样,§5.1) */
  critical: boolean;
}

/** 复写质量结果(spec §5.1 + §4.3 不变量) */
export interface QualityResult {
  /** 总体保真率(critical + non-critical) */
  total_rate: number;
  /** critical 子集保真率(必须 1.0) */
  critical_rate: number;
  /** 各章节保真率(防"统计骗术") */
  per_section_rates: Record<string, number>;
  /** 丢失的 critical(致命) */
  lost_critical: KeyFact[];
  /** 丢失的 non-critical */
  lost_non_critical: KeyFact[];
  /** 抽样未覆盖的章节(警告) */
  uncovered_sections: string[];
  /**
   * 是否过 critical 100% + total >= threshold(默认 0.9,见 spec §5.1 + 决策 #16);
   * threshold 由调用方(quality-judge.ts)传入,此字段由其计算后写入。
   */
  passed: boolean;
}

/** regen-quality.yaml 顶层(写到 forge/docs/regenerated/<role>.partial.yaml,失败时) */
export interface RegenQualityFile {
  schema: 'forge-regen-quality/v1';
  role: LegacyAnchorRole;
  generated_at: string;
  result: QualityResult;
}
