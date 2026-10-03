import { describe, it, expect } from 'vitest';
import { parseMermaid, mermaidToDocNodes } from '@fcw/graph-core';
import { layoutDocNodes, DOC_W, DOC_H } from './doc-layout';

const layoutOf = (mermaid: string) => {
  const { docs, edges } = mermaidToDocNodes(parseMermaid(mermaid));
  return { docs, positions: layoutDocNodes(docs, edges) };
};

describe('layoutDocNodes', () => {
  it('places every doc', () => {
    const { docs, positions } = layoutOf('graph TD\n  A[Sign in] --> B[Auth]\n  B --> C[Database]');

    expect([...positions.keys()].sort()).toEqual(docs.map((d) => d.id).sort());
  });

  it('puts a target below its source, so the diagram reads top-down', () => {
    const { positions } = layoutOf('graph TD\n  A[Sign in] --> B[Auth]');

    expect(positions.get('B')!.y).toBeGreaterThan(positions.get('A')!.y + DOC_H);
  });

  it('separates siblings horizontally instead of stacking them', () => {
    const { positions } = layoutOf('graph TD\n  A[Auth] --> B[Google]\n  A --> C[E-mail]');

    const google = positions.get('B')!;
    const email = positions.get('C')!;
    expect(google.y).toBe(email.y);
    expect(Math.abs(google.x - email.x)).toBeGreaterThanOrEqual(DOC_W);
  });

  it('returns top-left corners, not dagre centres, so tldraw can use them directly', () => {
    const { positions } = layoutOf('graph TD\n  A[Only]');

    // A lone node sits at the layout origin; its top-left is the margin itself.
    expect(positions.get('A')).toEqual({ x: 0, y: 0 });
  });
});
