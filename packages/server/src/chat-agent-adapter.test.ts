import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentTurnStream, type QueryFn } from './chat-agent-adapter.js';
import type { ChatMessage } from '@fcw/graph-core';
import type { TurnContext, TurnEvent, PermissionDecision } from './turn-events.js';

const msg = (role: 'user' | 'assistant', content: string): ChatMessage => ({
  role,
  content,
  createdAt: 'now',
});

function ctx(over: Partial<TurnContext> = {}): TurnContext {
  return {
    context: [msg('user', 'hello')],
    latest: 'hello',
    settings: { engine: 'agent' },
    attachments: [],
    waitForPermission: async () => ({ behavior: 'allow' }) as PermissionDecision,
    signal: new AbortController().signal,
    ...over,
  };
}

interface Capture {
  params?: { prompt: unknown; options?: Record<string, unknown> };
  promptMessages: unknown[];
  interrupt: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

/** Fake query() that records params/prompt and yields the given SDK messages. */
function fakeQuery(
  messages: unknown[],
  capture: Capture,
  hook?: (params: { options?: Record<string, unknown> }) => Promise<void>,
): QueryFn {
  return ((params) => {
    capture.params = params as Capture['params'];
    const gen = (async function* () {
      if (typeof params.prompt !== 'string') {
        for await (const m of params.prompt) capture.promptMessages.push(m);
      }
      if (hook) await hook(params as { options?: Record<string, unknown> });
      for (const m of messages) yield m;
    })() as AsyncGenerator<unknown> & { interrupt: ReturnType<typeof vi.fn> };
    capture.interrupt = vi.fn().mockResolvedValue(undefined);
    capture.close = vi.fn();
    gen.interrupt = capture.interrupt;
    (gen as unknown as { close: ReturnType<typeof vi.fn> }).close = capture.close;
    return gen as never;
  }) as QueryFn;
}

async function collect(stream: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

describe('createAgentTurnStream options', () => {
  it('maps settings to query options and resumes when a session id is present', async () => {
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    const turn = createAgentTurnStream(fakeQuery([], cap));
    await collect(
      turn(
        ctx({
          settings: { engine: 'agent', model: 'claude-opus-4-8', effort: 'xhigh', cwd: '/repo', permissionMode: 'acceptEdits' },
          sessionId: 'sess_live',
        }),
      ),
    );
    expect(cap.params?.options).toMatchObject({
      model: 'claude-opus-4-8',
      effort: 'xhigh',
      cwd: '/repo',
      permissionMode: 'acceptEdits',
      resume: 'sess_live',
      includePartialMessages: true,
    });
  });

  it('omits resume and injects a preamble for a fresh session', async () => {
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    const turn = createAgentTurnStream(fakeQuery([], cap));
    await collect(
      turn(
        ctx({
          context: [msg('user', 'parent q'), msg('assistant', 'parent a'), msg('user', 'child q')],
          latest: 'child q',
          sessionId: undefined,
        }),
      ),
    );
    expect(cap.params?.options?.resume).toBeUndefined();
    const first = cap.promptMessages[0] as { message: { content: Array<{ type: string; text?: string }> } };
    const text = first.message.content.find((b) => b.type === 'text')!.text!;
    expect(text).toContain('parent q');
    expect(text).toContain('parent a');
    expect(text).toContain('child q');
    expect(text).toContain('inherited');
  });

  it('keeps trailing tool messages in the preamble without duplicating the prompt', async () => {
    // After regenerate, the discarded turn's tool messages trail the user prompt.
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    const turn = createAgentTurnStream(fakeQuery([], cap));
    await collect(
      turn(
        ctx({
          context: [
            msg('user', 'list the files'),
            { role: 'tool', content: '→ Bash', createdAt: 'now' } as ChatMessage,
            { role: 'tool', content: 'a.txt b.txt', createdAt: 'now' } as ChatMessage,
          ],
          latest: 'list the files',
          sessionId: undefined,
        }),
      ),
    );
    const first = cap.promptMessages[0] as { message: { content: Array<{ type: string; text?: string }> } };
    const text = first.message.content.find((b) => b.type === 'text')!.text!;
    expect(text).toContain('a.txt b.txt');
    expect(text.match(/list the files/g)).toHaveLength(1);
  });
});

describe('createAgentTurnStream message mapping', () => {
  it('emits session, text deltas, tool_use, and tool_result', async () => {
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    const turn = createAgentTurnStream(
      fakeQuery(
        [
          { type: 'system', subtype: 'init', session_id: 'sess_new' },
          {
            type: 'stream_event',
            session_id: 'sess_new',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi ' } },
          },
          {
            type: 'assistant',
            session_id: 'sess_new',
            message: { content: [{ type: 'tool_use', id: 'tu1', name: 'Read', input: { path: '/x' } }] },
          },
          {
            type: 'user',
            session_id: 'sess_new',
            message: { content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'file body' }] },
          },
          {
            type: 'stream_event',
            session_id: 'sess_new',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'there' } },
          },
        ],
        cap,
      ),
    );
    const events = await collect(turn(ctx()));
    expect(events).toContainEqual({ type: 'session', sessionId: 'sess_new' });
    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { text: string }).text)).toEqual([
      'Hi ',
      'there',
    ]);
    expect(events).toContainEqual({ type: 'tool_use', toolUseId: 'tu1', name: 'Read', input: { path: '/x' } });
    expect(events).toContainEqual({ type: 'tool_result', toolUseId: 'tu1', content: 'file body' });
  });

  it('emits usage from the result message', async () => {
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    const turn = createAgentTurnStream(
      fakeQuery(
        [
          { type: 'system', subtype: 'init', session_id: 'sess_new' },
          {
            type: 'result',
            subtype: 'success',
            session_id: 'sess_new',
            total_cost_usd: 0.042,
            usage: {
              input_tokens: 1200,
              output_tokens: 340,
              cache_read_input_tokens: 900,
              cache_creation_input_tokens: 100,
            },
          },
        ],
        cap,
      ),
    );
    const events = await collect(turn(ctx()));
    expect(events).toContainEqual({
      type: 'usage',
      usage: {
        inputTokens: 1200,
        outputTokens: 340,
        cacheReadInputTokens: 900,
        cacheCreationInputTokens: 100,
        costUSD: 0.042,
      },
    });
  });

  it('emits no usage event when the result message lacks usage', async () => {
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    const turn = createAgentTurnStream(
      fakeQuery([{ type: 'result', subtype: 'success', session_id: 's' }], cap),
    );
    const events = await collect(turn(ctx()));
    expect(events.filter((e) => e.type === 'usage')).toHaveLength(0);
  });
});

