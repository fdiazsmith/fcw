import { describe, it, expect } from 'vitest';
import {
  collapseSubtree,
  expandSubtree,
  getVisibleNodes,
  getVisibleEdges,
  CollapsedState,
} from './collapse';
import type { GraphDocument } from '@fcw/graph-core';

function makeDoc(): GraphDocument {
  return {
    id: 'doc1',
    meta: { created: '2024-01-01', title: 'Test' },
    nodes: {
      root: { id: 'root', type: 'user_prompt', content: 'root', position: { x: 0, y: 0 }, created: '', status: 'complete' },
      child1: { id: 'child1', type: 'response', content: 'c1', position: { x: 0, y: 0 }, created: '', status: 'complete' },
      child2: { id: 'child2', type: 'response', content: 'c2', position: { x: 0, y: 0 }, created: '', status: 'complete' },
      grandchild: { id: 'grandchild', type: 'response', content: 'gc', position: { x: 0, y: 0 }, created: '', status: 'complete' },
      unrelated: { id: 'unrelated', type: 'user_prompt', content: 'u', position: { x: 0, y: 0 }, created: '', status: 'complete' },
    },
    edges: [
      { from: 'root', to: 'child1', type: 'reply_to' },
      { from: 'root', to: 'child2', type: 'reply_to' },
      { from: 'child1', to: 'grandchild', type: 'reply_to' },
    ],
  };
}

describe('collapse', () => {
  it('collapseSubtree hides descendants of given node', () => {
    const doc = makeDoc();
    const state: CollapsedState = new Set();
    collapseSubtree('root', doc, state);
    expect(state.has('root')).toBe(true);
  });

  it('getVisibleNodes excludes descendants of collapsed node', () => {
    const doc = makeDoc();
    const state: CollapsedState = new Set(['root']);
    const visible = getVisibleNodes(doc, state);
    const ids = Object.keys(visible);
    expect(ids).toContain('root');
    expect(ids).toContain('unrelated');
    expect(ids).not.toContain('child1');
    expect(ids).not.toContain('child2');
    expect(ids).not.toContain('grandchild');
  });

  it('getVisibleEdges excludes edges involving hidden nodes', () => {
    const doc = makeDoc();
    const state: CollapsedState = new Set(['root']);
    const edges = getVisibleEdges(doc, state);
    expect(edges.length).toBe(0);
  });

  it('expandSubtree restores collapsed node descendants', () => {
    const doc = makeDoc();
    const state: CollapsedState = new Set(['root']);
    expandSubtree('root', state);
    expect(state.has('root')).toBe(false);
    const visible = getVisibleNodes(doc, state);
    expect(Object.keys(visible)).toHaveLength(5);
  });

  it('nested collapse: collapsing child1 hides only its subtree', () => {
    const doc = makeDoc();
    const state: CollapsedState = new Set(['child1']);
    const visible = getVisibleNodes(doc, state);
    expect(Object.keys(visible)).toContain('root');
    expect(Object.keys(visible)).toContain('child1');
    expect(Object.keys(visible)).toContain('child2');
    expect(Object.keys(visible)).toContain('unrelated');
    expect(Object.keys(visible)).not.toContain('grandchild');
  });

  it('getVisibleEdges keeps edges between visible nodes', () => {
    const doc = makeDoc();
    const state: CollapsedState = new Set(['child1']);
    const edges = getVisibleEdges(doc, state);
    // root->child1, root->child2 visible; child1->grandchild hidden
    expect(edges).toHaveLength(2);
  });
});
