// WI-7: a chat whose sessionStale flag was persisted to disk must, after a
// restart (graph reloaded from JSON), run its next turn FRESH — no resume —
// so graph-rewires-context semantics survive a server restart.
import { describe, it, expect } from 'vitest';
import {
  chatGraphToJSON,
  chatGraphFromJSON,
} from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';
import type { TurnContext, TurnEvent } from './turn-events.js';

describe('ChatSessionManager restart staleness', () => {
  it('a persisted sessionStale chat runs fresh (no resume) after reload', async () => {
    // First "process": build a graph, give chat B a live session, then mark
    // it stale (simulating a re-wire) and persist to JSON.
    const seenA: TurnContext[] = [];
    const proc1 = new ChatSessionManager('T', {
      agent: async function* (ctx: TurnContext): AsyncIterable<TurnEvent> {
        seenA.push(ctx);
        yield { type: 'session', sessionId: 'sess_B' } as TurnEvent;
        yield { type: 'text_delta', text: 'ok' } as TurnEvent;
      },
    });
    const a = proc1.createChat({ x: 0, y: 0 }, 'A');
    const b = proc1.createChat({ x: 0, y: 0 }, 'B');
    proc1.updateSettings(b, { engine: 'agent' });
    proc1.connect(a, b); // B inherits A's context; B is now stale, no session yet
    await proc1.prompt(b, 'first'); // B gets sessionId=sess_B, sessionStale=false

    // Re-wire: connect a new parent into B -> B marked stale with sessionId still set.
    const c = proc1.createChat({ x: 0, y: 0 }, 'C');
    proc1.connect(c, b);
    expect(proc1.graph.chats[b].sessionId).toBe('sess_B');
    expect(proc1.graph.chats[b].sessionStale).toBe(true);

    // Persist + reload (simulating a server restart).
    const json = chatGraphToJSON(proc1.graph);
    const reloaded = chatGraphFromJSON(json);
    expect(reloaded.chats[b].sessionId).toBe('sess_B');
    expect(reloaded.chats[b].sessionStale).toBe(true);

    // Second "process": new manager over the reloaded graph.
    const seenB: TurnContext[] = [];
    const proc2 = new ChatSessionManager(
      'T',
      {
        agent: async function* (ctx: TurnContext): AsyncIterable<TurnEvent> {
          seenB.push(ctx);
          yield { type: 'text_delta', text: 'again' } as TurnEvent;
        },
      },
      reloaded,
    );

    await proc2.prompt(b, 'second');

    expect(seenB).toHaveLength(1);
    // Stale survived restart -> the turn must NOT resume the old session...
    expect(seenB[0].sessionId).toBeUndefined();
    // ...and the re-assembled context (ancestors A + C) must be present.
    const assembled = seenB[0].context.map((m) => m.content);
    expect(assembled).toContain('first');
  });
});
