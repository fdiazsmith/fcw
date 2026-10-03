// M2.3: compaction is a generated doc. compact / regenerate / edit / move run
// on doc ops and emit doc_* messages (never chat_compaction_*).
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ChatServerMessage } from '@fcw/graph-core';
import { compactionDigest, docIsStale, ROOT_CANVAS_ID } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

function collect(sessions: ChatSessionManager): ChatServerMessage[] {
  const events: ChatServerMessage[] = [];
  sessions.on('message', (msg: ChatServerMessage) => events.push(msg));
  return events;
}

/** Manager with two chats that each hold one exchange. */
function withChats(generate?: (members: { id: string }[]) => Promise<string>) {
  const sessions = new ChatSessionManager('T', {}, undefined, undefined, generate);
  const a = sessions.createChat({ x: 0, y: 0 });
  const b = sessions.createChat({ x: 100, y: 100 });
  sessions.graph.chats[a].messages.push(
    { role: 'user', content: 'q1', createdAt: 't' },
    { role: 'assistant', content: 'a1', createdAt: 't' },
  );
  sessions.graph.chats[b].messages.push({ role: 'user', content: 'q2', createdAt: 't' });
  return { sessions, a, b };
}

const stale = (sessions: ChatSessionManager, id: string): boolean => {
  const doc = sessions.graph.docs[id];
  const members = doc.canvas.placements
    .filter((p) => p.kind === 'chat')
    .map((p) => sessions.graph.chats[p.id]);
  return docIsStale(doc, members);
};

describe('ChatSessionManager.compact', () => {
  afterEach(() => vi.useRealTimers());

  it('creates a generated doc on root, then emits the generated body', async () => {
    const { sessions, a, b } = withChats(async () => '# Synthesized');
    const events = collect(sessions);
    const id = await sessions.compact([a, b]);

    const doc = sessions.graph.docs[id];
    expect(doc.canvas.placements.map((p) => [p.kind, p.id])).toEqual([['chat', a], ['chat', b]]);
    expect(doc.body).toBe('# Synthesized');
    expect(doc.generated?.status).toBe('idle');
    expect(stale(sessions, id)).toBe(false);
    expect(sessions.graph.rootCanvas.placements).toEqual([{ kind: 'doc', id, position: { x: 50, y: 50 } }]);
    expect(sessions.graph.compactions).toEqual({});

    expect(events.map((e) => e.type)).toEqual(['doc_created', 'doc_placed', 'doc_updated']);
    expect(events[0]).toMatchObject({ type: 'doc_created', doc: { id, body: '', generated: { status: 'generating' } } });
    expect(events[1]).toEqual({
      type: 'doc_placed',
      canvasId: ROOT_CANVAS_ID,
      placement: { kind: 'doc', id, position: { x: 50, y: 50 } },
    });
    expect(events[2]).toEqual({
      type: 'doc_updated',
      docId: id,
      body: '# Synthesized',
      generated: { sourceDigest: doc.generated!.sourceDigest, status: 'idle' },
    });
  });

  it('compacts chats on a doc canvas into a doc placed on that canvas', async () => {
    const { sessions, a, b } = withChats(async () => 'doc');
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', { x: 0, y: 0 });
    sessions.placeOnCanvas(host, 'chat', a, { x: 10, y: 10 });
    sessions.placeOnCanvas(host, 'chat', b, { x: 30, y: 30 });
    const events = collect(sessions);
    const id = await sessions.compact([a, b], host);

    expect(sessions.graph.docs[host].canvas.placements).toEqual([
      { kind: 'doc', id, position: { x: 20, y: 20 } },
    ]);
    expect(events.map((e) => e.type)).toEqual([
      'doc_created',
      'doc_unplaced',
      'doc_unplaced',
      'doc_placed',
      'doc_updated',
    ]);
    expect(events[1]).toEqual({ type: 'doc_unplaced', canvasId: host, kind: 'chat', id: a });
    expect(events[3]).toMatchObject({ type: 'doc_placed', canvasId: host });
  });

  it('defaults to a structural body when no generator is wired', async () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    sessions.graph.chats[a].messages.push({ role: 'user', content: 'the question', createdAt: 't' });
    const id = await sessions.compact([a]);
    expect(sessions.graph.docs[id].body).toContain('the question');
  });

  it('falls back to the structural body when the generator throws', async () => {
    const { sessions, a } = withChats(async () => { throw new Error('boom'); });
    const id = await sessions.compact([a]);
    expect(sessions.graph.docs[id].body).toContain('q1');
  });

  it('becomes stale when a member gains messages after compaction', async () => {
    const { sessions, a } = withChats(async () => 'doc');
    const id = await sessions.compact([a]);
    expect(stale(sessions, id)).toBe(false);
    sessions.graph.chats[a].messages.push({ role: 'user', content: 'new', createdAt: 't' });
    expect(stale(sessions, id)).toBe(true);
  });

  it('rejects unknown chats, unknown canvases and double-compaction', async () => {
    const { sessions, a } = withChats(async () => 'doc');
    await expect(sessions.compact(['nope'])).rejects.toThrow(/unknown chat/);
    await expect(sessions.compact([a], 'nope')).rejects.toThrow(/unknown canvas/);
    await sessions.compact([a]);
    await expect(sessions.compact([a])).rejects.toThrow(/already compacted/);
  });

  it('schedules a save', async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const { sessions, a } = withChats(async () => 'doc');
    sessions.setSaveHandler(async (graph) => { saves.push(graph.id); });
    await sessions.compact([a]);
    await vi.advanceTimersByTimeAsync(600);
    expect(saves.length).toBeGreaterThan(0);
  });
});

