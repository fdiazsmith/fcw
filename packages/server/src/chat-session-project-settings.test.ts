// M7.5: new chats inherit the project's default cwd / model / effort.
import { describe, it, expect } from 'vitest';
import { createChatGraph } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

describe('project settings for new chats', () => {
  it('a new chat starts with the project defaults; existing chats are untouched', () => {
    const graph = createChatGraph('P');
    const m = new ChatSessionManager(undefined, {}, graph);
    const before = m.createChat({ x: 0, y: 0 });

    graph.meta.settings = { cwd: '/repo', model: 'claude-opus-4-8', effort: 'high' };
    const created: unknown[] = [];
    m.on('message', (msg) => msg.type === 'chat_created' && created.push(msg.chat));
    const after = m.createChat({ x: 0, y: 0 });
    const branched = m.branch(after, { x: 1, y: 1 });

    expect(graph.chats[before].settings).toBeUndefined();
    const expected = { engine: 'api', cwd: '/repo', model: 'claude-opus-4-8', effort: 'high' };
    expect(graph.chats[after].settings).toEqual(expected);
    expect(graph.chats[branched].settings).toEqual(expected);
    expect(created[0]).toMatchObject({ settings: expected });
  });

  it('explicit chat settings win over the project defaults', () => {
    const graph = createChatGraph('P');
    graph.meta.settings = { cwd: '/repo', effort: 'high' };
    const m = new ChatSessionManager(undefined, {}, graph);
    const id = m.createChat({ x: 0, y: 0 });
    m.updateSettings(id, { effort: 'low', engine: 'agent' });
    expect(graph.chats[id].settings).toEqual({ engine: 'agent', cwd: '/repo', effort: 'low' });
  });

  it('no project settings: a new chat has no settings (unchanged behaviour)', () => {
    const m = new ChatSessionManager();
    const id = m.createChat({ x: 0, y: 0 });
    expect(m.graph.chats[id].settings).toBeUndefined();
  });
});
