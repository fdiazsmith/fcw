import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ChatServerMessage } from '@fcw/graph-core';
import { createChatGraph, addChat } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';
import type { StreamTurnFn, TurnEvent, TurnContext } from './turn-events.js';

/** Wrap a plain text-delta generator as an api-engine StreamTurnFn. */
function textTurn(
  gen: (ctx: TurnContext) => AsyncIterable<string>,
): StreamTurnFn {
  return async function* (ctx: TurnContext): AsyncIterable<TurnEvent> {
    for await (const text of gen(ctx)) yield { type: 'text_delta', text };
  };
}

function collect(sessions: ChatSessionManager): ChatServerMessage[] {
  const events: ChatServerMessage[] = [];
  sessions.on('message', (msg: ChatServerMessage) => events.push(msg));
  return events;
}

describe('ChatSessionManager.createChat', () => {
  it('adds a chat to the graph and emits chat_created', () => {
    const sessions = new ChatSessionManager();
    const events = collect(sessions);
    const id = sessions.createChat({ x: 5, y: 7 });
    expect(sessions.graph.chats[id]).toBeDefined();
    expect(sessions.graph.chats[id].position).toEqual({ x: 5, y: 7 });
    expect(events).toEqual([{ type: 'chat_created', chat: sessions.graph.chats[id] }]);
  });
});

describe('ChatSessionManager.prompt', () => {
  it('appends the user message and emits chat_user_message (no stream fn)', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    await sessions.prompt(id, 'hello');
    expect(sessions.graph.chats[id].messages).toHaveLength(1);
    expect(sessions.graph.chats[id].messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(events).toEqual([
      { type: 'chat_user_message', chatId: id, message: sessions.graph.chats[id].messages[0] },
    ]);
  });

  it('rejects for an unknown chat', async () => {
    const sessions = new ChatSessionManager();
    await expect(sessions.prompt('nope', 'x')).rejects.toThrow(/unknown chat/i);
  });
});

describe('ChatSessionManager persistence', () => {
  afterEach(() => vi.useRealTimers());

  it('adopts an initial graph', () => {
    const g = createChatGraph('Loaded');
    const id = addChat(g, { position: { x: 1, y: 2 } });
    const sessions = new ChatSessionManager('ignored', undefined, g);
    expect(sessions.graph).toBe(g);
    expect(sessions.graph.chats[id]).toBeDefined();
  });

  it('moveChat updates position and schedules a debounced save', async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const sessions = new ChatSessionManager();
    sessions.setSaveHandler(async (graph) => { saves.push(graph.id); });
    const id = sessions.createChat({ x: 0, y: 0 });
    sessions.moveChat(id, { x: 9, y: 9 });
    expect(sessions.graph.chats[id].position).toEqual({ x: 9, y: 9 });
    expect(saves).toHaveLength(0); // not yet — debounced
    await vi.advanceTimersByTimeAsync(600);
    expect(saves).toHaveLength(1); // one save for both mutations
  });

  it('saves after prompts and edge changes', async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const sessions = new ChatSessionManager();
    sessions.setSaveHandler(async (graph) => { saves.push(graph.id); });
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    await sessions.prompt(a, 'hi');
    sessions.connect(a, b);
    sessions.disconnect(a, b);
    await vi.advanceTimersByTimeAsync(600);
    expect(saves.length).toBeGreaterThanOrEqual(1);
  });

  it('moveChat throws for unknown chat', () => {
    const sessions = new ChatSessionManager();
    expect(() => sessions.moveChat('nope', { x: 0, y: 0 })).toThrow(/unknown chat/i);
  });
});

describe('ChatSessionManager connect / disconnect / branch', () => {
  it('connect adds an edge and emits chat_connected', () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    sessions.connect(a, b);
    expect(sessions.graph.edges).toHaveLength(1);
    expect(events).toEqual([
      { type: 'chat_connected', edge: { from: a, to: b, enabled: true, priority: 0 } },
    ]);
  });

  it('disconnect removes the edge and emits chat_disconnected', () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(a, b);
    const events = collect(sessions);
    sessions.disconnect(a, b);
    expect(sessions.graph.edges).toHaveLength(0);
    expect(events).toEqual([{ type: 'chat_disconnected', from: a, to: b }]);
  });

  it('branch creates a connected child chat and emits both events', () => {
    const sessions = new ChatSessionManager();
    const parent = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    const child = sessions.branch(parent, { x: 10, y: 500 });
    expect(sessions.graph.chats[child].position).toEqual({ x: 10, y: 500 });
    expect(sessions.graph.edges).toEqual([
      { from: parent, to: child, enabled: true, priority: 0 },
    ]);
    expect(events.map((e) => e.type)).toEqual(['chat_created', 'chat_connected']);
  });

  it('connect propagates cycle errors', () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(a, b);
    expect(() => sessions.connect(b, a)).toThrow(/cycle/i);
  });
});

