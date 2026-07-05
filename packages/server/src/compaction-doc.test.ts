import { describe, it, expect, vi } from 'vitest';
import type { ChatNode } from '@fcw/graph-core';
import {
  buildCompactionPrompt,
  structuralCompactionDocument,
  createCompactionDocGenerator,
} from './compaction-doc.js';

function member(id: string, title: string, exchanges: Array<[string, string]>): ChatNode {
  return {
    id,
    title,
    messages: exchanges.map(([role, content]) => ({
      role: role as 'user' | 'assistant',
      content,
      createdAt: '2026-01-01T00:00:00.000Z',
    })),
    position: { x: 0, y: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const members = [
  member('c1', 'Auth design', [
    ['user', 'how should we do auth?'],
    ['assistant', 'Use OAuth with PKCE.'],
  ]),
  member('c2', 'Token storage', [
    ['user', 'where do tokens live?'],
    ['assistant', 'httpOnly cookies.'],
  ]),
];

describe('structuralCompactionDocument', () => {
  it('renders member titles and transcripts as markdown', () => {
    const doc = structuralCompactionDocument(members);
    expect(doc).toContain('## Auth design');
    expect(doc).toContain('## Token storage');
    expect(doc).toContain('how should we do auth?');
    expect(doc).toContain('httpOnly cookies.');
    expect(doc).toContain('**User:**');
    expect(doc).toContain('**Assistant:**');
  });

  it('truncates very long messages', () => {
    const long = member('c3', 'Long', [['user', 'x'.repeat(2000)]]);
    const doc = structuralCompactionDocument([long]);
    expect(doc.length).toBeLessThan(1500);
    expect(doc).toContain('…');
  });
});

describe('buildCompactionPrompt', () => {
  it('includes every transcript and asks for a markdown document', () => {
    const params = buildCompactionPrompt(members);
    expect(params.system.toLowerCase()).toContain('markdown');
    const text = params.messages.map((m) => m.content).join('\n');
    expect(text).toContain('Use OAuth with PKCE.');
    expect(text).toContain('where do tokens live?');
    expect(params.max_tokens).toBeGreaterThanOrEqual(1024);
  });
});

describe('createCompactionDocGenerator', () => {
  it('returns the LLM document text', async () => {
    const createMessage = vi
      .fn()
      .mockResolvedValue({ content: [{ type: 'text', text: '# Synthesis\n\nOAuth + cookies.' }] });
    const generate = createCompactionDocGenerator({ createMessage });
    await expect(generate(members)).resolves.toBe('# Synthesis\n\nOAuth + cookies.');
    expect(createMessage).toHaveBeenCalledOnce();
  });

  it('falls back to the structural document when the LLM call fails', async () => {
    const createMessage = vi.fn().mockRejectedValue(new Error('api down'));
    const generate = createCompactionDocGenerator({ createMessage });
    const doc = await generate(members);
    expect(doc).toContain('## Auth design');
  });

  it('falls back when the response has no text block', async () => {
    const createMessage = vi.fn().mockResolvedValue({ content: [] });
    const generate = createCompactionDocGenerator({ createMessage });
    await expect(generate(members)).resolves.toContain('## Auth design');
  });

  it('uses the structural document when no API key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    try {
      const generate = createCompactionDocGenerator({});
      await expect(generate(members)).resolves.toContain('## Auth design');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
