import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@fcw/graph-core';
import { createChatStreamText } from './chat-claude-adapter.js';
import type { ClaudeClient } from './claude-client.js';
import type { TurnContext, TurnEvent } from './turn-events.js';

function turnCtx(context: ChatMessage[]): TurnContext {
  return {
    context,
    latest: context[context.length - 1]?.content ?? '',
    settings: { engine: 'api' },
    attachments: [],
    waitForPermission: async () => ({ behavior: 'deny' }),
    signal: new AbortController().signal,
  };
}

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
  it('appends the doc blocks section to the system prompt (M2.4)', async () => {
    const captured: { messages?: unknown; system?: string } = {};
    const streamTurn = createChatStreamText(fakeClient([], captured));
    const ctx = turnCtx([msg('user', 'q')]);
    ctx.docContext = [{ docId: 'h', title: 'Host', body: 'host body', degraded: false }];
    for await (const _ of streamTurn(ctx)) { /* drain */ }
    expect(captured.system).toContain('Flow Canvas');
    expect(captured.system).toContain('Documents in scope');
    expect(captured.system).toContain('## Host\nhost body');

    const plain: { messages?: unknown; system?: string } = {};
    for await (const _ of createChatStreamText(fakeClient([], plain))(turnCtx([msg('user', 'q')]))) { /* drain */ }
    expect(plain.system).not.toContain('Documents in scope');
  });

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
    const streamTurn = createChatStreamText(client);
    const out: string[] = [];
    for await (const ev of streamTurn(
      turnCtx([msg('user', 'q1'), msg('assistant', 'a1'), msg('user', 'q2')]),
    ) as AsyncIterable<TurnEvent>) {
      if (ev.type === 'text_delta') out.push(ev.text);
    }
    expect(out).toEqual(['Hel', 'lo']);
    expect(captured.messages).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ]);
    expect(captured.system).toContain('canvas');
  });

  it('emits usage assembled from message_start and message_delta events', async () => {
    const captured: { messages?: unknown; system?: string } = {};
    const client = fakeClient(
      [
        {
          type: 'message_start',
          message: {
            usage: {
              input_tokens: 1200,
              output_tokens: 1,
              cache_read_input_tokens: 900,
              cache_creation_input_tokens: 100,
            },
          },
        },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
        { type: 'message_delta', usage: { output_tokens: 340 } },
        { type: 'message_stop' },
      ],
      captured,
    );
    const streamTurn = createChatStreamText(client);
    const events: TurnEvent[] = [];
    for await (const ev of streamTurn(turnCtx([msg('user', 'q')])) as AsyncIterable<TurnEvent>) {
      events.push(ev);
    }
    expect(events).toContainEqual({
      type: 'usage',
      usage: {
        inputTokens: 1200,
        outputTokens: 340,
        cacheReadInputTokens: 900,
        cacheCreationInputTokens: 100,
        costUSD: 0,
      },
    });
  });

  it('emits no usage event when the stream carries no usage data', async () => {
    const captured: { messages?: unknown; system?: string } = {};
    const client = fakeClient(
      [
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
        { type: 'message_stop' },
      ],
      captured,
    );
    const streamTurn = createChatStreamText(client);
    const events: TurnEvent[] = [];
    for await (const ev of streamTurn(turnCtx([msg('user', 'q')])) as AsyncIterable<TurnEvent>) {
      events.push(ev);
    }
    expect(events.filter((e) => e.type === 'usage')).toHaveLength(0);
  });
});
