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
- [x] **M1.11** Remove `compaction.ts` exports once nothing imports them (last item of M1, after M2 has migrated callers; may move to M2). _Moved to end of M2 (server still imports them)._

Parallelizable: M1.7, M1.8, M1.10 are independent of M1.1–M1.6.

**Gate M1:** graph-core suite green; `tsc --noEmit` clean under `strict`; old `.fcw.json` fixtures with compactions load and migrate. **Passed 2026-10-03**: graph-core 192/192, tsc strict clean, `compacting-v2.fcw.json` fixture migrates losslessly (createdAt included). M1.10 label sanitising: `[`→`(`, `]`→`)`, `-->`→`->`.

## M2: Server

- [x] **M2.1** Persistence: `docs` + `rootCanvas` saved in `.fcw.json`; migration runs on load (M1.6). Test with a fixture from the `compacting` branch.
- [x] **M2.2** WS protocol (graph-core `chat-messages.ts`): `doc_created`, `doc_updated` (title/body), `doc_placed`, `doc_unplaced`, `doc_moved`, `doc_linked`. Client: matching `*_requested` messages. Replaces the `chat_compaction_*` messages (keep server accepting old ones until M3 lands, then delete).
- [x] **M2.3** Re-implement compact / regenerate / edit / move on top of doc ops. `chat-session-compaction` tests move over, not deleted.
- [x] **M2.4** Chat context from docs: a chat placed on a doc's canvas, or a doc-chat, gets `assembleDocContext` blocks in its preamble alongside transcript context. One pipeline (`context-builder.ts`).
- [x] **M2.5** Mermaid generation: `diagram_requested { canvasId, prompt }` → agent call constrained to the supported subset → `parseMermaid` → on failure, one retry with the parse error → on second failure, a single raw-Mermaid doc box. Then `mermaidToDocNodes` → placements (layout positions come from the client, see M3.4).
- [x] **M2.6** Doc-chat sessions: a chat bound to a doc (`ChatNode.docId?`) whose context is the doc + its references. "Apply to doc" message → `applyToDoc`.
- [x] **M2.8** (added) Doc context freshness: changing a doc's body/title, or placing/unplacing a chat on a doc canvas, marks every affected chat's agent session stale so the doc preamble is re-assembled.
- [x] **M2.9** (added) `linkDoc` never deletes a doc that has a doc-chat (would orphan the chat).
- [x] **M2.7** `scripts/docs-smoke.mjs` + `npm run smoke:docs`: real server, generate a diagram, compact two chats, apply to doc, restart, verify persistence.

- [x] **M2.10** (added) Staleness for doc-graph changes: placing / unplacing / linking a doc on a doc canvas, or generating a diagram onto one, marks chats whose doc context reaches that canvas's doc session-stale.
- [x] **M2.11** (added) `createApp` logs the first 10 chars of the API key at startup; log only presence (`set`/`NOT SET`).

**Gate M2:** server suite green; `smoke:compaction` **and** `smoke:docs` green; a pre-existing `.fcw.json` with compactions opens and migrates. **Passed 2026-10-03**: graph-core 181, server 331, frontend 150 (tsc baseline 27); smoke:compaction ✓; smoke:docs ✓ 15.1s (pasted 4 boxes; model-generated diagram parsed first time, 6 boxes; LLM compaction body; doc-chat Apply; restart persisted 11 docs/9 edges); fixture migration via real load path ✓. Model id `claude-sonnet-5` confirmed working. M2.10/M2.11 are follow-ups found at the gate, run alongside M3.

## M3: Canvas UI

Reuse the compacting branch's page-per-canvas + breadcrumb + dive-in. Graduate pieces from `src/proto/` with tests; don't copy wholesale.

