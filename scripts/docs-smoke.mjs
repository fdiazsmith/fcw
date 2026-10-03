// E2E smoke (M2.7): real server, real WS, real API key from .env.local.
// Pasted diagram -> generated diagram -> compact two chats -> doc-chat +
// apply to doc -> restart -> verify persistence. Costs real API calls.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createApp } from '../packages/server/dist/index.js';

const PORT = 8124;
const storageDir = mkdtempSync(join(tmpdir(), 'fcw-docs-smoke-'));
const t0 = Date.now();
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};
if (!process.env.ANTHROPIC_API_KEY) fail('ANTHROPIC_API_KEY not set (expected in .env.local)');

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
    const err = received.find((m) => m.type === 'chat_error');
    if (err) fail(`server error while waiting for ${what}: ${JSON.stringify(err)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
  fail(`timed out waiting for ${what}; got: ${received.map((m) => m.type).join(', ')}`);
};
const send = (ws, msg) => ws.send(JSON.stringify(msg));

let app = createApp({ port: PORT, storageDir, title: 'Docs smoke' });
await app.start();
let { ws, received } = await connect();
await until(received, (m) => m.type === 'chat_snapshot', 'initial snapshot');

// 1. pasted Mermaid -> parsed without the model
const pasted = 'graph TD\n  A[Client] --> B[API]\n  B --> C[Database]\n  B --> D[Cache]';
send(ws, { type: 'diagram_requested', canvasId: 'root', prompt: pasted });
const d1 = await until(received, (m) => m.type === 'diagram_created', 'diagram_created (pasted)');
if (d1.error) fail(`pasted diagram errored: ${d1.error}`);
if (d1.docIds.length !== 4 || d1.edges.length !== 3) fail(`pasted: expected 4 boxes/3 edges, got ${d1.docIds.length}/${d1.edges.length}`);
console.log(`OK pasted Mermaid -> ${d1.docIds.length} boxes, ${d1.edges.length} edges`);

// 2. natural-language prompt -> model writes Mermaid (fallback is a WARN, not a FAIL)
send(ws, { type: 'diagram_requested', canvasId: 'root', prompt: 'sign-in flow for a web app, 4-6 steps' });
const d2 = await until(
  received,
  (m) => m.type === 'diagram_created' && m !== d1,
  'diagram_created (generated)',
  120_000,
);
if (d2.error) {
  console.log(`WARN !!! generated diagram came back as RAW FALLBACK (${d2.docIds.length} box): ${d2.error}`);
} else {
  console.log(`OK generated diagram parsed -> ${d2.docIds.length} boxes, ${d2.edges.length} edges`);
}

// 3. two prompted chats -> compact -> generated doc with a body
send(ws, { type: 'chat_create_requested', position: { x: 0, y: 600 } });
send(ws, { type: 'chat_create_requested', position: { x: 400, y: 600 } });
await until(received, () => received.filter((m) => m.type === 'chat_created').length === 2, '2 chats');
const [c1, c2] = received.filter((m) => m.type === 'chat_created').map((m) => m.chat.id);
send(ws, { type: 'chat_prompt_submitted', chatId: c1, content: 'In one sentence: why use PKCE for a SPA?' });
send(ws, { type: 'chat_prompt_submitted', chatId: c2, content: 'In one sentence: where should a SPA store tokens?' });
for (const id of [c1, c2]) {
  await until(received, (m) => m.type === 'chat_stream_completed' && m.chatId === id, `reply in ${id}`, 90_000);
}
send(ws, { type: 'chat_compact_requested', chatIds: [c1, c2] });
const created = await until(received, (m) => m.type === 'doc_created' && m.doc.generated, 'generated doc_created');
const genId = created.doc.id;
const gen = await until(
  received,
  (m) => m.type === 'doc_updated' && m.docId === genId && m.generated?.status === 'idle',
  'generated body',
  120_000,
);
if (!gen.body) fail('generated doc has an empty body');
const structural = gen.body.startsWith('## ') && gen.body.includes('**User:**');
console.log(
  structural
    ? 'WARN !!! compaction body is the STRUCTURAL fallback (model call failed)'
    : `OK compact -> LLM doc body (${gen.body.length} chars)`,
);

// 4. doc-chat on a diagram box -> prompt -> apply reply to the doc
const boxId = d1.docIds[1];
send(ws, { type: 'doc_chat_requested', docId: boxId });
const ready = await until(received, (m) => m.type === 'doc_chat_ready' && m.docId === boxId, 'doc_chat_ready');
const docChat = ready.chatId;
send(ws, { type: 'chat_prompt_submitted', chatId: docChat, content: 'Write two sentences for this doc.' });
const reply = await until(
  received,
  (m) => m.type === 'chat_stream_completed' && m.chatId === docChat,
  'doc-chat reply',
  90_000,
);
const messageIndex = received.filter(
  (m) => m.chatId === docChat && ['chat_user_message', 'chat_tool_message', 'chat_stream_completed'].includes(m.type),
).length - 1;
send(ws, { type: 'doc_apply_requested', docId: boxId, chatId: docChat, messageIndex });
const applied = await until(received, (m) => m.type === 'doc_updated' && m.docId === boxId && m.body !== undefined, 'doc_updated (apply)');
if (applied.body !== reply.message.content) fail('applied body differs from the reply');
console.log(`OK doc-chat reply applied to "${boxId}": ${JSON.stringify(applied.body.slice(0, 80))}…`);

// 5. restart on the same storageDir -> snapshot carries everything
await new Promise((r) => setTimeout(r, 700)); // debounced save
ws.close();
await app.stop();
app = createApp({ port: PORT, storageDir, title: 'Docs smoke' });
await app.start();
({ ws, received } = await connect());
const snap = await until(received, (m) => m.type === 'chat_snapshot', 'snapshot after restart');
const g = snap.graph;
const allDocIds = [...d1.docIds, ...d2.docIds, genId];
const missing = allDocIds.filter((id) => !g.docs?.[id]);
if (missing.length) fail(`restart lost docs: ${missing.join(', ')}`);
if (g.docs[boxId].body !== applied.body) fail('restart lost the applied body');
const onRoot = new Set(g.rootCanvas.placements.filter((p) => p.kind === 'doc').map((p) => p.id));
const unplaced = allDocIds.filter((id) => !onRoot.has(id));
if (unplaced.length) fail(`restart lost root placements: ${unplaced.join(', ')}`);
const edgeKey = (e) => `${e.from}->${e.to}`;
const savedEdges = new Set(g.rootCanvas.edges.map(edgeKey));
const lostEdges = [...d1.edges, ...d2.edges].filter((e) => !savedEdges.has(edgeKey(e)));
if (lostEdges.length) fail(`restart lost edges: ${lostEdges.map(edgeKey).join(', ')}`);
if (g.chats?.[docChat]?.docId !== boxId) fail('restart lost the doc-chat binding');
console.log(`OK restart -> ${allDocIds.length} docs, applied body, root placements, ${savedEdges.size} edges`);

ws.close();
await app.stop();
console.log(`SMOKE PASSED in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(0);
