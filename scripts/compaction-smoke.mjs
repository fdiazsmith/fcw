// E2E smoke: real server + real WS, doc_* protocol (M2.3). Create chats ->
// compact into a generated doc -> stale -> regenerate -> user edit -> move ->
// restart -> verify persistence.
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createApp } from '../packages/server/dist/index.js';

const PORT = 8123;
const storageDir = mkdtempSync(join(tmpdir(), 'fcw-smoke-'));
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}`);
    const received = [];
    ws.on('message', (raw) => received.push(JSON.parse(raw.toString())));
    ws.on('open', () => resolve({ ws, received }));
    ws.on('error', reject);
  });
}

const until = async (received, pred, what, ms = 5000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const found = received.find(pred);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 25));
  }
  fail(`timed out waiting for ${what}; got: ${received.map((m) => m.type).join(', ')}`);
};

// ── boot keyless so the structural generator runs ──
process.env.ANTHROPIC_API_KEY = '';
let app = createApp({ port: PORT, storageDir, title: 'Smoke' });
await app.start();
let { ws, received } = await connect();

// 1. two chats with content
ws.send(JSON.stringify({ type: 'chat_create_requested', position: { x: 0, y: 0 } }));
ws.send(JSON.stringify({ type: 'chat_create_requested', position: { x: 400, y: 100 } }));
await until(received, () => received.filter((m) => m.type === 'chat_created').length === 2, '2 chats');
const [c1, c2] = received.filter((m) => m.type === 'chat_created').map((m) => m.chat.id);
ws.send(JSON.stringify({ type: 'chat_prompt_submitted', chatId: c1, content: 'discuss auth design' }));
ws.send(JSON.stringify({ type: 'chat_prompt_submitted', chatId: c2, content: 'discuss token storage' }));
await until(received, () => received.filter((m) => m.type === 'chat_user_message').length === 2, 'prompts');

// 2. compact them -> a generated doc on root, chats on its child canvas
ws.send(JSON.stringify({ type: 'chat_compact_requested', chatIds: [c1, c2] }));
const created = await until(received, (m) => m.type === 'doc_created', 'doc_created');
if (created.doc.generated?.status !== 'generating') fail('created doc not generating');
if (created.doc.canvas.placements.map((p) => p.id).join() !== [c1, c2].join()) fail('member placements mismatch');
const docId = created.doc.id;
await until(
  received,
  (m) => m.type === 'doc_placed' && m.canvasId === 'root' && m.placement.id === docId,
  'doc_placed on root',
);
const doc1 = await until(received, (m) => m.type === 'doc_updated' && m.docId === docId && m.body, 'generated body');
if (doc1.generated?.status !== 'idle') fail('doc status not idle');
if (!doc1.body.includes('discuss auth design')) fail('structural body missing member content');
if (!doc1.generated.sourceDigest) fail('no sourceDigest');
console.log('OK compact -> generated doc:', JSON.stringify(doc1.body.slice(0, 60)) + '…');

// 3. member changes (stale) -> regenerate picks up new content and fresh digest
ws.send(JSON.stringify({ type: 'chat_prompt_submitted', chatId: c1, content: 'new decision: use PKCE' }));
await until(received, (m) => m.type === 'chat_user_message' && m.message.content.includes('PKCE'), 'new msg');
ws.send(JSON.stringify({ type: 'doc_regenerate_requested', docId }));
const regenStart = await until(
  received,
  (m) => m.type === 'doc_updated' && m.generated?.status === 'generating',
  'regen generating broadcast',
);
const doc2 = await until(
  received,
  (m) => m.type === 'doc_updated' && m.generated?.status === 'idle' && m.body?.includes('PKCE'),
  'regenerated doc',
);
if (doc2.generated.sourceDigest === doc1.generated.sourceDigest) fail('digest did not change after regen');
console.log('OK stale -> regenerate -> body includes new content, digest refreshed', regenStart.generated.status);

// 4. user edit + move
ws.send(JSON.stringify({ type: 'doc_update_requested', docId, body: '# Hand edited' }));
await until(received, (m) => m.type === 'doc_updated' && m.body === '# Hand edited', 'edit echo');
ws.send(JSON.stringify({ type: 'doc_move_requested', canvasId: 'root', kind: 'doc', id: docId, position: { x: 77, y: 88 } }));
await until(received, (m) => m.type === 'doc_moved' && m.id === docId && m.position.x === 77, 'doc_moved');
await new Promise((r) => setTimeout(r, 700)); // debounced save
console.log('OK edit + move accepted');

// 5. persistence across restart
ws.close();
await app.stop();
const files = readdirSync(storageDir).filter((f) => f.endsWith('.fcw2.json'));
if (files.length !== 1) fail(`expected 1 fcw2 doc, got ${files.length}`);
const persisted = JSON.parse(readFileSync(join(storageDir, files[0]), 'utf-8'));
const savedDoc = persisted.docs?.[docId];
if (!savedDoc) fail('doc not persisted');
if (savedDoc.body !== '# Hand edited') fail('edited body not persisted');
if (savedDoc.generated?.sourceDigest !== doc2.generated.sourceDigest) fail('digest not persisted');
const savedPlacement = persisted.rootCanvas?.placements.find((p) => p.id === docId);
if (savedPlacement?.position.x !== 77) fail('moved position not persisted');
console.log('OK persisted to disk');

app = createApp({ port: PORT, storageDir, title: 'Smoke' });
await app.start();
({ ws, received } = await connect());
const snap = await until(received, (m) => m.type === 'chat_snapshot', 'snapshot after restart');
if (snap.graph.docs?.[docId]?.body !== '# Hand edited') fail('restart lost the edit');
if (!snap.graph.rootCanvas.placements.some((p) => p.id === docId && p.position.x === 77)) fail('restart lost the move');
console.log('OK restart -> snapshot carries the doc');

ws.close();
await app.stop();
console.log('SMOKE PASSED');
process.exit(0);
