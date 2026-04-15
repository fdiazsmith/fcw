import { describe, it, expect, vi } from 'vitest';
import { createDocument, createNode, toJSON, fromJSON } from '@fcw/graph-core';
import { buildSystemPrompt } from './context-builder.js';
import { createLlmSummary } from './llm-summary.js';

describe('save/load round-trip with summary', () => {
  it('saves summary in meta, loads it, and injects into system prompt', async () => {
    // 1. Create doc with content
    const doc = createDocument('Round Trip');
    const a = createNode(doc, 'user_prompt', 'Explain monads');
    createNode(doc, 'response', 'Monads are a design pattern...', a);

    // 2. Generate summary via LLM (mocked)
    const mockCreate = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Discussion about monads in FP' }],
    });
    const summarize = createLlmSummary({ createMessage: mockCreate });
    doc.meta.summary = await summarize(doc);

    // 3. Serialize (save)
    const json = toJSON(doc);

    // 4. Deserialize (load)
    const loaded = fromJSON(json);

    // 5. Verify summary persisted
    expect(loaded.meta.summary).toBe('Discussion about monads in FP');

    // 6. Build system prompt from loaded doc
    const prompt = buildSystemPrompt(loaded);
    expect(prompt).toContain('Discussion about monads in FP');
    expect(prompt).toContain('canvas_create_node');
  });

  it('round-trips without summary, falls back to structural', () => {
    const doc = createDocument('No Summary');
    createNode(doc, 'user_prompt', 'hi');
    const json = toJSON(doc);
    const loaded = fromJSON(json);
    expect(loaded.meta.summary).toBeUndefined();

    const prompt = buildSystemPrompt(loaded);
    expect(prompt).toContain('1 node');
  });
});
