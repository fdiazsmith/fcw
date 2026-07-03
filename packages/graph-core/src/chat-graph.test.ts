import { describe, it, expect } from 'vitest';
import {
  createChatGraph,
  addChat,
  appendMessage,
  addContextEdge,
  setEdgeEnabled,
  removeContextEdge,
  setChatPosition,
  removeLastMessage,
  updateChatSettings,
  markSessionStale,
} from './chat-graph.js';

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

describe('setChatPosition', () => {
  it('moves a chat', () => {
    const g = createChatGraph('T');
    const id = addChat(g, { position: { x: 0, y: 0 } });
    setChatPosition(g, id, { x: 40, y: 50 });
    expect(g.chats[id].position).toEqual({ x: 40, y: 50 });
  });

  it('throws for an unknown chat', () => {
    const g = createChatGraph('T');
    expect(() => setChatPosition(g, 'nope', { x: 0, y: 0 })).toThrow(/unknown chat/i);
  });
});

describe('removeLastMessage', () => {
  it('removes and returns the last message', () => {
    const g = createChatGraph('T');
    const id = addChat(g);
    appendMessage(g, id, 'user', 'hello');
    appendMessage(g, id, 'assistant', 'hi there');
    const removed = removeLastMessage(g, id);
    expect(removed).toMatchObject({ role: 'assistant', content: 'hi there' });
    expect(g.chats[id].messages.map((m) => m.content)).toEqual(['hello']);
  });

  it('returns undefined when there are no messages', () => {
    const g = createChatGraph('T');
    const id = addChat(g);
    expect(removeLastMessage(g, id)).toBeUndefined();
    expect(g.chats[id].messages).toHaveLength(0);
  });

  it('throws for an unknown chat id', () => {
    const g = createChatGraph('T');
    expect(() => removeLastMessage(g, 'nope')).toThrow(/unknown chat/i);
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

  it('rejects edges that would create a cycle', () => {
    const g = createChatGraph('T');
    const a = addChat(g);
    const b = addChat(g);
    const c = addChat(g);
    addContextEdge(g, a, b);
    addContextEdge(g, b, c);
    expect(() => addContextEdge(g, c, a)).toThrow(/cycle/i);
    expect(() => addContextEdge(g, b, a)).toThrow(/cycle/i);
    // unrelated edge still fine
    const d = addChat(g);
    addContextEdge(g, a, d);
  });

  it('a disabled edge still counts for cycle detection', () => {
    const g = createChatGraph('T');
    const a = addChat(g);
    const b = addChat(g);
    addContextEdge(g, a, b);
    g.edges[0].enabled = false;
    expect(() => addContextEdge(g, b, a)).toThrow(/cycle/i);
  });
});

describe('setEdgeEnabled / removeContextEdge', () => {
  it('toggles an edge without deleting it', () => {
    const g = createChatGraph('T');
    const a = addChat(g);
    const b = addChat(g);
    addContextEdge(g, a, b);
    setEdgeEnabled(g, a, b, false);
    expect(g.edges[0].enabled).toBe(false);
    setEdgeEnabled(g, a, b, true);
    expect(g.edges[0].enabled).toBe(true);
  });

  it('removes an edge', () => {
    const g = createChatGraph('T');
    const a = addChat(g);
    const b = addChat(g);
    addContextEdge(g, a, b);
    removeContextEdge(g, a, b);
    expect(g.edges).toHaveLength(0);
  });

  it('throws for a missing edge', () => {
    const g = createChatGraph('T');
    const a = addChat(g);
    const b = addChat(g);
    expect(() => setEdgeEnabled(g, a, b, true)).toThrow(/no edge/i);
    expect(() => removeContextEdge(g, a, b)).toThrow(/no edge/i);
  });
});

describe('updateChatSettings', () => {
  it('defaults to the api engine and merges partial settings', () => {
    const g = createChatGraph('S');
    const a = addChat(g);
    updateChatSettings(g, a, { engine: 'agent', model: 'claude-opus-4-8' });
    expect(g.chats[a].settings).toEqual({ engine: 'agent', model: 'claude-opus-4-8' });
    // partial merge keeps prior fields
    updateChatSettings(g, a, { effort: 'xhigh' });
    expect(g.chats[a].settings).toEqual({
      engine: 'agent',
      model: 'claude-opus-4-8',
      effort: 'xhigh',
    });
  });

  it('starts from the api default when no settings exist yet', () => {
    const g = createChatGraph('S');
    const a = addChat(g);
    updateChatSettings(g, a, { cwd: '/tmp' });
    expect(g.chats[a].settings).toEqual({ engine: 'api', cwd: '/tmp' });
  });

  it('throws for an unknown chat', () => {
    const g = createChatGraph('S');
    expect(() => updateChatSettings(g, 'nope', { engine: 'agent' })).toThrow(/unknown chat/i);
  });
});

describe('markSessionStale', () => {
  it('marks the chat and its downstream descendants stale', () => {
    const g = createChatGraph('S');
    const a = addChat(g);
    const b = addChat(g);
    const c = addChat(g);
    const other = addChat(g);
    addContextEdge(g, a, b); // a -> b
    addContextEdge(g, b, c); // b -> c
    markSessionStale(g, a);
    expect(g.chats[a].sessionStale).toBe(true);
    expect(g.chats[b].sessionStale).toBe(true);
    expect(g.chats[c].sessionStale).toBe(true);
    expect(g.chats[other].sessionStale).toBeUndefined();
  });

  it('handles diamonds without infinite loops', () => {
    const g = createChatGraph('S');
    const a = addChat(g);
    const b = addChat(g);
    const c = addChat(g);
    const d = addChat(g);
    addContextEdge(g, a, b);
    addContextEdge(g, a, c);
    addContextEdge(g, b, d);
    addContextEdge(g, c, d);
    markSessionStale(g, a);
    expect([a, b, c, d].every((id) => g.chats[id].sessionStale === true)).toBe(true);
  });

  it('throws for an unknown chat', () => {
    const g = createChatGraph('S');
    expect(() => markSessionStale(g, 'nope')).toThrow(/unknown chat/i);
  });
});
