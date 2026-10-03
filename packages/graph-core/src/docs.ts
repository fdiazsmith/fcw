// Structure-first doc model (see MERMAID-DOCS.md).
//
// Every box on a canvas IS a doc: title, markdown body, and its own child
// canvas. Canvases contain *placements* — {kind, id, position} — never the
// docs (or chats) themselves. Docs live in one global table per workspace, so one doc placed
// on many canvases stays a single entity: nesting is a tree, references are
// a graph. Pure functions, no I/O.

import type { Position } from './types.js';

// A placement puts a doc or a chat on a canvas. `id` keys into the doc table
// (kind 'doc') or the chat table (kind 'chat').
export interface DocPlacement {
  kind: 'doc' | 'chat';
  id: string;
  position: Position;
}

export interface DocEdge {
  from: string; // docId
  to: string; // docId
}

export interface DocCanvas {
  placements: DocPlacement[];
  edges: DocEdge[];
}

export interface Doc {
  id: string;
  title: string;
  body: string; // markdown
  canvas: DocCanvas;
  // Present when the body is generated from the chats placed on its canvas
  // (a compaction-style doc). sourceDigest fingerprints those transcripts at
  // the last generation, so edits to them mark the doc stale.
  generated?: { sourceDigest: string; status: 'generating' | 'idle' };
}

export interface DocWorkspace {
  docs: Record<string, Doc>;
}

let nextId = 0;
const newId = (): string => `doc_${++nextId}`;

export function createWorkspace(): DocWorkspace {
  return { docs: {} };
}

const normTitle = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Docs whose title matches `title` (trim, collapse whitespace, lowercase). Insertion order. */
export function findDocsByTitle(
  ws: Pick<DocWorkspace, 'docs'>,
  title: string,
  opts?: { excludeId?: string },
): Doc[] {
  const q = normTitle(title);
  if (!q) return [];
  return Object.values(ws.docs).filter((d) => d.id !== opts?.excludeId && normTitle(d.title) === q);
}

export function createDoc(ws: DocWorkspace, title: string): [DocWorkspace, Doc] {
  const doc: Doc = {
    id: newId(),
    title,
    body: '',
    canvas: { placements: [], edges: [] },
  };
  return [{ docs: { ...ws.docs, [doc.id]: doc } }, doc];
}

export function placeDoc(
  ws: DocWorkspace,
  canvasDocId: string,
  docId: string,
  position: Position,
): DocWorkspace {
  const host = ws.docs[canvasDocId];
  const updated: Doc = {
    ...host,
    canvas: {
      ...host.canvas,
      placements: [...host.canvas.placements, { kind: 'doc', id: docId, position }],
    },
  };
  return { docs: { ...ws.docs, [canvasDocId]: updated } };
}

export function updateDocBody(ws: DocWorkspace, docId: string, body: string): DocWorkspace {
  return { docs: { ...ws.docs, [docId]: { ...ws.docs[docId], body } } };
}

/** Explicit write-back: replace one doc's body; everything else is untouched. */
export function applyToDoc<W extends DocWorkspace>(ws: W, docId: string, body: string): W {
  const doc = ws.docs[docId];
  if (!doc) throw new Error(`applyToDoc: unknown doc "${docId}"`);
  return { ...ws, docs: { ...ws.docs, [docId]: { ...doc, body } } };
}
