import dagre from 'dagre';
import type { GraphDocument, Position } from '@fcw/graph-core';

const NODE_WIDTH = 280;
const NODE_HEIGHT = 200;

export function computeLayout(doc: GraphDocument): Map<string, Position> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 60, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const [id, node] of Object.entries(doc.nodes)) {
    const pinned = (node as unknown as { metadata?: { pinned?: boolean } }).metadata?.pinned;
    if (pinned) {
      g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT, x: node.position.x, y: node.position.y });
    } else {
      g.setNode(id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
  }

  for (const edge of doc.edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const positions = new Map<string, Position>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    const pinned = (node as unknown as { metadata?: { pinned?: boolean } }).metadata?.pinned;
    if (pinned) {
      positions.set(id, { x: node.position.x, y: node.position.y });
    } else {
      const n = g.node(id);
      positions.set(id, { x: n.x, y: n.y });
    }
  }

  return positions;
}
