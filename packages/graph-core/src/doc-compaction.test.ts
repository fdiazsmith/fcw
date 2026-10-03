import { describe, it, expect } from 'vitest';
import { createChatGraph, addChat, appendMessage } from './chat-graph.js';
import { addCompaction, compactionDigest } from './compaction.js';
import { compactChats, docIsStale } from './doc-compaction.js';
import type { Doc } from './docs.js';

function graphWithChats(n: number) {
  const g = createChatGraph('T');
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = addChat(g, { title: `chat ${i}`, position: { x: i * 100, y: i * 50 } });
    appendMessage(g, id, 'user', `question ${i}`);
    appendMessage(g, id, 'assistant', `answer ${i}`);
    ids.push(id);
  }
  return { g, ids };
}

describe('compactChats', () => {
  it('creates a generating doc with an empty body, titled after the first chat', () => {
    const { g, ids } = graphWithChats(2);
    const docId = compactChats(g, ids);
    const doc = g.docs[docId];
    expect(doc.id).toBe(docId);
    expect(doc.title).toBe('chat 0');
    expect(doc.body).toBe('');
    expect(doc.generated).toEqual({ sourceDigest: '', status: 'generating' });
  });

  it('places the chats on the new doc canvas at their current positions', () => {
    const { g, ids } = graphWithChats(2);
    const docId = compactChats(g, ids);
    expect(g.docs[docId].canvas).toEqual({
      placements: [
        { kind: 'chat', id: ids[0], position: { x: 0, y: 0 } },
        { kind: 'chat', id: ids[1], position: { x: 100, y: 50 } },
      ],
      edges: [],
    });
  });

  it('places the doc on the root canvas at the chats centroid by default', () => {
    const { g, ids } = graphWithChats(3);
    const docId = compactChats(g, ids);
    expect(g.rootCanvas.placements).toEqual([
      { kind: 'doc', id: docId, position: { x: 100, y: 50 } },
    ]);
  });

  it('accepts an explicit title and position', () => {
    const { g, ids } = graphWithChats(1);
    const docId = compactChats(g, ids, { title: 'Research', position: { x: 5, y: 6 } });
    expect(g.docs[docId].title).toBe('Research');
    expect(g.rootCanvas.placements[0].position).toEqual({ x: 5, y: 6 });
  });

  it('compacts chats from a doc canvas: places the doc there and unplaces the chats', () => {
    const { g, ids } = graphWithChats(3);
    const outer = compactChats(g, ids);
    const inner = compactChats(g, [ids[0], ids[1]], { sourceCanvasDocId: outer });

    expect(g.docs[outer].canvas.placements).toEqual([
      { kind: 'chat', id: ids[2], position: { x: 200, y: 100 } },
      { kind: 'doc', id: inner, position: { x: 50, y: 25 } },
    ]);
    expect(g.docs[inner].canvas.placements.map((p) => p.id)).toEqual([ids[0], ids[1]]);
    expect(g.rootCanvas.placements.map((p) => p.id)).toEqual([outer]);
  });

  it('on a doc canvas, uses the chats placement positions there', () => {
    const { g, ids } = graphWithChats(2);
    const outer = compactChats(g, ids);
    g.docs[outer].canvas.placements[0].position = { x: 10, y: 20 };
    const inner = compactChats(g, [ids[0]], { sourceCanvasDocId: outer });
    expect(g.docs[inner].canvas.placements[0].position).toEqual({ x: 10, y: 20 });
    expect(g.docs[outer].canvas.placements.at(-1)?.position).toEqual({ x: 10, y: 20 });
  });

  it('generates unique doc ids', () => {
    const { g, ids } = graphWithChats(2);
    expect(compactChats(g, [ids[0]])).not.toBe(compactChats(g, [ids[1]]));
  });

  it('throws for an empty chat list', () => {
    const { g } = graphWithChats(1);
    expect(() => compactChats(g, [])).toThrow(/at least one/i);
  });

  it('throws for an unknown chat', () => {
    const { g, ids } = graphWithChats(1);
    expect(() => compactChats(g, [ids[0], 'nope'])).toThrow(/unknown chat: nope/);
  });

  it('throws for an unknown source canvas doc', () => {
    const { g, ids } = graphWithChats(1);
    expect(() => compactChats(g, ids, { sourceCanvasDocId: 'nope' })).toThrow(/unknown doc: nope/);
  });

  it('throws when a chat is already in another compaction doc', () => {
    const { g, ids } = graphWithChats(3);
    compactChats(g, [ids[0], ids[1]]);
    expect(() => compactChats(g, [ids[1], ids[2]])).toThrow(/already compacted/);
  });

  it('throws when a chat is in a legacy compaction', () => {
    const { g, ids } = graphWithChats(2);
    addCompaction(g, [ids[0]]);
    expect(() => compactChats(g, ids)).toThrow(/already compacted/);
  });

  it('does not change anything when it throws', () => {
    const { g, ids } = graphWithChats(2);
    compactChats(g, [ids[0]]);
    const before = JSON.stringify(g);
    expect(() => compactChats(g, ids)).toThrow();
    expect(JSON.stringify(g)).toBe(before);
  });
});

describe('docIsStale', () => {
  const members = [
    { id: 'a', messages: [{ role: 'user', content: 'hi' }] },
    { id: 'b', messages: [{ role: 'assistant', content: 'yo' }] },
  ];
  const doc = (generated?: Doc['generated']): Doc => ({
    id: 'd',
    title: 'D',
    body: '',
    canvas: { placements: [], edges: [] },
    ...(generated && { generated }),
  });

  it('a doc without a generated body is never stale', () => {
    expect(docIsStale(doc(), members)).toBe(false);
  });

  it('is fresh when the members digest matches, regardless of member order', () => {
    const d = doc({ sourceDigest: compactionDigest(members), status: 'idle' });
    expect(docIsStale(d, members)).toBe(false);
    expect(docIsStale(d, [...members].reverse())).toBe(false);
  });

  it('is stale when a member transcript changed since generation', () => {
    const d = doc({ sourceDigest: compactionDigest(members), status: 'idle' });
    const changed = [members[0], { id: 'b', messages: [{ role: 'assistant', content: 'changed' }] }];
    expect(docIsStale(d, changed)).toBe(true);
  });

  it('a freshly compacted doc (empty digest) is stale until generated', () => {
    expect(docIsStale(doc({ sourceDigest: '', status: 'generating' }), members)).toBe(true);
  });
});
