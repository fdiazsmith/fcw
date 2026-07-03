// WI-1 guard: server tests must resolve @fcw/graph-core to its SOURCE, not a
// possibly-stale dist. The probe is exported from graph-core src only; if the
// vitest alias is removed AND dist is stale, this fails — re-add the alias.
import { describe, it, expect } from 'vitest';

describe('graph-core source resolution (WI-1)', () => {
  it('resolves @fcw/graph-core to source, not stale dist', async () => {
    const mod = await import('@fcw/graph-core');
    expect((mod as { __graphCoreSrcProbe?: boolean }).__graphCoreSrcProbe).toBe(true);
  });
});
