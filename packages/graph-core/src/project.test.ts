import { describe, it, expect } from 'vitest';
import { createChatGraph, addChat, projectSummary, chatGraphToJSON, chatGraphFromJSON } from './index.js';

describe('projectSummary (M7.1)', () => {
  it('summarises title, id, updatedAt and chat/doc counts', () => {
    const g = createChatGraph('Alpha');
    addChat(g);
    addChat(g);
    g.docs['d1'] = { id: 'd1', title: 'd', body: '', canvas: { placements: [], edges: [] } };
    expect(projectSummary(g, '2026-10-03T00:00:00.000Z')).toEqual({
      id: g.id,
      title: 'Alpha',
      updatedAt: '2026-10-03T00:00:00.000Z',
      chatCount: 2,
      docCount: 1,
    });
  });

  it('round-trips meta.settings and loads files without it unchanged', () => {
    const g = createChatGraph('A');
    g.meta.settings = { cwd: '/x', model: 'm', effort: 'high' };
    expect(chatGraphFromJSON(chatGraphToJSON(g)).meta.settings).toEqual({ cwd: '/x', model: 'm', effort: 'high' });
    const old = chatGraphFromJSON(chatGraphToJSON(createChatGraph('B')));
    expect(old.meta.settings).toBeUndefined();
  });
});