- [x] **M3.0** (added) Playwright: `@playwright/test`, `e2e/` + config booting the real server (keyless, temp storage) and Vite; the Gate M3 scenario written first as a failing spec against agreed `data-testid`s (see Decision log).
- [x] **M3.1** Frontend store: docs table, canvases, placements; reducer handles the M2.2 messages (`chat-store.ts`).
- [x] **M3.2** `DocShape`: title, body preview, child-canvas count, 🔗 marker when the doc is placed on more than one canvas, "generated · stale → regenerate?" state. Replaces `CompactShape`.
- [x] **M3.3** Navigation: one tldraw page per canvas, breadcrumb (`pathToRoot`), home. Generalize the compaction page logic; delete the compaction-only path.
- [x] **M3.4** Prompt bar "diagram" mode → `diagram_requested`; materialize with `layoutDocNodes`; edges as tldraw arrows.
- [x] **M3.5** "Link instead?" chip on boxes where `findDocsByTitle` matches → `doc_linked`.
- [x] **M3.6** Multi-select chats → Compact (existing MultiNodeActions) now produces a DocShape.
- [x] **M3.7** Freehand / user shapes coexist with doc shapes and survive navigation (proto `sync.ts` rule: store owns docs, tldraw owns the rest).

- [x] **M3.8** (added) e2e for Compact on a doc canvas → DocShape there (M3.6 shipped with only a throwaway check — TDD gap).
- [x] **M3.9** (added) Deleting a doc box / chat card on a canvas sends `doc_unplace_requested` (today it reappears on next sync). Deleting never destroys the doc itself (it stays in the global table).

**Gate M3:** frontend suite green; manual-equivalent Playwright check: generate diagram → dive into a box → breadcrumb back → reference shows 🔗 on both canvases. **Passed 2026-10-03**: graph-core 181, server 335, frontend 208 (tsc baseline 27); smoke:compaction ✓; `npm run e2e` 3/3 (smoke, freehand, gate-m3; gate spec unchanged since written red).

## M4: Doc panel

- [x] **M4.0** (added) Gate M4 spec written first (red) + deterministic chat engine injected into the e2e server via a `createApp` option (no env flag), so the gate is free and repeatable.
- [x] **M4.1** Side panel opens on doc select: TipTap body editor (reuse the `CompactShape` editor), debounced `doc_updated`.
- [x] **M4.2** Mount the real `ChatWindow` in the panel, bound to a doc-chat (M2.6): models, effort, attachments all work.
- [x] **M4.3** "Apply to doc" on assistant messages; the body changes only on press.
- [x] **M4.4** Context inspector: references list + budget readout from `assembleDocContext` (proto `DocPanel` had this).

**Gate M4:** suites green; Playwright: open doc → ask chat → Apply → body updated → reload → persisted. **Passed 2026-10-03**: graph-core 182, server 336, frontend 230 (tsc baseline 27); smoke:compaction ✓; e2e 6/6 incl. gate-m4 (spec unchanged since written red).

## M5: Export + global graph

- [x] **M5.1** "Export Mermaid" on any canvas (`graphToMermaid`), copy to clipboard.
- [x] **M5.2** Global graph view (sketch 04): every doc a node, every placement an edge. Graduate proto `GlobalGraph.tsx` (no d3-force).
- [x] **M5.3** Proto parity checklist: every row of `src/proto/README.md` "What to click" works in the real app.

  Parity table (`e2e/parity.spec.ts`, one serial test per row, sketch scenario built with the real UI; all passed first run, no production change needed):

  | README row | Spec test | ✓ | Real app differs by design |
  |---|---|---|---|
  | Look at the root canvas | `Look at the root canvas: the sign-in flow is real shapes, one per Mermaid box, each a doc` | ✓ | Scenario is built by pasting sketch 01's Mermaid, not seeded. |
  | `⤢ Canvas · 4` on Sign in | `⤢ Canvas · 4 on Sign in: a scoped canvas holding references, prose and room to sketch` | ✓ | Built via Doc mode + a diagram on Frontend Architecture + "Link instead?" chip (no "place existing" action). |
  | `Write` on API calls | `Write on API calls: one doc on two canvases; edit the body, both canvases show it` | ✓ | "Write" = select the box → `doc-panel` → `doc-body-editor`. Reference titled "Parity API calls" in the spec only: the shared e2e server already has gate-m3's "API calls" and the chip links the first title match. |
  | Drag the budget slider down | `Drag the budget slider down: references degrade to title-only, the target never does` | ✓ | Slider lives in the panel's collapsed Context section; inspection only (server budget unchanged). |
  | Type in the chat → `Apply to doc` | `Type in the chat → Apply to doc: the draft waits for the button, chats never silently write` | ✓ | Real `ChatWindow` doc-chat in the side panel (`doc-apply`). |
  | Global graph | `Global graph: every doc a node, every placement an edge; picking one navigates` | ✓ | Synthetic root node; snapshot on open; picking navigates via `pathToRoot` (M5.2). |
  | Draw with the pencil, navigate away and back | `Draw with the pencil, then navigate away and back: freehand survives` | ✓ | Checked on a doc canvas (Sign in); `freehand.spec.ts` covers root. |
  | Prompt bar → paste any Mermaid | `Prompt bar → paste any Mermaid (graph TD / flowchart, chains); anything else → one raw fallback box` | ✓ | Diagram mode (no `⌥`). Non-Mermaid keyless → **one raw fallback box** (M2.5), not the proto's 5-box generic scaffold; with a key the model writes the diagram. |

  Not carried over (by design):
  - `Reset · sketches` / `Reset · empty` — the proto's state is throwaway `localStorage`; the real app's state is the server's `.fcw.json`. The scenario is reproducible by the parity spec (and M6.1).
  - Spatial zoom (`SpatialCanvas.tsx`) — parked in MERMAID-DOCS.md § Decisions (Navigation = view-swap).
  - Keyword-matched canned diagrams (`seed.ts` "LLM") — the real app pastes Mermaid or asks the model.

