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
