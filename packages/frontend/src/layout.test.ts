import { describe, it, expect } from 'vitest';
import { computeLayout } from './layout';
import type { GraphDocument } from '@fcw/graph-core';

function makeDoc(overrides?: Partial<GraphDocument>): GraphDocument {
  return {
    id: 'doc1',
    meta: { created: '2024-01-01', title: 'Test' },
    nodes: {
      n1: { id: 'n1', type: 'user_prompt', content: 'hello', position: { x: 0, y: 0 }, created: '2024-01-01', status: 'completed' },
      n2: { id: 'n2', type: 'response', content: 'world', position: { x: 0, y: 0 }, created: '2024-01-01', status: 'completed' },
    },
    edges: [{ from: 'n1', to: 'n2', type: 'reply_to' }],
    ...overrides,
  };
}

describe('computeLayout', () => {
  it('returns positions for all nodes', () => {
    const doc = makeDoc();
    const positions = computeLayout(doc);
    expect(positions.has('n1')).toBe(true);
    expect(positions.has('n2')).toBe(true);
  });

  it('lays out top-to-bottom (n1.y < n2.y)', () => {
    const doc = makeDoc();
    const positions = computeLayout(doc);
    expect(positions.get('n1')!.y).toBeLessThan(positions.get('n2')!.y);
  });

  it('preserves pinned node position', () => {
    const doc = makeDoc();
    (doc.nodes['n1'] as unknown as { metadata: { pinned: boolean } }).metadata = { pinned: true };
    doc.nodes['n1'].position = { x: 999, y: 888 };
    const positions = computeLayout(doc);
    expect(positions.get('n1')).toEqual({ x: 999, y: 888 });
  });

  it('returns positions for all nodes in doc', () => {
    const doc = makeDoc({
      nodes: {
        a: { id: 'a', type: 'user_prompt', content: '', position: { x: 0, y: 0 }, created: '', status: 'completed' },
        b: { id: 'b', type: 'response', content: '', position: { x: 0, y: 0 }, created: '', status: 'completed' },
        c: { id: 'c', type: 'thought', content: '', position: { x: 0, y: 0 }, created: '', status: 'completed' },
      },
      edges: [],
    });
    const positions = computeLayout(doc);
    expect(positions.size).toBe(3);
  });
});
