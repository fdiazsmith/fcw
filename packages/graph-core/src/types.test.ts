import { describe, it, expect } from 'vitest';
import type {
  NodeType,
  EdgeType,
  NodeStatus,
  GraphNode,
  GraphEdge,
  GraphDocument,
} from './types.js';

describe('Graph Schema Types', () => {
  it('NodeType includes all required types', () => {
    const types: NodeType[] = [
      'user_prompt',
      'response',
      'code',
      'tool_call',
      'tool_result',
      'thought',
      'summary',
      'annotation',
    ];
    expect(types).toHaveLength(8);
  });

  it('EdgeType includes all required types', () => {
    const types: EdgeType[] = [
      'reply_to',
      'branches_from',
      'references',
      'tool_call',
      'tool_result',
    ];
    expect(types).toHaveLength(5);
  });

  it('NodeStatus includes all required statuses', () => {
    const statuses: NodeStatus[] = ['streaming', 'complete', 'error'];
    expect(statuses).toHaveLength(3);
  });

  it('GraphNode has required shape', () => {
    const node: GraphNode = {
      id: 'n1',
      type: 'user_prompt',
      content: 'hello',
      position: { x: 0, y: 0 },
      created: '2026-03-17T00:00:00Z',
      status: 'complete',
    };
    expect(node.id).toBe('n1');
    expect(node.type).toBe('user_prompt');
    expect(node.position.x).toBe(0);
    expect(node.status).toBe('complete');
  });

  it('GraphEdge has required shape', () => {
    const edge: GraphEdge = {
      from: 'n1',
      to: 'n2',
      type: 'reply_to',
    };
    expect(edge.from).toBe('n1');
    expect(edge.to).toBe('n2');
    expect(edge.type).toBe('reply_to');
  });

  it('GraphDocument has required shape', () => {
    const doc: GraphDocument = {
      id: 'doc_001',
      meta: { created: '2026-03-17T00:00:00Z', title: 'Test' },
      nodes: {},
      edges: [],
    };
    expect(doc.id).toBe('doc_001');
    expect(doc.meta.title).toBe('Test');
    expect(Object.keys(doc.nodes)).toHaveLength(0);
    expect(doc.edges).toHaveLength(0);
  });
});
