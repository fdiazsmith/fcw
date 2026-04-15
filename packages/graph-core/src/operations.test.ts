import { describe, it, expect } from 'vitest';
import {
  createDocument,
  createNode,
  updateNodeContent,
  deleteNode,
} from './operations.js';

describe('createDocument', () => {
  it('returns a GraphDocument with unique id, empty nodes, empty edges', () => {
    const doc = createDocument('Test Doc');
    expect(doc.id).toBeTruthy();
    expect(doc.meta.title).toBe('Test Doc');
    expect(doc.meta.created).toBeTruthy();
    expect(Object.keys(doc.nodes)).toHaveLength(0);
    expect(doc.edges).toHaveLength(0);
  });

  it('generates unique ids for each document', () => {
    const a = createDocument('A');
    const b = createDocument('B');
    expect(a.id).not.toBe(b.id);
  });
});

describe('createNode', () => {
  it('adds a node to doc.nodes and returns node id', () => {
    const doc = createDocument('Test');
    const nodeId = createNode(doc, 'user_prompt', 'hello world');
    expect(doc.nodes[nodeId]).toBeDefined();
    expect(doc.nodes[nodeId].type).toBe('user_prompt');
    expect(doc.nodes[nodeId].content).toBe('hello world');
    expect(doc.nodes[nodeId].status).toBe('complete');
  });

  it('creates node with streaming status when specified', () => {
    const doc = createDocument('Test');
    const nodeId = createNode(doc, 'response', '', undefined, { status: 'streaming' });
    expect(doc.nodes[nodeId].status).toBe('streaming');
  });

  it('auto-creates reply_to edge when parentId is provided', () => {
    const doc = createDocument('Test');
    const parentId = createNode(doc, 'user_prompt', 'question');
    const childId = createNode(doc, 'response', 'answer', parentId);
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0]).toEqual({
      from: parentId,
      to: childId,
      type: 'reply_to',
    });
  });

  it('creates no edge when parentId is omitted', () => {
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'standalone');
    expect(doc.edges).toHaveLength(0);
  });

  it('generates unique node ids', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'a');
    const b = createNode(doc, 'user_prompt', 'b');
    expect(a).not.toBe(b);
  });
});

describe('updateNodeContent', () => {
  it('replaces node content', () => {
    const doc = createDocument('Test');
    const id = createNode(doc, 'response', 'original');
    updateNodeContent(doc, id, 'updated');
    expect(doc.nodes[id].content).toBe('updated');
  });

  it('throws for non-existent node', () => {
    const doc = createDocument('Test');
    expect(() => updateNodeContent(doc, 'fake', 'content')).toThrow();
  });
});

describe('deleteNode', () => {
  it('removes node from doc.nodes', () => {
    const doc = createDocument('Test');
    const id = createNode(doc, 'user_prompt', 'hello');
    deleteNode(doc, id);
    expect(doc.nodes[id]).toBeUndefined();
  });

  it('removes all connected edges when node is deleted', () => {
    const doc = createDocument('Test');
    const parent = createNode(doc, 'user_prompt', 'q');
    const child = createNode(doc, 'response', 'a', parent);
    expect(doc.edges).toHaveLength(1);
    deleteNode(doc, child);
    expect(doc.edges).toHaveLength(0);
  });

  it('throws for non-existent node', () => {
    const doc = createDocument('Test');
    expect(() => deleteNode(doc, 'fake')).toThrow();
  });
});
