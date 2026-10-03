import { describe, it, expect } from 'vitest';
import { validateMermaid } from './diagram-gen.js';

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
