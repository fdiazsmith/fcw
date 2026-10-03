// M2.2: doc operations on the session manager. canvasId is 'root' or a docId.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { ChatServerMessage } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

function collect(sessions: ChatSessionManager): ChatServerMessage[] {
  const events: ChatServerMessage[] = [];
  sessions.on('message', (msg: ChatServerMessage) => events.push(msg));
  return events;
}

/** Counts save-handler calls after the debounce. */
async function savesAfter(sessions: ChatSessionManager, act: () => void): Promise<number> {
  vi.useFakeTimers();
  let saves = 0;
  sessions.setSaveHandler(async () => { saves++; });
  act();
  await vi.advanceTimersByTimeAsync(600);
  return saves;
}

describe('ChatSessionManager.createDoc', () => {
  afterEach(() => vi.useRealTimers());

  it('creates an empty doc, places it on root, emits doc_created then doc_placed', () => {
    const sessions = new ChatSessionManager();
    const events = collect(sessions);
    const id = sessions.createDoc(ROOT_CANVAS_ID, 'Auth', { x: 5, y: 6 });

    const doc = sessions.graph.docs[id];
    expect(doc).toMatchObject({ id, title: 'Auth', body: '', canvas: { placements: [], edges: [] } });
    expect(sessions.graph.rootCanvas.placements).toEqual([{ kind: 'doc', id, position: { x: 5, y: 6 } }]);
    expect(events).toEqual([
      { type: 'doc_created', doc },
      { type: 'doc_placed', canvasId: ROOT_CANVAS_ID, placement: { kind: 'doc', id, position: { x: 5, y: 6 } } },
    ]);
  });

  it("places on a doc's child canvas when canvasId is a docId", () => {
    const sessions = new ChatSessionManager();
    const parent = sessions.createDoc(ROOT_CANVAS_ID, 'Parent', { x: 0, y: 0 });
    const child = sessions.createDoc(parent, 'Child', { x: 1, y: 1 });
    expect(sessions.graph.docs[parent].canvas.placements).toEqual([
      { kind: 'doc', id: child, position: { x: 1, y: 1 } },
    ]);
  });

  it('rejects an unknown canvas', () => {
    const sessions = new ChatSessionManager();
    expect(() => sessions.createDoc('nope', 'X', { x: 0, y: 0 })).toThrow(/unknown canvas/);
    expect(sessions.graph.docs).toEqual({});
  });

  it('persists', async () => {
    const sessions = new ChatSessionManager();
    expect(await savesAfter(sessions, () => sessions.createDoc(ROOT_CANVAS_ID, 'X', { x: 0, y: 0 }))).toBe(1);
  });
});

describe('ChatSessionManager.updateDoc', () => {
  afterEach(() => vi.useRealTimers());

  it('patches title and/or body and emits only the given fields', () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createDoc(ROOT_CANVAS_ID, 'Old', { x: 0, y: 0 });
    const events = collect(sessions);
    sessions.updateDoc(id, { body: '# Body' });
    sessions.updateDoc(id, { title: 'New' });
    expect(sessions.graph.docs[id]).toMatchObject({ title: 'New', body: '# Body' });
    expect(events).toEqual([
      { type: 'doc_updated', docId: id, body: '# Body' },
      { type: 'doc_updated', docId: id, title: 'New' },
    ]);
  });

  it('rejects an unknown doc', () => {
    const sessions = new ChatSessionManager();
    expect(() => sessions.updateDoc('nope', { body: 'x' })).toThrow(/unknown doc/);
  });

  it('persists', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createDoc(ROOT_CANVAS_ID, 'X', { x: 0, y: 0 });
    expect(await savesAfter(sessions, () => sessions.updateDoc(id, { body: 'b' }))).toBe(1);
  });
});
