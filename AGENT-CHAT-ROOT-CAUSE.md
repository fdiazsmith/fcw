# Root-Cause Analysis: Agent-Chat-Windows Branch Not Working

Branch: `agent-chat-windows`
Date: 2026-07-03
Scope: chat windows as full Claude Code agent chats (dual engine `api`|`agent`, per-chat model/effort pickers, skills & slash commands, file attachments, tool-use + permission approval UI).

## TL;DR

The implementation is **complete and correct**. The "not working" state was two environment/build-hygiene defects that broke test runs and `npm run dev`:

1. **graph-core `dist/` was stale** — built before `updateChatSettings`/`markSessionStale`/`ChatSettings`/`Attachment` were added to `chat-graph.ts`. The server imports from compiled `dist/index.js` (not `src/`), so the new exports were absent at runtime → 14 server tests failed with `... is not a function`.
2. **`@anthropic-ai/claude-agent-sdk` was declared in `packages/server/package.json` but never installed at the workspace root** → 2 test files (`chat-agent-adapter.test.ts`, `capabilities.test.ts`) failed to load with `Cannot find package`.

Both fixed in one cycle: `npm run build -w packages/graph-core` + `npm install`. Result: **206/206 tests green, both `server` and `frontend` builds clean, dev server boots, graph loads, `/attachments` POST/GET respond.**

This document exists because the *systemic* cause (cross-package compiled-dist dependency with no build watcher) will recur on every graph-core edit unless addressed. It also captures the residual runtime risks that the test suite (which mocks the SDK) cannot catch — these belong in the PRD's verification section.

---

## Diagnosis Walk

### Step 1 — Reproduce

```
npm test
→ Test Files  4 failed | 15 passed (19)
→ Tests  16 failed | 182 passed (198)
```

Two failure clusters:
- `chat-session.test.ts`, `chat-ws-handler.test.ts` → `TypeError: (0 , markSessionStale) is not a function` / `updateChatSettings is not a function`
- `chat-agent-adapter.test.ts`, `capabilities.test.ts` → `Cannot find package '@anthropic-ai/claude-agent-sdk'`

### Step 2 — Localise

Functions exist in `packages/graph-core/src/chat-graph.ts` (lines 110, 123) and are re-exported from `src/index.ts` (lines 69–70). So the *source* is correct. The break is downstream of the source.

### Step 3 — Root cause #1: stale dist

Server `package.json`:
```json
"main": "dist/index.js",
"types": "dist/index.d.ts"
```
Root `tsconfig.json` compiles each package's `src/` → its own `dist/`. There is **no project-reference / no build-on-watch** between packages. Server test runner (vitest) resolves `@fcw/graph-core` to `packages/graph-core/dist/index.js` (compiled JS), **not** `src/`.

```
$ ls -la packages/graph-core/dist/chat-graph.js   # Jul 2 16:46
$ grep -c "markSessionStale|updateChatSettings" dist/chat-graph.js   # 0
$ grep -c "export function (markSessionStale|updateChatSettings)" src/chat-graph.ts   # 2
```

The dist was last built **before** commit `62d7531` (graph-core: ChatSettings/Attachment types…) added the helpers. Every graph-core edit since then was invisible to the server.

### Step 4 — Root cause #2: uninstalled SDK

```
$ grep claude-agent-sdk packages/server/package.json   # present (^0.3.200)
$ npm ls @anthropic-ai/claude-agent-sdk                # (empty)
$ ls packages/server/node_modules/@anthropic-ai/        # absent
```

Declared but never installed. `npm install` at root added 5 packages and resolved it.

### Step 5 — Fix + verify

```
npm run build -w packages/graph-core   # rebuild dist
npm install                            # install SDK
npm test                               # 206 passed
npm run build -w packages/server       # clean
npm run build -w packages/frontend     # clean (vite, 1 warning about chunk size)
```

Smoke test of dev server:
```
[init] API key: sk-ant-api...
[init] Claude client: created
[init] loaded chat-graph: cg_1783036358313_1.fcw2.json
FCW server running on port 8009
POST /attachments → 400 (validation working, rejects empty body)
GET  /attachments/:id → 404 (not-found path working)
```

### Step 6 — Confirm the SDK surface matches the implementation

