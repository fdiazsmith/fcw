import { describe, it, expect } from 'vitest';
import { createDocument, createNode } from './operations.js';
import { createEdge } from './edges.js';
import { getSubgraph } from './subgraph.js';

function buildTestGraph() {
  // A -> B -> C -> D
  //      B -> E
  const doc = createDocument('Test');
  const a = createNode(doc, 'user_prompt', 'A');
  const b = createNode(doc, 'response', 'B', a);
  const c = createNode(doc, 'response', 'C', b);
  const d = createNode(doc, 'response', 'D', c);
  const e = createNode(doc, 'response', 'E');
  createEdge(doc, b, e, 'branches_from');
  return { doc, a, b, c, d, e };
}

describe('getSubgraph', () => {
  it('depth=1 returns the node and its immediate neighbors', () => {
    const { doc, b, a, c, e } = buildTestGraph();
    const sub = getSubgraph(doc, b, 1);
    const nodeIds = Object.keys(sub.nodes);
    expect(nodeIds).toContain(b);
    expect(nodeIds).toContain(a); // parent
    expect(nodeIds).toContain(c); // child
    expect(nodeIds).toContain(e); // branch child
    expect(nodeIds).not.toContain(buildTestGraph().d); // too far
  });

  it('depth=2 returns 2-hop neighborhood', () => {
    const { doc, a, b, c, d, e } = buildTestGraph();
    const sub = getSubgraph(doc, b, 2);
    const nodeIds = Object.keys(sub.nodes);
    // b's depth-1: a, c, e. depth-2: d (via c)
    expect(nodeIds).toContain(a);
    expect(nodeIds).toContain(b);
    expect(nodeIds).toContain(c);
    expect(nodeIds).toContain(d);
    expect(nodeIds).toContain(e);
  });

  it('returns connecting edges within the subgraph', () => {
    const { doc, b } = buildTestGraph();
    const sub = getSubgraph(doc, b, 1);
    // Should include edges that connect nodes in the subgraph
    expect(sub.edges.length).toBeGreaterThan(0);
    for (const edge of sub.edges) {
      expect(sub.nodes[edge.from]).toBeDefined();
      expect(sub.nodes[edge.to]).toBeDefined();
    }
  });

  it('throws for non-existent nodeId', () => {
    const { doc } = buildTestGraph();
    expect(() => getSubgraph(doc, 'fake', 1)).toThrow();
  });

  it('depth=0 returns only the target node and no edges', () => {
    const { doc, b } = buildTestGraph();
    const sub = getSubgraph(doc, b, 0);
    expect(Object.keys(sub.nodes)).toEqual([b]);
    expect(sub.edges).toHaveLength(0);
  });
});
