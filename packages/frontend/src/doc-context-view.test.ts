import { describe, it, expect } from 'vitest';
import type { Doc } from '@fcw/graph-core';
import { docContextSummary } from './doc-context-view';

const doc = (id: string, body: string, refs: string[] = []): Doc => ({
  id,
  title: id.toUpperCase(),
  body,
  canvas: {
    placements: refs.map((r, i) => ({ kind: 'doc' as const, id: r, position: { x: i, y: 0 } })),
    edges: [],
  },
});
const state = {
  docs: {
    t: doc('t', 'tttt', ['a']),
    a: doc('a', 'aaaaaa', ['b']),
    b: doc('b', 'bbbbbbbb'),
  },
};

describe('docContextSummary', () => {
  it('lists blocks deepest-first with char counts and usage', () => {
    const s = docContextSummary(state, 't', 1000);
    expect(s.blocks).toEqual([
      { docId: 'b', title: 'B', degraded: false, chars: 8 },
      { docId: 'a', title: 'A', degraded: false, chars: 6 },
      { docId: 't', title: 'T', degraded: false, chars: 4 },
    ]);
    expect(s.usedChars).toBe(18);
    expect(s.budget).toBe(1000);
    expect(s.degradedCount).toBe(0);
  });

  it('degraded blocks count zero chars and are tallied', () => {
    const s = docContextSummary(state, 't', 10);
    expect(s.blocks.map((b) => [b.docId, b.degraded, b.chars])).toEqual([
      ['b', true, 0],
      ['a', false, 6],
      ['t', false, 4],
    ]);
    expect(s.usedChars).toBe(10);
    expect(s.degradedCount).toBe(1);
  });
});
