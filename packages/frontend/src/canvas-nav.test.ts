import { describe, it, expect } from 'vitest';
import type { Doc } from '@fcw/graph-core';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import { emptyChatState, ChatState } from './chat-store';
import {
  canvasPageSlug,
  canvasIdForPageSlug,
  pushCanvas,
  popTo,
  currentCanvas,
  pathToRoot,
  breadcrumbItems,
} from './canvas-nav';

const doc = (id: string, title: string, placed: string[] = []): Doc => ({
  id,
  title,
  body: '',
  canvas: {
    placements: placed.map((p) => ({ kind: 'doc' as const, id: p, position: { x: 0, y: 0 } })),
    edges: [],
  },
});

/** root places A; A places B; B places C. */
function nested(): ChatState {
  return {
    ...emptyChatState(),
    docs: { A: doc('A', 'Auth', ['B']), B: doc('B', 'Sign in', ['C']), C: doc('C', 'Form') },
    rootCanvas: { placements: [{ kind: 'doc', id: 'A', position: { x: 0, y: 0 } }], edges: [] },
  };
}

describe('page slug <-> canvas id', () => {
  it('round-trips a doc canvas id', () => {
    expect(canvasIdForPageSlug(canvasPageSlug('doc_1'))).toBe('doc_1');
  });

  it('a page that is not a canvas page maps to null', () => {
    expect(canvasIdForPageSlug('page')).toBeNull();
  });
});

describe('navigation stack', () => {
  it('starts at root; push appends; current is the top', () => {
    const s = pushCanvas([ROOT_CANVAS_ID], 'A');
    expect(s).toEqual([ROOT_CANVAS_ID, 'A']);
    expect(currentCanvas(s)).toBe('A');
  });

  it('pushing a canvas already on the stack truncates back to it (no cycles)', () => {
    expect(pushCanvas([ROOT_CANVAS_ID, 'A', 'B'], 'A')).toEqual([ROOT_CANVAS_ID, 'A']);
  });

  it('popTo keeps entries up to and including the index', () => {
    expect(popTo([ROOT_CANVAS_ID, 'A', 'B'], 0)).toEqual([ROOT_CANVAS_ID]);
    expect(popTo([ROOT_CANVAS_ID, 'A', 'B'], 1)).toEqual([ROOT_CANVAS_ID, 'A']);
  });

  it('an empty stack is root', () => {
    expect(currentCanvas([])).toBe(ROOT_CANVAS_ID);
  });
});

describe('pathToRoot', () => {
  it('root is just root', () => {
    expect(pathToRoot(nested(), ROOT_CANVAS_ID)).toEqual([ROOT_CANVAS_ID]);
  });

  it('walks placements up to root', () => {
    expect(pathToRoot(nested(), 'C')).toEqual([ROOT_CANVAS_ID, 'A', 'B', 'C']);
  });

  it('an unplaced doc hangs directly off root', () => {
    const s = { ...nested(), docs: { ...nested().docs, Z: doc('Z', 'Loose') } };
    expect(pathToRoot(s, 'Z')).toEqual([ROOT_CANVAS_ID, 'Z']);
  });

  it('tolerates placement cycles', () => {
    const s: ChatState = { ...emptyChatState(), docs: { A: doc('A', 'a', ['B']), B: doc('B', 'b', ['A']) } };
    expect(pathToRoot(s, 'A')).toEqual([ROOT_CANVAS_ID, 'B', 'A']);
  });
});

describe('breadcrumbItems', () => {
  it('labels root and each doc by title', () => {
    expect(breadcrumbItems(nested(), [ROOT_CANVAS_ID, 'A', 'B'])).toEqual([
      { canvasId: ROOT_CANVAS_ID, label: 'Canvas' },
      { canvasId: 'A', label: 'Auth' },
      { canvasId: 'B', label: 'Sign in' },
    ]);
  });

  it('labels an unknown doc by its id', () => {
    expect(breadcrumbItems(nested(), [ROOT_CANVAS_ID, 'gone'])[1]).toEqual({ canvasId: 'gone', label: 'gone' });
  });
});
