// M2.8: a chat whose doc context changed starts a fresh agent session next turn.
import { describe, it, expect } from 'vitest';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

const pos = { x: 0, y: 0 };

/** Pretend every chat has a live agent session. */
function freshen(sessions: ChatSessionManager): void {
  for (const chat of Object.values(sessions.graph.chats)) chat.sessionStale = false;
}

const stale = (sessions: ChatSessionManager, chatId: string) =>
  sessions.graph.chats[chatId].sessionStale === true;

/** Host doc on root holding a chat, a referenced doc on its canvas, a doc-chat
 *  of the reference, and an unrelated chat + doc. */
function world() {
  const sessions = new ChatSessionManager();
  const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', pos);
  const ref = sessions.createDoc(host, 'Ref', pos);
  const other = sessions.createDoc(ROOT_CANVAS_ID, 'Other', pos);
  const hosted = sessions.createChat(pos);
  sessions.placeOnCanvas(host, 'chat', hosted, pos);
  const refChat = sessions.requestDocChat(ref);
  const unrelated = sessions.createChat(pos);
  const otherChat = sessions.requestDocChat(other);
  freshen(sessions);
  return { sessions, host, ref, other, hosted, refChat, unrelated, otherChat };
}

describe('doc context freshness (M2.8)', () => {
  it("updateDoc marks the doc's doc-chat and every chat whose context reaches it", () => {
    const w = world();

    w.sessions.updateDoc(w.ref, { body: 'new body' });

    expect(stale(w.sessions, w.refChat)).toBe(true);
    expect(stale(w.sessions, w.hosted)).toBe(true);
    expect(stale(w.sessions, w.unrelated)).toBe(false);
    expect(stale(w.sessions, w.otherChat)).toBe(false);
  });

  it('a title change alone also marks them', () => {
    const w = world();

    w.sessions.updateDoc(w.ref, { title: 'Renamed' });

    expect(stale(w.sessions, w.refChat)).toBe(true);
    expect(stale(w.sessions, w.hosted)).toBe(true);
    expect(stale(w.sessions, w.otherChat)).toBe(false);
  });

  it('applyToDoc marks the doc-chat and chats reading the doc', () => {
    const w = world();
    w.sessions.graph.chats[w.refChat].messages.push(
      { role: 'user', content: 'draft it', createdAt: '' },
      { role: 'assistant', content: 'Drafted body.', createdAt: '' },
    );

    w.sessions.applyToDoc(w.ref, w.refChat, 1);

    expect(stale(w.sessions, w.refChat)).toBe(true);
    expect(stale(w.sessions, w.hosted)).toBe(true);
    expect(stale(w.sessions, w.unrelated)).toBe(false);
    expect(stale(w.sessions, w.otherChat)).toBe(false);
  });

  it("generation completing marks the generated doc's readers, not its own source chats", async () => {
    const w = world();
    const a = w.sessions.createChat(pos);
    const b = w.sessions.createChat(pos);
    const gen = await w.sessions.compact([a, b]);
    w.sessions.placeOnCanvas(w.host, 'doc', gen, pos);
    const genChat = w.sessions.requestDocChat(gen);
    freshen(w.sessions);

    await w.sessions.regenerateDoc(gen);

    expect(stale(w.sessions, genChat)).toBe(true);
    expect(stale(w.sessions, w.hosted)).toBe(true);
    expect(stale(w.sessions, a)).toBe(false);
    expect(stale(w.sessions, w.unrelated)).toBe(false);
    expect(stale(w.sessions, w.otherChat)).toBe(false);
  });

  it('placing a chat on a doc canvas marks that chat only', () => {
    const w = world();

    w.sessions.placeOnCanvas(w.host, 'chat', w.unrelated, pos);

    expect(stale(w.sessions, w.unrelated)).toBe(true);
    expect(stale(w.sessions, w.hosted)).toBe(false);
    expect(stale(w.sessions, w.refChat)).toBe(false);
  });

  it('unplacing a chat from a doc canvas marks that chat only', () => {
    const w = world();

    w.sessions.unplaceFromCanvas(w.host, 'chat', w.hosted);

    expect(stale(w.sessions, w.hosted)).toBe(true);
    expect(stale(w.sessions, w.refChat)).toBe(false);
    expect(stale(w.sessions, w.unrelated)).toBe(false);
  });
});
