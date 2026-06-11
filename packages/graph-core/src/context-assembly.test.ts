import { describe, it, expect } from 'vitest';
import { createChatGraph, addChat, appendMessage, addContextEdge } from './chat-graph.js';
import { assembleContext } from './context-assembly.js';

function chatWith(g: ReturnType<typeof createChatGraph>, lines: string[]) {
  const id = addChat(g);
  for (const [i, line] of lines.entries()) {
    appendMessage(g, id, i % 2 === 0 ? 'user' : 'assistant', line);
  }
  return id;
}

describe('assembleContext: root chat', () => {
  it('returns the chat own transcript when it has no parents', () => {
    const g = createChatGraph('T');
    const a = chatWith(g, ['q1', 'a1']);
    expect(assembleContext(g, a).map((m) => m.content)).toEqual(['q1', 'a1']);
  });

  it('throws for an unknown chat', () => {
    const g = createChatGraph('T');
    expect(() => assembleContext(g, 'nope')).toThrow(/unknown chat/i);
  });
});
