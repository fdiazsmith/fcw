import { describe, it, expect } from 'vitest';
import { validateMermaid, createDiagramGenerator } from './diagram-gen.js';

const GOOD = 'graph TD\nA[One] --> B[Two]';
const BAD = 'graph TD\nA --- B';

function fake(replies: Array<string | Error>) {
  const calls: Array<{ system: string; messages: Array<{ role: string; content: string }> }> = [];
  const createMessage = async (params: (typeof calls)[number]) => {
    calls.push(params);
    const next = replies[calls.length - 1];
    if (next instanceof Error) throw next;
    return { content: [{ type: 'text', text: next }] };
  };
  return { calls, createMessage: createMessage as never };
}

describe('createDiagramGenerator', () => {
  it('returns pasted Mermaid directly with no API call', async () => {
    const f = fake([]);
    const r = await createDiagramGenerator({ apiKey: 'k', createMessage: f.createMessage }).generate(GOOD);
    expect(r.ok).toBe(true);
    expect(f.calls).toHaveLength(0);
  });

  it('fails without calling when there is no api key', async () => {
    const f = fake([GOOD]);
    const r = await createDiagramGenerator({ createMessage: f.createMessage }).generate('a login flow');
    expect(r).toEqual({ ok: false, raw: '', error: 'no api key' });
    expect(f.calls).toHaveLength(0);
  });

  it('makes one call when the first reply is valid (fenced ok)', async () => {
    const f = fake(['```mermaid\n' + GOOD + '\n```']);
    const r = await createDiagramGenerator({ apiKey: 'k', createMessage: f.createMessage }).generate('a flow');
    expect(r.ok).toBe(true);
    expect(f.calls).toHaveLength(1);
  });

  it('retries once with the parse error', async () => {
    const f = fake([BAD, GOOD]);
    const r = await createDiagramGenerator({ apiKey: 'k', createMessage: f.createMessage }).generate('a flow');
    expect(r.ok).toBe(true);
    expect(f.calls).toHaveLength(2);
    const retry = JSON.stringify(f.calls[1].messages);
    expect(retry).toContain('A --- B');
    expect(retry).toContain('not supported');
  });

  it('returns the second raw reply after two failures', async () => {
    const second = 'graph TD\nX -.-> Y';
    const f = fake([BAD, second]);
    const r = await createDiagramGenerator({ apiKey: 'k', createMessage: f.createMessage }).generate('a flow');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.raw).toBe(second);
      expect(r.error).toContain('X -.-> Y');
    }
    expect(f.calls).toHaveLength(2);
  });

  it('fails softly when the API throws', async () => {
    const f = fake([new Error('boom')]);
    const r = await createDiagramGenerator({ apiKey: 'k', createMessage: f.createMessage }).generate('a flow');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('boom');
    expect(f.calls).toHaveLength(1);
  });

  it('system prompt states the subset and forbids subgraph', async () => {
    const f = fake([GOOD]);
    await createDiagramGenerator({ apiKey: 'k', createMessage: f.createMessage }).generate('a flow', {
      context: 'extra',
    });
    expect(f.calls[0].system).toContain('graph TD');
    expect(f.calls[0].system).toContain('-->');
    expect(f.calls[0].system).toMatch(/subgraph/);
    expect(JSON.stringify(f.calls[0].messages)).toContain('extra');
  });
});

describe('validateMermaid', () => {
  it('accepts the supported subset', () => {
    const r = validateMermaid('graph TD\n  A[Start] --> B[End]');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.graph.edges).toEqual([{ from: 'A', to: 'B' }]);
  });

  it('extracts a fenced mermaid block', () => {
    const r = validateMermaid('Here:\n```mermaid\ngraph TD\nA --> B\n```\nDone');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mermaid).toBe('graph TD\nA --> B');
  });

  it('rejects zero nodes', () => {
    const r = validateMermaid('graph TD');
    expect(r.ok).toBe(false);
  });

  it.each(['A --- B', 'A -.-> B', 'A ==> B', 'A -->|yes| B', 'A(Round) --> B', 'A{Q} --> B', 'subgraph X', 'end'])(
    'rejects unsupported line %s, naming the line',
    (line) => {
      const r = validateMermaid(`graph TD\nA --> B\n${line}`);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(line);
    },
  );
});
