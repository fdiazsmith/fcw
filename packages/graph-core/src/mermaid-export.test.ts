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
});
