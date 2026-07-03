import { describe, it, expect } from 'vitest';
import { createChatGraph, addChat, appendMessage, addContextEdge } from './chat-graph.js';
import { chatGraphToJSON, chatGraphFromJSON } from './chat-graph-serialization.js';

describe('chat-graph serialization', () => {
  it('round-trips a graph through JSON', () => {
    const g = createChatGraph('Round Trip');
    const a = addChat(g, { title: 'root', position: { x: 1, y: 2 } });
    const b = addChat(g);
    appendMessage(g, a, 'user', 'hello');
    appendMessage(g, a, 'assistant', 'hi');
    addContextEdge(g, a, b, { priority: 3 });
    g.chats[a].summary = 'greeting chat';

    const restored = chatGraphFromJSON(chatGraphToJSON(g));
    expect(restored).toEqual(g);
  });

  it('round-trips new settings/session/attachment/tool fields', () => {
    const g = createChatGraph('New Fields');
    const a = addChat(g, { title: 'root' });
    const b = addChat(g);
    g.chats[a].settings = { engine: 'agent', model: 'claude-opus-4-8', effort: 'xhigh', cwd: '/repo' };
    g.chats[a].sessionId = 'sess_123';
    g.chats[a].sessionStale = true;
    appendMessage(g, a, 'user', 'look at this');
    g.chats[a].messages[0].attachments = [
      { id: 'att1', name: 'a.png', mediaType: 'image/png', path: '/d/att1.png' },
    ];
    appendMessage(g, a, 'tool', 'Read result');
    Object.assign(g.chats[a].messages[1], {
      toolUseId: 'tu_1',
      toolName: 'Read',
      toolInput: { path: '/x' },
    });
    addContextEdge(g, a, b);

    const restored = chatGraphFromJSON(chatGraphToJSON(g));
    expect(restored).toEqual(g);
  });

  it('loads legacy graphs that lack the new fields', () => {
    const legacy = JSON.stringify({
      id: 'cg_legacy',
      version: 2,
      meta: { title: 'Legacy', created: '2024-01-01T00:00:00.000Z' },
      chats: {
        chat_1: {
          id: 'chat_1',
          title: 'old',
          messages: [{ role: 'user', content: 'hi', createdAt: '2024-01-01T00:00:00.000Z' }],
          position: { x: 0, y: 0 },
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      },
      edges: [],
    });
    const g = chatGraphFromJSON(legacy);
    expect(g.chats.chat_1.settings).toBeUndefined();
    expect(g.chats.chat_1.sessionId).toBeUndefined();
    expect(g.chats.chat_1.messages[0].attachments).toBeUndefined();
  });

  it('rejects documents without version 2', () => {
    const v1doc = JSON.stringify({ id: 'doc_1', meta: {}, nodes: {}, edges: [] });
    expect(() => chatGraphFromJSON(v1doc)).toThrow(/version/i);
  });

  it('rejects malformed JSON', () => {
    expect(() => chatGraphFromJSON('not json {')).toThrow();
  });

  it('rejects edges referencing missing chats', () => {
    const g = createChatGraph('Bad');
    const a = addChat(g);
    const b = addChat(g);
    addContextEdge(g, a, b);
    const json = JSON.parse(chatGraphToJSON(g));
    delete json.chats[a];
    expect(() => chatGraphFromJSON(JSON.stringify(json))).toThrow(/unknown chat/i);
  });
});
