import { describe, it, expect } from 'vitest';
import type { ChatServerMessage, ChatNode, Doc } from '@fcw/graph-core';
import { compactionDigest, createChatGraph } from '@fcw/graph-core';
import { emptyChatState, applyChatMessage, compactionIsStale, clearPendingLayout, canvasById, placementsOn, canvasesPlacing, rootChatIds, chatIdsOn, ChatState } from './chat-store';

const chat = (id: string): ChatNode => ({
  id,
  title: '',
  messages: [],
  position: { x: 0, y: 0 },
  createdAt: 't0',
});

const apply = (state: ChatState, ...msgs: ChatServerMessage[]) =>
  msgs.reduce(applyChatMessage, state);

describe('applyChatMessage', () => {
  it('chat_created adds a chat view', () => {
    const s = apply(emptyChatState(), { type: 'chat_created', chat: chat('c1') });
    expect(s.chats.c1).toMatchObject({ id: 'c1', messages: [], streamingText: null });
  });

  it('chat_user_message appends to the transcript', () => {
    const m = { role: 'user' as const, content: 'hi', createdAt: 't1' };
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_user_message', chatId: 'c1', message: m },
    );
    expect(s.chats.c1.messages).toEqual([m]);
  });

  it('stream lifecycle: started -> deltas accumulate -> completed moves to transcript', () => {
    const done = { role: 'assistant' as const, content: 'Hello!', createdAt: 't2' };
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_stream_started', chatId: 'c1' },
      { type: 'chat_stream_delta', chatId: 'c1', delta: 'Hel' },
    );
    expect(s.chats.c1.streamingText).toBe('Hel');
    s = apply(s, { type: 'chat_stream_delta', chatId: 'c1', delta: 'lo!' });
    expect(s.chats.c1.streamingText).toBe('Hello!');
    s = apply(s, { type: 'chat_stream_completed', chatId: 'c1', message: done });
    expect(s.chats.c1.streamingText).toBeNull();
    expect(s.chats.c1.messages).toEqual([done]);
  });

  it('chat_error clears streaming and records the error', () => {
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_stream_started', chatId: 'c1' },
      { type: 'chat_error', chatId: 'c1', message: 'boom' },
    );
    expect(s.chats.c1.streamingText).toBeNull();
    expect(s.chats.c1.error).toBe('boom');
  });

  it('chat_title_changed updates the view title', () => {
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_title_changed', chatId: 'c1', title: 'New Title' },
    );
    expect(s.chats.c1.title).toBe('New Title');
  });

  it('chat_last_message_removed pops the last message', () => {
    const a = { role: 'user' as const, content: 'q', createdAt: 't1' };
    const b = { role: 'assistant' as const, content: 'ans', createdAt: 't2' };
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_user_message', chatId: 'c1', message: a },
      { type: 'chat_user_message', chatId: 'c1', message: b },
    );
    expect(s.chats.c1.messages).toHaveLength(2);
    s = apply(s, { type: 'chat_last_message_removed', chatId: 'c1' });
    expect(s.chats.c1.messages).toEqual([a]);
  });

  it('ignores messages for unknown chats and unrelated types', () => {
    const s0 = emptyChatState();
    const s = apply(s0, { type: 'chat_stream_delta', chatId: 'ghost', delta: 'x' });
    expect(s).toEqual(s0);
  });

  it('chat_connected adds an edge, chat_disconnected removes it', () => {
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('a') },
      { type: 'chat_created', chat: chat('b') },
      { type: 'chat_connected', edge: { from: 'a', to: 'b', enabled: true, priority: 0 } },
    );
    expect(s.edges).toEqual([{ from: 'a', to: 'b', enabled: true, priority: 0 }]);
    s = apply(s, { type: 'chat_disconnected', from: 'a', to: 'b' });
    expect(s.edges).toEqual([]);
  });

  it('chat_connected is idempotent per edge', () => {
    const edge = { from: 'a', to: 'b', enabled: true, priority: 0 };
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('a') },
      { type: 'chat_created', chat: chat('b') },
      { type: 'chat_connected', edge },
      { type: 'chat_connected', edge },
    );
    expect(s.edges).toHaveLength(1);
  });

  it('chat_snapshot replaces the whole state from a graph', () => {
    // pre-existing local state should be discarded
    let s = apply(emptyChatState(), { type: 'chat_created', chat: chat('old') });
    const graph = {
      id: 'g1',
      version: 2 as const, docs: {}, rootCanvas: { placements: [], edges: [] }, compactions: {},
      meta: { title: 'T', created: 't0' },
      chats: {
        a: { ...chat('a'), messages: [{ role: 'user' as const, content: 'hi', createdAt: 't1' }] },
        b: chat('b'),
      },
      edges: [{ from: 'a', to: 'b', enabled: true, priority: 0 }],
    };
    s = apply(s, { type: 'chat_snapshot', graph });
    expect(Object.keys(s.chats).sort()).toEqual(['a', 'b']);
    expect(s.chats.old).toBeUndefined();
    expect(s.chats.a.messages).toHaveLength(1);
    expect(s.chats.a.streamingText).toBeNull();
    expect(s.edges).toEqual(graph.edges);
  });

  it('does not mutate previous state', () => {
    const s0 = apply(emptyChatState(), { type: 'chat_created', chat: chat('c1') });
    const s1 = apply(s0, {
      type: 'chat_user_message',
      chatId: 'c1',
      message: { role: 'user', content: 'hi', createdAt: 't1' },
    });
    expect(s0.chats.c1.messages).toHaveLength(0);
    expect(s1.chats.c1.messages).toHaveLength(1);
  });
});