- [x] **M5.4** (added) Blank doc boxes: prompt bar gets a third mode `prompt-mode-doc` → `doc_create_requested { canvasId, title: <input>, position: viewport centre }`. Needed for sketch 02 ("Design.md", "Page Structure") and M6.1.

**Gate M5:** suites green; parity checklist all ✓. **Passed 2026-10-03**: graph-core 182, server 336, frontend 241 (tsc baseline 27); e2e 17/17 incl. 8/8 parity rows (all passed first run).

## M6: Verify + close

- [x] **M6.1** End-to-end Playwright script of the four sketches (`docs/sketches/`) against the real server.
- [x] **M6.2** Delete `src/proto/`, `proto.html`, the `proto` scripts (parity proven in M5.3).
- [x] **M6.3** Update `MERMAID-DOCS.md` build order, this branch's `BRANCH.md` ("What's implemented"), `README.md`.
- [x] **M6.5** (added) Clean clone: `npm install` didn't build graph-core's `dist` (main/types point there), so `npm test` and server/frontend tsc failed. Fix: graph-core `"prepare": "tsc"`. Found by Gate M6's first run.
- [x] **M6.4** Final report to Fer: what shipped, the decision log, known gaps, how to dogfood.

**Gate M6:** full suite, all smokes, e2e green on a clean `npm install`. **First run red** (clean clone: no graph-core dist → frontend tests unresolved, server tsc 203 / frontend tsc 132 errors) → M6.5. **Passed 2026-10-03** on a fresh clone of `c58c7a8`: frontend 241, graph-core 182, server 336; tsc 0/0/27 (27 pre-existing frontend); smoke:compaction ✓, smoke:docs ✓ (15.6s, model diagram parsed), smoke:agent ✓; e2e 21/21.


## M7: Projects

A **project** is one chat graph = one `.fcw2.json` file: its own title, chats, docs, root canvas and edges. Isolation is structural (placements, ContextEdges and doc context never leave a graph); inside a project everything stays reachable (one doc table, global graph = the project). Today the server silently opens the newest file; M7 makes projects named, listable, creatable, switchable per tab, and removable to a trash folder. Decisions confirmed by Fer 2026-10-03 (see Decision log).

