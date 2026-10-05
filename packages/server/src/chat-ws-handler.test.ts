import { describe, it, expect, vi } from 'vitest';
import { ChatSessionManager } from './chat-session.js';
import { handleChatClientMessage, isChatClientMessage } from './chat-ws-handler.js';

describe('isChatClientMessage', () => {
  it('recognizes chat client messages and rejects v1 messages', () => {
    expect(isChatClientMessage({ type: 'chat_create_requested', position: { x: 0, y: 0 } })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_prompt_submitted', chatId: 'c', content: 'x' })).toBe(true);
    expect(isChatClientMessage({ type: 'user_prompt_submitted', content: 'x' })).toBe(false);
    expect(isChatClientMessage({ type: 'chat_bogus' })).toBe(false);
    expect(isChatClientMessage('junk')).toBe(false);
  });

  it('recognizes compaction messages', () => {
    expect(isChatClientMessage({ type: 'chat_compact_requested', chatIds: ['a'] })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_compact_requested', chatIds: [] })).toBe(false);
    // Legacy chat_compaction_* requests were removed at M3.6.
    expect(isChatClientMessage({ type: 'chat_compaction_regenerate_requested', compactionId: 'c' })).toBe(false);
    expect(
      isChatClientMessage({ type: 'chat_compaction_document_updated', compactionId: 'c', document: 'd' }),
    ).toBe(false);
    expect(
      isChatClientMessage({ type: 'chat_compaction_move_requested', compactionId: 'c', position: { x: 1, y: 2 } }),
    ).toBe(false);
  });
});

describe('doc_* client messages (M2.2)', () => {
  const pos = { x: 1, y: 2 };

  it('validates doc requests', () => {
    expect(isChatClientMessage({ type: 'doc_create_requested', canvasId: 'root', title: 't', position: pos })).toBe(true);
    expect(isChatClientMessage({ type: 'doc_create_requested', canvasId: 'root', position: pos })).toBe(false);
    expect(isChatClientMessage({ type: 'doc_update_requested', docId: 'd', body: 'b' })).toBe(true);
    expect(isChatClientMessage({ type: 'doc_update_requested', docId: 'd', body: 3 })).toBe(false);
    expect(isChatClientMessage({ type: 'doc_place_requested', canvasId: 'd', kind: 'chat', id: 'c', position: pos })).toBe(true);
    expect(isChatClientMessage({ type: 'doc_place_requested', canvasId: 'd', kind: 'box', id: 'c', position: pos })).toBe(false);
    expect(isChatClientMessage({ type: 'doc_unplace_requested', canvasId: 'd', kind: 'doc', id: 'e' })).toBe(true);
    expect(isChatClientMessage({ type: 'doc_move_requested', canvasId: 'd', kind: 'doc', id: 'e', position: pos })).toBe(true);
    expect(isChatClientMessage({ type: 'doc_move_requested', canvasId: 'd', kind: 'doc', id: 'e' })).toBe(false);
    expect(isChatClientMessage({ type: 'doc_link_requested', canvasId: 'd', placedDocId: 'a', existingDocId: 'b' })).toBe(true);
    expect(isChatClientMessage({ type: 'doc_link_requested', canvasId: 'd', placedDocId: 'a' })).toBe(false);
  });

  it('dispatches doc requests to the session manager', async () => {
    const sessions = new ChatSessionManager();
    await handleChatClientMessage({ type: 'doc_create_requested', canvasId: 'root', title: 'Host', position: pos }, sessions);
    const host = Object.keys(sessions.graph.docs)[0];
    await handleChatClientMessage({ type: 'doc_create_requested', canvasId: host, title: 'Box', position: pos }, sessions);
    const box = Object.keys(sessions.graph.docs)[1];
    await handleChatClientMessage({ type: 'doc_update_requested', docId: box, title: 'Auth', body: 'b' }, sessions);
    expect(sessions.graph.docs[box]).toMatchObject({ title: 'Auth', body: 'b' });

    const chat = sessions.createChat(pos);
    await handleChatClientMessage({ type: 'doc_place_requested', canvasId: host, kind: 'chat', id: chat, position: pos }, sessions);
    await handleChatClientMessage({ type: 'doc_move_requested', canvasId: host, kind: 'chat', id: chat, position: { x: 9, y: 9 } }, sessions);
    expect(sessions.graph.docs[host].canvas.placements[1]).toEqual({ kind: 'chat', id: chat, position: { x: 9, y: 9 } });
    await handleChatClientMessage({ type: 'doc_unplace_requested', canvasId: host, kind: 'chat', id: chat }, sessions);
    expect(sessions.graph.docs[host].canvas.placements).toHaveLength(1);

    await handleChatClientMessage({ type: 'doc_create_requested', canvasId: 'root', title: 'Existing', position: pos }, sessions);
    const existing = Object.keys(sessions.graph.docs)[2];
    await handleChatClientMessage({ type: 'doc_link_requested', canvasId: host, placedDocId: box, existingDocId: existing }, sessions);
    expect(sessions.graph.docs[host].canvas.placements).toEqual([{ kind: 'doc', id: existing, position: pos }]);
  });

  it('rejects unknown ids without mutating', async () => {
    const sessions = new ChatSessionManager();
    await expect(
      handleChatClientMessage({ type: 'doc_update_requested', docId: 'nope', body: 'x' }, sessions),
    ).rejects.toThrow(/unknown doc/);
    await expect(
      handleChatClientMessage({ type: 'doc_create_requested', canvasId: 'nope', title: 't', position: pos }, sessions),
    ).rejects.toThrow(/unknown canvas/);
    expect(sessions.graph.docs).toEqual({});
  });
});

describe('handleChatClientMessage', () => {
  it('chat_create_requested creates a chat at the given position', async () => {
    const sessions = new ChatSessionManager();
    await handleChatClientMessage(
      { type: 'chat_create_requested', position: { x: 3, y: 4 } },
      sessions,
    );
    const chats = Object.values(sessions.graph.chats);
    expect(chats).toHaveLength(1);
    expect(chats[0].position).toEqual({ x: 3, y: 4 });
  });

  it('chat_prompt_submitted runs a prompt turn', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    await handleChatClientMessage(
      { type: 'chat_prompt_submitted', chatId: id, content: 'hi' },
      sessions,
    );
    expect(sessions.graph.chats[id].messages).toHaveLength(1);
  });

  it('chat_branch_requested creates a connected child', async () => {
    const sessions = new ChatSessionManager();
    const parent = sessions.createChat({ x: 0, y: 0 });
    await handleChatClientMessage(
      { type: 'chat_branch_requested', parentId: parent, position: { x: 1, y: 2 } },
      sessions,
    );
    expect(Object.keys(sessions.graph.chats)).toHaveLength(2);
    expect(sessions.graph.edges).toHaveLength(1);
    expect(sessions.graph.edges[0].from).toBe(parent);
  });

  it('chat_connect_requested and chat_disconnect_requested manage edges', async () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    await handleChatClientMessage({ type: 'chat_connect_requested', from: a, to: b }, sessions);
    expect(sessions.graph.edges).toHaveLength(1);
    await handleChatClientMessage({ type: 'chat_disconnect_requested', from: a, to: b }, sessions);
    expect(sessions.graph.edges).toHaveLength(0);
  });

  it('chat_move_requested updates the chat position', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    await handleChatClientMessage(
      { type: 'chat_move_requested', chatId: id, position: { x: 7, y: 8 } },
      sessions,
    );
    expect(sessions.graph.chats[id].position).toEqual({ x: 7, y: 8 });
  });

  it('chat_compact_requested folds chats into a generated doc', async () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    sessions.graph.chats[a].messages.push({ role: 'user', content: 'stuff', createdAt: 't' });
    await handleChatClientMessage({ type: 'chat_compact_requested', chatIds: [a] }, sessions);
    const docs = Object.values(sessions.graph.docs);
    expect(docs).toHaveLength(1);
    expect(docs[0].canvas.placements).toEqual([{ kind: 'chat', id: a, position: { x: 0, y: 0 } }]);
    expect(docs[0].body).toContain('stuff');
    expect(sessions.graph.compactions).toEqual({});
  });

  it('chat_compact_requested honours canvasId', async () => {
    const sessions = new ChatSessionManager();
    const host = sessions.createDoc('root', 'Host', { x: 0, y: 0 });
    const a = sessions.createChat({ x: 0, y: 0 });
    sessions.placeOnCanvas(host, 'chat', a, { x: 4, y: 4 });
    expect(isChatClientMessage({ type: 'chat_compact_requested', chatIds: [a], canvasId: host })).toBe(true);
    await handleChatClientMessage({ type: 'chat_compact_requested', chatIds: [a], canvasId: host }, sessions);
    expect(sessions.graph.docs[host].canvas.placements).toEqual([
      { kind: 'doc', id: expect.any(String), position: { x: 4, y: 4 } },
    ]);
  });

  it('doc_regenerate_requested re-generates the body', async () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    const id = await sessions.compact([a]);
    sessions.graph.chats[a].messages.push({ role: 'user', content: 'fresh insight', createdAt: 't' });
    expect(isChatClientMessage({ type: 'doc_regenerate_requested', docId: id })).toBe(true);
    await handleChatClientMessage({ type: 'doc_regenerate_requested', docId: id }, sessions);
    expect(sessions.graph.docs[id].body).toContain('fresh insight');
  });

  it('chat_stop_requested stops the in-flight stream (partial settles)', async () => {
    const sessions = new ChatSessionManager('T');
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    async function* slow(): AsyncGenerator<import('./turn-events.js').TurnEvent> {
      yield { type: 'text_delta', text: 'par' };
      await handleChatClientMessage({ type: 'chat_stop_requested', chatId: id }, sessions);
      yield { type: 'text_delta', text: 'tial' };
    }
    (sessions as unknown as { streams: { api: () => AsyncIterable<unknown> } }).streams.api = () => slow();
    await handleChatClientMessage({ type: 'chat_prompt_submitted', chatId: id, content: 'hi' }, sessions);
    const msgs = sessions.graph.chats[id].messages;
    expect(msgs[msgs.length - 1]).toMatchObject({ role: 'assistant', content: 'par' });
  });

  it('chat_regenerate_requested re-runs the last turn', async () => {
    const sessions = new ChatSessionManager('T', {
      api: async function* () {
        yield { type: 'text_delta', text: 'ok' };
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    await sessions.prompt(id, 'q');
    expect(sessions.graph.chats[id].messages).toHaveLength(2);
    await handleChatClientMessage({ type: 'chat_regenerate_requested', chatId: id }, sessions);
    const msgs = sessions.graph.chats[id].messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('recognizes the new message types', () => {
    expect(isChatClientMessage({ type: 'chat_stop_requested', chatId: 'c' })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_regenerate_requested', chatId: 'c' })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_move_requested', chatId: 'c', position: { x: 0, y: 0 } })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_branch_requested', parentId: 'p', position: { x: 0, y: 0 } })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_connect_requested', from: 'a', to: 'b' })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_disconnect_requested', from: 'a', to: 'b' })).toBe(true);
  });

  it('recognizes settings / attachment / permission messages', () => {
    expect(
      isChatClientMessage({ type: 'chat_settings_updated', chatId: 'c', settings: { engine: 'agent' } }),
    ).toBe(true);
    expect(
      isChatClientMessage({ type: 'chat_prompt_submitted', chatId: 'c', content: 'x', attachmentIds: ['a1'] }),
    ).toBe(true);
    expect(
      isChatClientMessage({ type: 'chat_permission_decision', chatId: 'c', requestId: 'r', behavior: 'allow' }),
    ).toBe(true);
    // invalid enum values are rejected
    expect(
      isChatClientMessage({ type: 'chat_settings_updated', chatId: 'c', settings: { engine: 'bogus' } }),
    ).toBe(false);
    expect(
      isChatClientMessage({ type: 'chat_permission_decision', chatId: 'c', requestId: 'r', behavior: 'maybe' }),
    ).toBe(false);
  });

  it('chat_settings_updated dispatches to sessions.updateSettings', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    const spy = vi.spyOn(sessions, 'updateSettings');
    await handleChatClientMessage(
      { type: 'chat_settings_updated', chatId: id, settings: { engine: 'agent', effort: 'high' } },
      sessions,
    );
    expect(spy).toHaveBeenCalledWith(id, { engine: 'agent', effort: 'high' });
    expect(sessions.graph.chats[id].settings).toMatchObject({ engine: 'agent', effort: 'high' });
  });

  it('chat_prompt_submitted forwards attachmentIds', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    const spy = vi.spyOn(sessions, 'prompt');
    await handleChatClientMessage(
      { type: 'chat_prompt_submitted', chatId: id, content: 'hi', attachmentIds: ['a1', 'a2'] },
      sessions,
    );
    expect(spy).toHaveBeenCalledWith(id, 'hi', ['a1', 'a2']);
  });

  it('chat_permission_decision dispatches to sessions.resolvePermission', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    const spy = vi.spyOn(sessions, 'resolvePermission');
    await handleChatClientMessage(
      { type: 'chat_permission_decision', chatId: id, requestId: 'r1', behavior: 'deny', message: 'no' },
      sessions,
    );
    expect(spy).toHaveBeenCalledWith(id, 'r1', { behavior: 'deny', message: 'no' });
  });
});