describe('applyChatMessage — agent features', () => {
  it('chat_settings_changed stores the settings on the view', () => {
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_settings_changed', chatId: 'c1', settings: { engine: 'agent', model: 'claude-opus-4-8' } },
    );
    expect(s.chats.c1.settings).toEqual({ engine: 'agent', model: 'claude-opus-4-8' });
  });

  it('chat_usage_updated stores usage and contextChats on the view', () => {
    const usage = {
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadInputTokens: 900,
      cacheCreationInputTokens: 100,
      costUSD: 0.042,
      turns: 1,
    };
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_usage_updated', chatId: 'c1', usage, contextChats: 2 },
    );
    expect(s.chats.c1.usage).toEqual(usage);
    expect(s.chats.c1.contextChats).toBe(2);
  });

  it('chat_snapshot carries per-chat usage', () => {
    const usage = {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 0.001,
      turns: 3,
    };
    const node = { ...chat('c1'), usage };
    const graph = {
      id: 'g', version: 2 as const, docs: {}, rootCanvas: { placements: [], edges: [] }, compactions: {},
      meta: { title: 't', created: 't0' },
      chats: { c1: node }, edges: [],
    };
    const s = apply(emptyChatState(), { type: 'chat_snapshot', graph });
    expect(s.chats.c1.usage).toEqual(usage);
  });

  it('chat_snapshot carries per-chat settings', () => {
    const node = { ...chat('c1'), settings: { engine: 'agent' as const } };
    const graph = {
      id: 'g', version: 2 as const, docs: {}, rootCanvas: { placements: [], edges: [] }, compactions: {},
      meta: { title: 't', created: 't0' },
      chats: { c1: node }, edges: [],
    };
    const s = apply(emptyChatState(), { type: 'chat_snapshot', graph });
    expect(s.chats.c1.settings).toEqual({ engine: 'agent' });
  });

  it('chat_capabilities is stored on the state', () => {
    const s = apply(emptyChatState(), {
      type: 'chat_capabilities',
      models: [{ id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' }],
      commands: [{ name: 'review', description: 'review a PR' }],
    });
    expect(s.capabilities).toEqual({
      models: [{ id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' }],
      commands: [{ name: 'review', description: 'review a PR' }],
    });
  });

  it('chat_permission_requested / _resolved toggle pendingPermission', () => {
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_permission_requested', chatId: 'c1', requestId: 'r1', toolName: 'Bash', input: { cmd: 'ls' } },
    );
    expect(s.chats.c1.pendingPermission).toEqual({ requestId: 'r1', toolName: 'Bash', input: { cmd: 'ls' } });
    s = apply(s, { type: 'chat_permission_resolved', chatId: 'c1', requestId: 'r1' });
    expect(s.chats.c1.pendingPermission).toBeNull();
  });

  it('chat_permission_resolved for a stale requestId leaves the current prompt', () => {
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_permission_requested', chatId: 'c1', requestId: 'r2', toolName: 'Bash', input: {} },
    );
    s = apply(s, { type: 'chat_permission_resolved', chatId: 'c1', requestId: 'r1-old' });
    expect(s.chats.c1.pendingPermission?.requestId).toBe('r2');
  });

  it('queues concurrent permission requests; resolving the first surfaces the next', () => {
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_permission_requested', chatId: 'c1', requestId: 'r1', toolName: 'Bash', input: {} },
      { type: 'chat_permission_requested', chatId: 'c1', requestId: 'r2', toolName: 'Read', input: {} },
    );
    expect(s.chats.c1.pendingPermission?.requestId).toBe('r1');
    s = apply(s, { type: 'chat_permission_resolved', chatId: 'c1', requestId: 'r1' });
    expect(s.chats.c1.pendingPermission?.requestId).toBe('r2');
    s = apply(s, { type: 'chat_permission_resolved', chatId: 'c1', requestId: 'r2' });
    expect(s.chats.c1.pendingPermission).toBeNull();
  });

  it('chat_snapshot preserves an in-flight permission prompt', () => {
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_permission_requested', chatId: 'c1', requestId: 'r1', toolName: 'Bash', input: {} },
    );
    const graph = {
      id: 'g', version: 2 as const, docs: {}, rootCanvas: { placements: [], edges: [] }, compactions: {},
      meta: { title: 't', created: 't0' },
      chats: { c1: chat('c1') }, edges: [],
    };
    s = apply(s, { type: 'chat_snapshot', graph });
    expect(s.chats.c1.pendingPermission?.requestId).toBe('r1');
  });

  it('chat_tool_message appends a tool message to the transcript', () => {
    const toolMsg = {
      role: 'tool' as const,
      content: '→ Read',
      createdAt: 't1',
      toolUseId: 'tu1',
      toolName: 'Read',
      toolInput: { path: '/x' },
    };
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_tool_message', chatId: 'c1', message: toolMsg },
    );
    expect(s.chats.c1.messages).toEqual([toolMsg]);
  });
});

