import { describe, it, expect, vi } from 'vitest';
import { createCapabilitiesProvider } from './capabilities.js';

function fakeQuery(models: unknown[], commands: unknown[], calls: { models: number; commands: number }) {
  const interrupt = vi.fn(async () => {});
  const close = vi.fn();
  return () =>
    ({
      supportedModels: vi.fn(async () => {
        calls.models += 1;
        return models;
      }),
      supportedCommands: vi.fn(async () => {
        calls.commands += 1;
        return commands;
      }),
      interrupt,
      close,
    }) as never;
}

describe('createCapabilitiesProvider', () => {
  it('maps model value/displayName and command name/description', async () => {
    const calls = { models: 0, commands: 0 };
    const provider = createCapabilitiesProvider(
      fakeQuery(
        [{ value: 'claude-opus-4-8', displayName: 'Claude Opus 4.8', description: 'x' }],
        [{ name: 'review', description: 'review a PR', argumentHint: '' }],
        calls,
      ),
    );
    const caps = await provider();
    expect(caps.models).toEqual([{ id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' }]);
    expect(caps.commands).toEqual([{ name: 'review', description: 'review a PR' }]);
  });

  it('caches the result across calls', async () => {
    const calls = { models: 0, commands: 0 };
    const provider = createCapabilitiesProvider(fakeQuery([], [], calls));
    await provider();
    await provider();
    expect(calls.models).toBe(1);
    expect(calls.commands).toBe(1);
  });

  it('rejects and tears down the query when supportedModels hangs', async () => {
    const interrupt = vi.fn(async () => {});
    const close = vi.fn();
    const hangingQuery = () =>
      ({
        supportedModels: vi.fn(() => new Promise(() => {})), // never resolves
        supportedCommands: vi.fn(async () => []),
        interrupt,
        close,
      }) as never;
    const provider = createCapabilitiesProvider(hangingQuery, { timeoutMs: 50 });
    await expect(provider()).rejects.toThrow(/timed out/i);
    expect(interrupt).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });
});
