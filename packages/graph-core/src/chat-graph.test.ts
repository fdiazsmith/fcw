import { describe, it, expect } from 'vitest';
import { createChatGraph, addChat, appendMessage, addContextEdge } from './chat-graph.js';

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

describe('addContextEdge', () => {
  it('creates an enabled edge with default priority 0', () => {
    const g = createChatGraph('T');
    const a = addChat(g);
    const b = addChat(g);
    addContextEdge(g, a, b);
    expect(g.edges).toEqual([{ from: a, to: b, enabled: true, priority: 0 }]);
  });

  it('accepts an explicit priority', () => {
    const g = createChatGraph('T');
    const a = addChat(g);
    const b = addChat(g);
    addContextEdge(g, a, b, { priority: 5 });
    expect(g.edges[0].priority).toBe(5);
  });

  it('throws on unknown endpoints, self-edges, and duplicates', () => {
    const g = createChatGraph('T');
    const a = addChat(g);
    const b = addChat(g);
    expect(() => addContextEdge(g, a, 'nope')).toThrow(/unknown chat/i);
    expect(() => addContextEdge(g, 'nope', b)).toThrow(/unknown chat/i);
    expect(() => addContextEdge(g, a, a)).toThrow(/self/i);
    addContextEdge(g, a, b);
    expect(() => addContextEdge(g, a, b)).toThrow(/exists/i);
  });
});
