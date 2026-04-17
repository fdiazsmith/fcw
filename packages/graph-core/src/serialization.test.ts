import { describe, it, expect } from 'vitest';
import { createDocument, createNode } from './operations.js';
import { createEdge } from './edges.js';
import { toJSON, fromJSON } from './serialization.js';

describe('toJSON', () => {
  it('produces a valid JSON string', () => {
    const doc = createDocument('Test');
    const json = toJSON(doc);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe('fromJSON', () => {
  it('parses a JSON string back into a GraphDocument', () => {
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'hello');
    const json = toJSON(doc);
    const restored = fromJSON(json);
    expect(restored.meta.title).toBe('Test');
    expect(Object.keys(restored.nodes)).toHaveLength(1);
  });
});

describe('round-trip', () => {
  it('fromJSON(toJSON(doc)) produces structurally identical document', () => {
    const doc = createDocument('Round Trip');
    const a = createNode(doc, 'user_prompt', 'question');
    const b = createNode(doc, 'response', 'answer', a);
    createEdge(doc, a, b, 'references');

    const restored = fromJSON(toJSON(doc));
    expect(restored.id).toBe(doc.id);
    expect(restored.meta).toEqual(doc.meta);
    expect(restored.nodes).toEqual(doc.nodes);
    expect(restored.edges).toEqual(doc.edges);
  });
});

describe('toJSON preserves executionStatus and pathStatus', () => {
  it('includes executionStatus and pathStatus when present on nodes', () => {
    const doc = createDocument('Test');
    const nodeId = createNode(doc, 'user_prompt', 'hello');
    doc.nodes[nodeId].executionStatus = 'in_progress';
    doc.nodes[nodeId].pathStatus = 'archived';
    const json = toJSON(doc);
    const parsed = JSON.parse(json);
    expect(parsed.nodes[nodeId].executionStatus).toBe('in_progress');
    expect(parsed.nodes[nodeId].pathStatus).toBe('archived');
  });
});

describe('fromJSON backfill', () => {
  it('backfills executionStatus and pathStatus defaults when absent', () => {
    const raw = {
      id: 'doc1',
      meta: { created: '2024-01-01', title: 'Old Doc' },
      nodes: {
        n1: {
          id: 'n1',
          type: 'user_prompt',
          content: 'hello',
          position: { x: 0, y: 0 },
          created: '2024-01-01',
          status: 'completed',
        },
      },
      edges: [],
    };
    const restored = fromJSON(JSON.stringify(raw));
    expect(restored.nodes['n1'].executionStatus).toBe('completed');
    expect(restored.nodes['n1'].pathStatus).toBe('active');
  });

  it('preserves existing executionStatus and pathStatus when present', () => {
    const raw = {
      id: 'doc2',
      meta: { created: '2024-01-01', title: 'New Doc' },
      nodes: {
        n2: {
          id: 'n2',
          type: 'response',
          content: 'answer',
          position: { x: 10, y: 20 },
          created: '2024-01-01',
          status: 'completed',
          executionStatus: 'in_progress',
          pathStatus: 'archived',
        },
      },
      edges: [],
    };
    const restored = fromJSON(JSON.stringify(raw));
    expect(restored.nodes['n2'].executionStatus).toBe('in_progress');
    expect(restored.nodes['n2'].pathStatus).toBe('archived');
  });
});

describe('fromJSON validation', () => {
  it('rejects invalid JSON string', () => {
    expect(() => fromJSON('not json')).toThrow();
  });

  it('rejects JSON missing required fields', () => {
    expect(() => fromJSON(JSON.stringify({ id: 'x' }))).toThrow();
  });

  it('rejects JSON with missing nodes field', () => {
    expect(() =>
      fromJSON(
        JSON.stringify({
          id: 'x',
          meta: { created: '', title: '' },
          edges: [],
        }),
      ),
    ).toThrow();
  });

  it('rejects JSON with missing edges field', () => {
    expect(() =>
      fromJSON(
        JSON.stringify({
          id: 'x',
          meta: { created: '', title: '' },
          nodes: {},
        }),
      ),
    ).toThrow();
  });
});