describe('applyChatMessage — compactions', () => {
  const compaction = (id: string, memberIds: string[]) => ({
    id,
    title: 'Doc',
    memberIds,
    document: '',
    sourceDigest: '',
    position: { x: 0, y: 0 },
    createdAt: 't0',
    status: 'generating' as const,
  });

  it('starts empty and chat_compaction_created adds one', () => {
    expect(emptyChatState().compactions).toEqual({});
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_compaction_created', compaction: compaction('k1', ['c1']) },
    );
    expect(s.compactions.k1).toMatchObject({ id: 'k1', memberIds: ['c1'], status: 'generating' });
  });

  it('chat_compaction_document patches document, digest and status', () => {
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_compaction_created', compaction: compaction('k1', ['c1']) },
      {
        type: 'chat_compaction_document',
        compactionId: 'k1',
        document: '# Doc',
        sourceDigest: 'd1',
        status: 'idle',
      },
    );
    expect(s.compactions.k1).toMatchObject({ document: '# Doc', sourceDigest: 'd1', status: 'idle' });
  });

  it('chat_compaction_document for an unknown compaction is a no-op', () => {
    const before = apply(emptyChatState(), { type: 'chat_created', chat: chat('c1') });
    const after = apply(before, {
      type: 'chat_compaction_document',
      compactionId: 'nope',
      document: 'x',
      sourceDigest: 'd',
      status: 'idle',
    });
    expect(after).toBe(before);
  });

  it('chat_snapshot carries compactions', () => {
    const graph = {
      id: 'g', version: 2 as const, docs: {}, rootCanvas: { placements: [], edges: [] }, compactions: { k1: compaction('k1', ['c1']) },
      meta: { title: 't', created: 't0' },
      chats: { c1: chat('c1') }, edges: [],
    };
    const s = apply(emptyChatState(), { type: 'chat_snapshot', graph });
    expect(s.compactions.k1).toBeDefined();
  });

  it('compactionIsStale compares the stored digest against member transcripts', () => {
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_compaction_created', compaction: compaction('k1', ['c1']) },
    );
    const digest = compactionDigest([s.chats.c1]);
    s = apply(s, {
      type: 'chat_compaction_document',
      compactionId: 'k1',
      document: 'doc',
      sourceDigest: digest,
      status: 'idle',
    });
    expect(compactionIsStale(s, 'k1')).toBe(false);
    s = apply(s, {
      type: 'chat_user_message',
      chatId: 'c1',
      message: { role: 'user', content: 'changed', createdAt: 't1' },
    });
    expect(compactionIsStale(s, 'k1')).toBe(true);
  });
});