describe('doc-chat messages (M2.6)', () => {
  it('validates', () => {
    expect(isChatClientMessage({ type: 'doc_chat_requested', docId: 'd' })).toBe(true);
    expect(isChatClientMessage({ type: 'doc_chat_requested' })).toBe(false);
    expect(isChatClientMessage({ type: 'doc_apply_requested', docId: 'd', chatId: 'c', messageIndex: 1 })).toBe(true);
    expect(isChatClientMessage({ type: 'doc_apply_requested', docId: 'd', chatId: 'c', messageIndex: -1 })).toBe(false);
    expect(isChatClientMessage({ type: 'doc_apply_requested', docId: 'd', chatId: 'c', messageIndex: 1.5 })).toBe(false);
    expect(isChatClientMessage({ type: 'doc_apply_requested', docId: 'd', chatId: 'c' })).toBe(false);
  });

  it('dispatches to requestDocChat and applyToDoc', async () => {
    const sessions = new ChatSessionManager();
    const req = vi.spyOn(sessions, 'requestDocChat').mockReturnValue('c');
    const apply = vi.spyOn(sessions, 'applyToDoc').mockReturnValue();
    await handleChatClientMessage({ type: 'doc_chat_requested', docId: 'd' }, sessions);
    await handleChatClientMessage({ type: 'doc_apply_requested', docId: 'd', chatId: 'c', messageIndex: 1 }, sessions);
    expect(req).toHaveBeenCalledWith('d');
    expect(apply).toHaveBeenCalledWith('d', 'c', 1);
  });
});

