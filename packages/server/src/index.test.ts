// M2.11: startup logs never leak any part of the API key.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.js';
import type { StreamTurnFn } from './turn-events.js';

describe('createApp startup logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs only that the API key is set, never any of its characters', () => {
    const key = 'sk-ant-SECRETKEYMATERIAL123456';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const app = createApp({ storageDir: mkdtempSync(join(tmpdir(), 'fcw-idx-')), anthropicApiKey: key });
    app.manager.destroy();
    app.wss.close();

    const output = log.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(output).toContain('[init] API key: set');
    expect(output).not.toContain('sk-ant');
    expect(output).not.toContain('SECRET');
  });
});

describe('createApp engines override', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers a keyless chat prompt with the injected stream text', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const fake: StreamTurnFn = async function* (ctx) {
      yield { type: 'text_delta', text: 'Drafted: ' };
      yield { type: 'text_delta', text: ctx.latest };
    };
    const app = createApp({
      storageDir: mkdtempSync(join(tmpdir(), 'fcw-idx-')),
      anthropicApiKey: '',
      engines: { api: fake },
    });
    const id = app.chatSessions.createChat({ x: 0, y: 0 });
    await app.chatSessions.prompt(id, 'hello');
    app.manager.destroy();
    app.wss.close();

    const last = app.chatSessions.graph.chats[id].messages.at(-1);
    expect(last).toMatchObject({ role: 'assistant', content: 'Drafted: hello' });
  });
});
