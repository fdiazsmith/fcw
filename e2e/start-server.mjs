// Boots the real FCW server for e2e: keyless (no model calls) and with a
// fresh temp storage dir per run, so tests never touch packages/server/data.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.ANTHROPIC_API_KEY = '';

const { createApp } = await import('../packages/server/dist/index.js');
const storageDir = mkdtempSync(join(tmpdir(), 'fcw-e2e-'));
const app = createApp({ port: 8009, storageDir, title: 'e2e' });
await app.start();
console.log(`[e2e] FCW server on 8009, storage ${storageDir}`);
