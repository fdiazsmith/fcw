// M2.4: a chat's turn context carries doc blocks for the doc whose canvas it sits on.
import { describe, it, expect } from 'vitest';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { DocContextBlock } from '@fcw/graph-core';
import { ChatSessionManager, DEFAULT_DOC_CONTEXT_BUDGET } from './chat-session.js';
import type { TurnContext, TurnEvent } from './turn-events.js';

function capturing(): { sessions: ChatSessionManager; seen: TurnContext[] } {
  const seen: TurnContext[] = [];
  const sessions = new ChatSessionManager('t', {
    api: async function* (ctx: TurnContext): AsyncIterable<TurnEvent> {
      seen.push(ctx);
      yield { type: 'text_delta', text: 'ok' };
    },
  });
  return { sessions, seen };
}

const titles = (blocks: DocContextBlock[] | undefined) => (blocks ?? []).map((b) => b.title);
const pos = { x: 0, y: 0 };

describe('doc context in chat turns (M2.4)', () => {
  it('chat on root gets no doc blocks', async () => {
    const { sessions, seen } = capturing();
    sessions.createDoc(ROOT_CANVAS_ID, 'Unrelated', pos);
    const chat = sessions.createChat(pos);
    await sessions.prompt(chat, 'hi');
    expect(seen[0].docContext).toEqual([]);
  });

  it("chat on a regular doc's canvas gets that doc + its references, deepest first", async () => {
    const { sessions, seen } = capturing();
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', pos);
    const ref = sessions.createDoc(host, 'Ref', pos);
    sessions.createDoc(ref, 'Deep', pos);
    sessions.updateDoc(host, { body: 'host body' });
    const chat = sessions.createChat(pos);
    sessions.placeOnCanvas(host, 'chat', chat, pos);

    await sessions.prompt(chat, 'hi');

    expect(titles(seen[0].docContext)).toEqual(['Deep', 'Ref', 'Host']);
    expect(seen[0].docContext?.at(-1)).toMatchObject({ docId: host, body: 'host body', degraded: false });
  });

  it("chat on a generated doc's canvas gets no context from that doc", async () => {
    const { sessions, seen } = capturing();
    const a = sessions.createChat(pos);
    const b = sessions.createChat(pos);
    await sessions.compact([a, b]);
    seen.length = 0;

    await sessions.prompt(a, 'hi');

    expect(seen[0].docContext).toEqual([]);
  });

  it('budget degradation flows through: distant references become title-only', async () => {
    const { sessions, seen } = capturing();
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', pos);
    const ref = sessions.createDoc(host, 'Ref', pos);
    sessions.updateDoc(ref, { body: 'x'.repeat(DEFAULT_DOC_CONTEXT_BUDGET + 1) });
    sessions.updateDoc(host, { body: 'host body' });
    const chat = sessions.createChat(pos);
    sessions.placeOnCanvas(host, 'chat', chat, pos);

    await sessions.prompt(chat, 'hi');

    expect(seen[0].docContext).toEqual([
      { docId: ref, title: 'Ref', body: '', degraded: true },
      { docId: host, title: 'Host', body: 'host body', degraded: false },
    ]);
  });
});
