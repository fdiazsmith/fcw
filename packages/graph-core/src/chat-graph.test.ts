import { describe, it, expect } from 'vitest';
import { createChatGraph, addChat, appendMessage } from './chat-graph.js';

describe('createChatGraph', () => {
  it('returns an empty versioned chat graph', () => {
    const g = createChatGraph('My Canvas');
    expect(g.id).toBeTruthy();
    expect(g.version).toBe(2);
    expect(g.meta.title).toBe('My Canvas');
    expect(g.meta.created).toBeTruthy();
    expect(Object.keys(g.chats)).toHaveLength(0);
    expect(g.edges).toHaveLength(0);
  });

  it('generates unique graph ids', () => {
    expect(createChatGraph('A').id).not.toBe(createChatGraph('B').id);
  });
});

describe('addChat', () => {
  it('adds an empty chat node and returns its id', () => {
    const g = createChatGraph('T');
    const id = addChat(g, { position: { x: 10, y: 20 } });
    const chat = g.chats[id];
    expect(chat).toBeDefined();
    expect(chat.id).toBe(id);
    expect(chat.messages).toHaveLength(0);
    expect(chat.position).toEqual({ x: 10, y: 20 });
    expect(chat.createdAt).toBeTruthy();
  });

  it('generates unique chat ids within a graph', () => {
    const g = createChatGraph('T');
    expect(addChat(g)).not.toBe(addChat(g));
  });
});

describe('appendMessage', () => {
  it('appends messages to a chat transcript in order', () => {
    const g = createChatGraph('T');
    const id = addChat(g);
    appendMessage(g, id, 'user', 'hello');
    appendMessage(g, id, 'assistant', 'hi there');
    expect(g.chats[id].messages.map((m) => m.content)).toEqual(['hello', 'hi there']);
    expect(g.chats[id].messages[0].role).toBe('user');
    expect(g.chats[id].messages[0].createdAt).toBeTruthy();
  });

  it('throws for an unknown chat id', () => {
    const g = createChatGraph('T');
    expect(() => appendMessage(g, 'nope', 'user', 'x')).toThrow(/unknown chat/i);
  });
});
