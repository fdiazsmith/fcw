import { describe, it, expect } from 'vitest';
import { searchChats } from './chat-search';
import { emptyChatState, type ChatState, type ChatView } from './chat-store';

const view = (over: Partial<ChatView> & { id: string }): ChatView => ({
  id: over.id,
  title: over.title ?? '',
  position: over.position ?? { x: 0, y: 0 },
  messages: over.messages ?? [],
  streamingText: over.streamingText ?? null,
  error: over.error ?? null,
  settings: over.settings ?? { engine: 'api' },
  pendingPermission: null,
  pendingPermissionQueue: [],
});

const state = (...views: ChatView[]): ChatState => ({
  ...emptyChatState(),
  chats: Object.fromEntries(views.map((v) => [v.id, v])),
  edges: [],
});

describe('searchChats', () => {
  it('returns empty for a blank query', () => {
    const s = state(view({ id: 'c1', title: 'Hello' }));
    expect(searchChats(s, '')).toEqual([]);
    expect(searchChats(s, '   ')).toEqual([]);
  });

  it('matches on title case-insensitively', () => {
    const s = state(view({ id: 'c1', title: 'Deployment Notes' }));
    const r = searchChats(s, 'deploy');
    expect(r).toHaveLength(1);
    expect(r[0].chatId).toBe('c1');
    expect(r[0].title).toBe('Deployment Notes');
  });

  it('matches message content and returns a snippet around the match', () => {
    const long =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaNEEDLEbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const s = state(
      view({
        id: 'c1',
        title: 'Chat',
        messages: [{ role: 'user', content: long, createdAt: 't' }],
      }),
    );
    const r = searchChats(s, 'needle');
    expect(r).toHaveLength(1);
    expect(r[0].snippet.toLowerCase()).toContain('needle');
    // snippet is a window (±40 chars), not the whole message
    expect(r[0].snippet.length).toBeLessThan(long.length);
  });

  it('does not return chats with no match', () => {
    const s = state(
      view({ id: 'c1', title: 'Alpha' }),
      view({ id: 'c2', title: 'Beta' }),
    );
    const r = searchChats(s, 'alpha');
    expect(r.map((m) => m.chatId)).toEqual(['c1']);
  });

  it('ranks title matches above message-only matches', () => {
    const s = state(
      view({
        id: 'msg',
        title: 'Untitled',
        messages: [{ role: 'user', content: 'talk about tacos', createdAt: 't' }],
      }),
      view({ id: 'ttl', title: 'Tacos plan' }),
    );
    const r = searchChats(s, 'tacos');
    expect(r[0].chatId).toBe('ttl');
    expect(r.map((m) => m.chatId).sort()).toEqual(['msg', 'ttl']);
  });
});
