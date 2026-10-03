// M2.11: startup logs never leak any part of the API key.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.js';

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
