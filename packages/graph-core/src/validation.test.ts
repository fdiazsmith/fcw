import { describe, it, expect } from 'vitest';
import { createDocument, createNode } from './operations.js';
import { createEdge } from './edges.js';
import { validateDocument } from './validation.js';

describe('validateDocument', () => {
  it('returns valid for a well-formed document', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    createNode(doc, 'response', 'a', a);
    const result = validateDocument(doc);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid for an empty document', () => {
    const doc = createDocument('Empty');
    const result = validateDocument(doc);
    expect(result.valid).toBe(true);
  });

  it('detects edges referencing non-existent from node', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    // Manually inject a bad edge
    doc.edges.push({ from: 'ghost', to: a, type: 'reply_to' });
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('detects edges referencing non-existent to node', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    doc.edges.push({ from: a, to: 'ghost', type: 'reply_to' });
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('ghost'))).toBe(true);
  });

  it('detects edges with invalid type values', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    const b = createNode(doc, 'response', 'a');
    // Manually inject edge with bad type
    doc.edges.push({ from: a, to: b, type: 'invalid_type' as any });
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid_type'))).toBe(true);
  });

  it('reports multiple errors at once', () => {
    const doc = createDocument('Test');
    doc.edges.push({ from: 'x', to: 'y', type: 'reply_to' });
    doc.edges.push({ from: 'a', to: 'b', type: 'bad' as any });
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts valid executionStatus values', () => {
    const doc = createDocument('Test');
    const nodeId = createNode(doc, 'user_prompt', 'q');
    doc.nodes[nodeId].executionStatus = 'pending';
    expect(validateDocument(doc).valid).toBe(true);
    doc.nodes[nodeId].executionStatus = 'in_progress';
    expect(validateDocument(doc).valid).toBe(true);
    doc.nodes[nodeId].executionStatus = 'completed';
    expect(validateDocument(doc).valid).toBe(true);
  });

  it('rejects invalid executionStatus value', () => {
    const doc = createDocument('Test');
    const nodeId = createNode(doc, 'user_prompt', 'q');
    (doc.nodes[nodeId] as any).executionStatus = 'bad_status';
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('executionStatus'))).toBe(true);
  });

  it('accepts valid pathStatus values', () => {
    const doc = createDocument('Test');
    const nodeId = createNode(doc, 'user_prompt', 'q');
    doc.nodes[nodeId].pathStatus = 'active';
    expect(validateDocument(doc).valid).toBe(true);
    doc.nodes[nodeId].pathStatus = 'archived';
    expect(validateDocument(doc).valid).toBe(true);
  });

  it('rejects invalid pathStatus value', () => {
    const doc = createDocument('Test');
    const nodeId = createNode(doc, 'user_prompt', 'q');
    (doc.nodes[nodeId] as any).pathStatus = 'gone';
    const result = validateDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('pathStatus'))).toBe(true);
  });
});
