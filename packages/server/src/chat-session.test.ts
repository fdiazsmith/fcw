import { describe, it, expect } from 'vitest';
import type { ChatServerMessage } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

function collect(sessions: ChatSessionManager): ChatServerMessage[] {
  const events: ChatServerMessage[] = [];
  sessions.on('message', (msg: ChatServerMessage) => events.push(msg));
  return events;
}

describe('ChatSessionManager.createChat', () => {
  it('adds a chat to the graph and emits chat_created', () => {
    const sessions = new ChatSessionManager();
    const events = collect(sessions);
    const id = sessions.createChat({ x: 5, y: 7 });
    expect(sessions.graph.chats[id]).toBeDefined();
    expect(sessions.graph.chats[id].position).toEqual({ x: 5, y: 7 });
    expect(events).toEqual([{ type: 'chat_created', chat: sessions.graph.chats[id] }]);
  });
});

describe('ChatSessionManager.prompt', () => {
  it('appends the user message and emits chat_user_message (no stream fn)', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    await sessions.prompt(id, 'hello');
    expect(sessions.graph.chats[id].messages).toHaveLength(1);
    expect(sessions.graph.chats[id].messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(events).toEqual([
      { type: 'chat_user_message', chatId: id, message: sessions.graph.chats[id].messages[0] },
    ]);
  });

  it('rejects for an unknown chat', async () => {
    const sessions = new ChatSessionManager();
    await expect(sessions.prompt('nope', 'x')).rejects.toThrow(/unknown chat/i);
  });
});
