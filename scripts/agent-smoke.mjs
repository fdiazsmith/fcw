// Real-SDK smoke gate for the agent engine. Not run by vitest (needs a local
// Claude Code install + ANTHROPIC_API_KEY). Run via `npm run smoke:agent`.
//
// Exercises the two riskiest paths the mocked tests can't reach:
//   1. createAgentTurnStream with a real query() — asserts a `session` event
//      and at least one `text_delta`.
//   2. createCapabilitiesProvider — asserts it resolves (or documents why not).
//
// Exit 0 on PASS, 1 on FAIL. Failures here are actionable: check `claude`
// is on PATH and `ANTHROPIC_API_KEY` is set in .env.local.
import { createAgentTurnStream } from '../packages/server/dist/chat-agent-adapter.js';
import { createCapabilitiesProvider } from '../packages/server/dist/capabilities.js';

const cwd = process.argv[2] ?? process.cwd();

async function smokeTurn() {
  const stream = createAgentTurnStream();
  const ctx = {
    context: [{ role: 'user', content: 'Reply with exactly the word OK.', createdAt: new Date().toISOString() }],
    latest: 'Reply with exactly the word OK.',
    settings: { engine: 'agent', cwd },
    sessionId: undefined, // fresh session -> preamble path, no resume
    attachments: [],
    waitForPermission: async () => ({ behavior: 'allow' }),
    signal: new AbortController().signal,
  };
  let sawSession = false;
  let text = '';
  let events = 0;
  for await (const ev of stream(ctx)) {
    if (ev.type === 'session') sawSession = true;
    if (ev.type === 'text_delta') text += ev.text;
    if (events > 50_000) throw new Error('runaway stream — >50k events');
  }
  console.log(`[smoke:turn] events=${events} session=${sawSession} text=${JSON.stringify(text.slice(0, 80))}`);
  if (!sawSession) throw new Error('no session event emitted');
  if (!text.trim()) throw new Error('no text_delta emitted');
  return true;
}

async function smokeCaps() {
  const caps = await createCapabilitiesProvider()();
  console.log(`[smoke:caps] models=${caps.models.length} commands=${caps.commands.length}`);
  if (caps.models.length === 0) console.warn('[smoke:caps] WARNING: no models reported');
  return true;
}

const [turnOk, capsOk] = await Promise.all([smokeTurn(), smokeCaps()]).catch((err) => {
  console.error('[smoke] FAIL:', err);
  process.exit(1);
});
if (turnOk && capsOk) {
  console.log('[smoke] PASS');
  process.exit(0);
}
console.error('[smoke] FAIL: unexpected');
process.exit(1);
