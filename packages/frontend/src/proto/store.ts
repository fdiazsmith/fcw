// PROTOTYPE — throwaway. No tests, no server, localStorage only.
// The real model lives in graph-core; this is a thin mutable shell around it so
// the UI has something to click. Delete this folder when the design question is
// answered.
//
// One rule kept faithfully: canvases hold *placements*, docs live in one table.
// Everything the prototype is meant to prove falls out of that.

import { parseMermaid, mermaidToDocNodes } from '@fcw/graph-core';
import type { Doc, DocEdge, Position } from '@fcw/graph-core';
import { layoutDocNodes, DOC_W, DOC_H } from '../doc-layout';

export interface ProtoState {
  docs: Record<string, Doc>;
  rootId: string;
  seq: number; // persisted so ids survive a reload
}

const KEY = 'fcw-proto-v1';

// ── derived reads ────────────────────────────────────────────────────────────

/** Which canvases hold this doc. Length > 1 ⇒ it's a reference. */
export function placedOn(state: ProtoState, docId: string): string[] {
  return Object.values(state.docs)
    .filter((d) => d.canvas.placements.some((p) => p.docId === docId))
    .map((d) => d.id);
}

export function isReference(state: ProtoState, docId: string): boolean {
  return placedOn(state, docId).length > 1;
}

export function childCount(state: ProtoState, docId: string): number {
  return state.docs[docId]?.canvas.placements.length ?? 0;
}

/** Every doc → every placement, for the global graph (sketch 04). It's a query. */
export function globalGraph(state: ProtoState): { nodes: Doc[]; links: DocEdge[] } {
  const nodes = Object.values(state.docs);
  const links: DocEdge[] = [];
  for (const doc of nodes) {
    for (const p of doc.canvas.placements) links.push({ from: doc.id, to: p.docId });
    for (const e of doc.canvas.edges) links.push({ from: e.from, to: e.to });
  }
  return { nodes, links };
}

/** Walk up the nesting tree to the root — the breadcrumb / home glyph. */
export function pathToRoot(state: ProtoState, docId: string): string[] {
  const path = [docId];
  const guard = new Set([docId]);
  let current = docId;
  while (current !== state.rootId) {
    const parent = placedOn(state, current)[0];
    if (!parent || guard.has(parent)) break;
    guard.add(parent);
    path.unshift(parent);
    current = parent;
  }
  return path;
}

// ── writes (all pure: state in, state out) ───────────────────────────────────

const bounds = (placements: { position: Position }[]) => {
  if (placements.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const xs = placements.map((p) => p.position.x);
  const ys = placements.map((p) => p.position.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs) + DOC_W,
    maxY: Math.max(...ys) + DOC_H,
  };
};

export function generate(state: ProtoState, canvasId: string, mermaid: string): ProtoState {
  const parsed = parseMermaid(mermaid);
  if (parsed.nodes.length === 0) return state;

  const prefix = `g${state.seq}:`;
  const { docs, edges } = mermaidToDocNodes(parsed, { idPrefix: prefix });
  const positions = layoutDocNodes(docs, edges);

  // Drop a new diagram below whatever is already on this canvas.
  const host = state.docs[canvasId];
  const below = host.canvas.placements.length > 0 ? bounds(host.canvas.placements).maxY + 120 : 0;

  const table = { ...state.docs };
  for (const doc of docs) table[doc.id] = doc;

  table[canvasId] = {
    ...host,
    canvas: {
      placements: [
        ...host.canvas.placements,
        ...docs.map((d) => {
          const p = positions.get(d.id)!;
          return { docId: d.id, position: { x: p.x, y: p.y + below } };
        }),
      ],
      edges: [...host.canvas.edges, ...edges],
    },
  };

  return { ...state, docs: table, seq: state.seq + 1 };
}

export function createBlank(
  state: ProtoState,
  canvasId: string,
  title: string,
  position: Position,
): [ProtoState, string] {
  const id = `d${state.seq}`;
  const doc: Doc = { id, title, body: '', canvas: { placements: [], edges: [] } };
  const host = state.docs[canvasId];
  return [
    {
      ...state,
      seq: state.seq + 1,
      docs: {
        ...state.docs,
        [id]: doc,
        [canvasId]: {
          ...host,
          canvas: { ...host.canvas, placements: [...host.canvas.placements, { docId: id, position }] },
        },
      },
    },
    id,
  ];
}

/** Place an *existing* doc on another canvas — the 🔗 reference of sketch 02. */
export function placeExisting(
  state: ProtoState,
  canvasId: string,
  docId: string,
  position: Position,
): ProtoState {
  const host = state.docs[canvasId];
  if (host.canvas.placements.some((p) => p.docId === docId)) return state;
  return {
    ...state,
    docs: {
      ...state.docs,
      [canvasId]: {
        ...host,
        canvas: { ...host.canvas, placements: [...host.canvas.placements, { docId, position }] },
      },
    },
  };
}

/** Remove from *this* canvas only. The doc itself survives — it may live elsewhere. */
export function unplace(state: ProtoState, canvasId: string, docId: string): ProtoState {
  const host = state.docs[canvasId];
  return {
    ...state,
    docs: {
      ...state.docs,
      [canvasId]: {
        ...host,
        canvas: {
          placements: host.canvas.placements.filter((p) => p.docId !== docId),
          edges: host.canvas.edges.filter((e) => e.from !== docId && e.to !== docId),
        },
      },
    },
  };
}

export function move(
  state: ProtoState,
  canvasId: string,
  docId: string,
  position: Position,
): ProtoState {
  const host = state.docs[canvasId];
  return {
    ...state,
    docs: {
      ...state.docs,
      [canvasId]: {
        ...host,
        canvas: {
          ...host.canvas,
          placements: host.canvas.placements.map((p) => (p.docId === docId ? { ...p, position } : p)),
        },
      },
    },
  };
}

export function setBody(state: ProtoState, docId: string, body: string): ProtoState {
  return { ...state, docs: { ...state.docs, [docId]: { ...state.docs[docId], body } } };
}

export function setTitle(state: ProtoState, docId: string, title: string): ProtoState {
  return { ...state, docs: { ...state.docs, [docId]: { ...state.docs[docId], title } } };
}

export function connect(state: ProtoState, canvasId: string, from: string, to: string): ProtoState {
  const host = state.docs[canvasId];
  if (host.canvas.edges.some((e) => e.from === from && e.to === to)) return state;
  return {
    ...state,
    docs: {
      ...state.docs,
      [canvasId]: { ...host, canvas: { ...host.canvas, edges: [...host.canvas.edges, { from, to }] } },
    },
  };
}

// ── persistence ──────────────────────────────────────────────────────────────

export function emptyState(): ProtoState {
  const rootId = 'root';
  return {
    rootId,
    seq: 1,
    docs: { [rootId]: { id: rootId, title: 'Workspace', body: '', canvas: { placements: [], edges: [] } } },
  };
}

export function load(): ProtoState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ProtoState) : null;
  } catch {
    return null;
  }
}

export function save(state: ProtoState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota — prototype, don't care */
  }
}

export function clearSaved(): void {
  localStorage.removeItem(KEY);
}

export { DOC_W, DOC_H };
