// Archive (hide, keep data) and permanent delete of chats.
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ChatServerMessage } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';
import type { StreamTurnFn, TurnEvent } from './turn-events.js';

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

describe('ChatSessionManager.setChatArchived', () => {
  afterEach(() => vi.useRealTimers());

  it('flags the chat, keeps its edges, emits chat_archived_changed and saves', async () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(a, b);
    const events = collect(sessions);
    const saves = await savesAfter(sessions, () => sessions.setChatArchived(a, true));
    expect(sessions.graph.chats[a].archived).toBe(true);
    expect(sessions.graph.edges).toHaveLength(1);
    expect(events).toEqual([{ type: 'chat_archived_changed', chatId: a, archived: true }]);
    expect(saves).toBe(1);
  });

  it('unarchives', () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    sessions.setChatArchived(a, true);
    const events = collect(sessions);
    sessions.setChatArchived(a, false);
    expect(sessions.graph.chats[a].archived).toBeUndefined();
    expect(events).toEqual([{ type: 'chat_archived_changed', chatId: a, archived: false }]);
  });

  it('throws for an unknown chat', () => {
    expect(() => new ChatSessionManager().setChatArchived('nope', true)).toThrow(/unknown chat/i);
  });
});

describe('ChatSessionManager.deleteChat', () => {
  afterEach(() => vi.useRealTimers());

  it('removes the chat, its edges and placements, emits chat_deleted and saves', async () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(a, b);
    const host = sessions.createDoc('root', 'Host', { x: 0, y: 0 });
    sessions.placeOnCanvas(host, 'chat', a, { x: 1, y: 1 });
    const events = collect(sessions);
    const saves = await savesAfter(sessions, () => sessions.deleteChat(a));
    expect(sessions.graph.chats[a]).toBeUndefined();
    expect(sessions.graph.edges).toEqual([]);
    expect(sessions.graph.docs[host].canvas.placements).toEqual([]);
    expect(events).toEqual([{ type: 'chat_deleted', chatId: a }]);
    expect(saves).toBe(1);
  });

  it('marks chats that inherited from it stale (their context changed)', () => {
    const sessions = new ChatSessionManager();
    const a = sessions.createChat({ x: 0, y: 0 });
    const b = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(a, b);
    sessions.graph.chats[b].sessionStale = false;
    sessions.deleteChat(a);
    expect(sessions.graph.chats[b].sessionStale).toBe(true);
  });

  it('refuses a doc-chat', () => {
    const sessions = new ChatSessionManager();
    const doc = sessions.createDoc('root', 'D', { x: 0, y: 0 });
    sessions.requestDocChat(doc);
    const chatId = Object.values(sessions.graph.chats).find((c) => c.docId === doc)!.id;
    expect(() => sessions.deleteChat(chatId)).toThrow(/doc-chat/i);
    expect(sessions.graph.chats[chatId]).toBeDefined();
  });

  it('stops an in-flight stream; nothing is emitted for the chat afterwards', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 }, 'Preset');
    (sessions as unknown as { streams: { api: StreamTurnFn } }).streams.api = async function* (): AsyncIterable<TurnEvent> {
      yield { type: 'text_delta', text: 'par' };
      sessions.deleteChat(id);
      yield { type: 'text_delta', text: 'tial' };
    };
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    const after = events.slice(events.findIndex((e) => e.type === 'chat_deleted') + 1);
    expect(after).toEqual([]);
  });
});
