import { describe, it, expect } from 'vitest';
import type { ChatServerMessage, ChatNode } from '@fcw/graph-core';
import { emptyChatState, applyChatMessage, ChatState } from './chat-store';

const chat = (id: string): ChatNode => ({
  id,
  title: '',
  messages: [],
  position: { x: 0, y: 0 },
  createdAt: 't0',
});

const apply = (state: ChatState, ...msgs: ChatServerMessage[]) =>
  msgs.reduce(applyChatMessage, state);

describe('applyChatMessage', () => {
  it('chat_created adds a chat view', () => {
    const s = apply(emptyChatState(), { type: 'chat_created', chat: chat('c1') });
    expect(s.chats.c1).toMatchObject({ id: 'c1', messages: [], streamingText: null });
  });

  it('chat_user_message appends to the transcript', () => {
    const m = { role: 'user' as const, content: 'hi', createdAt: 't1' };
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_user_message', chatId: 'c1', message: m },
    );
    expect(s.chats.c1.messages).toEqual([m]);
  });

  it('stream lifecycle: started -> deltas accumulate -> completed moves to transcript', () => {
    const done = { role: 'assistant' as const, content: 'Hello!', createdAt: 't2' };
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_stream_started', chatId: 'c1' },
      { type: 'chat_stream_delta', chatId: 'c1', delta: 'Hel' },
    );
    expect(s.chats.c1.streamingText).toBe('Hel');
    s = apply(s, { type: 'chat_stream_delta', chatId: 'c1', delta: 'lo!' });
    expect(s.chats.c1.streamingText).toBe('Hello!');
    s = apply(s, { type: 'chat_stream_completed', chatId: 'c1', message: done });
    expect(s.chats.c1.streamingText).toBeNull();
    expect(s.chats.c1.messages).toEqual([done]);
  });

  it('chat_error clears streaming and records the error', () => {
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_stream_started', chatId: 'c1' },
      { type: 'chat_error', chatId: 'c1', message: 'boom' },
    );
    expect(s.chats.c1.streamingText).toBeNull();
    expect(s.chats.c1.error).toBe('boom');
  });

  it('chat_title_changed updates the view title', () => {
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_title_changed', chatId: 'c1', title: 'New Title' },
    );
    expect(s.chats.c1.title).toBe('New Title');
  });

  it('chat_last_message_removed pops the last message', () => {
    const a = { role: 'user' as const, content: 'q', createdAt: 't1' };
    const b = { role: 'assistant' as const, content: 'ans', createdAt: 't2' };
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('c1') },
      { type: 'chat_user_message', chatId: 'c1', message: a },
      { type: 'chat_user_message', chatId: 'c1', message: b },
    );
    expect(s.chats.c1.messages).toHaveLength(2);
    s = apply(s, { type: 'chat_last_message_removed', chatId: 'c1' });
    expect(s.chats.c1.messages).toEqual([a]);
  });

  it('ignores messages for unknown chats and unrelated types', () => {
    const s0 = emptyChatState();
    const s = apply(s0, { type: 'chat_stream_delta', chatId: 'ghost', delta: 'x' });
    expect(s).toEqual(s0);
  });

  it('chat_connected adds an edge, chat_disconnected removes it', () => {
    let s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('a') },
      { type: 'chat_created', chat: chat('b') },
      { type: 'chat_connected', edge: { from: 'a', to: 'b', enabled: true, priority: 0 } },
    );
    expect(s.edges).toEqual([{ from: 'a', to: 'b', enabled: true, priority: 0 }]);
    s = apply(s, { type: 'chat_disconnected', from: 'a', to: 'b' });
    expect(s.edges).toEqual([]);
  });

  it('chat_connected is idempotent per edge', () => {
    const edge = { from: 'a', to: 'b', enabled: true, priority: 0 };
    const s = apply(
      emptyChatState(),
      { type: 'chat_created', chat: chat('a') },
      { type: 'chat_created', chat: chat('b') },
      { type: 'chat_connected', edge },
      { type: 'chat_connected', edge },
    );
    expect(s.edges).toHaveLength(1);
  });

  it('chat_snapshot replaces the whole state from a graph', () => {
    // pre-existing local state should be discarded
    let s = apply(emptyChatState(), { type: 'chat_created', chat: chat('old') });
    const graph = {
      id: 'g1',
      version: 2 as const,
      meta: { title: 'T', created: 't0' },
      chats: {
        a: { ...chat('a'), messages: [{ role: 'user' as const, content: 'hi', createdAt: 't1' }] },
        b: chat('b'),
      },
      edges: [{ from: 'a', to: 'b', enabled: true, priority: 0 }],
    };
    s = apply(s, { type: 'chat_snapshot', graph });
    expect(Object.keys(s.chats).sort()).toEqual(['a', 'b']);
    expect(s.chats.old).toBeUndefined();
    expect(s.chats.a.messages).toHaveLength(1);
    expect(s.chats.a.streamingText).toBeNull();
    expect(s.edges).toEqual(graph.edges);
  });

  it('does not mutate previous state', () => {
    const s0 = apply(emptyChatState(), { type: 'chat_created', chat: chat('c1') });
    const s1 = apply(s0, {
      type: 'chat_user_message',
      chatId: 'c1',
      message: { role: 'user', content: 'hi', createdAt: 't1' },
    });
    expect(s0.chats.c1.messages).toHaveLength(0);
    expect(s1.chats.c1.messages).toHaveLength(1);
  });
});