const mkDoc = (id: string, over: Partial<Doc> = {}): Doc => ({
  id,
  title: id,
  body: '',
  canvas: { placements: [], edges: [] },
  ...over,
});

describe('doc state: snapshot', () => {
  it('starts empty', () => {
    const s = emptyChatState();
    expect(s.docs).toEqual({});
    expect(s.rootCanvas).toEqual({ placements: [], edges: [] });
    expect(s.docChats).toEqual({});
    expect(s.pendingLayout).toEqual([]);
  });

  it('chat_snapshot loads docs, rootCanvas and derives docChats', () => {
    const graph = {
      ...createChatGraph('t'),
      chats: { c1: { ...chat('c1'), docId: 'd1' }, c2: chat('c2') },
      docs: { d1: mkDoc('d1') },
      rootCanvas: { placements: [{ kind: 'doc' as const, id: 'd1', position: { x: 1, y: 2 } }], edges: [] },
    };
    const s = apply(emptyChatState(), { type: 'chat_snapshot', graph });
    expect(s.docs.d1.id).toBe('d1');
    expect(s.rootCanvas.placements).toHaveLength(1);
    expect(s.docChats).toEqual({ d1: 'c1' });
  });

  it('chat_snapshot from an old server defaults docs and rootCanvas', () => {
    const { docs: _d, rootCanvas: _r, ...old } = createChatGraph('t');
    const s = apply(emptyChatState(), { type: 'chat_snapshot', graph: old as any });
    expect(s.docs).toEqual({});
    expect(s.rootCanvas).toEqual({ placements: [], edges: [] });
  });
});

describe('doc state: docs and doc-chats', () => {
  it('doc_created adds to the table', () => {
    const s = apply(emptyChatState(), { type: 'doc_created', doc: mkDoc('d1') });
    expect(s.docs.d1.title).toBe('d1');
  });

  it('doc_updated patches title, body and generated; ignores unknown ids', () => {
    let s = apply(emptyChatState(), { type: 'doc_created', doc: mkDoc('d1') });
    s = apply(
      s,
      { type: 'doc_updated', docId: 'd1', title: 'T', body: 'B' },
      { type: 'doc_updated', docId: 'd1', generated: { sourceDigest: 'x', status: 'idle' } },
    );
    expect(s.docs.d1).toMatchObject({ title: 'T', body: 'B', generated: { sourceDigest: 'x', status: 'idle' } });
    const after = apply(s, { type: 'doc_updated', docId: 'nope', body: 'z' });
    expect(after.docs).toEqual(s.docs);
  });

  it('doc_chat_ready records the doc-chat', () => {
    const s = apply(emptyChatState(), { type: 'doc_chat_ready', docId: 'd1', chatId: 'c1' });
    expect(s.docChats).toEqual({ d1: 'c1' });
  });
});

