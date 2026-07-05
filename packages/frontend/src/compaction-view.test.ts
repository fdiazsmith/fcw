import { describe, it, expect } from 'vitest';
import { compactionDigest, type Compaction } from '@fcw/graph-core';
import { emptyChatState, applyChatMessage, type ChatState } from './chat-store';
import {
  compactionForChat,
  compactionPageSlug,
  edgeVisible,
  compactCardModel,
} from './compaction-view';

function stateWith(compactions: Compaction[], chatIds: string[]): ChatState {
  let s = emptyChatState();
  for (const id of chatIds) {
    s = applyChatMessage(s, {
      type: 'chat_created',
      chat: { id, title: '', messages: [], position: { x: 0, y: 0 }, createdAt: 't' },
    });
  }
  for (const c of compactions) {
    s = applyChatMessage(s, { type: 'chat_compaction_created', compaction: c });
  }
  return s;
}

const compaction = (id: string, memberIds: string[], over: Partial<Compaction> = {}): Compaction => ({
  id,
  title: 'Research',
  memberIds,
  document: '# Doc',
  sourceDigest: '',
  position: { x: 0, y: 0 },
  createdAt: 't',
  status: 'idle',
  ...over,
});

describe('compactionForChat', () => {
  it('maps member chats to their compaction and others to null', () => {
    const s = stateWith([compaction('k1', ['a', 'b'])], ['a', 'b', 'c']);
    expect(compactionForChat(s, 'a')).toBe('k1');
    expect(compactionForChat(s, 'b')).toBe('k1');
    expect(compactionForChat(s, 'c')).toBeNull();
  });
});

describe('compactionPageSlug', () => {
  it('derives a stable slug from the compaction id', () => {
    expect(compactionPageSlug('k1')).toBe('cmp-k1');
    expect(compactionPageSlug('k1')).toBe(compactionPageSlug('k1'));
  });
});

describe('edgeVisible', () => {
  it('shows edges within one container and hides cross-boundary edges', () => {
    const s = stateWith([compaction('k1', ['a', 'b'])], ['a', 'b', 'c', 'd']);
    expect(edgeVisible(s, 'a', 'b')).toBe(true); // both inside k1
    expect(edgeVisible(s, 'c', 'd')).toBe(true); // both on main canvas
    expect(edgeVisible(s, 'a', 'c')).toBe(false); // crosses the boundary
  });
});

describe('compactCardModel', () => {
  it('projects title, document, member count and generating state', () => {
    const s = stateWith([compaction('k1', ['a'], { status: 'generating' })], ['a']);
    expect(compactCardModel(s, 'k1')).toMatchObject({
      compactionId: 'k1',
      title: 'Research',
      document: '# Doc',
      memberCount: 1,
      generating: true,
    });
  });

  it('computes staleness from member transcripts', () => {
    let s = stateWith([], ['a']);
    const digest = compactionDigest([s.chats.a]);
    s = applyChatMessage(s, {
      type: 'chat_compaction_created',
      compaction: compaction('k1', ['a'], { sourceDigest: digest }),
    });
    expect(compactCardModel(s, 'k1').stale).toBe(false);
    s = applyChatMessage(s, {
      type: 'chat_user_message',
      chatId: 'a',
      message: { role: 'user', content: 'more', createdAt: 't' },
    });
    expect(compactCardModel(s, 'k1').stale).toBe(true);
  });

  it('throws for an unknown compaction', () => {
    expect(() => compactCardModel(emptyChatState(), 'nope')).toThrow(/unknown compaction/);
  });
});
