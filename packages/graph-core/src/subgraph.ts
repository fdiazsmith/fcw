import type { GraphDocument, GraphNode, GraphEdge } from './types.js';

interface Subgraph {
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

export function getSubgraph(
  doc: GraphDocument,
  nodeId: string,
  depth: number,
): Subgraph {
  if (!doc.nodes[nodeId]) {
    throw new Error(`Node "${nodeId}" not found`);
  }

  const visited = new Set<string>();
  const queue: Array<{ id: string; d: number }> = [{ id: nodeId, d: 0 }];

  while (queue.length > 0) {
    const { id, d } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    if (d < depth) {
      for (const edge of doc.edges) {
        if (edge.from === id && !visited.has(edge.to)) {
          queue.push({ id: edge.to, d: d + 1 });
        }
        if (edge.to === id && !visited.has(edge.from)) {
          queue.push({ id: edge.from, d: d + 1 });
        }
      }
    }
  }

  const nodes: Record<string, GraphNode> = {};
  for (const id of visited) {
    nodes[id] = doc.nodes[id];
  }

  const edges = doc.edges.filter(
    (e) => visited.has(e.from) && visited.has(e.to),
  );

  return { nodes, edges };
}
