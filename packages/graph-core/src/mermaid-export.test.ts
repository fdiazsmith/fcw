import { describe, it, expect } from 'vitest';
import { parseMermaid } from './mermaid.js';
import { graphToMermaid } from './mermaid-export.js';
import type { DocCanvas } from './docs.js';

const pos = { x: 0, y: 0 };
const docs = (...pairs: [string, string][]) => ({
  docs: Object.fromEntries(
    pairs.map(([id, title]) => [id, { id, title, body: '', canvas: { placements: [], edges: [] } }]),
  ),
});
const place = (...ids: string[]) => ids.map((id) => ({ kind: 'doc' as const, id, position: pos }));

describe('graphToMermaid', () => {
  it('exports an empty canvas as a bare directive that parses', () => {
    const out = graphToMermaid({ placements: [], edges: [] }, docs());
    expect(out).toBe('graph TD');
    expect(parseMermaid(out)).toEqual({ nodes: [], edges: [] });
  });

  it('round-trips titles in placement order and edges', () => {
    const ws = docs(['a', 'Sign in'], ['b', 'Auth'], ['c', 'Database']);
    const canvas: DocCanvas = {
      placements: place('a', 'b', 'c'),
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
      ],
    };
    const g = parseMermaid(graphToMermaid(canvas, ws));
    expect(g.nodes.map((n) => n.label)).toEqual(['Sign in', 'Auth', 'Database']);
    expect(g.edges).toEqual([
      { from: g.nodes[0].id, to: g.nodes[1].id },
      { from: g.nodes[0].id, to: g.nodes[2].id },
    ]);
  });

  it('skips chat placements and edges touching them', () => {
    const ws = docs(['a', 'A'], ['b', 'B']);
    const canvas: DocCanvas = {
      placements: [...place('a'), { kind: 'chat', id: 'chat1', position: pos }, ...place('b')],
      edges: [
        { from: 'a', to: 'chat1' },
        { from: 'a', to: 'b' },
      ],
    };
    const g = parseMermaid(graphToMermaid(canvas, ws));
    expect(g.nodes.map((n) => n.label)).toEqual(['A', 'B']);
    expect(g.edges).toHaveLength(1);
  });

  it('maps ids that are not mermaid identifiers to unique safe ids', () => {
    const ws = docs(['doc-1', 'One'], ['doc_1', 'Two'], ['doc 1', 'Three']);
    const canvas: DocCanvas = {
      placements: place('doc-1', 'doc_1', 'doc 1'),
      edges: [{ from: 'doc-1', to: 'doc 1' }],
    };
    const g = parseMermaid(graphToMermaid(canvas, ws));
    expect(g.nodes.map((n) => n.label)).toEqual(['One', 'Two', 'Three']);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(3);
    expect(g.edges).toEqual([{ from: g.nodes[0].id, to: g.nodes[2].id }]);
  });

  it('replaces brackets, newlines and arrows in titles; empty title falls back to the id', () => {
    const ws = docs(['a', 'List [v2]\nnotes'], ['b', 'x --> y'], ['c', '  ']);
    const g = parseMermaid(graphToMermaid({ placements: place('a', 'b', 'c'), edges: [] }, ws));
    expect(g.nodes.map((n) => n.label)).toEqual(['List (v2) notes', 'x -> y', 'c']);
  });
});
