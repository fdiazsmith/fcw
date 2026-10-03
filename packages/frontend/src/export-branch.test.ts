import { describe, it, expect } from 'vitest';
import { exportBranchMarkdown } from './export-branch';
import { emptyChatState, type ChatState, type ChatView } from './chat-store';
import type { ContextEdge } from '@fcw/graph-core';

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

const mkState = (chats: Record<string, ChatView>, edges: ContextEdge[] = []): ChatState => ({
  ...emptyChatState(),
  chats,
  edges,
});

const edge = (from: string, to: string): ContextEdge => ({
  from,
  to,
  enabled: true,
  priority: 0,
});

describe('exportBranchMarkdown', () => {
  it('renders a header from the chat title', () => {
    const state = mkState({ c1: view({ id: 'c1', title: 'My Branch' }) });
    const md = exportBranchMarkdown(state, 'c1');
    expect(md).toContain('## My Branch');
  });

  it('falls back to the chat id when title is empty', () => {
    const state = mkState({ c1: view({ id: 'c1', title: '' }) });
    expect(exportBranchMarkdown(state, 'c1')).toContain('## c1');
  });

  it('renders role-labelled messages', () => {
    const state = mkState({
      c1: view({
        id: 'c1',
        title: 'T',
        messages: [
          { role: 'user', content: 'hi', createdAt: 't' },
          { role: 'assistant', content: 'hello', createdAt: 't' },
          { role: 'tool', content: 'ran', createdAt: 't' },
        ],
      }),
    });
    const md = exportBranchMarkdown(state, 'c1');
    expect(md).toContain('**User:**');
    expect(md).toContain('hi');
    expect(md).toContain('**Assistant:**');
    expect(md).toContain('hello');
    expect(md).toContain('**Tool:**');
    expect(md).toContain('ran');
  });

  it('includes inherited parent context before the chat\'s own messages', () => {
    const state = mkState(
      {
        parent: view({
          id: 'parent',
          title: 'Parent',
          messages: [{ role: 'user', content: 'PARENT_MSG', createdAt: 't0' }],
        }),
        child: view({
          id: 'child',
          title: 'Child',
          messages: [{ role: 'user', content: 'CHILD_MSG', createdAt: 't1' }],
        }),
      },
      [edge('parent', 'child')],
    );
    const md = exportBranchMarkdown(state, 'child');
    expect(md).toContain('PARENT_MSG');
    expect(md).toContain('CHILD_MSG');
    // parent context comes first (assembleContext order)
    expect(md.indexOf('PARENT_MSG')).toBeLessThan(md.indexOf('CHILD_MSG'));
  });
});
