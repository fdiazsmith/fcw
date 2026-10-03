# PLAN: structure-first-app

Living plan for building the full structure-first app. **The master agent owns this
file** (see `ORCHESTRATOR.md`). It is the single source of truth for progress: if it
isn't checked here, it isn't done.

Design source: `MERMAID-DOCS.md` (decisions table is binding). Thesis: `FCW-INTENT.md`.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done (tests green, committed) · `[!]` blocked

```
M0 baseline ──▶ M1 unified model (graph-core) ──▶ M2 server ──▶ M3 canvas UI ──▶ M4 doc panel ──▶ M5 export+graph ──▶ M6 verify
                 pure, parallelizable              protocol,      DocShape, nav,    TipTap body,     global graph,      e2e scenario,
                                                   persistence,   diagrams, chip    ChatWindow,      Mermaid export,    docs, delete
                                                   generation                       Apply to doc     proto parity       proto
```

Each milestone ends in a **gate**. Never start a milestone until the previous gate passes.

---

## M0: Baseline

- [x] **M0.1** `npm install`; `npm test` from root; record pass/fail counts below. Fix nothing yet. If red, the failures become M0.2.
- [x] **M0.2** Make the baseline green (only pre-existing failures; one fix per commit). _Nothing to fix: baseline already green._
- [x] **M0.3** `npm run smoke:compaction` passes (real server). Note the cost and duration. _Passed, ~3s, $0 (runs keyless with the structural generator)._

**Gate M0:** full suite green; compaction smoke green. Baseline: **passed 2026-10-03** — frontend 150/150 (18 files), graph-core 147/147 (17), server 252/252 (24); compaction smoke green.

## M1: Unified model (graph-core, pure, strict TDD)

Compaction becomes a Doc. Placements become polymorphic. Everything here is pure functions.

- [x] **M1.1** `DocPlacement` → `{ kind: 'doc' | 'chat', id, position }`. Update `docs.ts`, `doc-context.ts` (chat placements contribute nothing yet), `mermaid-docs.ts`.
- [x] **M1.2** `Doc.generated?: { sourceDigest: string; status: 'generating' | 'idle' }`. A doc with `generated` is a compaction-style doc.
- [x] **M1.3** `ChatGraph` gains `docs: Record<string, Doc>` and `rootCanvas: DocCanvas`. Chats on the root canvas stay where they are (`ChatNode.position`), so v2 graphs load unchanged.
- [x] **M1.4** `compactChats(graph, chatIds, opts)` → creates a generated Doc, places the chats on its child canvas, and places the doc on the canvas the chats came from. Same invariants as `addCompaction` (≥1 member, known ids, no chat in two compactions).
- [x] **M1.5** `docIsStale(doc, members)`: reuse the digest logic from `compaction.ts`.
- [x] **M1.6** Migration `migrateCompactions(graph)`: old `graph.compactions` → generated Docs. Idempotent. Round-trip through `chat-graph-serialization`.
- [x] **M1.7** `applyToDoc(ws, docId, body)`: explicit write-back. Clears nothing else.
- [x] **M1.8** `findDocsByTitle(ws, title)`: case- and whitespace-insensitive match for the "link instead?" chip.
- [x] **M1.9** `linkPlacement(ws, canvas, placementId, existingDocId)`: swap a generated box for a placement of an existing doc. Edges on that canvas re-point.
- [x] **M1.10** `graphToMermaid(canvas, ws)`: export direction. Round-trips through `parseMermaid` for the supported subset.
- [x] **M1.12** Data integrity follow-ups from M1.6: `Doc.createdAt?` preserved by `migrateCompactions` (no field dropped) and set by `compactChats`; `createDoc` ids unique across restarts (no module-counter collisions with persisted docs).
- [ ] **M1.11** Remove `compaction.ts` exports once nothing imports them (last item of M1, after M2 has migrated callers; may move to M2). _Moved to end of M2 (server still imports them)._

Parallelizable: M1.7, M1.8, M1.10 are independent of M1.1–M1.6.

**Gate M1:** graph-core suite green; `tsc --noEmit` clean under `strict`; old `.fcw.json` fixtures with compactions load and migrate. **Passed 2026-10-03**: graph-core 192/192, tsc strict clean, `compacting-v2.fcw.json` fixture migrates losslessly (createdAt included). M1.10 label sanitising: `[`→`(`, `]`→`)`, `-->`→`->`.

