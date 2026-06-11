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

describe('assembleContext: inheritance', () => {
  it('prepends the parent transcript (grandparents first)', () => {
    const g = createChatGraph('T');
    const a = chatWith(g, ['a-q', 'a-a']);
    const b = chatWith(g, ['b-q', 'b-a']);
    const c = chatWith(g, ['c-q']);
    addContextEdge(g, a, b);
    addContextEdge(g, b, c);
    expect(assembleContext(g, c).map((m) => m.content)).toEqual([
      'a-q', 'a-a', 'b-q', 'b-a', 'c-q',
    ]);
  });

  it('ignores disabled edges', () => {
    const g = createChatGraph('T');
    const a = chatWith(g, ['a-q', 'a-a']);
    const b = chatWith(g, ['b-q']);
    addContextEdge(g, a, b);
    g.edges[0].enabled = false;
    expect(assembleContext(g, b).map((m) => m.content)).toEqual(['b-q']);
  });
});

describe('assembleContext: multiple parents', () => {
  it('merges parents ordered by edge priority (lower first)', () => {
    const g = createChatGraph('T');
    const a = chatWith(g, ['a-q']);
    const b = chatWith(g, ['b-q']);
    const c = chatWith(g, ['c-q']);
    addContextEdge(g, a, c, { priority: 2 });
    addContextEdge(g, b, c, { priority: 1 });
    expect(assembleContext(g, c).map((m) => m.content)).toEqual(['b-q', 'a-q', 'c-q']);
  });

  it('emits a diamond shared ancestor exactly once, before its dependents', () => {
    const g = createChatGraph('T');
    const a = chatWith(g, ['a-q']);
    const b = chatWith(g, ['b-q']);
    const c = chatWith(g, ['c-q']);
    const d = chatWith(g, ['d-q']);
    addContextEdge(g, a, b);
    addContextEdge(g, a, c);
    addContextEdge(g, b, d, { priority: 0 });
    addContextEdge(g, c, d, { priority: 1 });
    expect(assembleContext(g, d).map((m) => m.content)).toEqual([
      'a-q', 'b-q', 'c-q', 'd-q',
    ]);
  });

  it('re-wiring to a different parent rewrites history on the next assembly', () => {
    const g = createChatGraph('T');
    const a = chatWith(g, ['a-q']);
    const b = chatWith(g, ['b-q']);
    const c = chatWith(g, ['c-q']);
    addContextEdge(g, a, c);
    addContextEdge(g, b, c);
    g.edges.find((e) => e.from === b)!.enabled = false;
    expect(assembleContext(g, c).map((m) => m.content)).toEqual(['a-q', 'c-q']);
    g.edges.find((e) => e.from === a)!.enabled = false;
    g.edges.find((e) => e.from === b)!.enabled = true;
    expect(assembleContext(g, c).map((m) => m.content)).toEqual(['b-q', 'c-q']);
  });

  it('is deterministic regardless of edge insertion order', () => {
    const build = (flip: boolean) => {
      const g = createChatGraph('T');
      const a = chatWith(g, ['a-q']);
      const b = chatWith(g, ['b-q']);
      const c = chatWith(g, ['c-q']);
      if (flip) {
        addContextEdge(g, b, c, { priority: 1 });
        addContextEdge(g, a, c, { priority: 0 });
      } else {
        addContextEdge(g, a, c, { priority: 0 });
        addContextEdge(g, b, c, { priority: 1 });
      }
      return assembleContext(g, c).map((m) => m.content);
    };
    expect(build(true)).toEqual(build(false));
  });
});
