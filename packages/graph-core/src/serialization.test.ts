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
