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
