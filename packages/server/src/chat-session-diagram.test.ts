// M2.5: diagram_requested → generated boxes placed on a canvas.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ROOT_CANVAS_ID, parseMermaid } from '@fcw/graph-core';
import type { ChatServerMessage } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';
import type { GenerateDiagram } from './diagram-gen.js';

function collect(sessions: ChatSessionManager): ChatServerMessage[] {
  const events: ChatServerMessage[] = [];
  sessions.on('message', (msg: ChatServerMessage) => events.push(msg));
  return events;
}

const MERMAID = 'graph TD\nA[Login] --> B[Session]\nB --> C[Logout]';

const okGenerator: GenerateDiagram = async () => ({ ok: true, mermaid: MERMAID, graph: parseMermaid(MERMAID) });

function manager(generate: GenerateDiagram): ChatSessionManager {
  return new ChatSessionManager('t', {}, undefined, undefined, undefined, generate);
}

describe('ChatSessionManager.requestDiagram', () => {
  afterEach(() => vi.useRealTimers());

  it('ok: adds one doc per box, places them, stores edges, emits per-box then diagram_created', async () => {
    const generate = vi.fn(okGenerator);
    const sessions = manager(generate);
    const events = collect(sessions);

    await sessions.requestDiagram(ROOT_CANVAS_ID, 'auth flow');

    expect(generate).toHaveBeenCalledWith('auth flow');
    const created = events.filter((e) => e.type === 'doc_created');
    expect(created.map((e) => e.type === 'doc_created' && e.doc.title)).toEqual(['Login', 'Session', 'Logout']);
    const ids = created.map((e) => (e.type === 'doc_created' ? e.doc.id : ''));
    for (const id of ids) expect(sessions.graph.docs[id]).toMatchObject({ body: '' });
    expect(sessions.graph.rootCanvas.placements.map((p) => [p.kind, p.id])).toEqual(ids.map((id) => ['doc', id]));
    const edges = [
      { from: ids[0], to: ids[1] },
      { from: ids[1], to: ids[2] },
    ];
    expect(sessions.graph.rootCanvas.edges).toEqual(edges);

    expect(events.map((e) => e.type)).toEqual([
      'doc_created', 'doc_placed', 'doc_created', 'doc_placed', 'doc_created', 'doc_placed', 'diagram_created',
    ]);
    expect(events.at(-1)).toEqual({ type: 'diagram_created', canvasId: ROOT_CANVAS_ID, docIds: ids, edges });
  });

  it("places on a doc's child canvas and stores edges there", async () => {
    const sessions = manager(okGenerator);
    const host = sessions.createDoc(ROOT_CANVAS_ID, 'Host', { x: 0, y: 0 });
    await sessions.requestDiagram(host, 'x');
    expect(sessions.graph.docs[host].canvas.placements).toHaveLength(3);
    expect(sessions.graph.docs[host].canvas.edges).toHaveLength(2);
    expect(sessions.graph.rootCanvas.edges).toEqual([]);
  });

  it('never collides ids across two generations of the same diagram', async () => {
    const sessions = manager(okGenerator);
    await sessions.requestDiagram(ROOT_CANVAS_ID, 'x');
    await sessions.requestDiagram(ROOT_CANVAS_ID, 'x');
    expect(Object.keys(sessions.graph.docs)).toHaveLength(6);
    expect(sessions.graph.rootCanvas.placements).toHaveLength(6);
  });

  it('rejects an unknown canvas without calling the generator', async () => {
    const generate = vi.fn(okGenerator);
    const sessions = manager(generate);
    await expect(sessions.requestDiagram('nope', 'x')).rejects.toThrow(/unknown canvas/);
    expect(generate).not.toHaveBeenCalled();
    expect(sessions.graph.docs).toEqual({});
  });

  it('persists', async () => {
    vi.useFakeTimers();
    const sessions = manager(okGenerator);
    let saves = 0;
    sessions.setSaveHandler(async () => { saves++; });
    await sessions.requestDiagram(ROOT_CANVAS_ID, 'x');
    await vi.advanceTimersByTimeAsync(600);
    expect(saves).toBe(1);
  });
});
