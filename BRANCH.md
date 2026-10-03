# Branch: `structure-first-app`

> Checkpoint branch. Each branch in this repo captures a distinct architectural
> idea or stage, and grows out of the one before it. **These branches are not
> meant to merge back into each other.** `BRANCH.md` tells you which one you're
> standing in.

## The idea: build the full app

The experiments proved out. This branch is the attempt to build the **full
structure-first app** as laid out in `MERMAID-DOCS.md`, on top of everything the
parent branches built: the v2 chat-graph, the full agent chat windows, compaction,
and the structure-first engine.

Thesis: see `FCW-INTENT.md` § Thesis. The context window that ran out was the human's.

## Lineage

```
main → phase5-chat-features → v2 → agent-chat-windows → compacting → mermaid-docs → structure-first-app
```

(`collapse-system` and `phase7-polish` are folded in along the way.)

## Starting point

- Engine (graph-core, tested): `parseMermaid`, `parseWikilinks`, Doc/placement
  model, `assembleDocContext`, `mermaidToDocNodes`
- Layout (frontend, tested): `layoutDocNodes` (dagre)
- Throwaway prototype (deleted in M6.2 once the real app matched it, see
  `PLAN.md` § M5.3). Its verdict: view-swap navigation wins, spatial zoom is parked

## What's implemented

All of `PLAN.md` M0 to M5 and M6.1/M6.2. Source of truth for detail: `PLAN.md`.

- **Model (graph-core):** compaction is a Doc (`compactChats`, `migrateCompactions`
  for old `.fcw.json`); polymorphic placements (`doc` | `chat`); `ChatGraph.docs` +
  `rootCanvas`; `applyToDoc`, `findDocsByTitle`, `linkPlacement`, `docIsStale`;
  `graphToMermaid` (round-trips with `parseMermaid` for the supported subset).
- **Server / protocol:** `docs` and `rootCanvas` persisted in `.fcw.json`, migration on
  load; `doc_*` WS messages (created, updated, placed, unplaced, moved, linked, create,
  chat, apply); diagram generation (parse, retry once, raw fallback box; pasted Mermaid
  skips the model, keyless gives the fallback); doc context in chat preambles with
  staleness tracking; doc-chat sessions bound to a doc.
- **Canvas UI:** `DocShape` (title, body preview, child-canvas count, link marker when
  placed on more than one canvas, stale/regenerate state); one tldraw page per canvas
  with breadcrumb and home; prompt bar with Chat / Diagram / Doc modes; "Link
  instead?" chip; Compact on multi-selected chats; freehand shapes survive navigation;
  deleting a box or chat card unplaces it (the doc stays in the global table).
- **Doc panel:** opens on doc select; TipTap body editor (debounced save); the real
  `ChatWindow` bound to a doc-chat; "Apply to doc" on assistant messages (body changes
  only on press); context inspector (references, budget slider).
- **Export + global graph:** "Export Mermaid" on any canvas (copies to clipboard);
  global graph view (every doc a node, every placement an edge; picking one navigates).
- **Tests (last gate, M5):** vitest graph-core 182, server 336, frontend 241.
  Playwright `e2e/` (real server, keyless, temp storage): `smoke`, `freehand`,
  `gate-m3`, `gate-m4`, `compact`, `delete`, `doc-mode`, `export`, `global-graph`,
  `parity` (8 rows), `sketches` (the four `docs/sketches/`).
  Smokes: `smoke:compaction`, `smoke:docs`, `smoke:agent`.

Known gaps are listed in `PLAN.md` § Blockers / notes.

## How to run

```bash
npm install
npm run dev              # server + frontend, http://localhost:8008
npm test                 # vitest, all packages
npm run e2e              # Playwright on its own ports (Vite 8108, server 8109); safe beside npm run dev
npm run smoke:compaction # real server, keyless, free
npm run smoke:docs       # real API: needs ANTHROPIC_API_KEY in .env.local, a few cents
```

## Decisions settled (2026-10-03)

1. **Compaction = Doc.** One entity; a compaction is a generated doc whose child canvas holds the chats.
2. **Generate new docs, offer "link instead?"** on title matches. No auto-linking.
3. **Doc chat = the real agent `ChatWindow` in a side panel**, with Apply to doc.
4. **Mermaid: constrain, validate, retry once, then fall back to a raw box.**

Build plan: `PLAN.md`. Master agent prompt: `ORCHESTRATOR.md`.
Full rationale in `MERMAID-DOCS.md`; the parent's notes are in the `mermaid-docs` `BRANCH.md`.
