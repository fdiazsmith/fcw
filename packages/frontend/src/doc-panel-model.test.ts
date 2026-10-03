import { describe, it, expect } from 'vitest';
import type { ChatNode } from '@fcw/graph-core';
import { emptyChatState, applyChatMessage } from './chat-store';
import { docChatBinding } from './doc-panel-model';

const chatNode = (id: string, docId?: string): ChatNode =>
  ({ id, title: id, position: { x: 0, y: 0 }, messages: [], createdAt: '', ...(docId ? { docId } : {}) });

describe('docChatBinding', () => {
  it('requests a doc-chat when the doc has none', () => {
    expect(docChatBinding(emptyChatState(), 'd1')).toEqual({ chat: null, needsRequest: true });
  });

  it('shows the doc-chat once the store knows it', () => {
    const state = applyChatMessage(emptyChatState(), { type: 'chat_created', chat: chatNode('c1', 'd1') });
    const b = docChatBinding(state, 'd1');
    expect(b.needsRequest).toBe(false);
    expect(b.chat?.id).toBe('c1');
  });

  it('waits (no chat, no re-request) when doc_chat_ready names a chat not yet loaded', () => {
    const state = applyChatMessage(emptyChatState(), { type: 'doc_chat_ready', docId: 'd1', chatId: 'c9' });
    expect(docChatBinding(state, 'd1')).toEqual({ chat: null, needsRequest: false });
  });
});
