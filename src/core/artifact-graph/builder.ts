// 构建 artifact 依赖图 — spec §2.1 core/artifact-graph

import type { ArtifactGraph, ArtifactNode } from './types.js';
import { DEFAULT_ARTIFACTS, type ArtifactKind } from '../schema/index.js';

/**
 * 构建固定的"线性"依赖图：proposal → specs → design → tasks。
 * 调用方传入每个 artifact 的 exists / valid 状态。
 */
export function buildGraph(
  states: Record<ArtifactKind, { exists: boolean; valid: boolean }>,
): ArtifactGraph {
  // 根据 DEFAULT_ARTIFACTS 顺序创建节点
  const nodes: ArtifactNode[] = DEFAULT_ARTIFACTS.map((id) => ({
    id,
    exists: states[id].exists,
    valid: states[id].valid,
  }));
  // 建立线性依赖边：相邻两个 artifact 之间的依赖
  const edges: ArtifactGraph['edges'] = [];
  for (let i = 0; i < DEFAULT_ARTIFACTS.length - 1; i++) {
    edges.push({ from: DEFAULT_ARTIFACTS[i]!, to: DEFAULT_ARTIFACTS[i + 1]! });
  }
  return { nodes, edges };
}

/**
 * 找出"可以跑"的下一个 artifact：从前到后，第一个 exists=false 或 valid=false 的就是该补/该改的。
 * 若全部 valid → 返回 null（可以进入 apply / archive）。
 */
export function findNextArtifact(graph: ArtifactGraph): ArtifactKind | null {
  for (const node of graph.nodes) {
    if (!node.exists || !node.valid) return node.id;
  }
  return null;
}
