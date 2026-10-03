import { describe, it, expect } from 'vitest';
import { ROOT_CANVAS_ID } from './index.js';
import type { ChatClientMessage, ChatServerMessage } from './index.js';

describe('doc protocol (M2.2)', () => {
  it("addresses the top-level canvas as 'root'", () => {
    expect(ROOT_CANVAS_ID).toBe('root');
  });

  it('declares the doc_* server and client messages', () => {
    const pos = { x: 1, y: 2 };
    const server: ChatServerMessage[] = [
      { type: 'doc_created', doc: { id: 'd', title: 't', body: '', canvas: { placements: [], edges: [] } } },
      { type: 'doc_updated', docId: 'd', title: 't', body: 'b', generated: { sourceDigest: 's', status: 'idle' } },
      { type: 'doc_placed', canvasId: ROOT_CANVAS_ID, placement: { kind: 'doc', id: 'd', position: pos } },
      { type: 'doc_unplaced', canvasId: 'd', kind: 'chat', id: 'c' },
      { type: 'doc_moved', canvasId: 'd', kind: 'chat', id: 'c', position: pos },
      { type: 'doc_linked', canvasId: ROOT_CANVAS_ID, placedDocId: 'a', existingDocId: 'b' },
    ];
    const client: ChatClientMessage[] = [
      { type: 'doc_create_requested', canvasId: ROOT_CANVAS_ID, title: 't', position: pos },
      { type: 'doc_update_requested', docId: 'd', body: 'b' },
      { type: 'doc_place_requested', canvasId: 'd', kind: 'doc', id: 'e', position: pos },
      { type: 'doc_unplace_requested', canvasId: 'd', kind: 'doc', id: 'e' },
      { type: 'doc_move_requested', canvasId: 'd', kind: 'doc', id: 'e', position: pos },
      { type: 'doc_link_requested', canvasId: 'd', placedDocId: 'a', existingDocId: 'b' },
      { type: 'doc_regenerate_requested', docId: 'd' },
      { type: 'chat_compact_requested', chatIds: ['c'], canvasId: 'd' },
    ];
    expect(server).toHaveLength(6);
    expect(client).toHaveLength(8);
  });
});
