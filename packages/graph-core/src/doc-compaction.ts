// Compaction in the structure-first model (see MERMAID-DOCS.md § Decisions,
// "Compaction vs. Doc"): compacting chats creates a Doc whose body is
// generated from their transcripts, with those chats placed on its child
// canvas. Mutates the ChatGraph in place, like addCompaction.
import type { ChatGraph } from './chat-graph.js';
import { compactionDigest } from './compaction.js';
import type { CompactionMember } from './compaction.js';
import type { Doc, DocCanvas } from './docs.js';
import type { Position } from './types.js';

let docCounter = 0;

export function compactChats(
  graph: ChatGraph,
  chatIds: string[],
  options?: { title?: string; position?: Position; sourceCanvasDocId?: string },
): string {
  if (chatIds.length === 0) throw new Error('compaction needs at least one chat');
  for (const chatId of chatIds) {
    if (!graph.chats[chatId]) throw new Error(`unknown chat: ${chatId}`);
  }
  const sourceId = options?.sourceCanvasDocId;
  if (sourceId !== undefined && !graph.docs[sourceId]) throw new Error(`unknown doc: ${sourceId}`);

  // A chat lives behind at most one compaction. The source canvas is exempt:
  // its placements of these chats move onto the new doc.
  for (const doc of Object.values(graph.docs)) {
    if (!doc.generated || doc.id === sourceId) continue;
    const taken = doc.canvas.placements.find((p) => p.kind === 'chat' && chatIds.includes(p.id));
    if (taken) throw new Error(`chat already compacted: ${taken.id} (in ${doc.id})`);
  }
  for (const existing of Object.values(graph.compactions)) {
    const taken = chatIds.find((c) => existing.memberIds.includes(c));
    if (taken) throw new Error(`chat already compacted: ${taken} (in ${existing.id})`);
  }

  // A chat's current position: its placement on the source doc canvas, or
  // ChatNode.position when it sits on the root canvas.
  const sourcePlacements = sourceId !== undefined ? graph.docs[sourceId].canvas.placements : [];
  const positionOf = (chatId: string): Position =>
    sourcePlacements.find((p) => p.kind === 'chat' && p.id === chatId)?.position ??
    graph.chats[chatId].position;
  const positions = chatIds.map(positionOf);
  const position = options?.position ?? {
    x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
    y: positions.reduce((sum, p) => sum + p.y, 0) / positions.length,
  };

  const id = `doc_${Date.now()}_${++docCounter}`;
  graph.docs[id] = {
    id,
    title: options?.title ?? graph.chats[chatIds[0]].title,
    body: '',
    createdAt: new Date().toISOString(),
    canvas: {
      placements: chatIds.map((c, i) => ({ kind: 'chat', id: c, position: { ...positions[i] } })),
      edges: [],
    },
    generated: { sourceDigest: '', status: 'generating' },
  };

  let target: DocCanvas = graph.rootCanvas;
  if (sourceId !== undefined) {
    target = graph.docs[sourceId].canvas;
    target.placements = target.placements.filter(
      (p) => !(p.kind === 'chat' && chatIds.includes(p.id)),
    );
  }
  target.placements.push({ kind: 'doc', id, position });
  return id;
}

/** True when a member transcript changed since the body was generated.
 *  A doc without a generated body is never stale. */
export function docIsStale(doc: Doc, members: CompactionMember[]): boolean {
  if (!doc.generated) return false;
  return compactionDigest(members) !== doc.generated.sourceDigest;
}

/** Old graph.compactions → generated docs (same id) placed on the root
 *  canvas, members placed on each doc's child canvas. Idempotent: an
 *  already-migrated doc is left as is and never placed twice. */
export function migrateCompactions(graph: ChatGraph): void {
  for (const c of Object.values(graph.compactions)) {
    if (graph.docs[c.id]) continue;
    graph.docs[c.id] = {
      id: c.id,
      title: c.title,
      body: c.document,
      createdAt: c.createdAt,
      canvas: {
        placements: c.memberIds.map((m) => ({
          kind: 'chat',
          id: m,
          position: { ...graph.chats[m].position },
        })),
        edges: [],
      },
      generated: { sourceDigest: c.sourceDigest, status: c.status },
    };
    graph.rootCanvas.placements.push({ kind: 'doc', id: c.id, position: { ...c.position } });
  }
  graph.compactions = {};
}
