import type { GraphDocument, NodeType } from '@fcw/graph-core';

export interface LogEntry {
  id: string;
  type: NodeType;
  content: string;
  depth: number;
}

export function traverseLog(doc: GraphDocument): LogEntry[] {
  const nodes = Object.values(doc.nodes);
  if (nodes.length === 0) return [];

  // Build adjacency: parent -> children (edges go from -> to)
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const edge of doc.edges) {
    const list = children.get(edge.from) ?? [];
    list.push(edge.to);
    children.set(edge.from, list);
    hasParent.add(edge.to);
  }

  // Roots: nodes with no incoming edges
  const roots = nodes.filter((n) => !hasParent.has(n.id));

  // Sort roots by created timestamp
  roots.sort((a, b) => a.created.localeCompare(b.created));

  const result: LogEntry[] = [];
  const visited = new Set<string>();

  function dfs(nodeId: string, depth: number): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = doc.nodes[nodeId];
    if (!node) return;

    result.push({
      id: node.id,
      type: node.type,
      content: node.content,
      depth,
    });

    const kids = children.get(nodeId) ?? [];
    // Sort children by created time
    kids.sort((a, b) =>
      (doc.nodes[a]?.created ?? '').localeCompare(doc.nodes[b]?.created ?? ''),
    );

    for (let i = 0; i < kids.length; i++) {
      // First child continues at same depth, subsequent are branches
      dfs(kids[i], i === 0 ? depth : depth + 1);
    }
  }

  for (const root of roots) {
    dfs(root.id, 0);
  }

  return result;
}
