import { describe, it, expect } from 'vitest';
import { exportAsMarkdown, exportAsJson } from './export.js';
import { createDocument, createNode } from '@fcw/graph-core';

describe('exportAsMarkdown', () => {
  it('returns title as h1', () => {
    const doc = createDocument('My Chat');
    const md = exportAsMarkdown(doc);
    expect(md).toContain('# My Chat');
  });

  it('returns empty body for empty doc', () => {
    const doc = createDocument('Empty');
    const md = exportAsMarkdown(doc);
    expect(md.trim()).toBe('# Empty');
  });

  it('formats user_prompt with > blockquote', () => {
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'hello');
    const md = exportAsMarkdown(doc);
    expect(md).toContain('> hello');
  });

  it('formats response as plain text', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    createNode(doc, 'response', 'answer text', a);
    const md = exportAsMarkdown(doc);
    expect(md).toContain('answer text');
  });

  it('indents branches', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'root');
    createNode(doc, 'response', 'reply1', a);
    createNode(doc, 'response', 'branch1', a);
    const md = exportAsMarkdown(doc);
    // Branch should be indented with >
    expect(md).toContain('  > *Branch:*');
  });

  it('formats code nodes with fenced code blocks', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'show code');
    createNode(doc, 'code', 'const x = 1;', a);
    const md = exportAsMarkdown(doc);
    expect(md).toContain('```\nconst x = 1;\n```');
  });

  it('orders nodes depth-first', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'FIRST');
    const b = createNode(doc, 'response', 'SECOND', a);
    createNode(doc, 'user_prompt', 'THIRD', b);
    const md = exportAsMarkdown(doc);
    const firstIdx = md.indexOf('FIRST');
    const secondIdx = md.indexOf('SECOND');
    const thirdIdx = md.indexOf('THIRD');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });
});

describe('exportAsJson', () => {
  it('returns valid JSON string', () => {
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'hello');
    const json = exportAsJson(doc);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe(doc.id);
  });

  it('preserves all nodes and edges', () => {
    const doc = createDocument('Test');
    const a = createNode(doc, 'user_prompt', 'q');
    createNode(doc, 'response', 'a', a);
    const json = exportAsJson(doc);
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed.nodes)).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
  });
});
