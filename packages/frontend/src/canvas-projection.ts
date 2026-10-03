// Pure projection: what one canvas should show. The store owns doc boxes,
// chat cards and their arrows; ChatCanvas diffs this against tldraw and leaves
// every other shape (freehand, user arrows) alone.
import { ROOT_CANVAS_ID, findDocsByTitle } from '@fcw/graph-core';
import type { Doc, Position } from '@fcw/graph-core';
import type { ChatState } from './chat-store';
import { canvasById, canvasesPlacing, chatIdsOn } from './chat-store';
import { docCardModel, DocCardModel } from './doc-view';

export interface ProjectedDoc {
  docId: string;
  position: Position;
  model: DocCardModel;
  /** An existing doc with the same title: offer "link instead?" (M3.5). */
  linkTo: string | null;
}

export interface ProjectedChat {
  chatId: string;
  position: Position;
}

export interface ProjectedEdge {
  from: string;
  to: string;
}

export interface CanvasProjection {
  docs: ProjectedDoc[];
  chats: ProjectedChat[];
  docEdges: ProjectedEdge[];
  chatEdges: ProjectedEdge[];
}

/** Other docs titled like this one — candidates to link instead of keeping a new doc. */
export function linkCandidates(state: ChatState, docId: string): Doc[] {
  const doc = state.docs[docId];
  if (!doc) return [];
  return findDocsByTitle(state, doc.title, { excludeId: docId });
}

function membersOf(state: ChatState, docId: string) {
  return chatIdsOn(state, docId)
    .map((id) => state.chats[id])
    .filter(Boolean)
    .map((c) => ({ id: c.id, messages: c.messages }));
}

export function projectCanvas(state: ChatState, canvasId: string): CanvasProjection {
  const canvas = canvasById(state, canvasId);
  if (!canvas) return { docs: [], chats: [], docEdges: [], chatEdges: [] };

  const docs: ProjectedDoc[] = canvas.placements
    .filter((p) => p.kind === 'doc' && state.docs[p.id])
    .map((p) => ({
      docId: p.id,
      position: p.position,
      model: docCardModel(state.docs[p.id], {
        placedOnCount: canvasesPlacing(state, p.id).length,
        members: membersOf(state, p.id),
      }),
      linkTo: linkCandidates(state, p.id)[0]?.id ?? null,
    }));

  const chats: ProjectedChat[] =
    canvasId === ROOT_CANVAS_ID
      ? chatIdsOn(state, canvasId).map((id) => ({ chatId: id, position: state.chats[id].position }))
      : canvas.placements
          .filter((p) => p.kind === 'chat' && state.chats[p.id])
          .map((p) => ({ chatId: p.id, position: p.position }));

  const docIds = new Set(docs.map((d) => d.docId));
  const chatIds = new Set(chats.map((c) => c.chatId));
  return {
    docs,
    chats,
    docEdges: canvas.edges.filter((e) => docIds.has(e.from) && docIds.has(e.to)).map(({ from, to }) => ({ from, to })),
    chatEdges: state.edges.filter((e) => chatIds.has(e.from) && chatIds.has(e.to)).map(({ from, to }) => ({ from, to })),
  };
}
