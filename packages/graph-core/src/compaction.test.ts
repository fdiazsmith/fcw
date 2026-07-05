import { describe, it, expect } from 'vitest';
import { createChatGraph, addChat, appendMessage } from './chat-graph.js';
import {
  addCompaction,
  compactionDigest,
  isCompactionStale,
  setCompactionDocument,
  completeCompactionGeneration,
  setCompactionStatus,
  setCompactionPosition,
} from './compaction.js';

function graphWithChats(n: number) {
  const g = createChatGraph('T');
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = addChat(g, { position: { x: i * 100, y: i * 50 } });
    appendMessage(g, id, 'user', `question ${i}`);
    appendMessage(g, id, 'assistant', `answer ${i}`);
    ids.push(id);
  }
  return { g, ids };
}

describe('addCompaction', () => {
  it('creates a compaction over member chats, centered at their centroid', () => {
    const { g, ids } = graphWithChats(3);
    const id = addCompaction(g, ids);
    const c = g.compactions[id];
    expect(c).toBeDefined();
    expect(c.memberIds).toEqual(ids);
    expect(c.document).toBe('');
    expect(c.status).toBe('generating');
    expect(c.sourceDigest).toBe('');
    expect(c.createdAt).toBeTruthy();
    // centroid of (0,0), (100,50), (200,100)
    expect(c.position).toEqual({ x: 100, y: 50 });
  });

  it('accepts an explicit title and position', () => {
    const { g, ids } = graphWithChats(1);
    const id = addCompaction(g, ids, { title: 'Research', position: { x: 5, y: 6 } });
    expect(g.compactions[id].title).toBe('Research');
    expect(g.compactions[id].position).toEqual({ x: 5, y: 6 });
  });

  it('defaults the title to the first member chat title', () => {
    const { g, ids } = graphWithChats(2);
    g.chats[ids[0]].title = 'Auth flow';
    const id = addCompaction(g, ids);
    expect(g.compactions[id].title).toBe('Auth flow');
  });

  it('throws for an empty member list', () => {
    const { g } = graphWithChats(1);
    expect(() => addCompaction(g, [])).toThrow(/at least one/i);
  });

  it('throws for an unknown member chat', () => {
    const { g, ids } = graphWithChats(1);
    expect(() => addCompaction(g, [...ids, 'nope'])).toThrow(/unknown chat: nope/);
  });

  it('throws when a chat is already a member of another compaction', () => {
    const { g, ids } = graphWithChats(2);
    addCompaction(g, [ids[0]]);
    expect(() => addCompaction(g, [ids[0], ids[1]])).toThrow(/already compacted/);
  });

  it('generates unique compaction ids', () => {
    const { g, ids } = graphWithChats(2);
    expect(addCompaction(g, [ids[0]])).not.toBe(addCompaction(g, [ids[1]]));
  });
});

describe('compactionDigest', () => {
  it('is deterministic and independent of member order', () => {
    const { g, ids } = graphWithChats(2);
    const members = ids.map((id) => g.chats[id]);
    const a = compactionDigest(members);
    const b = compactionDigest([...members].reverse());
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });

  it('changes when a member gains a message', () => {
    const { g, ids } = graphWithChats(2);
    const before = compactionDigest(ids.map((id) => g.chats[id]));
    appendMessage(g, ids[1], 'user', 'follow-up');
    const after = compactionDigest(ids.map((id) => g.chats[id]));
    expect(after).not.toBe(before);
  });

  it('changes when message content changes', () => {
    const { g, ids } = graphWithChats(1);
    const before = compactionDigest(ids.map((id) => g.chats[id]));
    g.chats[ids[0]].messages[0].content = 'edited';
    const after = compactionDigest(ids.map((id) => g.chats[id]));
    expect(after).not.toBe(before);
  });
});

describe('generation lifecycle + staleness', () => {
  it('completeCompactionGeneration stores document, digest and idles the node', () => {
    const { g, ids } = graphWithChats(2);
    const id = addCompaction(g, ids);
    const digest = compactionDigest(ids.map((i) => g.chats[i]));
    completeCompactionGeneration(g, id, '# Doc', digest);
    const c = g.compactions[id];
    expect(c.document).toBe('# Doc');
    expect(c.sourceDigest).toBe(digest);
    expect(c.status).toBe('idle');
    expect(isCompactionStale(g, id)).toBe(false);
  });

  it('becomes stale when a member transcript changes after generation', () => {
    const { g, ids } = graphWithChats(2);
    const id = addCompaction(g, ids);
    completeCompactionGeneration(g, id, 'doc', compactionDigest(ids.map((i) => g.chats[i])));
    appendMessage(g, ids[0], 'user', 'new message inside');
    expect(isCompactionStale(g, id)).toBe(true);
  });

  it('setCompactionDocument edits the document without touching the digest', () => {
    const { g, ids } = graphWithChats(1);
    const id = addCompaction(g, ids);
    const digest = compactionDigest(ids.map((i) => g.chats[i]));
    completeCompactionGeneration(g, id, 'original', digest);
    setCompactionDocument(g, id, 'user-edited');
    expect(g.compactions[id].document).toBe('user-edited');
    expect(g.compactions[id].sourceDigest).toBe(digest);
    expect(isCompactionStale(g, id)).toBe(false);
  });

  it('setCompactionStatus flips back to generating for a regenerate', () => {
    const { g, ids } = graphWithChats(1);
    const id = addCompaction(g, ids);
    completeCompactionGeneration(g, id, 'doc', 'd1');
    setCompactionStatus(g, id, 'generating');
    expect(g.compactions[id].status).toBe('generating');
  });

  it('setCompactionPosition moves the compaction', () => {
    const { g, ids } = graphWithChats(1);
    const id = addCompaction(g, ids);
    setCompactionPosition(g, id, { x: 9, y: 8 });
    expect(g.compactions[id].position).toEqual({ x: 9, y: 8 });
  });

  it('helpers throw for an unknown compaction id', () => {
    const { g } = graphWithChats(1);
    expect(() => isCompactionStale(g, 'nope')).toThrow(/unknown compaction/);
    expect(() => setCompactionDocument(g, 'nope', 'x')).toThrow(/unknown compaction/);
    expect(() => completeCompactionGeneration(g, 'nope', 'x', 'd')).toThrow(/unknown compaction/);
    expect(() => setCompactionStatus(g, 'nope', 'idle')).toThrow(/unknown compaction/);
    expect(() => setCompactionPosition(g, 'nope', { x: 0, y: 0 })).toThrow(/unknown compaction/);
  });
});
