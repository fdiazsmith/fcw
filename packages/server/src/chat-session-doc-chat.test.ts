// M2.6: doc-chat sessions — one chat bound to a doc, never placed on a canvas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { ChatServerMessage } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';
import type { TurnEvent } from './turn-events.js';

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

/** A doc with a doc-chat holding one user (0) + one assistant (1) message. */
async function docChatWithReply(): Promise<{ sessions: ChatSessionManager; doc: string; chat: string }> {
  const sessions = new ChatSessionManager('t', {
    api: async function* (): AsyncIterable<TurnEvent> {
      yield { type: 'text_delta', text: '# Better body' };
    },
  });
  const doc = sessions.createDoc(ROOT_CANVAS_ID, 'Auth', pos);
  sessions.updateDoc(doc, { body: 'old body' });
  const chat = sessions.requestDocChat(doc);
  await sessions.prompt(chat, 'rewrite it');
  return { sessions, doc, chat };
}

describe('ChatSessionManager.applyToDoc', () => {
  afterEach(() => vi.useRealTimers());

  it('body is unchanged until apply is requested', async () => {
    const { sessions, doc } = await docChatWithReply();
    expect(sessions.graph.docs[doc].body).toBe('old body');
  });

  it('applies an assistant message to the doc body, emits doc_updated, persists', async () => {
    const { sessions, doc, chat } = await docChatWithReply();
    vi.useFakeTimers();
    let saves = 0;
    sessions.setSaveHandler(async () => { saves++; });
    const events = collect(sessions);

    sessions.applyToDoc(doc, chat, 1);

    expect(sessions.graph.docs[doc].body).toBe('# Better body');
    expect(sessions.graph.docs[doc].title).toBe('Auth');
    expect(events).toEqual([{ type: 'doc_updated', docId: doc, body: '# Better body' }]);
    await vi.advanceTimersByTimeAsync(600);
    expect(saves).toBe(1);
  });

  it('rejects a user message', async () => {
    const { sessions, doc, chat } = await docChatWithReply();
    expect(() => sessions.applyToDoc(doc, chat, 0)).toThrow(/assistant/);
    expect(() => sessions.applyToDoc(doc, chat, 5)).toThrow(/assistant/);
    expect(sessions.graph.docs[doc].body).toBe('old body');
  });

  it("rejects a chat that is not that doc's doc-chat", async () => {
    const { sessions, doc } = await docChatWithReply();
    const other = sessions.createDoc(ROOT_CANVAS_ID, 'Other', pos);
    const otherChat = sessions.requestDocChat(other);
    const plain = sessions.createChat(pos);
    expect(() => sessions.applyToDoc(doc, otherChat, 1)).toThrow(/not the doc-chat/);
    expect(() => sessions.applyToDoc(doc, plain, 1)).toThrow(/not the doc-chat/);
    expect(() => sessions.applyToDoc(doc, 'nope', 1)).toThrow(/not the doc-chat/);
    expect(sessions.graph.docs[doc].body).toBe('old body');
  });

  it('rejects an unknown doc', async () => {
    const { sessions, chat } = await docChatWithReply();
    expect(() => sessions.applyToDoc('nope', chat, 1)).toThrow(/unknown doc/);
  });
});
