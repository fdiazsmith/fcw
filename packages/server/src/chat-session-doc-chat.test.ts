// M2.6: doc-chat sessions — one chat bound to a doc, never placed on a canvas.
import { describe, it, expect } from 'vitest';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { ChatServerMessage } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

function collect(sessions: ChatSessionManager): ChatServerMessage[] {
  const events: ChatServerMessage[] = [];
  sessions.on('message', (msg: ChatServerMessage) => events.push(msg));
  return events;
}

const pos = { x: 0, y: 0 };

describe('ChatSessionManager.requestDocChat', () => {
  it('creates a doc-chat titled after the doc, placed nowhere; emits chat_created then doc_chat_ready', () => {
    const sessions = new ChatSessionManager();
    const doc = sessions.createDoc(ROOT_CANVAS_ID, 'Auth', pos);
    const events = collect(sessions);

    const chatId = sessions.requestDocChat(doc);

    expect(sessions.graph.chats[chatId]).toMatchObject({ title: 'Auth', docId: doc });
    const canvases = [sessions.graph.rootCanvas, ...Object.values(sessions.graph.docs).map((d) => d.canvas)];
    expect(canvases.some((c) => c.placements.some((p) => p.id === chatId))).toBe(false);
    expect(events).toEqual([
      { type: 'chat_created', chat: sessions.graph.chats[chatId] },
      { type: 'doc_chat_ready', docId: doc, chatId },
    ]);
  });

  it('reuses the existing doc-chat: only doc_chat_ready', () => {
    const sessions = new ChatSessionManager();
    const doc = sessions.createDoc(ROOT_CANVAS_ID, 'Auth', pos);
    const first = sessions.requestDocChat(doc);
    const events = collect(sessions);

    expect(sessions.requestDocChat(doc)).toBe(first);
    expect(Object.keys(sessions.graph.chats)).toEqual([first]);
    expect(events).toEqual([{ type: 'doc_chat_ready', docId: doc, chatId: first }]);
  });

  it('rejects an unknown doc', () => {
    const sessions = new ChatSessionManager();
    expect(() => sessions.requestDocChat('nope')).toThrow(/unknown doc/);
    expect(sessions.graph.chats).toEqual({});
  });
});
