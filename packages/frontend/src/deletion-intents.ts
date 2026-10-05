// What the server should hear when the user deletes fcw shapes from a canvas.
// Deleting a doc box or a doc-canvas chat only unplaces it: the doc stays in the
// global table. A root chat card is archived; its context edges are kept, so the
// arrows that go with it in the same deletion send no disconnect.
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { ChatClientMessage } from '@fcw/graph-core';

export interface DeletedShape {
  type: string;
  props: { docId?: string; chatId?: string } | Record<string, unknown>;
  meta?: { fcwCtx?: unknown; from?: unknown; to?: unknown } | Record<string, unknown>;
}

export function deletionIntents(shapes: DeletedShape[], canvasId: string): ChatClientMessage[] {
  const out: ChatClientMessage[] = [];
  const archived = new Set<string>();
  for (const s of shapes) {
    const props = s.props as { docId?: string; chatId?: string };
    if (s.type === 'doc-node' && props.docId) {
      out.push({ type: 'doc_unplace_requested', canvasId, kind: 'doc', id: props.docId });
    } else if (s.type === 'chat-node' && props.chatId) {
      if (canvasId === ROOT_CANVAS_ID) {
        // Root chats are implicit: the server cannot unplace them there.
        archived.add(props.chatId);
        out.push({ type: 'chat_archive_requested', chatId: props.chatId });
      } else {
        out.push({ type: 'doc_unplace_requested', canvasId, kind: 'chat', id: props.chatId });
      }
    }
  }
  for (const s of shapes) {
    const meta = s.meta as { fcwCtx?: unknown; from?: unknown; to?: unknown } | undefined;
    if (s.type !== 'arrow' || !meta?.fcwCtx) continue;
    const from = String(meta.from);
    const to = String(meta.to);
    if (archived.has(from) || archived.has(to)) continue;
    out.push({ type: 'chat_disconnect_requested', from, to });
  }
  return out;
}
