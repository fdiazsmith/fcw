import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createChatGraph, addChat, appendMessage } from './chat-graph.js';
import type { Compaction } from './compaction.js';
import { compactChats, compactionDigest, docIsStale, migrateCompactions } from './doc-compaction.js';
import { chatGraphToJSON, chatGraphFromJSON } from './chat-graph-serialization.js';
import type { Doc } from './docs.js';
import type { ChatGraph } from './chat-graph.js';

/** A pre-structure-first compaction, as old .fcw.json files hold them. */
function legacyCompaction(g: ChatGraph, memberIds: string[], fields: Partial<Compaction> = {}): string {
  const id = `cmp_${Object.keys(g.compactions).length + 1}`;
  g.compactions[id] = {
    id,
    title: 'Legacy',
    memberIds,
    document: '',
    sourceDigest: '',
    position: { x: 0, y: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'generating',
    ...fields,
  };
  return id;
}

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

  it('stamps createdAt as an ISO timestamp', () => {
    const { g, ids } = graphWithChats(1);
    const doc = g.docs[compactChats(g, ids)];
    expect(new Date(doc.createdAt!).toISOString()).toBe(doc.createdAt);
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
    legacyCompaction(g, [ids[0]]);
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

describe('migrateCompactions', () => {
  function legacyGraph() {
    const { g, ids } = graphWithChats(3);
    const cmp = legacyCompaction(g, [ids[0], ids[1]], {
      position: { x: 7, y: 8 },
      document: '# generated',
      sourceDigest: 'dig-1',
      status: 'idle',
    });
    return { g, ids, cmp };
  }

  it('turns each compaction into a generated doc with the same id, placed on root', () => {
    const { g, ids, cmp } = legacyGraph();
    const createdAt = g.compactions[cmp].createdAt;
    migrateCompactions(g);

    expect(g.compactions).toEqual({});
    expect(g.docs[cmp]).toEqual({
      id: cmp,
      title: 'Legacy',
      body: '# generated',
      createdAt,
      canvas: {
        placements: [
          { kind: 'chat', id: ids[0], position: { x: 0, y: 0 } },
          { kind: 'chat', id: ids[1], position: { x: 100, y: 50 } },
        ],
        edges: [],
      },
      generated: { sourceDigest: 'dig-1', status: 'idle' },
    });
    expect(g.rootCanvas.placements).toEqual([{ kind: 'doc', id: cmp, position: { x: 7, y: 8 } }]);
  });

  it('is idempotent', () => {
    const { g } = legacyGraph();
    migrateCompactions(g);
    const once = JSON.stringify(g);
    migrateCompactions(g);
    expect(JSON.stringify(g)).toBe(once);
  });

  it('does not duplicate placements if a compaction reappears for an already migrated doc', () => {
    const { g, cmp } = legacyGraph();
    const legacy = structuredClone(g.compactions);
    migrateCompactions(g);
    const once = JSON.stringify(g);
    g.compactions = legacy;
    migrateCompactions(g);
    expect(JSON.stringify(g)).toBe(once);
    expect(g.rootCanvas.placements.filter((p) => p.id === cmp)).toHaveLength(1);
  });

  it('round-trips through JSON', () => {
    const { g } = legacyGraph();
    migrateCompactions(g);
    expect(chatGraphFromJSON(chatGraphToJSON(g))).toEqual(g);
  });

  it('migrates a compacting-branch .fcw.json without losing data', () => {
    const json = readFileSync(new URL('./__fixtures__/compacting-v2.fcw.json', import.meta.url), 'utf8');
    const g = chatGraphFromJSON(json);
    const before = structuredClone(g);
    expect(Object.keys(before.compactions)).toHaveLength(2);

    migrateCompactions(g);

    expect(g.compactions).toEqual({});
    expect(g.chats).toEqual(before.chats);
    expect(g.edges).toEqual(before.edges);
    expect(g.meta).toEqual(before.meta);
    for (const c of Object.values(before.compactions)) {
      const doc = g.docs[c.id];
      expect(doc.title).toBe(c.title);
      expect(doc.body).toBe(c.document);
      expect(doc.generated).toEqual({ sourceDigest: c.sourceDigest, status: c.status });
      expect(doc.createdAt).toBe(c.createdAt);
      expect(doc.canvas.placements).toEqual(
        c.memberIds.map((m) => ({ kind: 'chat', id: m, position: before.chats[m].position })),
      );
      expect(g.rootCanvas.placements).toContainEqual({ kind: 'doc', id: c.id, position: c.position });
    }
    expect(g.rootCanvas.placements).toHaveLength(2);

    // the stored digest still matches the untouched transcripts
    const token = g.docs.cmp_1773900100000_1;
    const members = token.canvas.placements.map((p) => g.chats[p.id]);
    expect(docIsStale(token, members)).toBe(false);

    // migrated members stay compacted; the rest are free
    expect(() => compactChats(g, ['chat_1773900000000_1'])).toThrow(/already compacted/);
    expect(() => compactChats(g, ['chat_1773900000000_4'])).not.toThrow();

    const reloaded = chatGraphFromJSON(chatGraphToJSON(g));
    expect(reloaded).toEqual(g);
    expect(reloaded.docs.cmp_1773900100000_1.createdAt).toBe('2026-03-19T06:45:00.000Z');
  });
});
