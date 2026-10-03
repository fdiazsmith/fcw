import { describe, it, expect } from 'vitest';
import { deletionIntents } from './deletion-intents';

const doc = (docId: string) => ({ type: 'doc-node', props: { docId } });
const chat = (chatId: string) => ({ type: 'chat-node', props: { chatId } });

describe('deletionIntents', () => {
  it('a deleted doc box unplaces the doc from that canvas', () => {
    expect(deletionIntents([doc('d1')], 'root')).toEqual([
      { type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id: 'd1' },
    ]);
  });

  it('a deleted chat card on a doc canvas unplaces the chat', () => {
    expect(deletionIntents([chat('c1')], 'docA')).toEqual([
      { type: 'doc_unplace_requested', canvasId: 'docA', kind: 'chat', id: 'c1' },
    ]);
  });

  it('a deleted chat card on root sends nothing (root chats are implicit)', () => {
    expect(deletionIntents([chat('c1')], 'root')).toEqual([]);
  });

  it('ignores other shapes and shapes without an id', () => {
    expect(deletionIntents([{ type: 'draw', props: {} }, doc(''), chat('')], 'docA')).toEqual([]);
  });

  it('handles several shapes at once', () => {
    expect(deletionIntents([doc('d1'), doc('d2')], 'docA')).toHaveLength(2);
  });
});