## M2: Server

- [~] **M2.1** Persistence: `docs` + `rootCanvas` saved in `.fcw.json`; migration runs on load (M1.6). Test with a fixture from the `compacting` branch.
- [~] **M2.2** WS protocol (graph-core `chat-messages.ts`): `doc_created`, `doc_updated` (title/body), `doc_placed`, `doc_unplaced`, `doc_moved`, `doc_linked`. Client: matching `*_requested` messages. Replaces the `chat_compaction_*` messages (keep server accepting old ones until M3 lands, then delete).
- [~] **M2.3** Re-implement compact / regenerate / edit / move on top of doc ops. `chat-session-compaction` tests move over, not deleted.
- [ ] **M2.4** Chat context from docs: a chat placed on a doc's canvas, or a doc-chat, gets `assembleDocContext` blocks in its preamble alongside transcript context. One pipeline (`context-builder.ts`).
- [~] **M2.5** Mermaid generation: `diagram_requested { canvasId, prompt }` → agent call constrained to the supported subset → `parseMermaid` → on failure, one retry with the parse error → on second failure, a single raw-Mermaid doc box. Then `mermaidToDocNodes` → placements (layout positions come from the client, see M3.4).
- [ ] **M2.6** Doc-chat sessions: a chat bound to a doc (`ChatNode.docId?`) whose context is the doc + its references. "Apply to doc" message → `applyToDoc`.
- [ ] **M2.7** `scripts/docs-smoke.mjs` + `npm run smoke:docs`: real server, generate a diagram, compact two chats, apply to doc, restart, verify persistence.

**Gate M2:** server suite green; `smoke:compaction` **and** `smoke:docs` green; a pre-existing `.fcw.json` with compactions opens and migrates.

## M3: Canvas UI

Reuse the compacting branch's page-per-canvas + breadcrumb + dive-in. Graduate pieces from `src/proto/` with tests; don't copy wholesale.

- [ ] **M3.1** Frontend store: docs table, canvases, placements; reducer handles the M2.2 messages (`chat-store.ts`).
- [ ] **M3.2** `DocShape`: title, body preview, child-canvas count, 🔗 marker when the doc is placed on more than one canvas, "generated · stale → regenerate?" state. Replaces `CompactShape`.
- [ ] **M3.3** Navigation: one tldraw page per canvas, breadcrumb (`pathToRoot`), home. Generalize the compaction page logic; delete the compaction-only path.
- [ ] **M3.4** Prompt bar "diagram" mode → `diagram_requested`; materialize with `layoutDocNodes`; edges as tldraw arrows.
- [ ] **M3.5** "Link instead?" chip on boxes where `findDocsByTitle` matches → `doc_linked`.
- [ ] **M3.6** Multi-select chats → Compact (existing MultiNodeActions) now produces a DocShape.
- [ ] **M3.7** Freehand / user shapes coexist with doc shapes and survive navigation (proto `sync.ts` rule: store owns docs, tldraw owns the rest).

**Gate M3:** frontend suite green; manual-equivalent Playwright check: generate diagram → dive into a box → breadcrumb back → reference shows 🔗 on both canvases.

## M4: Doc panel

- [ ] **M4.1** Side panel opens on doc select: TipTap body editor (reuse the `CompactShape` editor), debounced `doc_updated`.
- [ ] **M4.2** Mount the real `ChatWindow` in the panel, bound to a doc-chat (M2.6): models, effort, attachments all work.
- [ ] **M4.3** "Apply to doc" on assistant messages; the body changes only on press.
- [ ] **M4.4** Context inspector: references list + budget readout from `assembleDocContext` (proto `DocPanel` had this).

**Gate M4:** suites green; Playwright: open doc → ask chat → Apply → body updated → reload → persisted.

## M5: Export + global graph

- [ ] **M5.1** "Export Mermaid" on any canvas (`graphToMermaid`), copy to clipboard.
- [ ] **M5.2** Global graph view (sketch 04): every doc a node, every placement an edge. Graduate proto `GlobalGraph.tsx` (no d3-force).
- [ ] **M5.3** Proto parity checklist: every row of `src/proto/README.md` "What to click" works in the real app.

