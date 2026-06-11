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
});
