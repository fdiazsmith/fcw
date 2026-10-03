// Boots the real FCW server for e2e: keyless (no model calls), a fresh temp
// storage dir per run, and a scripted chat engine (M4.0) so assistant replies
// are deterministic: `Drafted: <prompt>` streamed as three text deltas.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.ANTHROPIC_API_KEY = '';

const { createApp } = await import('../packages/server/dist/index.js');
const storageDir = mkdtempSync(join(tmpdir(), 'fcw-e2e-'));

// Expose the storage dir to specs (e.g. projects.spec.ts inspects `.trash/`).
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-results');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'e2e-storage-dir.txt'), storageDir);

async function* scriptedTurn(ctx) {
  const words = `Drafted: ${ctx.latest}`.split(' ');
  const size = Math.ceil(words.length / 3);
  for (let i = 0; i < words.length; i += size) {
    const chunk = words.slice(i, i + size).join(' ');
    yield { type: 'text_delta', text: i === 0 ? chunk : ` ${chunk}` };
  }
}

const app = createApp({
  port: 8009,
  storageDir,
  title: 'e2e',
  engines: { api: scriptedTurn },
});
await app.start();
console.log(`[e2e] FCW server on 8009, storage ${storageDir}`);
