// artifact-graph 类型定义 — 线性依赖关系表示
import type { ArtifactKind } from '../schema/index.js';

// 图的节点：单个 artifact 的状态
export interface ArtifactNode {
  // artifact 类型（proposal/specs/design/tasks）
  id: ArtifactKind;
  // 该 artifact 文件存在？
  exists: boolean;
  // 该 artifact 通过 validate？
  valid: boolean;
}

// 完整的 artifact 依赖图
export interface ArtifactGraph {
  // 所有 artifact 节点
  nodes: ArtifactNode[];
  // 依赖边的顺序表示：proposal → specs → design → tasks
  edges: { from: ArtifactKind; to: ArtifactKind }[];
}
