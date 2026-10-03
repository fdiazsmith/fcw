import { describe, it, expect } from 'vitest';
import { parseMermaid } from './mermaid.js';
import { mermaidToDocNodes } from './mermaid-docs.js';

describe('mermaidToDocNodes', () => {
  it('turns every mermaid node into a doc with the label as title', () => {
    const graph = parseMermaid('graph TD\n  A[Sign in] --> B[Auth]');

    const { docs } = mermaidToDocNodes(graph);

    expect(docs.map((d) => d.title)).toEqual(['Sign in', 'Auth']);
  });

  it('gives each doc an empty body and an empty child canvas', () => {
    const graph = parseMermaid('graph TD\n  A[Sign in]');

    const [doc] = mermaidToDocNodes(graph).docs;

    expect(doc.body).toBe('');
    expect(doc.canvas).toEqual({ placements: [], edges: [] });
  });

  it('maps mermaid edges onto doc edges', () => {
    const graph = parseMermaid('graph TD\n  A[Sign in] --> B[Auth] --> C[Database]');

    const { docs, edges } = mermaidToDocNodes(graph);
    const byTitle = (title: string) => docs.find((d) => d.title === title)!.id;

    expect(edges).toEqual([
      { from: byTitle('Sign in'), to: byTitle('Auth') },
      { from: byTitle('Auth'), to: byTitle('Database') },
    ]);
  });

  it('namespaces ids with the prefix so two diagrams never collide', () => {
    const graph = parseMermaid('graph TD\n  A[Sign in] --> B[Auth]');

    const first = mermaidToDocNodes(graph, { idPrefix: 'g1:' });
    const second = mermaidToDocNodes(graph, { idPrefix: 'g2:' });

    expect(first.docs.map((d) => d.id)).toEqual(['g1:A', 'g1:B']);
    expect(first.edges).toEqual([{ from: 'g1:A', to: 'g1:B' }]);
    expect(second.docs.map((d) => d.id)).toEqual(['g2:A', 'g2:B']);
  });

  it('keeps first-seen order, so layout is deterministic', () => {
    const graph = parseMermaid('graph TD\n  A[Sign in] --> C[Database]\n  B[Auth] --> C');

    const { docs } = mermaidToDocNodes(graph);

    expect(docs.map((d) => d.title)).toEqual(['Sign in', 'Database', 'Auth']);
  });
});
