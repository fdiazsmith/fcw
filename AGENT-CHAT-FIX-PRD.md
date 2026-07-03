# PRD: Agent-Chat-Windows Hardening

Status: Draft
Branch: `agent-chat-windows`
Follows: `AGENT-CHAT-ROOT-CAUSE.md`

## Problem

The agent-chat-windows branch was reported "not working." Root-cause analysis found the implementation complete and correct (206/206 tests green, builds clean) but blocked by two environment defects and burdened by **one systemic build-hygiene gap** plus **eight residual runtime risks** the mocked test suite cannot see.

This PRD converts those findings into independently-grabbable, TDD-shaped work items. Each item is a vertical slice: red test → green impl → verify.

## Goals

1. **Eliminate the stale-dist trap permanently.** A graph-core edit must be visible to the server without a manual rebuild.
2. **Close the mocked-SDK verification gap.** Real-subprocess behaviour for the riskiest adapter paths must be covered by integration tests or an explicit manual-verify gate.
3. **Land the five small correctness fixes** the analysis surfaced (tool-input truncation, abort `close()`, empty-stream error, capabilities hang-guard, stale-on-restart test).

## Non-Goals

- New features. Anything not in the original agent-chat-windows spec is out of scope.
- Refactoring the dual-engine architecture. It stays as designed.
- Replacing vitest mocks with a full SDK harness everywhere — only the riskiest paths get real-SDK coverage.

## Work Items

Tracer-bullet slices, ordered by dependency. One TDD cycle per bullet, atomic commit each.

### WI-1 — Cross-package build hygiene (systemic fix)

**Why:** root cause of the original breakage. Will recur on every graph-core edit.

**Options (pick one, prefer lowest-cost first):**

- **1a. TypeScript project references.** Add `"references": [{ "path": "../graph-core" }]` to `packages/server/tsconfig.json`, set `"composite": true` on graph-core, and switch the root build to `tsc -b`. Server build then rebuilds graph-core on demand. *Cost: medium. Risk: touches tsconfig shape, may surface strict-mode issues across packages.*
- **1b. `onSave`/watch build for graph-core.** Add `"dev": "tsc --watch --preserveWatchOutput"` to graph-core and document that server dev depends on it. *Cost: low. Risk: relies on developer running two processes; root `npm run dev` must start both.*
- **1c. Point server at graph-core `src` in dev only.** Add a `dev` condition or a `vitest` alias so tests resolve `@fcw/graph-core` to `src/index.ts` (type-checked, not compiled) while production keeps `dist`. *Cost: low. Risk: dual resolution paths; one more thing to keep in sync.*

**Acceptance (all options):**
- RED: a test that adds a no-op export to graph-core `src`, runs a server test referencing it, and fails **before** the fix (because dist is stale) and passes **after**.
- Edit `packages/graph-core/src/chat-graph.ts`, run `npm test -w packages/server` without a manual build → new code is picked up.
- `npm run dev` (root) reflects graph-core edits within one rebuild cycle, no manual `npm run build`.
- A README note in `packages/graph-core/README.md` (or root) documenting the resolution mechanism.

**Verification:** delete `packages/graph-core/dist`, run `npm test`, confirm tests still pass (resolution falls back to source) OR rebuild happens automatically.

### WI-2 — `npm install` guard

**Why:** the uninstalled-SDK failure was silent until test load. Cheap to prevent.

**Acceptance:**
- RED: a `pretest` or `prepare` script at root that fails fast if any workspace's `package.json` declares a dependency absent from `node_modules`.
- Add `"prepare": "node scripts/check-deps.js"` (or a tiny `npm ls --all --omit=dev`-based check) to root `package.json`.
- `npm test` aborts with a clear message if `@anthropic-ai/claude-agent-sdk` (or any declared dep) is missing.

**Verification:** `mv node_modules/@anthropic-ai/claude-agent-sdk /tmp/x && npm test` → clear failure mentioning the missing package; restore → green.