describe('doc state: placements', () => {
  const pos = (x: number, y: number) => ({ x, y });
  const base = () =>
    apply(emptyChatState(), { type: 'doc_created', doc: mkDoc('d1') }, { type: 'doc_created', doc: mkDoc('d2') });

  it('doc_placed adds a placement to root and to a doc canvas', () => {
    const s = apply(
      base(),
      { type: 'doc_placed', canvasId: 'root', placement: { kind: 'doc', id: 'd1', position: pos(1, 1) } },
      { type: 'doc_placed', canvasId: 'd1', placement: { kind: 'doc', id: 'd2', position: pos(2, 2) } },
    );
    expect(s.rootCanvas.placements).toEqual([{ kind: 'doc', id: 'd1', position: pos(1, 1) }]);
    expect(s.docs.d1.canvas.placements).toEqual([{ kind: 'doc', id: 'd2', position: pos(2, 2) }]);
  });

  it('doc_moved updates a position; doc_unplaced removes it', () => {
    let s = apply(base(), {
      type: 'doc_placed',
      canvasId: 'root',
      placement: { kind: 'doc', id: 'd1', position: pos(1, 1) },
    });
    s = apply(s, { type: 'doc_moved', canvasId: 'root', kind: 'doc', id: 'd1', position: pos(9, 9) });
    expect(s.rootCanvas.placements[0].position).toEqual(pos(9, 9));
    s = apply(s, { type: 'doc_unplaced', canvasId: 'root', kind: 'doc', id: 'd1' });
    expect(s.rootCanvas.placements).toEqual([]);
  });

  it('unknown canvases and ids are ignored without throwing', () => {
    const s = base();
    const out = apply(
      s,
      { type: 'doc_placed', canvasId: 'nope', placement: { kind: 'doc', id: 'd1', position: pos(0, 0) } },
      { type: 'doc_moved', canvasId: 'nope', kind: 'doc', id: 'd1', position: pos(0, 0) },
      { type: 'doc_unplaced', canvasId: 'nope', kind: 'doc', id: 'd1' },
      { type: 'doc_moved', canvasId: 'root', kind: 'doc', id: 'zzz', position: pos(0, 0) },
    );
    expect(out.rootCanvas).toEqual(s.rootCanvas);
    expect(out.docs).toEqual(s.docs);
  });
});

describe('doc state: doc_linked', () => {
  const pos = { x: 0, y: 0 };
  const place = (canvasId: string, id: string): ChatServerMessage => ({
    type: 'doc_placed',
    canvasId,
    placement: { kind: 'doc', id, position: pos },
  });
  const setup = (...extra: ChatServerMessage[]) =>
    apply(
      emptyChatState(),
      { type: 'doc_created', doc: mkDoc('c') },
      { type: 'doc_created', doc: mkDoc('a') },
      { type: 'doc_created', doc: mkDoc('b') },
      { type: 'doc_created', doc: mkDoc('x') },
      place('c', 'a'),
      place('c', 'b'),
      ...extra,
    );

  it('swaps the placement, re-points edges, and deletes the empty orphan replaced doc', () => {
    let s = setup();
    s = { ...s, docs: { ...s.docs, c: { ...s.docs.c, canvas: { ...s.docs.c.canvas, edges: [{ from: 'a', to: 'b' }] } } } };
    s = apply(s, { type: 'doc_linked', canvasId: 'c', placedDocId: 'b', existingDocId: 'x' });
    expect(s.docs.c.canvas.placements.map((p) => p.id)).toEqual(['a', 'x']);
    expect(s.docs.c.canvas.edges).toEqual([{ from: 'a', to: 'x' }]);
    expect(s.docs.b).toBeUndefined();
  });

  it('keeps the replaced doc when it has a body', () => {
    let s = setup({ type: 'doc_updated', docId: 'b', body: 'text' });
    s = apply(s, { type: 'doc_linked', canvasId: 'c', placedDocId: 'b', existingDocId: 'x' });
    expect(s.docs.b).toBeDefined();
  });

  it('keeps the replaced doc when it is still placed elsewhere', () => {
    let s = setup(place('root', 'b'));
    s = apply(s, { type: 'doc_linked', canvasId: 'c', placedDocId: 'b', existingDocId: 'x' });
    expect(s.docs.b).toBeDefined();
  });

  it('keeps the replaced doc when it has a doc-chat', () => {
    let s = setup({ type: 'doc_chat_ready', docId: 'b', chatId: 'k' });
    s = apply(s, { type: 'doc_linked', canvasId: 'c', placedDocId: 'b', existingDocId: 'x' });
    expect(s.docs.b).toBeDefined();
  });

  it('keeps the replaced doc when its own canvas has content', () => {
    let s = setup(place('b', 'x'));
    s = apply(s, { type: 'doc_linked', canvasId: 'c', placedDocId: 'b', existingDocId: 'x' });
    expect(s.docs.b).toBeDefined();
  });

  it('ignores an invalid link without throwing', () => {
    const s = setup();
    const out = apply(s, { type: 'doc_linked', canvasId: 'c', placedDocId: 'b', existingDocId: 'nope' });
    expect(out.docs).toEqual(s.docs);
    expect(apply(s, { type: 'doc_linked', canvasId: 'zz', placedDocId: 'b', existingDocId: 'x' }).docs).toEqual(s.docs);
  });
});

