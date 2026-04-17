import { describe, it, expect } from 'vitest';
import {
  collapseSubtree,
  expandSubtree,
  getVisibleNodes,
  getVisibleEdges,
  getAutoCollapsedNodes,
  getAutoHiddenNodes,
  getCollapsedChildCount,
  CollapsedState,
} from './collapse';
import type { GraphDocument } from '@fcw/graph-core';

function makeDoc(): GraphDocument {
  return {
    id: 'doc1',
    meta: { created: '2024-01-01', title: 'Test' },
    nodes: {
      root: { id: 'root', type: 'user_prompt', content: 'root', position: { x: 0, y: 0 }, created: '', status: 'completed' },
      child1: { id: 'child1', type: 'response', content: 'c1', position: { x: 0, y: 0 }, created: '', status: 'completed' },
      child2: { id: 'child2', type: 'response', content: 'c2', position: { x: 0, y: 0 }, created: '', status: 'completed' },
      grandchild: { id: 'grandchild', type: 'response', content: 'gc', position: { x: 0, y: 0 }, created: '', status: 'completed' },
      unrelated: { id: 'unrelated', type: 'user_prompt', content: 'u', position: { x: 0, y: 0 }, created: '', status: 'completed' },
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

function makeDocWithStatus(): GraphDocument {
  return {
    id: 'doc2',
    meta: { created: '2024-01-01', title: 'Status Test' },
    nodes: {
      root: {
        id: 'root', type: 'user_prompt', content: 'root',
        position: { x: 0, y: 0 }, created: '', status: 'completed',
        executionStatus: 'completed', pathStatus: 'archived',
      },
      child1: {
        id: 'child1', type: 'response', content: 'c1',
        position: { x: 0, y: 0 }, created: '', status: 'completed',
        executionStatus: 'completed', pathStatus: 'active',
      },
      child2: {
        id: 'child2', type: 'response', content: 'c2',
        position: { x: 0, y: 0 }, created: '', status: 'completed',
        executionStatus: 'in_progress', pathStatus: 'archived',
      },
      grandchild: {
        id: 'grandchild', type: 'response', content: 'gc',
        position: { x: 0, y: 0 }, created: '', status: 'completed',
        executionStatus: 'completed', pathStatus: 'archived',
      },
      unrelated: {
        id: 'unrelated', type: 'user_prompt', content: 'u',
        position: { x: 0, y: 0 }, created: '', status: 'completed',
        // no executionStatus/pathStatus — undefined fields
      },
    },
    edges: [
      { from: 'root', to: 'child1', type: 'reply_to' },
      { from: 'root', to: 'child2', type: 'reply_to' },
      { from: 'child1', to: 'grandchild', type: 'reply_to' },
    ],
  };
}

describe('getAutoCollapsedNodes', () => {
  it('returns IDs where executionStatus=completed AND pathStatus=archived', () => {
    const doc = makeDocWithStatus();
    const autoCollapsed = getAutoCollapsedNodes(doc);
    expect(autoCollapsed.has('root')).toBe(true);
    expect(autoCollapsed.has('grandchild')).toBe(true);
  });

  it('returns empty set when no nodes meet both conditions', () => {
    const doc: GraphDocument = {
      id: 'doc3',
      meta: { created: '2024-01-01', title: 'Empty' },
      nodes: {
        n1: {
          id: 'n1', type: 'user_prompt', content: 'x',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'in_progress', pathStatus: 'archived',
        },
      },
      edges: [],
    };
    const autoCollapsed = getAutoCollapsedNodes(doc);
    expect(autoCollapsed.size).toBe(0);
  });

  it('does NOT include nodes that are completed but active', () => {
    const doc = makeDocWithStatus();
    const autoCollapsed = getAutoCollapsedNodes(doc);
    expect(autoCollapsed.has('child1')).toBe(false);
  });

  it('does NOT include nodes that are archived but in_progress', () => {
    const doc = makeDocWithStatus();
    const autoCollapsed = getAutoCollapsedNodes(doc);
    expect(autoCollapsed.has('child2')).toBe(false);
  });

  it('handles nodes with undefined executionStatus/pathStatus gracefully', () => {
    const doc = makeDocWithStatus();
    const autoCollapsed = getAutoCollapsedNodes(doc);
    // 'unrelated' has no executionStatus/pathStatus — should not be included
    expect(autoCollapsed.has('unrelated')).toBe(false);
  });

  it('when pathStatus changes from archived to active, node leaves auto-collapsed set', () => {
    const doc = makeDocWithStatus();
    // root starts as completed+archived (auto-collapsed)
    let autoCollapsed = getAutoCollapsedNodes(doc);
    expect(autoCollapsed.has('root')).toBe(true);

    // Simulate update: root becomes active
    doc.nodes['root'] = { ...doc.nodes['root'], pathStatus: 'active' };
    autoCollapsed = getAutoCollapsedNodes(doc);
    expect(autoCollapsed.has('root')).toBe(false);
  });
});

describe('getAutoHiddenNodes', () => {
  it('hides completed tool_call nodes regardless of pathStatus', () => {
    const doc: GraphDocument = {
      id: 'doc4',
      meta: { created: '', title: '' },
      nodes: {
        resp: {
          id: 'resp', type: 'response', content: 'answer',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'completed', pathStatus: 'active',
        },
        tc: {
          id: 'tc', type: 'tool_call', content: 'tool: test',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'completed', pathStatus: 'active',
        },
        tr: {
          id: 'tr', type: 'tool_result', content: 'result',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'completed', pathStatus: 'active',
        },
      },
      edges: [
        { from: 'resp', to: 'tc', type: 'tool_call' },
        { from: 'tc', to: 'tr', type: 'tool_result' },
      ],
    };
    const hidden = getAutoHiddenNodes(doc);
    expect(hidden.has('tc')).toBe(true);
    expect(hidden.has('tr')).toBe(true);
    expect(hidden.has('resp')).toBe(false);
  });

  it('hides completed thought nodes', () => {
    const doc: GraphDocument = {
      id: 'doc5',
      meta: { created: '', title: '' },
      nodes: {
        th: {
          id: 'th', type: 'thought', content: 'thinking...',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'completed', pathStatus: 'active',
        },
      },
      edges: [],
    };
    const hidden = getAutoHiddenNodes(doc);
    expect(hidden.has('th')).toBe(true);
  });

  it('hides tool nodes even when streaming/in_progress', () => {
    const doc: GraphDocument = {
      id: 'doc6',
      meta: { created: '', title: '' },
      nodes: {
        tc: {
          id: 'tc', type: 'tool_call', content: 'tool: test',
          position: { x: 0, y: 0 }, created: '', status: 'streaming',
          executionStatus: 'in_progress', pathStatus: 'active',
        },
      },
      edges: [],
    };
    const hidden = getAutoHiddenNodes(doc);
    expect(hidden.has('tc')).toBe(true);
  });

  it('does NOT hide user_prompt or response nodes', () => {
    const doc: GraphDocument = {
      id: 'doc7',
      meta: { created: '', title: '' },
      nodes: {
        up: {
          id: 'up', type: 'user_prompt', content: 'hello',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'completed', pathStatus: 'active',
        },
        resp: {
          id: 'resp', type: 'response', content: 'answer',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'completed', pathStatus: 'active',
        },
      },
      edges: [],
    };
    const hidden = getAutoHiddenNodes(doc);
    expect(hidden.has('up')).toBe(false);
    expect(hidden.has('resp')).toBe(false);
  });

  it('getVisibleNodes excludes auto-hidden nodes when passed in state', () => {
    const doc: GraphDocument = {
      id: 'doc8',
      meta: { created: '', title: '' },
      nodes: {
        resp: {
          id: 'resp', type: 'response', content: 'answer',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'completed', pathStatus: 'active',
        },
        tc: {
          id: 'tc', type: 'tool_call', content: 'tool: test',
          position: { x: 0, y: 0 }, created: '', status: 'completed',
          executionStatus: 'completed', pathStatus: 'active',
        },
      },
      edges: [{ from: 'resp', to: 'tc', type: 'tool_call' }],
    };
    const hidden = getAutoHiddenNodes(doc);
    const visible = getVisibleNodes(doc, new Set(), hidden);
    expect('resp' in visible).toBe(true);
    expect('tc' in visible).toBe(false);
  });
});

describe('getCollapsedChildCount', () => {
  it('returns the number of descendants hidden when a node is collapsed', () => {
    const doc = makeDocWithStatus();
    // root has children: child1, child2; child1 has grandchild
    // descendants of root = child1, child2, grandchild = 3
    expect(getCollapsedChildCount('root', doc)).toBe(3);
  });

  it('returns 0 for a leaf node with no descendants', () => {
    const doc = makeDocWithStatus();
    expect(getCollapsedChildCount('grandchild', doc)).toBe(0);
  });

  it('returns correct count for intermediate node', () => {
    const doc = makeDocWithStatus();
    // child1 has only grandchild
    expect(getCollapsedChildCount('child1', doc)).toBe(1);
  });
});
