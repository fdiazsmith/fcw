import { expect, it } from 'vitest';
import { parseMermaid } from './mermaid.js';

it('parses a single node with its label', () => {
  expect(parseMermaid('graph TD\n  A[Intro]')).toEqual({
    nodes: [{ id: 'A', label: 'Intro' }],
    edges: [],
  });
});

it('parses an edge between two nodes', () => {
  expect(parseMermaid('graph TD\n  A[Intro] --> B[Method]')).toEqual({
    nodes: [
      { id: 'A', label: 'Intro' },
      { id: 'B', label: 'Method' },
    ],
    edges: [{ from: 'A', to: 'B' }],
  });
});

it('declares each node once even when referenced again', () => {
  const graph = parseMermaid('graph TD\n  A[Intro] --> B[Method]\n  A --> C[Results]');
  expect(graph.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C']);
  expect(graph.edges).toEqual([
    { from: 'A', to: 'B' },
    { from: 'A', to: 'C' },
  ]);
});
