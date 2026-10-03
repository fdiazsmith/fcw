// What the server should hear when the user deletes fcw shapes from a canvas.
// Deleting only unplaces: the doc itself stays in the global table.
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { ChatClientMessage } from '@fcw/graph-core';

export interface DeletedShape {
  type: string;
  props: { docId?: string; chatId?: string } | Record<string, unknown>;
}

export function deletionIntents(shapes: DeletedShape[], canvasId: string): ChatClientMessage[] {
  const out: ChatClientMessage[] = [];
  for (const s of shapes) {
    const props = s.props as { docId?: string; chatId?: string };
    if (s.type === 'doc-node' && props.docId) {
      out.push({ type: 'doc_unplace_requested', canvasId, kind: 'doc', id: props.docId });
    } else if (s.type === 'chat-node' && props.chatId && canvasId !== ROOT_CANVAS_ID) {
      // Root chats are implicit: the server has no way to unplace them there.
      out.push({ type: 'doc_unplace_requested', canvasId, kind: 'chat', id: props.chatId });
    }
  }
  return out;
}