describe('ChatSessionManager.regenerateDoc', () => {
  it('re-runs generation and clears staleness', async () => {
    let call = 0;
    const { sessions, a } = withChats(async () => `doc v${++call}`);
    const id = await sessions.compact([a]);
    sessions.graph.chats[a].messages.push({ role: 'user', content: 'later', createdAt: 't' });
    expect(stale(sessions, id)).toBe(true);

    const events = collect(sessions);
    await sessions.regenerateDoc(id);

    expect(sessions.graph.docs[id].body).toBe('doc v2');
    expect(stale(sessions, id)).toBe(false);
    // First a generating status broadcast, then the finished body.
    expect(events[0]).toEqual({
      type: 'doc_updated',
      docId: id,
      generated: { sourceDigest: expect.any(String), status: 'generating' },
    });
    expect(events[1]).toMatchObject({ type: 'doc_updated', body: 'doc v2', generated: { status: 'idle' } });
  });

  it('throws for an unknown doc and for a doc without a generated body', async () => {
    const { sessions } = withChats(async () => 'doc');
    await expect(sessions.regenerateDoc('nope')).rejects.toThrow(/unknown doc/);
    const plain = sessions.createDoc(ROOT_CANVAS_ID, 'Plain', { x: 0, y: 0 });
    await expect(sessions.regenerateDoc(plain)).rejects.toThrow(/not generated/);
  });
});

describe('editing a compaction doc', () => {
  it('persists the user edit and broadcasts it without touching the digest', async () => {
    const { sessions, a } = withChats(async () => 'generated');
    const id = await sessions.compact([a]);
    const generatedBefore = { ...sessions.graph.docs[id].generated };

    const events = collect(sessions);
    sessions.updateDoc(id, { body: 'hand-edited' });

    expect(sessions.graph.docs[id].body).toBe('hand-edited');
    expect(sessions.graph.docs[id].generated).toEqual(generatedBefore);
    expect(events).toEqual([{ type: 'doc_updated', docId: id, body: 'hand-edited' }]);
  });
});

describe('moving a compaction doc', () => {
  afterEach(() => vi.useRealTimers());

  it('updates the root placement, emits doc_moved and schedules a save', async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const { sessions, a } = withChats(async () => 'doc');
    const id = await sessions.compact([a]);
    sessions.setSaveHandler(async (graph) => { saves.push(graph.id); });
    const events = collect(sessions);
    sessions.moveOnCanvas(ROOT_CANVAS_ID, 'doc', id, { x: 42, y: 24 });
    expect(sessions.graph.rootCanvas.placements[0].position).toEqual({ x: 42, y: 24 });
    expect(events).toEqual([
      { type: 'doc_moved', canvasId: ROOT_CANVAS_ID, kind: 'doc', id, position: { x: 42, y: 24 } },
    ]);
    await vi.advanceTimersByTimeAsync(600);
    expect(saves).toHaveLength(1);
  });
});

describe('compaction digest parity', () => {
  it('the stored digest matches compactionDigest over the members', async () => {
    const { sessions, a, b } = withChats(async () => 'doc');
    const id = await sessions.compact([a, b]);
    const expected = compactionDigest([sessions.graph.chats[a], sessions.graph.chats[b]]);
    expect(sessions.graph.docs[id].generated?.sourceDigest).toBe(expected);
  });
});
