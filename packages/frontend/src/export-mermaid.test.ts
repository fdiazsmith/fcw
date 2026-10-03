import { describe, it, expect } from 'vitest';
import { exportCanvasMermaid } from './export-mermaid';
import { emptyChatState, type ChatState } from './chat-store';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { Doc } from '@fcw/graph-core';

const pos = { x: 0, y: 0 };
const doc = (id: string, title: string, over: Partial<Doc['canvas']> = {}): Doc => ({
  id,
  title,
  body: '',
  canvas: { placements: [], edges: [], ...over },
});

const state = (): ChatState => ({
  ...emptyChatState(),
  docs: {
    a: doc('a', 'Sign in'),
    b: doc('b', 'API calls'),
    host: doc('host', 'Host', {
      placements: [{ kind: 'doc', id: 'b', position: pos }],
      edges: [],
    }),
  },
  rootCanvas: {
    placements: [
      { kind: 'doc', id: 'a', position: pos },
      { kind: 'doc', id: 'b', position: pos },
    ],
    edges: [{ from: 'a', to: 'b' }],
  },
});

describe('exportCanvasMermaid', () => {
  it('exports the root canvas as Mermaid with titles and edges', () => {
    const out = exportCanvasMermaid(state(), ROOT_CANVAS_ID);
    expect(out).toContain('Sign in');
    expect(out).toContain('API calls');
    expect(out).toContain('-->');
  });

  it("exports a doc's own canvas, not root", () => {
    const out = exportCanvasMermaid(state(), 'host');
    expect(out).toContain('API calls');
    expect(out).not.toContain('Sign in');
  });

  it('an unknown canvas exports as an empty graph', () => {
    expect(exportCanvasMermaid(state(), 'nope')).toBe('graph TD');
  });
});