- [ ] **M7.1** graph-core: `ChatGraph.meta.settings?: { cwd?: string; model?: string; effort?: ChatSettings['effort'] }` (project defaults); `ProjectSummary { id, title, updatedAt, chatCount, docCount }`; messages — client: `project_list_requested`, `project_create_requested { title }`, `project_open_requested { id }`, `project_rename_requested { id, title }`, `project_settings_requested { id, settings }`, `project_trash_requested { id }`; server: `project_list { projects }`, `project_opened { project: ProjectSummary }` (followed by the usual `chat_snapshot`), `project_closed { id, reason: 'trashed' }`.
- [ ] **M7.2** Server store (`chat-graph-store.ts`): `listProjects`, `createProject(title)`, `loadProject(id)` (runs `migrateCompactions`), `renameProject`, `trashProject(id)` → moves the file to `data/.trash/` (timestamp suffix on name clash; never deletes). Tests on a temp dir, incl. the M1 compacting fixture.
- [ ] **M7.3** `ProjectHost`: lazily creates one `ChatSessionManager` per open project (each with its own save handler), remembers the last-opened project in `data/.fcw-state.json`. First launch with no state file: the newest existing graph becomes the default project and, if its title is the default (`Untitled`), is renamed **Sandbox**. No files at all → create an empty "Sandbox".
- [ ] **M7.4** Per-connection routing (`ws-server.ts`): each WebSocket is bound to a project (`?project=<id>` on the WS URL, else last-opened); `project_open_requested` rebinds it and sends `project_opened` + snapshot; chat/doc messages go to that connection's manager; broadcasts reach only connections on the same project; `project_list` is broadcast to everyone on create/rename/trash. Trashing a project stops its running turns, unloads its manager, and sends `project_closed` to its connections.
- [ ] **M7.5** New chats inherit the project's `settings` (cwd / model / effort) on creation; existing chats are untouched.
- [ ] **M7.6** Frontend: ws-client connects with `?project=`; the page URL carries `?project=<id>` (reload/bookmark lands there); store resets on `project_opened`; nav stack resets to the project root.
- [ ] **M7.7** Project menu: the root breadcrumb item shows the project title with ▾ → list (switch), **New project**, **Rename**, **Project settings** (cwd via the existing FolderPicker, model, effort), **Move to trash** (confirm). Testids: `project-menu`, `project-item` (+`data-project-id`), `project-new`, `project-rename`, `project-settings`, `project-trash`.
- [ ] **M7.8** e2e `projects.spec.ts` (written first, red): create projects A and B; a diagram in A and a chat in B; switch back and forth — neither leaks; two tabs on A and B at once stay independent; global graph in A shows only A's docs; rename persists; trash B → gone from the list, file in `.trash/`; restart → last-opened project reopens.