describe('ChatSessionManager.prompt with streaming', () => {
  async function* fakeStream() {
    yield 'Hel';
    yield 'lo!';
  }

  it('streams deltas and appends the assistant message', async () => {
    const seen: string[][] = [];
    const sessions = new ChatSessionManager('T', {
      api: textTurn((ctx) => {
        seen.push(ctx.context.map((m) => `${m.role}:${m.content}`));
        return fakeStream();
      }),
    });
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');

    const msgs = sessions.graph.chats[id].messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({ role: 'assistant', content: 'Hello!' });
    expect(events.map((e) => e.type)).toEqual([
      'chat_user_message',
      'chat_stream_started',
      'chat_stream_delta',
      'chat_stream_delta',
      'chat_stream_completed',
      'chat_title_changed', // untitled chat gets auto-titled after the turn
    ]);
    expect(events[2]).toEqual({ type: 'chat_stream_delta', chatId: id, delta: 'Hel' });
    expect(events[4]).toMatchObject({ chatId: id, message: { content: 'Hello!' } });
    // the turn fn received the assembled context including the new user message
    expect(seen).toEqual([['user:hi']]);
  });

  it('sends inherited parent context to the turn fn', async () => {
    const seen: string[][] = [];
    const sessions = new ChatSessionManager('T', {
      api: textTurn((ctx) => {
        seen.push(ctx.context.map((m) => `${m.role}:${m.content}`));
        return fakeStream();
      }),
    });
    const parent = sessions.createChat({ x: 0, y: 0 });
    await sessions.prompt(parent, 'parent question');
    const child = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(parent, child);
    await sessions.prompt(child, 'child question');
    expect(seen[1]).toEqual([
      'user:parent question',
      'assistant:Hello!',
      'user:child question',
    ]);
  });

  it('dispatches to the agent engine when settings.engine is agent', async () => {
    const calls: string[] = [];
    const sessions = new ChatSessionManager('T', {
      api: textTurn(() => {
        calls.push('api');
        return fakeStream();
      }),
      agent: textTurn(() => {
        calls.push('agent');
        return fakeStream();
      }),
    });
    const id = sessions.createChat({ x: 0, y: 0 });
    sessions.updateSettings(id, { engine: 'agent' });
    await sessions.prompt(id, 'hi');
    expect(calls).toEqual(['agent']);
  });

  it('stores the session id and clears staleness on a session event', async () => {
    const sessions = new ChatSessionManager('T', {
      agent: async function* () {
        yield { type: 'session', sessionId: 'sess_xyz' } as TurnEvent;
        yield { type: 'text_delta', text: 'ok' } as TurnEvent;
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 });
    sessions.updateSettings(id, { engine: 'agent' });
    sessions.graph.chats[id].sessionStale = true;
    await sessions.prompt(id, 'hi');
    expect(sessions.graph.chats[id].sessionId).toBe('sess_xyz');
    expect(sessions.graph.chats[id].sessionStale).toBe(false);
  });

  it('accumulates turn usage on the chat and emits chat_usage_updated with the module count', async () => {
    const turnUsage = {
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 100,
      costUSD: 0.042,
    };
    const sessions = new ChatSessionManager('T', {
      agent: async function* () {
        yield { type: 'text_delta', text: 'ok' } as TurnEvent;
        yield { type: 'usage', usage: turnUsage } as TurnEvent;
      },
    });
    const parentA = sessions.createChat({ x: 0, y: 0 });
    const parentB = sessions.createChat({ x: 0, y: 0 });
    const id = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(parentA, id);
    sessions.connect(parentB, id);
    sessions.updateSettings(id, { engine: 'agent' });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    expect(sessions.graph.chats[id].usage).toEqual({ ...turnUsage, turns: 1 });
    expect(events).toContainEqual({
      type: 'chat_usage_updated',
      chatId: id,
      usage: { ...turnUsage, turns: 1 },
      contextChats: 2,
    });
  });

  it('counts only enabled incoming edges as context modules', async () => {
    const turnUsage = {
      inputTokens: 1,
      outputTokens: 1,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 0,
    };
    const sessions = new ChatSessionManager('T', {
      agent: async function* () {
        yield { type: 'text_delta', text: 'ok' } as TurnEvent;
        yield { type: 'usage', usage: turnUsage } as TurnEvent;
      },
    });
    const parent = sessions.createChat({ x: 0, y: 0 });
    const id = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(parent, id);
    sessions.graph.edges[0].enabled = false;
    sessions.updateSettings(id, { engine: 'agent' });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    const usageEvents = events.filter((e) => e.type === 'chat_usage_updated');
    expect(usageEvents).toHaveLength(1);
    expect(usageEvents[0]).toMatchObject({ contextChats: 0 });
  });

  it('appends tool messages and emits chat_tool_message', async () => {
    const sessions = new ChatSessionManager('T', {
      agent: async function* () {
        yield { type: 'tool_use', toolUseId: 'tu1', name: 'Read', input: { path: '/x' } } as TurnEvent;
        yield { type: 'tool_result', toolUseId: 'tu1', content: 'file contents' } as TurnEvent;
        yield { type: 'text_delta', text: 'done' } as TurnEvent;
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    sessions.updateSettings(id, { engine: 'agent' });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    const toolMsgs = sessions.graph.chats[id].messages.filter((m) => m.role === 'tool');
    expect(toolMsgs).toHaveLength(2);
    expect(toolMsgs[0]).toMatchObject({ toolUseId: 'tu1', toolName: 'Read', toolInput: { path: '/x' } });
    expect(toolMsgs[1]).toMatchObject({ toolUseId: 'tu1', content: 'file contents' });
    expect(events.filter((e) => e.type === 'chat_tool_message')).toHaveLength(2);
    // assistant text still lands as the final message
    const last = sessions.graph.chats[id].messages.at(-1)!;
    expect(last).toMatchObject({ role: 'assistant', content: 'done' });
  });

  it('truncates large toolInput in the emitted tool message but keeps it full on disk', async () => {
    const big = 'x'.repeat(50_000);
    const sessions = new ChatSessionManager('T', {
      agent: async function* () {
        yield { type: 'tool_use', toolUseId: 'tu1', name: 'Read', input: { path: '/big', data: big } } as TurnEvent;
        yield { type: 'text_delta', text: 'done' } as TurnEvent;
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    sessions.updateSettings(id, { engine: 'agent' });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');

    // Graph (disk-side) message keeps the full input.
    const diskMsg = sessions.graph.chats[id].messages.find((m) => m.role === 'tool');
    expect(diskMsg?.toolInput).toEqual({ path: '/big', data: big });

    // Emitted WS copy is truncated.
    const emitted = events.find(
      (e) => e.type === 'chat_tool_message' && (e as { message?: { toolUseId?: string } }).message?.toolUseId === 'tu1',
    ) as { message: { toolInput?: string; toolInputTruncated?: boolean } };
    expect(emitted).toBeDefined();
    expect(emitted.message.toolInputTruncated).toBe(true);
    expect(typeof emitted.message.toolInput).toBe('string');
    expect((emitted.message.toolInput as string).length).toBeLessThanOrEqual(4096);
    expect((emitted.message.toolInput as string).length).toBeLessThan(big.length);
  });

  it('emits chat_permission_requested and resolvePermission unblocks the turn', async () => {
    let decision: unknown;
    const sessions = new ChatSessionManager('T', {
      agent: async function* (ctx) {
        yield { type: 'permission_request', requestId: 'r1', toolName: 'Bash', input: { cmd: 'ls' } } as TurnEvent;
        decision = await ctx.waitForPermission('r1');
        yield { type: 'text_delta', text: 'after' } as TurnEvent;
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    sessions.updateSettings(id, { engine: 'agent' });
    const events = collect(sessions);
    const done = sessions.prompt(id, 'hi');
    // let the generator reach the await
    await new Promise((r) => setTimeout(r, 0));
    expect(events.some((e) => e.type === 'chat_permission_requested')).toBe(true);
    sessions.resolvePermission(id, 'r1', { behavior: 'allow' });
    await done;
    expect(decision).toEqual({ behavior: 'allow' });
    expect(events.some((e) => e.type === 'chat_permission_resolved')).toBe(true);
    expect(sessions.graph.chats[id].messages.at(-1)).toMatchObject({ content: 'after' });
  });

  it('stop() denies pending permissions for that chat and emits chat_permission_resolved', async () => {
    let decision: unknown;
    const sessions = new ChatSessionManager('T', {
      agent: async function* (ctx) {
        yield { type: 'permission_request', requestId: 'r9', toolName: 'Bash', input: { cmd: 'rm' } } as TurnEvent;
        decision = await ctx.waitForPermission('r9');
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    sessions.updateSettings(id, { engine: 'agent' });
    const events = collect(sessions);
    const done = sessions.prompt(id, 'hi');
    await new Promise((r) => setTimeout(r, 0));
    sessions.stop(id);
    await done;
    expect(decision).toEqual({ behavior: 'deny', message: expect.stringContaining('stopped') });
    expect(events.some((e) => e.type === 'chat_permission_resolved')).toBe(true);
  });

  it('auto-titles an untitled chat from the first user message when the stream completes', async () => {
    const sessions = new ChatSessionManager('T', { api: textTurn(() => fakeStream()) });
    const id = sessions.createChat({ x: 0, y: 0 }); // title ''
    const events = collect(sessions);
    await sessions.prompt(id, 'What is the capital of France?');
    expect(sessions.graph.chats[id].title).toBe('What is the capital of France?');
    const titleEvent = events.find((e) => e.type === 'chat_title_changed');
    expect(titleEvent).toEqual({
      type: 'chat_title_changed',
      chatId: id,
      title: 'What is the capital of France?',
    });
  });

  it('truncates a long first message at a word boundary with an ellipsis', async () => {
    const sessions = new ChatSessionManager('T', { api: textTurn(() => fakeStream()) });
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    await sessions.prompt(
      id,
      'Please explain the entire history of the Roman empire in great detail',
    );
    const title = sessions.graph.chats[id].title;
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(41); // 40 chars + ellipsis
    expect(title).toBe('Please explain the entire history of…');
    expect(events.some((e) => e.type === 'chat_title_changed')).toBe(true);
  });

  it('does not retitle a chat that already has a title', async () => {
    const sessions = new ChatSessionManager('T', { api: textTurn(() => fakeStream()) });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset title');
    const events = collect(sessions);
    await sessions.prompt(id, 'anything');
    expect(sessions.graph.chats[id].title).toBe('Preset title');
    expect(events.some((e) => e.type === 'chat_title_changed')).toBe(false);
  });

  it('stop() breaks the stream, appends the partial text, and completes', async () => {
    let started = false;
    const sessions = new ChatSessionManager('T');
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    (sessions as unknown as { streams: { api: StreamTurnFn } }).streams.api = textTurn(
      async function* (): AsyncGenerator<string> {
        yield 'par';
        started = true;
        sessions.stop(id); // request stop mid-stream
        yield 'tial'; // should be ignored
        yield 'more';
      },
    );
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    expect(started).toBe(true);
    const msgs = sessions.graph.chats[id].messages;
    expect(msgs[msgs.length - 1]).toMatchObject({ role: 'assistant', content: 'par' });
    expect(events.some((e) => e.type === 'chat_stream_completed')).toBe(true);
    expect(events.some((e) => e.type === 'chat_error')).toBe(false);
  });

  it('regenerate() drops a trailing assistant message and re-streams', async () => {
    const sessions = new ChatSessionManager('T', { api: textTurn(() => fakeStream()) });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    await sessions.prompt(id, 'question'); // -> user + assistant 'Hello!'
    expect(sessions.graph.chats[id].messages).toHaveLength(2);
    const events = collect(sessions);
    await sessions.regenerate(id);
    // still user + one assistant (removed then re-added), no new user message
    const msgs = sessions.graph.chats[id].messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(msgs[0].content).toBe('question');
    const types = events.map((e) => e.type);
    expect(types[0]).toBe('chat_last_message_removed');
    expect(types).toContain('chat_stream_started');
    expect(types).toContain('chat_stream_completed');
    expect(types).not.toContain('chat_user_message');
  });

  it('regenerate() marks an agent session stale before re-running', async () => {
    const seenSessionIds: (string | undefined)[] = [];
    const sessions = new ChatSessionManager('T', {
      agent: async function* (ctx) {
        seenSessionIds.push(ctx.sessionId);
        yield { type: 'session', sessionId: 'sess_1' } as TurnEvent;
        yield { type: 'text_delta', text: 'reply' } as TurnEvent;
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    sessions.updateSettings(id, { engine: 'agent' });
    await sessions.prompt(id, 'q'); // captures sessionId sess_1
    expect(sessions.graph.chats[id].sessionId).toBe('sess_1');
    await sessions.regenerate(id);
    // second run started fresh (no resume) because regenerate marked it stale
    expect(seenSessionIds).toEqual([undefined, undefined]);
  });

  it('regenerate() is a no-op when the last message is not assistant', async () => {
    const sessions = new ChatSessionManager('T', { api: textTurn(() => fakeStream()) });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    const events = collect(sessions);
    await sessions.regenerate(id); // no messages at all
    expect(events).toHaveLength(0);
    expect(sessions.graph.chats[id].messages).toHaveLength(0);
  });

  it('regenerate() throws for an unknown chat', async () => {
    const sessions = new ChatSessionManager('T', { api: textTurn(() => fakeStream()) });
    await expect(sessions.regenerate('nope')).rejects.toThrow(/unknown chat/i);
  });

  it('emits chat_error and no assistant message when the stream fails', async () => {
    const sessions = new ChatSessionManager('T', {
      api: textTurn(async function* (): AsyncGenerator<string> {
        yield 'par';
        throw new Error('boom');
      }),
    });
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    expect(events.map((e) => e.type)).toEqual([
      'chat_user_message',
      'chat_stream_started',
      'chat_stream_delta',
      'chat_error',
    ]);
    expect(sessions.graph.chats[id].messages).toHaveLength(1); // only the user msg
  });

  it('emits chat_error (not completed) when the stream yields nothing', async () => {
    const sessions = new ChatSessionManager('T', {
      agent: async function* () {
        // yields nothing, then closes
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    sessions.updateSettings(id, { engine: 'agent' });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    expect(events.some((e) => e.type === 'chat_error')).toBe(true);
    expect(events.some((e) => e.type === 'chat_stream_completed')).toBe(false);
    // no empty assistant message appended — only the user prompt remains
    const roles = sessions.graph.chats[id].messages.map((m) => m.role);
    expect(roles).toEqual(['user']);
  });

  it('completes normally for a tool-only stream with no text deltas', async () => {
    const sessions = new ChatSessionManager('T', {
      agent: async function* () {
        yield { type: 'tool_use', toolUseId: 'tu1', name: 'Read', input: { path: '/x' } } as TurnEvent;
        yield { type: 'tool_result', toolUseId: 'tu1', content: 'done' } as TurnEvent;
      },
    });
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    sessions.updateSettings(id, { engine: 'agent' });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    expect(events.some((e) => e.type === 'chat_stream_completed')).toBe(true);
    expect(events.some((e) => e.type === 'chat_error')).toBe(false);
    // an empty assistant message is still appended (the turn did complete)
    expect(sessions.graph.chats[id].messages.at(-1)).toMatchObject({ role: 'assistant', content: '' });
  });

  it('resolves attachmentIds to attachments on the user message', async () => {
    const resolver = (attId: string) =>
      attId === 'a1'
        ? { id: 'a1', name: 'pic.png', mediaType: 'image/png', path: '/d/a1.png' }
        : undefined;
    let ctxAttachments: unknown;
    const sessions = new ChatSessionManager(
      'T',
      {
        api: async function* (ctx) {
          ctxAttachments = ctx.attachments;
          yield { type: 'text_delta', text: 'ok' } as TurnEvent;
        },
      },
      undefined,
      resolver,
    );
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    await sessions.prompt(id, 'see this', ['a1', 'missing']);
    const userMsg = sessions.graph.chats[id].messages[0];
    expect(userMsg.attachments).toEqual([
      { id: 'a1', name: 'pic.png', mediaType: 'image/png', path: '/d/a1.png' },
    ]);
    expect(ctxAttachments).toEqual(userMsg.attachments);
  });
});

describe('ChatSessionManager edge staleness', () => {
  it('connect and disconnect mark the target and descendants stale', () => {
    const sessions = new ChatSessionManager('T');
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    const c = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(b, c); // b -> c
    sessions.connect(a, b); // a -> b, marks b and c stale
    expect(sessions.graph.chats[b].sessionStale).toBe(true);
    expect(sessions.graph.chats[c].sessionStale).toBe(true);
    // clear then disconnect re-marks
    sessions.graph.chats[b].sessionStale = false;
    sessions.graph.chats[c].sessionStale = false;
    sessions.disconnect(a, b);
    expect(sessions.graph.chats[b].sessionStale).toBe(true);
    expect(sessions.graph.chats[c].sessionStale).toBe(true);
  });
});

describe('ChatSessionManager.updateSettings', () => {
  it('emits chat_settings_changed with the merged settings', () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    sessions.updateSettings(id, { engine: 'agent', model: 'claude-opus-4-8' });
    expect(events).toContainEqual({
      type: 'chat_settings_changed',
      chatId: id,
      settings: { engine: 'agent', model: 'claude-opus-4-8' },
    });
  });
});
