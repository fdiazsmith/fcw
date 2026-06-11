import { describe, it, expect } from 'vitest';
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

  it('recognizes the new message types', () => {
    expect(isChatClientMessage({ type: 'chat_branch_requested', parentId: 'p', position: { x: 0, y: 0 } })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_connect_requested', from: 'a', to: 'b' })).toBe(true);
    expect(isChatClientMessage({ type: 'chat_disconnect_requested', from: 'a', to: 'b' })).toBe(true);
  });
});
