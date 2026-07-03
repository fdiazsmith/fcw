// TDD for the root deps-guard script. Lives in the server workspace so it
// runs under the existing vitest install; the script itself is repo-root
// tooling (see scripts/check-deps.mjs) and is imported by relative path.
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';

// The script is written next; import lazily so the RED cycle can observe a
// missing-module failure before the impl exists.
const ROOT = join(__dirname, '..', '..', '..');

describe('findMissingDeps', () => {
  it('reports a declared dependency that is not installed', async () => {
    const { findMissingDeps } = await import(join(ROOT, 'scripts', 'check-deps.mjs'));
    // packages/server declares @anthropic-ai/claude-agent-sdk; the injected
    // exists() claims it's absent -> it must be flagged.
    const result = findMissingDeps({
      root: ROOT,
      exists: (p: string) => !p.endsWith('node_modules/@anthropic-ai/claude-agent-sdk'),
      workspaces: ['packages/server'],
    });
    expect(result.missing.map((m: { workspace: string; dep: string }) => m.dep)).toContain(
      '@anthropic-ai/claude-agent-sdk',
    );
    expect(result.missing.every((m: { workspace: string; dep: string }) => m.workspace === 'server')).toBe(true);
  });

  it('reports OK when every declared dependency is installed', async () => {
    const { findMissingDeps } = await import(join(ROOT, 'scripts', 'check-deps.mjs'));
    const result = findMissingDeps({
      root: ROOT,
      exists: () => true,
      workspaces: ['packages/server'],
    });
    expect(result.missing).toEqual([]);
    expect(result.checked).toBeGreaterThan(0);
  });
});
