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

describe('ChatSessionManager place / unplace / move', () => {
  afterEach(() => vi.useRealTimers());

  it('places an existing doc and a chat on a doc canvas', () => {
    const sessions = new ChatSessionManager();
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', { x: 0, y: 0 });
    const ref = sessions.createDoc(ROOT_CANVAS_ID, 'Ref', { x: 0, y: 0 });
    const chat = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    sessions.placeOnCanvas(host, 'doc', ref, { x: 1, y: 2 });
    sessions.placeOnCanvas(host, 'chat', chat, { x: 3, y: 4 });
    expect(sessions.graph.docs[host].canvas.placements).toEqual([
      { kind: 'doc', id: ref, position: { x: 1, y: 2 } },
      { kind: 'chat', id: chat, position: { x: 3, y: 4 } },
    ]);
    expect(events).toEqual([
      { type: 'doc_placed', canvasId: host, placement: { kind: 'doc', id: ref, position: { x: 1, y: 2 } } },
      { type: 'doc_placed', canvasId: host, placement: { kind: 'chat', id: chat, position: { x: 3, y: 4 } } },
    ]);
  });

  it('rejects unknown ids, duplicates, and chat placements on root', () => {
    const sessions = new ChatSessionManager();
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', { x: 0, y: 0 });
    const chat = sessions.createChat({ x: 0, y: 0 });
    const p = { x: 0, y: 0 };
    expect(() => sessions.placeOnCanvas('nope', 'doc', host, p)).toThrow(/unknown canvas/);
    expect(() => sessions.placeOnCanvas(host, 'doc', 'nope', p)).toThrow(/unknown doc/);
    expect(() => sessions.placeOnCanvas(host, 'chat', 'nope', p)).toThrow(/unknown chat/);
    expect(() => sessions.placeOnCanvas(ROOT_CANVAS_ID, 'doc', host, p)).toThrow(/already placed/);
    expect(() => sessions.placeOnCanvas(ROOT_CANVAS_ID, 'chat', chat, p)).toThrow(/root/);
  });

  it('moves and unplaces a placement', () => {
    const sessions = new ChatSessionManager();
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', { x: 0, y: 0 });
    const chat = sessions.createChat({ x: 0, y: 0 });
    sessions.placeOnCanvas(host, 'chat', chat, { x: 0, y: 0 });
    const events = collect(sessions);
    sessions.moveOnCanvas(host, 'chat', chat, { x: 9, y: 9 });
    expect(sessions.graph.docs[host].canvas.placements[0].position).toEqual({ x: 9, y: 9 });
    sessions.unplaceFromCanvas(host, 'chat', chat);
    expect(sessions.graph.docs[host].canvas.placements).toEqual([]);
    expect(events).toEqual([
      { type: 'doc_moved', canvasId: host, kind: 'chat', id: chat, position: { x: 9, y: 9 } },
      { type: 'doc_unplaced', canvasId: host, kind: 'chat', id: chat },
    ]);
  });

  it('move / unplace reject a placement that is not on the canvas', () => {
    const sessions = new ChatSessionManager();
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', { x: 0, y: 0 });
    expect(() => sessions.moveOnCanvas(host, 'doc', 'nope', { x: 0, y: 0 })).toThrow(/not placed/);
    expect(() => sessions.unplaceFromCanvas('nope', 'doc', host)).toThrow(/unknown canvas/);
    expect(() => sessions.unplaceFromCanvas(host, 'doc', 'nope')).toThrow(/not placed/);
  });

  it('every placement mutation persists', async () => {
    const sessions = new ChatSessionManager();
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', { x: 0, y: 0 });
    const ref = sessions.createDoc(ROOT_CANVAS_ID, 'Ref', { x: 0, y: 0 });
    expect(await savesAfter(sessions, () => sessions.placeOnCanvas(host, 'doc', ref, { x: 0, y: 0 }))).toBe(1);
    expect(await savesAfter(sessions, () => sessions.moveOnCanvas(host, 'doc', ref, { x: 1, y: 0 }))).toBe(1);
    expect(await savesAfter(sessions, () => sessions.unplaceFromCanvas(host, 'doc', ref))).toBe(1);
  });
});

describe('ChatSessionManager.linkDoc', () => {
  afterEach(() => vi.useRealTimers());

  /** Host canvas with a fresh box `placed` and an existing doc `existing` elsewhere. */
  function setup() {
    const sessions = new ChatSessionManager();
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', { x: 0, y: 0 });
    const existing = sessions.createDoc(ROOT_CANVAS_ID, 'Auth', { x: 0, y: 0 });
    const placed = sessions.createDoc(host, 'Auth', { x: 7, y: 8 });
    return { sessions, host, existing, placed };
  }

  it('swaps the placement, emits only doc_linked, and deletes the empty orphan', () => {
    const { sessions, host, existing, placed } = setup();
    const events = collect(sessions);
    sessions.linkDoc(host, placed, existing);
    expect(sessions.graph.docs[host].canvas.placements).toEqual([
      { kind: 'doc', id: existing, position: { x: 7, y: 8 } },
    ]);
    expect(sessions.graph.docs[placed]).toBeUndefined();
    expect(events).toEqual([{ type: 'doc_linked', canvasId: host, placedDocId: placed, existingDocId: existing }]);
  });

  it('keeps the replaced doc when it has a body, a non-empty canvas, or another placement', () => {
    const withBody = setup();
    withBody.sessions.updateDoc(withBody.placed, { body: 'notes' });
    withBody.sessions.linkDoc(withBody.host, withBody.placed, withBody.existing);
    expect(withBody.sessions.graph.docs[withBody.placed]).toBeDefined();

    const withCanvas = setup();
    withCanvas.sessions.createDoc(withCanvas.placed, 'Inner', { x: 0, y: 0 });
    withCanvas.sessions.linkDoc(withCanvas.host, withCanvas.placed, withCanvas.existing);
    expect(withCanvas.sessions.graph.docs[withCanvas.placed]).toBeDefined();

    const elsewhere = setup();
    elsewhere.sessions.placeOnCanvas(ROOT_CANVAS_ID, 'doc', elsewhere.placed, { x: 0, y: 0 });
    elsewhere.sessions.linkDoc(elsewhere.host, elsewhere.placed, elsewhere.existing);
    expect(elsewhere.sessions.graph.docs[elsewhere.placed]).toBeDefined();
  });

  it('rejects unknown canvas / docs', () => {
    const { sessions, host, existing, placed } = setup();
    expect(() => sessions.linkDoc('nope', placed, existing)).toThrow(/unknown canvas/);
    expect(() => sessions.linkDoc(host, placed, 'nope')).toThrow(/unknown doc/);
    expect(() => sessions.linkDoc(host, 'nope', existing)).toThrow(/not placed/);
  });

  it('persists', async () => {
    const { sessions, host, existing, placed } = setup();
    expect(await savesAfter(sessions, () => sessions.linkDoc(host, placed, existing))).toBe(1);
  });
});