**Gate M5:** suites green; parity checklist all ✓.

## M6: Verify + close

- [ ] **M6.1** End-to-end Playwright script of the four sketches (`docs/sketches/`) against the real server.
- [ ] **M6.2** Delete `src/proto/`, `proto.html`, the `proto` scripts (parity proven in M5.3).
- [ ] **M6.3** Update `MERMAID-DOCS.md` build order, this branch's `BRANCH.md` ("What's implemented"), `README.md`.
- [ ] **M6.4** Final report to Fer: what shipped, the decision log, known gaps, how to dogfood.

**Gate M6:** full suite, all smokes, e2e green on a clean `npm install`.

---

## Decision log

Decisions the master agent made that weren't in `MERMAID-DOCS.md`. Each one is flagged for Fer's review.

| Date | Item | Decision | Why | Reversible? |
|---|---|---|---|---|
| 2026-10-03 | M1.3 | A chat is "on the root canvas" iff no doc canvas places it; root keeps using `ChatNode.position`, `rootCanvas` holds only doc placements for now. | v2 graphs load unchanged with zero rewriting. | Yes |
| 2026-10-03 | M1.4 | `compactChats` mutates the graph in place and returns the doc id (like `addCompaction`), unlike the immutable `docs.ts` fns. Ids `doc_<ts>_<n>`. | Server code already mutates ChatGraph in place; keeps M2 diff small. | Yes |
| 2026-10-03 | M1.6 | Migration keeps old compaction ids as doc ids and is not yet wired into `chatGraphFromJSON` (M2.1 does it). | Ids referenced by clients stay stable. | Yes |
| 2026-10-03 | M1.12 | Added item: `Doc.createdAt?` + shared `newDocId()` (`doc_<ts>_<n>`). | Migration was dropping `Compaction.createdAt`; module-counter ids collided across restarts. | Yes |
| 2026-10-03 | M2.2 | Canvas addressing: `canvasId` is `'root'` (`ROOT_CANVAS_ID`) or a docId (its child canvas). `doc_created` carries the whole Doc; placement on the parent arrives as `doc_placed`. | One addressing scheme for every op; root isn't a doc. | Yes |
| 2026-10-03 | M2.2 | Server stops *emitting* `chat_compaction_*` at M2.2 and only accepts the old requests. Frontend compaction display is knowingly broken until M3.1/M3.6. `smoke:compaction` is ported to the new protocol (same scenario). | Avoids running two parallel emit paths; the plan deletes the old ones at M3 anyway. | Yes |
| 2026-10-03 | M2.2 | `doc_link_requested` deletes the replaced doc only if it's empty (body, child canvas) and placed nowhere. | Thesis: no silent data loss; a filled box is never discarded. | Yes |
| 2026-10-03 | M2.5 | Prompt that already parses as subset-Mermaid skips the model (paste path, proto parity). Keyless → raw fallback box. Max 2 API calls. | Proto parity, keyless smoke stays free. | Yes |
| 2026-10-03 | M1.9 | `linkPlacement` returns the new canvas only; deleting the now-unplaced generated doc is the server's call (M2.2 `doc_linked`), only when it's empty and placed nowhere. | Keeps the pure fn free of deletion policy; no silent data loss. | Yes |

## Blockers / notes

- 2026-10-03: `isolation: worktree` sub-agents branch off `main`, not `structure-first-app`. Briefs must tell them to `git reset --hard structure-first-app` first.
- Frontend `tsc --noEmit` has **27 pre-existing errors** at baseline (App.tsx, GraphNodeShape, SearchBar, ImportMeta.env, ChatView test fixtures). Verification rule: no *new* errors. Fixing them is a candidate item, not done ad hoc.
- `compaction-doc.ts` hard-codes model `claude-sonnet-5`; current ids are e.g. `claude-sonnet-5-5`. If invalid, the LLM path silently falls back to the structural doc. Verify at a keyed smoke; not changed (out of scope).
- Playwright is not configured in the repo; browsers are cached locally (`~/Library/Caches/ms-playwright`). Gate M3 adds `@playwright/test` + an `e2e/` dir.
- Proto localStorage (`fcw-proto-v1`) holds old `{docId}` placements; a stored proto session misbehaves after M1.1. Throwaway, deleted in M6.2.