### WI-3 — Tool-input truncation (correctness, spec gap)

**Why:** spec calls for truncating `toolInput` in emitted tool messages; impl stores it verbatim. Large `Read`/`Bash` outputs bloat WS frames + `.fcw2.json`.

**Acceptance:**
- RED: `chat-session.test.ts` — a `tool_use` event with a 50 KB `input` produces a `chat_tool_message` whose `toolInput` is truncated to ≤ 4 KB with a `… (truncated, N bytes)` marker, **and** the persisted graph message keeps the full input (or a configured cap) on disk.
- Decide and document: keep full input in the graph message (disk-side) and truncate only the WS-emitted copy, OR truncate both. Spec leans toward "keep full input on disk-side message if needed."
- Configurable cap constant (e.g. `TOOL_INPUT_EMIT_MAX = 4096`).

**Verification:** test green; manual: prompt agent to `Read` a large file, confirm WS frame stays small and `.fcw2.json` doesn't balloon.

### WI-4 — Abort path calls `close()` (correctness, spec gap)

**Why:** spec says abort calls `interrupt()` **and** `close()`; impl only calls `interrupt()`. Possible subprocess leak on stop.

**Acceptance:**
- RED: `chat-agent-adapter.test.ts` — when `ctx.signal` aborts, `q.interrupt()` is called **and** `q.close()` is called (assert both mocks). Order: interrupt first, then close.
- Update `onAbort` in `createAgentTurnStream` to `await q.interrupt?.().catch(()=>{}); q.close?.();`.
- Confirm `finally` block still removes the listener.

**Verification:** test green; manual: start an agent turn, hit Stop, confirm no orphaned `claude` subprocess via `ps aux | grep claude`.

### WI-5 — Empty-stream error emission (correctness, robustness)

**Why:** if the adapter yields zero events, `runStream` appends an empty assistant message and emits `chat_stream_completed` with empty content. UI shows a blank bubble instead of an error.

**Acceptance:**
- RED: `chat-session.test.ts` — a `StreamTurnFn` that closes immediately (yields nothing) produces `chat_error` (not `chat_stream_completed` with empty text) and does **not** append an empty assistant message.
- In `runStream`: track `emittedAny`; if `!emittedAny && text === ''` after the loop, emit `chat_error` with message `'stream produced no output'` and skip the assistant append.
- Decide: does a permission-only turn (no text, but tool events) count as "empty"? No — any non-`text_delta` event counts as output. Test both.

**Verification:** tests green for (a) truly-empty stream → error, (b) tool-only stream → completes normally.

### WI-6 — Capabilities hang guard (robustness)

**Why:** `capabilities.ts` calls `supportedModels()` immediately after `query()` with an empty prompt. If the SDK needs the init message to flow first, this hangs or throws. UI falls back to free-text but logs get noisy and the first client connection may stall.

**Acceptance:**
- RED: `capabilities.test.ts` — a fake query whose `supportedModels()` never resolves is cancelled after a timeout (e.g. 10 s) and the provider rejects with a clear error; `ws-server` logs the error and continues.
- Add a `Promise.race` timeout around `load()` in `capabilities.ts`; on timeout, call `q.interrupt()` + `q.close()` and reject.
- `ws-server` already `.catch`es — confirm the error message is actionable.
- Decide: retry once on timeout, or leave to lazy re-fetch on next client connect? Spec says lazy + cached; a single failure should not poison the cache forever (current impl resets `cache = null` on error — good, keep).

**Verification:** test green; manual: with no `claude` binary on PATH (or a broken install), confirm server still boots, UI shows free-text model input, logs say "capabilities failed: …".

### WI-7 — Stale-on-restart integration test (coverage gap)

**Why:** `sessionStale` is persisted and the in-memory clear-on-next-session path is unit-tested, but the restart-with-stale path (load `.fcw2.json` where a chat has `sessionStale: true` → next prompt re-preambles) has no end-to-end test.

