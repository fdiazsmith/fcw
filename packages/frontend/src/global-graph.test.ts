import { describe, it, expect } from 'vitest';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { Doc } from '@fcw/graph-core';
import { emptyChatState } from './chat-store';
import type { ChatState } from './chat-store';
import { globalGraph, simulate, GRAPH_W, GRAPH_H } from './global-graph';

const doc = (id: string, over: Partial<Doc> = {}): Doc => ({
  id,
  title: id.toUpperCase(),
  body: '',
  canvas: { placements: [], edges: [] },
  ...over,
});
const at = { x: 0, y: 0 };

function state(): ChatState {
  const s = emptyChatState();
  s.docs = {
    a: doc('a', {
      body: 'prose',
      canvas: {
        placements: [
          { kind: 'doc', id: 'b', position: at },
          { kind: 'doc', id: 'b', position: at },
          { kind: 'chat', id: 'c1', position: at },
        ],
        edges: [{ from: 'b', to: 'c' }],
      },
    }),
    b: doc('b'),
    c: doc('c'),
  };
  s.rootCanvas = { placements: [{ kind: 'doc', id: 'a', position: at }], edges: [] };
  return s;
}

describe('globalGraph', () => {
  it('has a node per doc plus the synthetic root; chats are not nodes', () => {
    const g = globalGraph(state());
    expect(g.nodes.map((n) => n.id).sort()).toEqual([ROOT_CANVAS_ID, 'a', 'b', 'c'].sort());
    expect(g.nodes.find((n) => n.id === ROOT_CANVAS_ID)!.title).toBe('Canvas');
  });

  it('edges: placements (deduped, host -> placed) and doc edges; root hosts its placements', () => {
    const g = globalGraph(state());
    expect(g.edges).toHaveLength(3);
    expect(g.edges).toContainEqual({ from: ROOT_CANVAS_ID, to: 'a', kind: 'placement' });
    expect(g.edges).toContainEqual({ from: 'a', to: 'b', kind: 'placement' });
    expect(g.edges).toContainEqual({ from: 'b', to: 'c', kind: 'edge' });
  });

  it('hasBody and degree', () => {
    const g = globalGraph(state());
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(byId.a.hasBody).toBe(true);
    expect(byId.b.hasBody).toBe(false);
    expect(byId.a.degree).toBe(2);
    expect(byId.b.degree).toBe(2);
    expect(byId.c.degree).toBe(1);
  });
});

describe('simulate', () => {
  it('is deterministic, finite, and inside the canvas', () => {
    const g = globalGraph(state());
    const p1 = simulate(g);
    const p2 = simulate(g);
    expect([...p1.entries()]).toEqual([...p2.entries()]);
    expect(p1.size).toBe(g.nodes.length);
    for (const p of p1.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(GRAPH_W);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(GRAPH_H);
    }
  });
});