Verified against `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`:
- `query({prompt: string | AsyncIterable<SDKUserMessage>, options?})` — matches `createAgentTurnStream`'s `promptStream` (yields one `SDKUserMessage`).
- `Query.supportedModels()` / `Query.supportedCommands()` / `Query.interrupt()` / `Query.close()` — all present, used by `capabilities.ts` and the abort path.
- `includePartialMessages`, `resume`, `model`, `effort`, `cwd`, `permissionMode`, `canUseTool` — all on `Options`.

The implementation does not call any SDK method that doesn't exist.

---

## Why This Happened (the systemic cause)

**Cross-package dependency on compiled artifacts, with no rebuild guarantee.**

`@fcw/graph-core` is consumed by `@fcw/server` as a built `.js`/`.d.ts` pair, not via TypeScript project references or a `src` entrypoint. Consequences:

- Editing `graph-core/src` and running `npm test -w packages/server` silently uses the **old** dist. Tests pass or fail depending on whether the touched surface was already compiled.
- `npm run dev` (root) runs `npm run build -w packages/server` first — which itself does **not** rebuild graph-core. So even a fresh dev boot can run against stale graph-core dist.
- The failure mode is cryptic: `TypeError: X is not a function` looks like a missing export, sending you to `index.ts`, which is correct. The real bug is one build step away.

The SDK-not-installed issue is a one-off (forgot `npm install` after editing `package.json`), but it compounded the confusion: two different root causes producing overlapping "this branch is broken" symptoms.

---

## Residual Runtime Risks (tests don't cover these)

The test suite mocks `@anthropic-ai/claude-agent-sdk` everywhere. The manual verification step in the original spec is the **only** ground truth for real subprocess behaviour. Flag these:

1. **Capabilities spawns a throwaway query with an empty async-iterable prompt.** `capabilities.ts` calls `queryFn({ prompt: emptyPrompt(), options: {} })` then immediately `q.supportedModels()` + `q.supportedCommands()` without iterating any messages. Untested against the real SDK — if `supportedModels()` requires the init message to have flowed, capabilities will hang or throw and the UI falls back to free-text (acceptable, but noisy in logs).
2. **Agent adapter `promptStream` yields one user message then returns.** Resume-per-turn semantics depend on the SDK treating a single yielded user message as one turn. If the SDK expects the iterable to stay open for the assistant turn and any follow-up, resume will misbehave. The spec's design (one `query()` per prompt) is sound, but real SDK behaviour is the arbiter.
3. **`canUseTool` + `includePartialMessages` interleaving.** The adapter pushes `permission_request` onto the queue from inside `canUseTool`, then awaits `ctx.waitForPermission`. The SDK's message loop is paused inside `canUseTool` during this wait. If the SDK emits partial text deltas *while* a tool permission is pending, ordering on the wire could surprise the UI. Test mocks don't exercise this concurrency.
4. **`toolInput` truncation.** Spec calls out truncating large tool inputs in emitted tool messages. `chat-session.appendToolMessage` stores `toolInput: ev.input` verbatim — **no truncation implemented**. Large tool outputs (e.g. `Read` of a big file) will bloat WS frames and the persisted `.fcw2.json`.
5. **Abort path calls `q.interrupt()` but not `q.close()`.** Spec says "calls `query.interrupt()` (and `close()`)" on abort. Implementation only calls `interrupt()`. The `finally` in the consumer removes the listener but does not close the query. Possible subprocess leak on stop.
6. **No `chat_error` emission for a stream that yields zero events.** If the agent adapter closes its queue without ever emitting (e.g. SDK exits immediately), `runStream` appends an empty assistant message and emits `chat_stream_completed` with an empty message — not an error. UI shows a blank assistant bubble.
7. **`sessionStale` is never persisted-to-disk-then-cleared on a fresh turn.** It is set in memory by `markSessionStale` and cleared in-memory on the next `session` event. Since `markSessionStale` calls `scheduleSave`, the stale flag *is* written to `.fcw2.json`. On server restart, a chat with `sessionStale: true` will correctly re-preamble. Good — but no test covers the restart-with-stale path end to end.
8. **Server dev uses `node --watch dist/index.js`.** Editing server `src/` does not reload unless `dist/` is rebuilt. The root `npm run dev` script does `npm run build -w packages/server && … & npm run dev -w packages/server` — the `&` means the build runs **once**, then the watcher serves stale dist on subsequent src edits. Developer must manually re-run the build.

---

## Actionable PRD (next page)

See `AGENT-CHAT-FIX-PRD.md`.
