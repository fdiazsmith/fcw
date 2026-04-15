import { describe, it, expect, vi } from 'vitest';
import { createLlmSummary } from './llm-summary.js';
import { createDocument, createNode } from '@fcw/graph-core';
import type { GenerateSummary } from '@fcw/graph-core';

describe('createLlmSummary', () => {
  it('returns a GenerateSummary function', () => {
    const fn = createLlmSummary({ apiKey: 'test' });
    expect(fn).toBeTypeOf('function');
  });

  it('calls Claude API and returns summary string', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Conversation about testing' }],
    });

    const fn = createLlmSummary({ createMessage: mockCreate });
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'How do I write tests?');
    createNode(doc, 'response', 'Use vitest...');

    const result = await fn(doc);
    expect(result).toBe('Conversation about testing');
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it('falls back to structural summary on API error', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('API down'));

    const fn = createLlmSummary({ createMessage: mockCreate });
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'hello');

    const result = await fn(doc);
    expect(result).toContain('1 node');
    expect(result).toContain('user_prompt');
  });

  it('passes graph content to the API prompt', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'summary' }],
    });

    const fn = createLlmSummary({ createMessage: mockCreate });
    const doc = createDocument('Test');
    createNode(doc, 'user_prompt', 'What is TypeScript?');

    await fn(doc);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('What is TypeScript?');
  });

  it('satisfies GenerateSummary interface', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
    });
    const fn: GenerateSummary = createLlmSummary({ createMessage: mockCreate });
    const doc = createDocument('Test');
    const result = await fn(doc);
    expect(typeof result).toBe('string');
  });
});
