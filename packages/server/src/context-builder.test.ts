import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './context-builder.js';
import { createDocument, createNode } from '@fcw/graph-core';

describe('buildSystemPrompt', () => {
  it('includes saved summary from meta when available', () => {
    const doc = createDocument('Test');
    doc.meta.summary = 'User asked about X, assistant explained Y';
    const prompt = buildSystemPrompt(doc);
    expect(prompt).toContain('User asked about X, assistant explained Y');
  });

  it('falls back to structural summary when no saved summary', () => {
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'hello');
    const prompt = buildSystemPrompt(doc);
    expect(prompt).toContain('1 node');
    expect(prompt).toContain('user_prompt');
  });

  it('includes canvas tool instructions', () => {
    const doc = createDocument('Test');
    const prompt = buildSystemPrompt(doc);
    expect(prompt).toContain('canvas_create_node');
    expect(prompt).toContain('DIAGRAM-FIRST');
  });

  it('includes base system identity', () => {
    const doc = createDocument('Test');
    const prompt = buildSystemPrompt(doc);
    expect(prompt).toContain('Flow Canvas');
  });

  it('includes document title', () => {
    const doc = createDocument('My Chat');
    const prompt = buildSystemPrompt(doc);
    expect(prompt).toContain('My Chat');
  });

  it('uses structural summary for empty doc with no saved summary', () => {
    const doc = createDocument('Empty');
    const prompt = buildSystemPrompt(doc);
    expect(prompt).toContain('0 nodes');
  });
});