describe('createAgentTurnStream permissions', () => {
  it('emits permission_request and returns the awaited decision to canUseTool', async () => {
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    let permissionResult: unknown;
    const turn = createAgentTurnStream(
      fakeQuery(
        [
          {
            type: 'stream_event',
            session_id: 's',
            event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'ok' } },
          },
        ],
        cap,
        async (params) => {
          const canUseTool = params.options!.canUseTool as (
            n: string,
            i: unknown,
            o: unknown,
          ) => Promise<unknown>;
          permissionResult = await canUseTool('Bash', { command: 'ls' }, {});
        },
      ),
    );
    const events = await collect(
      turn(ctx({ waitForPermission: async () => ({ behavior: 'deny', message: 'nope' }) })),
    );
    const req = events.find((e) => e.type === 'permission_request') as
      | { type: 'permission_request'; toolName: string; input: unknown }
      | undefined;
    expect(req).toMatchObject({ toolName: 'Bash', input: { command: 'ls' } });
    expect(permissionResult).toEqual({ behavior: 'deny', message: 'nope' });
  });
});

describe('createAgentTurnStream attachments', () => {
  it('adds image/document blocks and lists text files by path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fcw-att-'));
    const imgPath = join(dir, 'pic.png');
    const pdfPath = join(dir, 'doc.pdf');
    writeFileSync(imgPath, Buffer.from([1, 2, 3]));
    writeFileSync(pdfPath, Buffer.from([4, 5, 6]));
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    const turn = createAgentTurnStream(fakeQuery([], cap));
    await collect(
      turn(
        ctx({
          attachments: [
            { id: 'i', name: 'pic.png', mediaType: 'image/png', path: imgPath },
            { id: 'd', name: 'doc.pdf', mediaType: 'application/pdf', path: pdfPath },
            { id: 't', name: 'notes.txt', mediaType: 'text/plain', path: '/tmp/notes.txt' },
          ],
        }),
      ),
    );
    const content = (cap.promptMessages[0] as { message: { content: Array<{ type: string; text?: string }> } })
      .message.content;
    expect(content.some((b) => b.type === 'image')).toBe(true);
    expect(content.some((b) => b.type === 'document')).toBe(true);
    const text = content.find((b) => b.type === 'text')!.text!;
    expect(text).toContain('/tmp/notes.txt');
  });
});

describe('createAgentTurnStream abort', () => {
  it('interrupts and closes the query when the signal aborts', async () => {
    const cap: Capture = { promptMessages: [], interrupt: vi.fn(), close: vi.fn() };
    const controller = new AbortController();
    const turn = createAgentTurnStream(
      fakeQuery([], cap, async () => {
        controller.abort();
      }),
    );
    await collect(turn(ctx({ signal: controller.signal })));
    expect(cap.interrupt).toHaveBeenCalled();
    expect(cap.close).toHaveBeenCalled();
  });
});