**Gate M7:** suites green; smokes green (each smoke's fresh storageDir yields a default project); e2e green incl. `projects.spec.ts`; your existing `packages/server/data` opens as **Sandbox** with all content intact (checked on a copy of the folder).

---

## Decision log

Decisions the master agent made that weren't in `MERMAID-DOCS.md`. Each one is flagged for Fer's review.

| Date | Item | Decision | Why | Reversible? |
|---|---|---|---|---|
| 2026-10-03 | M7 | **Confirmed by Fer.** Project = one `.fcw2.json` graph. Switching is per tab (each WS bound to a project; server keeps one manager per open project). Removing = move to `data/.trash/`, never hard delete. Projects carry default cwd/model/effort for new chats. Existing canvas becomes "Sandbox". | Isolation is already structural per graph; per-tab keeps running agent turns alive while you look elsewhere; trash honours "no silent data loss". | Yes |
| 2026-10-03 | M1.3 | A chat is "on the root canvas" iff no doc canvas places it; root keeps using `ChatNode.position`, `rootCanvas` holds only doc placements for now. | v2 graphs load unchanged with zero rewriting. | Yes |
| 2026-10-03 | M1.4 | `compactChats` mutates the graph in place and returns the doc id (like `addCompaction`), unlike the immutable `docs.ts` fns. Ids `doc_<ts>_<n>`. | Server code already mutates ChatGraph in place; keeps M2 diff small. | Yes |
| 2026-10-03 | M1.6 | Migration keeps old compaction ids as doc ids and is not yet wired into `chatGraphFromJSON` (M2.1 does it). | Ids referenced by clients stay stable. | Yes |
| 2026-10-03 | M1.12 | Added item: `Doc.createdAt?` + shared `newDocId()` (`doc_<ts>_<n>`). | Migration was dropping `Compaction.createdAt`; module-counter ids collided across restarts. | Yes |
| 2026-10-03 | M2.2 | Canvas addressing: `canvasId` is `'root'` (`ROOT_CANVAS_ID`) or a docId (its child canvas). `doc_created` carries the whole Doc; placement on the parent arrives as `doc_placed`. | One addressing scheme for every op; root isn't a doc. | Yes |
| 2026-10-03 | M2.2 | Server stops *emitting* `chat_compaction_*` at M2.2 and only accepts the old requests. Frontend compaction display is knowingly broken until M3.1/M3.6. `smoke:compaction` is ported to the new protocol (same scenario). | Avoids running two parallel emit paths; the plan deletes the old ones at M3 anyway. | Yes |
| 2026-10-03 | M2.2 | `doc_link_requested` deletes the replaced doc only if it's empty (body, child canvas) and placed nowhere. | Thesis: no silent data loss; a filled box is never discarded. | Yes |
| 2026-10-03 | M2.5 | Prompt that already parses as subset-Mermaid skips the model (paste path, proto parity). Keyless → raw fallback box. Max 2 API calls. | Proto parity, keyless smoke stays free. | Yes |
| 2026-10-03 | M2.1 | Migration runs server-side in `chat-graph-store.ts` (`loadLatestChatGraph`); `chatGraphFromJSON` stays a plain parse. Chat placements on root are rejected (root chats are implicit). | Keeps graph-core parse pure; one load path. | Yes |
| 2026-10-03 | M2.5 | Server emits `diagram_created { canvasId, docIds, edges, error? }` after the per-box `doc_created`/`doc_placed`; the client runs `layoutDocNodes` and sends `doc_move_requested` per box. Fallback = one doc whose body is the raw Mermaid in a fence. | Positions stay a client concern (M3.4) without a second round-trip protocol. | Yes |
| 2026-10-03 | M2.4 | A chat placed on a **generated** doc's canvas does not get that doc as context (its body is derived from the chat itself); placed on a regular doc's canvas, it gets `assembleDocContext(that doc)`. | Avoid feeding a chat its own summary. | Yes |
| 2026-10-03 | M2.6 | Doc-chat = `ChatNode.docId`; at most one per doc, created on `doc_chat_requested`; never rendered on a canvas (frontend must exclude chats with `docId` from root). Apply = `doc_apply_requested { docId, chatId, messageIndex }`, assistant messages only. | Side-panel placement per locked decision; data stays placement-agnostic. | Yes |
| 2026-10-03 | M3 | UI contract (`data-testid`): `doc-shape` (+`data-doc-id`, `data-doc-title`), `doc-title`, `doc-open-canvas`, `doc-ref-marker` (🔗, only when placed on >1 canvas), `doc-stale`, `doc-regenerate`, `doc-link-chip`; `breadcrumb`, `breadcrumb-item`, `breadcrumb-home`; `prompt-bar` (input), `prompt-mode-diagram`, `prompt-mode-chat`; `doc-panel`, `doc-body-editor`, `doc-apply`; `export-mermaid`; `global-graph`, `global-graph-toggle`. | Lets the e2e spec be written first (TDD for UI glue) while implementation agents work in parallel. | Yes |
| 2026-10-03 | M3.4 | A canvas-level prompt bar (bottom centre) with modes Chat (create a chat at viewport centre + send the prompt) and Diagram (`diagram_requested` on the current canvas). | The live app has no canvas prompt bar; proto had one. | Yes |
| 2026-10-03 | M3 | UI glue in `ChatCanvas.tsx` is covered by the Playwright gate spec (written first, red); logic goes in pure, unit-tested modules (like `compaction-view.ts`). | tldraw interaction isn't testable in jsdom; keeps strict TDD honest. | Yes |
| 2026-10-03 | M3.3 | Only the current canvas is synced to tldraw; doc shape ids are per canvas (`doc-<canvasId>-<docId>`); breadcrumb = navigation stack, rebuilt with `pathToRoot` if the page changes another way. | One page per canvas without cross-page bookkeeping. | Yes |
| 2026-10-03 | M4.0 | e2e server gets a scripted chat engine through a `createApp` injection point; production wiring unchanged. | Gate M4 needs an assistant reply; keyless + deterministic beats spending API money per run. | Yes |
| 2026-10-03 | M4.0 | `createApp({ engines: { api?, agent? } })` replaces engine streams for every chat; `createApp` also returns `chatSessions`. e2e engine replies `Drafted: <prompt>`. | Smallest seam; production wiring unchanged. | Yes |
| 2026-10-03 | M4.1 | Panel opens from tldraw selection (exactly one `doc-node` selected), not DocCard onClick (dead inside tldraw). Title read-only. 420px right overlay; Context section collapsed by default. | Selection is tldraw's own model; avoids fighting pointer handling. | Yes |
| 2026-10-03 | M5.4 | Blank docs via a `Doc` prompt-bar mode, not a toolbar button or double-click. | One entry point for "make something here"; double-click already means "new chat" on root. | Yes |
| 2026-10-03 | M5.2 | Global graph includes a synthetic root node ("Canvas") linked to docs on `rootCanvas`; docs only (no chats); snapshot taken when opened (no live update); labels always shown ≤12 nodes; doc edges dashed, placement edges solid; picking navigates via `pathToRoot`. | Root isn't a doc but is where everything hangs. | Yes |
| 2026-10-03 | M1.9 | `linkPlacement` returns the new canvas only; deleting the now-unplaced generated doc is the server's call (M2.2 `doc_linked`), only when it's empty and placed nowhere. | Keeps the pure fn free of deletion policy; no silent data loss. | Yes |

## Blockers / notes

- 2026-10-03: `isolation: worktree` sub-agents branch off `main`, not `structure-first-app`. Briefs must tell them to `git reset --hard structure-first-app` first.
- Frontend `tsc --noEmit` has **27 pre-existing errors** at baseline (App.tsx, GraphNodeShape, SearchBar, ImportMeta.env, ChatView test fixtures). Verification rule: no *new* errors. Fixing them is a candidate item, not done ad hoc.
- M2.4 lives in `chat-session.ts` + adapters (`renderDocContext`), not `context-builder.ts` (that file is the v1 system prompt). Default doc budget 24k chars. API engine gets the doc section in its system prompt; agent engine in its fresh-session preamble.
- `requestDiagram` doesn't pass canvas context to the generator yet (diagram for a nested canvas doesn't know its parent doc). Candidate later item.
- ~~Model id `claude-sonnet-5` possibly invalid~~ — verified working by smoke:docs.
- Playwright is not configured in the repo; browsers are cached locally (`~/Library/Caches/ms-playwright`). Gate M3 adds `@playwright/test` + an `e2e/` dir.
- `npm run e2e` (root): Playwright 1.63, server :8009 keyless on temp storage + Vite :8008; `reuseExistingServer:false` so stop `npm run dev` first. Dev StrictMode opens 2 WS; the first closing logs one `[ws] error` (tolerated by the smoke spec).
- `App.tsx` (v1 surface, unmounted) has a stale `ws://localhost:8080` default and most of the 27 baseline tsc errors. Candidate cleanup, not done.
- Known gaps from M3: prompt-bar chats match incoming `chat_created` in order (another client's chat could be adopted); double-click-to-create-chat only on root; tldraw's page menu lists every visited canvas page; keyless compaction docs get an empty title when chats are untitled; `MultiNodeActions` only used by dead `App.tsx`.
- e2e specs share one server per run and rely on ordering + cleanup (gate-m3 expects exactly 3 boxes on root). Fragile; a per-spec fresh server or a reset endpoint would fix it. Not done.
- No chat-delete exists: deleting a root chat card reappears on next sync (pre-existing behaviour, unchanged).
- Doc panel (420px, top-right) covers the "+ New chat / Export / Compact" toolbar while open. `DocCard` onClick is dead inside tldraw. Dev StrictMode may send `doc_chat_requested` twice (server dedupes: one doc-chat per doc).
- From M5.3: "Link instead?" links the oldest same-titled doc with no choice offered; Doc-mode boxes stack at viewport centre; Escape doesn't close the panel while the editor has focus; `global-graph-edge` has no from/to attributes.
- Proto localStorage (`fcw-proto-v1`) holds old `{docId}` placements; a stored proto session misbehaves after M1.1. Throwaway, deleted in M6.2.

