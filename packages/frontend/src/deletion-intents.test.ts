import { describe, it, expect } from 'vitest';
import { deletionIntents } from './deletion-intents';

const doc = (docId: string) => ({ type: 'doc-node', props: { docId } });
const chat = (chatId: string) => ({ type: 'chat-node', props: { chatId } });
const ctx = (from: string, to: string) => ({ type: 'arrow', props: {}, meta: { fcwCtx: true, from, to } });

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

  it('a deleted chat card on root archives the chat (root chats are implicit)', () => {
    expect(deletionIntents([chat('c1')], 'root')).toEqual([{ type: 'chat_archive_requested', chatId: 'c1' }]);
  });

  it('a deleted context arrow disconnects its edge', () => {
    expect(deletionIntents([ctx('a', 'b')], 'root')).toEqual([
      { type: 'chat_disconnect_requested', from: 'a', to: 'b' },
    ]);
  });

  it('archiving a chat keeps its edges: arrows deleted with it send no disconnect', () => {
    expect(deletionIntents([ctx('a', 'b'), chat('b'), ctx('b', 'c'), ctx('x', 'y')], 'root')).toEqual([
      { type: 'chat_archive_requested', chatId: 'b' },
      { type: 'chat_disconnect_requested', from: 'x', to: 'y' },
    ]);
  });

  it('ignores other shapes and shapes without an id', () => {
    expect(deletionIntents([{ type: 'draw', props: {} }, { type: 'arrow', props: {} }, doc(''), chat('')], 'docA')).toEqual([]);
  });

  it('handles several shapes at once', () => {
    expect(deletionIntents([doc('d1'), doc('d2')], 'docA')).toHaveLength(2);
  });
});
