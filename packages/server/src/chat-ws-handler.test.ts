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

  it('chat_stop_requested stops the in-flight stream (partial settles)', async () => {
    const sessions = new ChatSessionManager('T');
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    async function* slow(): AsyncGenerator<string> {
      yield 'par';
      await handleChatClientMessage({ type: 'chat_stop_requested', chatId: id }, sessions);
      yield 'tial';
    }
    (sessions as unknown as { streamText: () => AsyncIterable<string> }).streamText = () => slow();
    await handleChatClientMessage({ type: 'chat_prompt_submitted', chatId: id, content: 'hi' }, sessions);
    const msgs = sessions.graph.chats[id].messages;
    expect(msgs[msgs.length - 1]).toMatchObject({ role: 'assistant', content: 'par' });
  });

  it('chat_regenerate_requested re-runs the last turn', async () => {
    async function* stream(): AsyncGenerator<string> {
      yield 'ok';
    }
    const sessions = new ChatSessionManager('T', () => stream());
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
