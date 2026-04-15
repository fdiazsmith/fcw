import { describe, it, expect } from 'vitest';
import { traverseLog } from './log-traversal.js';
import { createDocument, createNode } from '@fcw/graph-core';

describe('traverseLog', () => {
  it('returns empty array for empty document', () => {
    const doc = createDocument('Empty');
    expect(traverseLog(doc)).toEqual([]);
  });

  it('returns single node', () => {
    const doc = createDocument('Test');
    const id = createNode(doc, 'user_prompt', 'hello');
    const result = traverseLog(doc);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(id);
    expect(result[0].depth).toBe(0);
  });

  it('returns linear chain in order', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q1');
    const b = createNode(doc, 'response', 'a1', a);
    const c = createNode(doc, 'user_prompt', 'q2', b);
    const result = traverseLog(doc);
    expect(result.map((n) => n.id)).toEqual([a, b, c]);
    expect(result.map((n) => n.depth)).toEqual([0, 0, 0]);
  });

  it('handles branches with increased depth', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'root');
    const b = createNode(doc, 'response', 'reply1', a);
    const c = createNode(doc, 'response', 'branch1', a); // branch from same parent
    const result = traverseLog(doc);
    expect(result).toHaveLength(3);
    // First child at depth 0, second child (branch) at depth 1
    const ids = result.map((n) => n.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
    expect(ids).toContain(c);
    // The branched node should have greater depth
    const branchEntry = result.find((n) => n.id === c);
    expect(branchEntry!.depth).toBeGreaterThan(0);
  });

  it('traverses depth-first', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'root');
    const b = createNode(doc, 'response', 'child1', a);
    const c = createNode(doc, 'user_prompt', 'grandchild1', b);
    const d = createNode(doc, 'response', 'child2', a); // branch
    const result = traverseLog(doc);
    const ids = result.map((n) => n.id);
    // depth-first: a -> b -> c before d
    expect(ids.indexOf(a)).toBeLessThan(ids.indexOf(b));
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(c));
    expect(ids.indexOf(c)).toBeLessThan(ids.indexOf(d));
  });

  it('includes node type and content in entries', () => {
    const doc = createDocument('Test');
    const id = createNode(doc, 'user_prompt', 'hello world');
    const result = traverseLog(doc);
    expect(result[0].type).toBe('user_prompt');
    expect(result[0].content).toBe('hello world');
  });
});
