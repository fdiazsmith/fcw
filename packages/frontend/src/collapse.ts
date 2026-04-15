import type { GraphDocument, GraphNode, GraphEdge } from '@fcw/graph-core';

/** Set of node IDs that are collapsed (their descendants are hidden) */
export type CollapsedState = Set<string>;

/** Build adjacency: parent -> children from edges */
function getChildren(doc: GraphDocument): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const edge of doc.edges) {
    const list = children.get(edge.from) ?? [];
    list.push(edge.to);
    children.set(edge.from, list);
  }
  return children;
}

/** Get all descendants of a node */
function getDescendants(nodeId: string, children: Map<string, string[]>): Set<string> {
  const result = new Set<string>();
  const stack = children.get(nodeId) ?? [];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of children.get(id) ?? []) {
      stack.push(child);
    }
  }
  return result;
}

export function collapseSubtree(nodeId: string, _doc: GraphDocument, state: CollapsedState): void {
  state.add(nodeId);
}

export function expandSubtree(nodeId: string, state: CollapsedState): void {
  state.delete(nodeId);
}

/** Returns only nodes visible given current collapsed state */
export function getVisibleNodes(
  doc: GraphDocument,
  state: CollapsedState,
): Record<string, GraphNode> {
  if (state.size === 0) return doc.nodes;

  const children = getChildren(doc);
  const hidden = new Set<string>();

  for (const collapsedId of state) {
    for (const desc of getDescendants(collapsedId, children)) {
      hidden.add(desc);
    }
  }

  const result: Record<string, GraphNode> = {};
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (!hidden.has(id)) {
      result[id] = node;
    }
  }
  return result;
}

/** Returns only edges where both endpoints are visible */
export function getVisibleEdges(
  doc: GraphDocument,
  state: CollapsedState,
): GraphEdge[] {
  const visible = getVisibleNodes(doc, state);
  return doc.edges.filter((e) => e.from in visible && e.to in visible);
}
