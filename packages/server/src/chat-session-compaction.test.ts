import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ChatServerMessage } from '@fcw/graph-core';
import { compactionDigest, isCompactionStale } from '@fcw/graph-core';
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

describe('ChatSessionManager.compact', () => {
  afterEach(() => vi.useRealTimers());

  it('creates the compaction, then emits the generated document', async () => {
    const { sessions, a, b } = withChats(async () => '# Synthesized');
    const events = collect(sessions);
    const id = await sessions.compact([a, b]);

    const compaction = sessions.graph.compactions[id];
    expect(compaction.memberIds).toEqual([a, b]);
    expect(compaction.document).toBe('# Synthesized');
    expect(compaction.status).toBe('idle');
    expect(isCompactionStale(sessions.graph, id)).toBe(false);

    expect(events[0]).toMatchObject({ type: 'chat_compaction_created' });
    expect((events[0] as unknown as { compaction: { status: string } }).compaction.status).toBe(
      'generating',
    );
    expect(events[1]).toMatchObject({
      type: 'chat_compaction_document',
      compactionId: id,
      document: '# Synthesized',
      status: 'idle',
    });
  });

  it('defaults to a structural document when no generator is wired', async () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    sessions.graph.chats[a].messages.push({ role: 'user', content: 'the question', createdAt: 't' });
    const id = await sessions.compact([a]);
    expect(sessions.graph.compactions[id].document).toContain('the question');
  });

  it('becomes stale when a member gains messages after compaction', async () => {
    const { sessions, a } = withChats(async () => 'doc');
    const id = await sessions.compact([a]);
    expect(isCompactionStale(sessions.graph, id)).toBe(false);
    sessions.graph.chats[a].messages.push({ role: 'user', content: 'new', createdAt: 't' });
    expect(isCompactionStale(sessions.graph, id)).toBe(true);
  });

  it('rejects unknown chats and double-compaction', async () => {
    const { sessions, a } = withChats(async () => 'doc');
    await expect(sessions.compact(['nope'])).rejects.toThrow(/unknown chat/);
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

describe('ChatSessionManager.regenerateCompaction', () => {
  it('re-runs generation and clears staleness', async () => {
    let call = 0;
    const { sessions, a } = withChats(async () => `doc v${++call}`);
    const id = await sessions.compact([a]);
    sessions.graph.chats[a].messages.push({ role: 'user', content: 'later', createdAt: 't' });
    expect(isCompactionStale(sessions.graph, id)).toBe(true);

    const events = collect(sessions);
    await sessions.regenerateCompaction(id);

    expect(sessions.graph.compactions[id].document).toBe('doc v2');
    expect(isCompactionStale(sessions.graph, id)).toBe(false);
    // First a generating status broadcast, then the finished document.
    expect(events[0]).toMatchObject({ type: 'chat_compaction_document', status: 'generating' });
    expect(events[1]).toMatchObject({
      type: 'chat_compaction_document',
      document: 'doc v2',
      status: 'idle',
    });
  });

  it('throws for an unknown compaction', async () => {
    const { sessions } = withChats(async () => 'doc');
    await expect(sessions.regenerateCompaction('nope')).rejects.toThrow(/unknown compaction/);
  });
});

describe('ChatSessionManager.updateCompactionDocument', () => {
  it('persists the user edit and broadcasts it without touching the digest', async () => {
    const { sessions, a } = withChats(async () => 'generated');
    const id = await sessions.compact([a]);
    const digestBefore = sessions.graph.compactions[id].sourceDigest;

    const events = collect(sessions);
    sessions.updateCompactionDocument(id, 'hand-edited');

    expect(sessions.graph.compactions[id].document).toBe('hand-edited');
    expect(sessions.graph.compactions[id].sourceDigest).toBe(digestBefore);
    expect(events).toEqual([
      {
        type: 'chat_compaction_document',
        compactionId: id,
        document: 'hand-edited',
        sourceDigest: digestBefore,
        status: 'idle',
      },
    ]);
  });
});

describe('ChatSessionManager.moveCompaction', () => {
  afterEach(() => vi.useRealTimers());

  it('updates the position and schedules a save', async () => {
    vi.useFakeTimers();
    const saves: string[] = [];
    const { sessions, a } = withChats(async () => 'doc');
    const id = await sessions.compact([a]);
    sessions.setSaveHandler(async (graph) => { saves.push(graph.id); });
    sessions.moveCompaction(id, { x: 42, y: 24 });
    expect(sessions.graph.compactions[id].position).toEqual({ x: 42, y: 24 });
    await vi.advanceTimersByTimeAsync(600);
    expect(saves).toHaveLength(1);
  });
});

describe('compaction digest parity', () => {
  it('the stored digest matches compactionDigest over the members', async () => {
    const { sessions, a, b } = withChats(async () => 'doc');
    const id = await sessions.compact([a, b]);
    const expected = compactionDigest([sessions.graph.chats[a], sessions.graph.chats[b]]);
    expect(sessions.graph.compactions[id].sourceDigest).toBe(expected);
  });
});
