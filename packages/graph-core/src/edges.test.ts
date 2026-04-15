import { describe, it, expect } from 'vitest';
import { createDocument, createNode } from './operations.js';
import {
  createEdge,
  deleteEdge,
  getEdgesFrom,
  getEdgesTo,
} from './edges.js';

describe('createEdge', () => {
  it('adds edge to doc.edges', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    const b = createNode(doc, 'response', 'a');
    createEdge(doc, a, b, 'reply_to');
    expect(doc.edges).toContainEqual({ from: a, to: b, type: 'reply_to' });
  });

  it('throws if from node does not exist', () => {
    const doc = createDocument('Test');
    const b = createNode(doc, 'response', 'a');
    expect(() => createEdge(doc, 'fake', b, 'reply_to')).toThrow('Node "fake" not found');
  });

  it('throws if to node does not exist', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    expect(() => createEdge(doc, a, 'fake', 'reply_to')).toThrow('Node "fake" not found');
  });
});

describe('deleteEdge', () => {
  it('removes the edge between two nodes', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    const b = createNode(doc, 'response', 'a');
    createEdge(doc, a, b, 'reply_to');
    expect(doc.edges).toHaveLength(1);
    deleteEdge(doc, a, b);
    expect(doc.edges).toHaveLength(0);
  });

  it('only removes the specific edge, not others', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    const b = createNode(doc, 'response', 'a1');
    const c = createNode(doc, 'response', 'a2');
    createEdge(doc, a, b, 'reply_to');
    createEdge(doc, a, c, 'reply_to');
    deleteEdge(doc, a, b);
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0].to).toBe(c);
  });
});

describe('getEdgesFrom', () => {
  it('returns all edges originating from a node', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    const b = createNode(doc, 'response', 'a1');
    const c = createNode(doc, 'response', 'a2');
    createEdge(doc, a, b, 'reply_to');
    createEdge(doc, a, c, 'branches_from');
    const edges = getEdgesFrom(doc, a);
    expect(edges).toHaveLength(2);
  });

  it('returns empty array when no outgoing edges', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    expect(getEdgesFrom(doc, a)).toHaveLength(0);
  });
});

describe('getEdgesTo', () => {
  it('returns all edges pointing to a node', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q1');
    const b = createNode(doc, 'user_prompt', 'q2');
    const c = createNode(doc, 'response', 'a');
    createEdge(doc, a, c, 'reply_to');
    createEdge(doc, b, c, 'references');
    const edges = getEdgesTo(doc, c);
    expect(edges).toHaveLength(2);
  });

  it('returns empty array when no incoming edges', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    expect(getEdgesTo(doc, a)).toHaveLength(0);
  });
});
