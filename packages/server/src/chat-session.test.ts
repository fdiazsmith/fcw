import { describe, it, expect } from 'vitest';
import type { ChatServerMessage } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

function collect(sessions: ChatSessionManager): ChatServerMessage[] {
  const events: ChatServerMessage[] = [];
  sessions.on('message', (msg: ChatServerMessage) => events.push(msg));
  return events;
}

describe('ChatSessionManager.createChat', () => {
  it('adds a chat to the graph and emits chat_created', () => {
    const sessions = new ChatSessionManager();
    const events = collect(sessions);
    const id = sessions.createChat({ x: 5, y: 7 });
    expect(sessions.graph.chats[id]).toBeDefined();
    expect(sessions.graph.chats[id].position).toEqual({ x: 5, y: 7 });
    expect(events).toEqual([{ type: 'chat_created', chat: sessions.graph.chats[id] }]);
  });
});

describe('ChatSessionManager.prompt', () => {
  it('appends the user message and emits chat_user_message (no stream fn)', async () => {
    const sessions = new ChatSessionManager();
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    await sessions.prompt(id, 'hello');
    expect(sessions.graph.chats[id].messages).toHaveLength(1);
    expect(sessions.graph.chats[id].messages[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(events).toEqual([
      { type: 'chat_user_message', chatId: id, message: sessions.graph.chats[id].messages[0] },
    ]);
  });

  it('rejects for an unknown chat', async () => {
    const sessions = new ChatSessionManager();
    await expect(sessions.prompt('nope', 'x')).rejects.toThrow(/unknown chat/i);
  });
});

describe('ChatSessionManager.prompt with streaming', () => {
  async function* fakeStream() {
    yield 'Hel';
    yield 'lo!';
  }

  it('streams deltas and appends the assistant message', async () => {
    const seen: string[][] = [];
    const sessions = new ChatSessionManager('T', (messages) => {
      seen.push(messages.map((m) => `${m.role}:${m.content}`));
      return fakeStream();
    });
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');

    const msgs = sessions.graph.chats[id].messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1]).toMatchObject({ role: 'assistant', content: 'Hello!' });
    expect(events.map((e) => e.type)).toEqual([
      'chat_user_message',
      'chat_stream_started',
      'chat_stream_delta',
      'chat_stream_delta',
      'chat_stream_completed',
    ]);
    expect(events[2]).toEqual({ type: 'chat_stream_delta', chatId: id, delta: 'Hel' });
    expect(events[4]).toMatchObject({ chatId: id, message: { content: 'Hello!' } });
    // the stream fn received the assembled context including the new user message
    expect(seen).toEqual([['user:hi']]);
  });

  it('sends inherited parent context to the stream fn', async () => {
    const seen: string[][] = [];
    const sessions = new ChatSessionManager('T', (messages) => {
      seen.push(messages.map((m) => `${m.role}:${m.content}`));
      return fakeStream();
    });
    const parent = sessions.createChat({ x: 0, y: 0 });
    await sessions.prompt(parent, 'parent question');
    const child = sessions.createChat({ x: 0, y: 0 });
    sessions.connect(parent, child);
    await sessions.prompt(child, 'child question');
    expect(seen[1]).toEqual([
      'user:parent question',
      'assistant:Hello!',
      'user:child question',
    ]);
  });

  it('emits chat_error and no assistant message when the stream fails', async () => {
    async function* failing(): AsyncGenerator<string> {
      yield 'par';
      throw new Error('boom');
    }
    const sessions = new ChatSessionManager('T', () => failing());
    const id = sessions.createChat({ x: 0, y: 0 });
    const events = collect(sessions);
    await sessions.prompt(id, 'hi');
    expect(events.map((e) => e.type)).toEqual([
      'chat_user_message',
      'chat_stream_started',
      'chat_stream_delta',
      'chat_error',
    ]);
    expect(sessions.graph.chats[id].messages).toHaveLength(1); // only the user msg
  });
});
