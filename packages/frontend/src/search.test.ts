import { describe, it, expect } from 'vitest';
import { searchNodes, SearchResult } from './search';
import type { GraphDocument } from '@fcw/graph-core';

function makeDoc(): GraphDocument {
  return {
    id: 'doc1',
    meta: { created: '2024-01-01', title: 'Test' },
    nodes: {
      n1: { id: 'n1', type: 'user_prompt', content: 'Hello world', position: { x: 0, y: 0 }, created: '', status: 'complete' },
      n2: { id: 'n2', type: 'response', content: 'Goodbye moon', position: { x: 0, y: 0 }, created: '', status: 'complete' },
      n3: { id: 'n3', type: 'thought', content: 'hello again', position: { x: 0, y: 0 }, created: '', status: 'complete' },
    },
    edges: [],
  };
}

describe('searchNodes', () => {
  it('returns empty for empty query', () => {
    expect(searchNodes(makeDoc(), '')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const results = searchNodes(makeDoc(), 'hello');
    const ids = results.map((r) => r.nodeId);
    expect(ids).toContain('n1');
    expect(ids).toContain('n3');
    expect(ids).not.toContain('n2');
  });

  it('returns nodeId and content snippet', () => {
    const results = searchNodes(makeDoc(), 'goodbye');
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe('n2');
    expect(results[0].content).toBe('Goodbye moon');
  });

  it('matches partial words', () => {
    const results = searchNodes(makeDoc(), 'moo');
    expect(results).toHaveLength(1);
    expect(results[0].nodeId).toBe('n2');
  });

  it('returns empty when no match', () => {
    expect(searchNodes(makeDoc(), 'xyz')).toEqual([]);
  });
});