describe('diagram_requested (M2.5)', () => {
  it('validates', () => {
    expect(isChatClientMessage({ type: 'diagram_requested', canvasId: 'root', prompt: 'p' })).toBe(true);
    expect(isChatClientMessage({ type: 'diagram_requested', canvasId: 'root' })).toBe(false);
    expect(isChatClientMessage({ type: 'diagram_requested', prompt: 'p' })).toBe(false);
  });

  it('dispatches to requestDiagram', async () => {
    const sessions = new ChatSessionManager();
    const spy = vi.spyOn(sessions, 'requestDiagram').mockResolvedValue();
    await handleChatClientMessage({ type: 'diagram_requested', canvasId: 'root', prompt: 'p' }, sessions);
    expect(spy).toHaveBeenCalledWith('root', 'p');
  });
});

describe('chat archive / delete messages', () => {
  it('validates', () => {
    for (const type of ['chat_archive_requested', 'chat_unarchive_requested', 'chat_delete_requested']) {
      expect(isChatClientMessage({ type, chatId: 'c' })).toBe(true);
      expect(isChatClientMessage({ type })).toBe(false);
    }
  });

  it('dispatches to setChatArchived and deleteChat', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    await handleChatClientMessage({ type: 'chat_archive_requested', chatId: id }, sessions);
    expect(sessions.graph.chats[id].archived).toBe(true);
    await handleChatClientMessage({ type: 'chat_unarchive_requested', chatId: id }, sessions);
    expect(sessions.graph.chats[id].archived).toBeUndefined();
    await handleChatClientMessage({ type: 'chat_delete_requested', chatId: id }, sessions);
    expect(sessions.graph.chats[id]).toBeUndefined();
  });
});