**Acceptance:**
- RED: a node-level integration test (`chat-session.restart.test.ts` or extend `integration.test.ts`) that:
  1. Creates a graph, branches chat B from chat A, prompts A.
  2. Serializes via `chatGraphToJSON`, deserializes via `chatGraphFromJSON` (simulating restart).
  3. Constructs a new `ChatSessionManager` with the deserialized graph + a fake agent stream that records the prompt it received.
  4. Prompts B → asserts the recorded prompt **contains the preamble** (because B's session was marked stale by the branch, or B has no sessionId at all).
- This is the regression guard for the "graph-rewires-context survives restart" guarantee.

**Verification:** test green; manual: the manual-verify step "Restart server → sessionId persisted, conversation resumes via `resume`" in the original spec.

### WI-8 — Real-SDK smoke gate (verification, not unit test)

**Why:** the riskiest paths (resume, `canUseTool` concurrency, partial-message interleaving) are mocked in tests. Only a real query exercises them.

**Acceptance:**
- Add `packages/server/scripts/agent-smoke.mjs` (not run by vitest) that, with `ANTHROPIC_API_KEY` + local `claude` present:
  1. Calls `createAgentTurnStream()` with a real `query`, a trivial prompt ("reply with the word OK"), asserts it emits a `session` event + at least one `text_delta` containing "OK".
  2. Calls `createCapabilitiesProvider()` and asserts it resolves non-empty models (or documents the empty case).
- Add `npm run smoke:agent` script. Document in README: run before merging agent-engine changes.
- **Not** wired into `npm test` (needs real creds + subprocess). Optional CI gate later.

**Verification:** `npm run smoke:agent` prints PASS locally; failures are actionable.

### WI-9 — Dev-script rebuild-on-src-change (DX, ties to WI-1)

**Why:** `npm run dev` builds server once then `node --watch dist/index.js`. Server `src/` edits don't reload. Compounds WI-1.

**Acceptance:**
- RED: n/a (DX). Instead: document the contract and pick a mechanism.
- Options: (a) `tsc --watch` for server in dev alongside `node --watch dist`; (b) switch server dev to `tsx watch src/index.ts` (skips dist entirely in dev — but then `@fcw/graph-core` resolution still needs WI-1's fix); (c) a `concurrently`-based dev script.
- Whatever is chosen, editing `packages/server/src/*.ts` and saving must reflect in the running server within ~2 s without a manual build.

**Verification:** edit a `console.log` in `index.ts`, save, confirm the log appears in the dev server output.

## Out of Scope (explicitly)

- MCP layer re-introduction (deferred per PROJECT-V2).
- Frontend ChatShape refactor.
- Token-budget ancestor summarization hardening (separate concern).
- Any new WS message types.

## Verification Summary

| Item | Test type | Runs in `npm test`? |
|---|---|---|
| WI-1 | unit (graph-core→server resolution) | yes |
| WI-2 | pretest script | yes (pretest) |
| WI-3 | unit (chat-session) | yes |
| WI-4 | unit (chat-agent-adapter) | yes |
| WI-5 | unit (chat-session) | yes |
| WI-6 | unit (capabilities) | yes |
| WI-7 | integration (node) | yes |
| WI-8 | real-SDK smoke | no (manual/CI gate) |
| WI-9 | DX, no test | n/a |

## Risks

- **WI-1 (project references)** is the highest-value but highest-risk change. If it destabilises the build, fall back to WI-1c (vitest alias to `src`) which is reversible and localised.
- **WI-8** requires a local Claude Code install + API key; document the prerequisite clearly or it becomes a silent skip.
- Truncation (WI-3) changes the on-disk shape of `toolInput`; if any consumer expects full input, it breaks. Audit `export-branch.ts` and any markdown export first.

## Order of Work

WI-2 → WI-1 → WI-3 → WI-4 → WI-5 → WI-6 → WI-7 → WI-9 → WI-8

WI-2 first (cheapest, prevents the install class of bug while iterating). WI-1 next (unblocks confident iteration on everything after). WI-8 last (gate, not blocker).
