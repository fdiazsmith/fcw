// M2.10: changing which docs sit on a doc canvas marks chats reading that doc stale.
import { describe, it, expect } from 'vitest';
import { ROOT_CANVAS_ID, parseMermaid } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

const pos = { x: 0, y: 0 };
const MERMAID = 'graph TD\nA[Login] --> B[Session]';

function world() {
  const sessions = new ChatSessionManager('t', {}, undefined, undefined, undefined, async () => ({
    ok: true,
    mermaid: MERMAID,
    graph: parseMermaid(MERMAID),
  }));
  const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', pos);
  const hosted = sessions.createChat(pos);
  sessions.placeOnCanvas(host, 'chat', hosted, pos);
  const rootChat = sessions.createChat(pos);
  const loose = sessions.createDoc(ROOT_CANVAS_ID, 'Loose', pos);
  const fresh = () => {
    for (const chat of Object.values(sessions.graph.chats)) chat.sessionStale = false;
  };
  fresh();
  const stale = (id: string) => sessions.graph.chats[id].sessionStale === true;
  return { sessions, host, hosted, rootChat, loose, fresh, stale };
}

describe('doc graph freshness (M2.10)', () => {
  it('placing a doc on a doc canvas marks chats reading that doc', () => {
    const w = world();
    w.sessions.placeOnCanvas(w.host, 'doc', w.loose, pos);
    expect(w.stale(w.hosted)).toBe(true);
    expect(w.stale(w.rootChat)).toBe(false);
  });

  it('unplacing a doc marks them', () => {
    const w = world();
    w.sessions.placeOnCanvas(w.host, 'doc', w.loose, pos);
    w.fresh();
    w.sessions.unplaceFromCanvas(w.host, 'doc', w.loose);
    expect(w.stale(w.hosted)).toBe(true);
    expect(w.stale(w.rootChat)).toBe(false);
  });

  it('linking a doc marks them', () => {
    const w = world();
    const box = w.sessions.createDoc(w.host, 'Box', pos);
    w.fresh();
    w.sessions.linkDoc(w.host, box, w.loose);
    expect(w.stale(w.hosted)).toBe(true);
    expect(w.stale(w.rootChat)).toBe(false);
  });

  it('a diagram generated onto a doc canvas marks them', async () => {
    const w = world();
    await w.sessions.requestDiagram(w.host, 'auth');
    expect(w.stale(w.hosted)).toBe(true);
    expect(w.stale(w.rootChat)).toBe(false);
  });

  it('root-canvas changes mark nothing', async () => {
    const w = world();
    const other = w.sessions.createDoc(ROOT_CANVAS_ID, 'Other', pos);
    w.fresh();
    w.sessions.unplaceFromCanvas(ROOT_CANVAS_ID, 'doc', other);
    w.sessions.placeOnCanvas(ROOT_CANVAS_ID, 'doc', other, pos);
    await w.sessions.requestDiagram(ROOT_CANVAS_ID, 'auth');
    expect(Object.values(w.sessions.graph.chats).some((c) => c.sessionStale)).toBe(false);
  });
});
