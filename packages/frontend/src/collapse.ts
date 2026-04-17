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

/** Node types that auto-hide once completed (regardless of path status) */
const AUTO_HIDE_TYPES = new Set(['tool_call', 'tool_result', 'thought']);

/**
 * Returns node IDs that should be hidden because they are completed
 * tool_call, tool_result, or thought nodes. These hide themselves
 * (not their descendants) — they collapse to their parent with a badge.
 */
export function getAutoHiddenNodes(doc: GraphDocument): Set<string> {
  const result = new Set<string>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    // Hide all tool_call, tool_result, and thought nodes unconditionally
    if (AUTO_HIDE_TYPES.has(node.type)) {
      result.add(id);
    }
  }
  return result;
}

/** Returns only nodes visible given current collapsed state and auto-hidden set */
export function getVisibleNodes(
  doc: GraphDocument,
  state: CollapsedState,
  autoHidden?: Set<string>,
): Record<string, GraphNode> {
  if (state.size === 0 && (!autoHidden || autoHidden.size === 0)) return doc.nodes;

  const children = getChildren(doc);
  const hidden = new Set<string>();

  for (const collapsedId of state) {
    for (const desc of getDescendants(collapsedId, children)) {
      hidden.add(desc);
    }
  }

  // Also hide auto-hidden nodes (tool_call, tool_result, thought when completed)
  if (autoHidden) {
    for (const id of autoHidden) {
      hidden.add(id);
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
  autoHidden?: Set<string>,
): GraphEdge[] {
  const visible = getVisibleNodes(doc, state, autoHidden);
  return doc.edges.filter((e) => e.from in visible && e.to in visible);
}

/**
 * Returns the set of node IDs that should be auto-collapsed because they are
 * both executionStatus==='completed' and pathStatus==='archived'.
 * Computed on every render from the document — not stored in state.
 */
export function getAutoCollapsedNodes(doc: GraphDocument): Set<string> {
  const result = new Set<string>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.executionStatus === 'completed' && node.pathStatus === 'archived') {
      result.add(id);
    }
  }
  return result;
}

/**
 * Returns the count of descendant nodes that would be hidden if nodeId is collapsed.
 */
export function getCollapsedChildCount(nodeId: string, doc: GraphDocument): number {
  const children = getChildren(doc);
  return getDescendants(nodeId, children).size;
}
