// The global graph is a query, never maintained (MERMAID-DOCS.md § Two
// Structures): every doc a node, every placement an edge. The root canvas is
// not a doc, so it appears as a synthetic "Canvas" node. Chats are not nodes.
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { DocCanvas } from '@fcw/graph-core';
import type { ChatState } from './chat-store';

export interface GraphNode {
  id: string;
  title: string;
  hasBody: boolean;
  degree: number;
}
export interface GraphEdge {
  from: string;
  to: string;
  kind: 'placement' | 'edge';
}
export interface GlobalGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const GRAPH_W = 620;
export const GRAPH_H = 460;

export function globalGraph(state: ChatState): GlobalGraphData {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string, kind: GraphEdge['kind']) => {
    const key = `${kind}|${from}|${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };
  const collect = (host: string, canvas: DocCanvas) => {
    for (const p of canvas.placements) if (p.kind === 'doc') add(host, p.id, 'placement');
    for (const e of canvas.edges) add(e.from, e.to, 'edge');
  };
  collect(ROOT_CANVAS_ID, state.rootCanvas);
  for (const doc of Object.values(state.docs)) collect(doc.id, doc.canvas);

  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }
  const nodes: GraphNode[] = [
    { id: ROOT_CANVAS_ID, title: 'Canvas', hasBody: false, degree: degree.get(ROOT_CANVAS_ID) ?? 0 },
    ...Object.values(state.docs).map((d) => ({
      id: d.id,
      title: d.title,
      hasBody: d.body.trim() !== '',
      degree: degree.get(d.id) ?? 0,
    })),
  ];
  return { nodes, edges };
}

export interface Point {
  x: number;
  y: number;
}

/** Small deterministic spring sim (no d3-force): ring start, repulsion, springs, centre pull. */
export function simulate(graph: GlobalGraphData, opts: { steps?: number; width?: number; height?: number } = {}): Map<string, Point> {
  const { steps = 260, width = GRAPH_W, height = GRAPH_H } = opts;
  const n = graph.nodes.length;
  const pts = graph.nodes.map((node, i) => ({
    id: node.id,
    x: width / 2 + Math.cos((i / n) * Math.PI * 2) * 150,
    y: height / 2 + Math.sin((i / n) * Math.PI * 2) * 150,
  }));
  const index = new Map(pts.map((p, i) => [p.id, i]));

  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const d = Math.sqrt(d2);
        const f = 1400 / d2;
        a.x -= (dx / d) * f;
        a.y -= (dy / d) * f;
        b.x += (dx / d) * f;
        b.y += (dy / d) * f;
      }
    }
    for (const e of graph.edges) {
      const a = pts[index.get(e.from) ?? -1];
      const b = pts[index.get(e.to) ?? -1];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const f = (d - 90) * 0.012;
      a.x += (dx / d) * f;
      a.y += (dy / d) * f;
      b.x -= (dx / d) * f;
      b.y -= (dy / d) * f;
    }
    for (const p of pts) {
      p.x += (width / 2 - p.x) * 0.008;
      p.y += (height / 2 - p.y) * 0.008;
    }
  }

  const pad = 12;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, pad), max - pad);
  return new Map(pts.map((p) => [p.id, { x: clamp(p.x, width), y: clamp(p.y, height) }]));
}