describe('doc state: diagram_created and pendingLayout', () => {
  it('mirrors edges once and queues the layout; clearPendingLayout removes it', () => {
    const edges = [{ from: 'a', to: 'b' }];
    let s = apply(
      emptyChatState(),
      { type: 'doc_created', doc: mkDoc('a') },
      { type: 'doc_created', doc: mkDoc('b') },
      { type: 'diagram_created', canvasId: 'root', docIds: ['a', 'b'], edges },
      { type: 'diagram_created', canvasId: 'a', docIds: ['b'], edges: [] },
    );
    const queued = s.pendingLayout.length;
    expect(queued).toBe(2);
    expect(s.pendingLayout).toEqual([
      { canvasId: 'root', docIds: ['a', 'b'], edges },
      { canvasId: 'a', docIds: ['b'], edges: [] },
    ]);
    // The server added the edges to its canvas; mirror them once (no duplicates).
    expect(s.rootCanvas.edges).toEqual(edges);
    s = apply(s, { type: 'diagram_created', canvasId: 'root', docIds: ['a', 'b'], edges });
    expect(s.rootCanvas.edges).toEqual(edges);
    s = clearPendingLayout(s, 'root');
    expect(s.pendingLayout.map((p) => p.canvasId)).toEqual(['a']);
  });
});

describe('doc selectors', () => {
  const pos = { x: 0, y: 0 };
  const state = apply(
    emptyChatState(),
    { type: 'chat_created', chat: chat('c1') },
    { type: 'chat_created', chat: chat('c2') },
    { type: 'chat_created', chat: chat('c3') },
    { type: 'chat_created', chat: { ...chat('dc'), docId: 'd1' } },
    { type: 'doc_created', doc: mkDoc('d1') },
    { type: 'doc_created', doc: mkDoc('d2') },
    { type: 'doc_placed', canvasId: 'root', placement: { kind: 'doc', id: 'd1', position: pos } },
    { type: 'doc_placed', canvasId: 'd2', placement: { kind: 'doc', id: 'd1', position: pos } },
    { type: 'doc_placed', canvasId: 'd1', placement: { kind: 'chat', id: 'c1', position: pos } },
    { type: 'doc_placed', canvasId: 'd1', placement: { kind: 'doc', id: 'd2', position: pos } },
  );

  it('canvasById resolves root, a doc canvas, or undefined', () => {
    expect(canvasById(state, 'root')).toBe(state.rootCanvas);
    expect(canvasById(state, 'd1')).toBe(state.docs.d1.canvas);
    expect(canvasById(state, 'nope')).toBeUndefined();
  });

  it('placementsOn lists a canvas placements (empty for unknown)', () => {
    expect(placementsOn(state, 'd1').map((p) => `${p.kind}:${p.id}`)).toEqual(['chat:c1', 'doc:d2']);
    expect(placementsOn(state, 'nope')).toEqual([]);
  });

  it('canvasesPlacing lists every canvas that places the doc', () => {
    expect(canvasesPlacing(state, 'd1').sort()).toEqual(['d2', 'root']);
    expect(canvasesPlacing(state, 'zzz')).toEqual([]);
  });

  it('rootChatIds excludes chats on doc canvases and doc-chats', () => {
    expect(rootChatIds(state).sort()).toEqual(['c2', 'c3']);
  });

  it('chatIdsOn: root -> rootChatIds, doc canvas -> its chat placements', () => {
    expect(chatIdsOn(state, 'root').sort()).toEqual(['c2', 'c3']);
    expect(chatIdsOn(state, 'd1')).toEqual(['c1']);
    expect(chatIdsOn(state, 'nope')).toEqual([]);
  });
});
