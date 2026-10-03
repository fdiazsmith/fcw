// Auto-layout for doc boxes (see MERMAID-DOCS.md § Build Order, step 3).
//
// The Mermaid parser returns no coordinates, so something has to place the
// boxes. dagre does it — no d3-force, no PIXI: our canvases are scoped to a few
// dozen shapes and tldraw already owns rendering.

import dagre from 'dagre';
import type { Doc, DocEdge, Position } from '@fcw/graph-core';

export const DOC_W = 260;
export const DOC_H = 150;

export interface LayoutOptions {
  /** Gap between ranks (vertical, in a top-down graph). */
  rankSep?: number;
  /** Gap between siblings within a rank. */
  nodeSep?: number;
}

/**
 * Lay out docs and their edges top-down, returning **top-left corners** —
 * dagre works in centres, tldraw positions shapes by their corner, and doing
 * the conversion here means no caller has to remember it.
 */
export function layoutDocNodes(
  docs: Pick<Doc, 'id'>[],
  edges: DocEdge[],
  options: LayoutOptions = {},
): Map<string, Position> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    ranksep: options.rankSep ?? 90,
    nodesep: options.nodeSep ?? 60,
    marginx: 0,
    marginy: 0,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const doc of docs) {
    g.setNode(doc.id, { width: DOC_W, height: DOC_H });
  }
  // Edges to docs outside this set would make dagre invent phantom nodes.
  const known = new Set(docs.map((d) => d.id));
  for (const edge of edges) {
    if (known.has(edge.from) && known.has(edge.to)) g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const positions = new Map<string, Position>();
  for (const doc of docs) {
    const node = g.node(doc.id);
    positions.set(doc.id, { x: node.x - DOC_W / 2, y: node.y - DOC_H / 2 });
  }
  return positions;
}

/** Shift a layout so its bounding box is centred on `center` (e.g. the viewport). */
export function centerLayoutAt(positions: Map<string, Position>, center: Position): Map<string, Position> {
  if (positions.size === 0) return new Map();
  const all = [...positions.values()];
  const minX = Math.min(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y));
  const maxX = Math.max(...all.map((p) => p.x)) + DOC_W;
  const maxY = Math.max(...all.map((p) => p.y)) + DOC_H;
  const dx = center.x - (minX + maxX) / 2;
  const dy = center.y - (minY + maxY) / 2;
  return new Map([...positions].map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
}
