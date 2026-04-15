import { describe, it, expect } from 'vitest';
import { createDocument, createNode } from './operations.js';
import { createEdge } from './edges.js';
import { generateStructuralSummary } from './summary.js';
import type { GenerateSummary } from './summary.js';

describe('generateStructuralSummary', () => {
  it('returns string with node count and edge count', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'question one');
    createNode(doc, 'response', 'answer one', a);
    const summary = generateStructuralSummary(doc);
    expect(summary).toContain('2 nodes');
    expect(summary).toContain('1 edge');
  });

  it('includes node type breakdown', () => {
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'q1');
    createNode(doc, 'user_prompt', 'q2');
    createNode(doc, 'response', 'a1');
    const summary = generateStructuralSummary(doc);
    expect(summary).toContain('user_prompt: 2');
    expect(summary).toContain('response: 1');
  });

  it('includes first 50 chars of user_prompt content', () => {
    const doc = createDocument('Test');
    const longPrompt = 'A'.repeat(80);
    createNode(doc, 'user_prompt', longPrompt);
    const summary = generateStructuralSummary(doc);
    expect(summary).toContain('A'.repeat(50));
    expect(summary).not.toContain('A'.repeat(51));
  });

  it('handles empty document', () => {
    const doc = createDocument('Empty');
    const summary = generateStructuralSummary(doc);
    expect(summary).toContain('0 nodes');
    expect(summary).toContain('0 edges');
  });
});

describe('GenerateSummary interface', () => {
  it('is an async function type that takes a doc and returns a string', async () => {
    const mockImpl: GenerateSummary = async (doc) => {
      return `Summary of ${doc.meta.title}`;
    };
    const doc = createDocument('Test');
    await expect(mockImpl(doc)).resolves.toBe('Summary of Test');
  });
});
