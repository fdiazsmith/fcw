// E2E smoke: real server + real WS. Create chats -> compact -> stale -> regenerate
// -> user edit -> move -> restart -> verify persistence.
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

// 2. compact them
ws.send(JSON.stringify({ type: 'chat_compact_requested', chatIds: [c1, c2] }));
const created = await until(received, (m) => m.type === 'chat_compaction_created', 'compaction_created');
if (created.compaction.status !== 'generating') fail('created status not generating');
if (created.compaction.memberIds.join() !== [c1, c2].join()) fail('memberIds mismatch');
const doc1 = await until(received, (m) => m.type === 'chat_compaction_document', 'document');
if (doc1.status !== 'idle') fail('doc status not idle');
if (!doc1.document.includes('discuss auth design')) fail('structural doc missing member content');
if (!doc1.sourceDigest) fail('no sourceDigest');
const cmpId = created.compaction.id;
console.log('OK compact -> document generated:', JSON.stringify(doc1.document.slice(0, 60)) + '…');

// 3. member changes -> regenerate picks up new content and fresh digest
ws.send(JSON.stringify({ type: 'chat_prompt_submitted', chatId: c1, content: 'new decision: use PKCE' }));
await until(received, (m) => m.type === 'chat_user_message' && m.message.content.includes('PKCE'), 'new msg');
ws.send(JSON.stringify({ type: 'chat_compaction_regenerate_requested', compactionId: cmpId }));
const regenStart = await until(
  received,
  (m) => m.type === 'chat_compaction_document' && m.status === 'generating',
  'regen generating broadcast',
);
const doc2 = await until(
  received,
  (m) => m.type === 'chat_compaction_document' && m.status === 'idle' && m.document.includes('PKCE'),
  'regenerated doc',
);
if (doc2.sourceDigest === doc1.sourceDigest) fail('digest did not change after regen');
console.log('OK regenerate -> doc includes new content, digest refreshed', regenStart.status);

// 4. user edit + move
ws.send(JSON.stringify({ type: 'chat_compaction_document_updated', compactionId: cmpId, document: '# Hand edited' }));
await until(received, (m) => m.type === 'chat_compaction_document' && m.document === '# Hand edited', 'edit echo');
ws.send(JSON.stringify({ type: 'chat_compaction_move_requested', compactionId: cmpId, position: { x: 77, y: 88 } }));
await new Promise((r) => setTimeout(r, 700)); // debounced save
console.log('OK edit + move accepted');

// 5. persistence across restart
ws.close();
await app.stop();
const files = readdirSync(storageDir).filter((f) => f.endsWith('.fcw2.json'));
if (files.length !== 1) fail(`expected 1 fcw2 doc, got ${files.length}`);
const persisted = JSON.parse(readFileSync(join(storageDir, files[0]), 'utf-8'));
const savedCmp = persisted.compactions?.[cmpId];
if (!savedCmp) fail('compaction not persisted');
if (savedCmp.document !== '# Hand edited') fail('edited document not persisted');
if (savedCmp.position.x !== 77) fail('moved position not persisted');
console.log('OK persisted to disk');

app = createApp({ port: PORT, storageDir, title: 'Smoke' });
await app.start();
({ ws, received } = await connect());
const snap = await until(received, (m) => m.type === 'chat_snapshot', 'snapshot after restart');
if (!snap.graph.compactions?.[cmpId]) fail('snapshot after restart missing compaction');
if (snap.graph.compactions[cmpId].document !== '# Hand edited') fail('restart lost the edit');
console.log('OK restart -> snapshot carries the compaction');

ws.close();
await app.stop();
console.log('SMOKE PASSED');
process.exit(0);
