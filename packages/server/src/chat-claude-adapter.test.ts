import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@fcw/graph-core';
import { createChatStreamText } from './chat-claude-adapter.js';
import type { ClaudeClient } from './claude-client.js';

function fakeClient(events: unknown[], captured: { messages?: unknown; system?: string }) {
  return {
    stream(messages: unknown, systemPrompt: string) {
      captured.messages = messages;
      captured.system = systemPrompt;
      return (async function* () {
        for (const e of events) yield e;
      })() as ReturnType<ClaudeClient['stream']>;
    },
    buildSystemPrompt: (s: string) => s,
  } as unknown as ClaudeClient;
}

const msg = (role: 'user' | 'assistant', content: string): ChatMessage => ({
  role,
  content,
  createdAt: 'now',
});

describe('createChatStreamText', () => {
  it('maps context to API messages and yields only text deltas', async () => {
    const captured: { messages?: unknown; system?: string } = {};
    const client = fakeClient(
      [
        { type: 'message_start' },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
        { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'x' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } },
        { type: 'message_stop' },
      ],
      captured,
    );
    const streamText = createChatStreamText(client);
    const out: string[] = [];
    for await (const d of streamText([msg('user', 'q1'), msg('assistant', 'a1'), msg('user', 'q2')])) {
      out.push(d);
    }
    expect(out).toEqual(['Hel', 'lo']);
    expect(captured.messages).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
    expect(captured.system).toContain('canvas');
  });
});
