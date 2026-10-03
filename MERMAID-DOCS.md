# Mermaid → Documents

## The Idea

A **structure-first** mode for FCW. Instead of talking and watching a graph form (v2 chat-graph),
you ask for the *shape* of a body of work, get a diagram, and then fill each box with real writing.

The diagram is scaffolding. The documents are the substance.

```
prompt → Mermaid text → boxes on canvas → each box is a Markdown doc → expand with text
```

## Decisions

| Question | Decision |
|---|---|
| Canvas form | **Many shapes, one per box.** Parse the Mermaid, create a real tldraw shape per node, edges as connectors. The diagram *is* the graph — not a picture of one. |
| Who writes the body | **Either.** A box opens as an empty Markdown doc you can type into, with an option to have the LLM draft it from diagram context. |
| Storage | **Embedded in `.fcw.json`** for the proof of concept — consistent with how chat nodes persist, one portable file, no new plumbing. Export to real `.md` files comes later. |
| Source of truth | **The graph.** After generation, your edits are truth, full stop. |
| Box = doc | **Uniform.** Every box is a doc from birth: title, empty body, empty child canvas. "Add documentation" = fill the body; "open as canvas" = fill the canvas. No promotion step, one entity type. |
| Navigation | **View-swap**: one tldraw page per canvas, breadcrumb to walk back up. *Revised 2026-10-03.* Spatial zoom-in was prototyped (`src/proto/SpatialCanvas.tsx`) and **parked**: depth costs zoom exponentially (~0.15× per level), and a reference can't nest inside its own ancestry. View-swap has neither problem. |
| Chats | **Chats live on canvases too.** A scoped canvas holds v2 chat nodes alongside doc boxes; docs on the canvas can feed chat context. This feature and v2 chat-graph share one surface. |
| Doc write-back | **Explicit apply.** The doc-builder chat proposes body text; a human presses "apply to doc" on a message. Chats never silently mutate docs. |
| Chat context depth | **Recursive with budget.** A doc-chat inherits the doc's references transitively; over budget, the most distant docs degrade to title-only (later: llm-summary). Placements may form cycles — traversal tolerates them (visited set), unlike ContextEdge which forbids them. |
| Doc-chat placement | **Side panel** next to the doc body, mounting the **real agent `ChatWindow`** (models, effort, attachments: the same component as canvas chats). The doc and its references feed in as context; assistant messages get **Apply to doc**. *Revised 2026-10-03.* Data model is placement-agnostic, so it can move onto the canvas later. |
| Compaction vs. Doc | **Unified (2026-10-03).** Compaction is not its own entity. Compacting chats creates a Doc whose body is **generated** from their transcripts, and those chats are *placed on its child canvas*. Placements generalize to `{kind: 'doc' \| 'chat', id, position}`. Staleness (`sourceDigest`) and "regenerate?" apply to any doc with a generated body. Old `.fcw.json` compactions migrate on load. |
| Generating vs. referencing | **New doc + "link instead?" chip (2026-10-03).** Generating a diagram always creates new docs. A box whose title matches an existing doc shows a chip, and one click swaps it for a placement of the existing doc. No auto-linking. |
| Mermaid generation | **Constrain, validate, retry (2026-10-03).** The server prompts the agent to emit only the supported Mermaid subset. If `parseMermaid` fails, retry once with the parse error. If that fails, place the raw Mermaid in a single doc box so nothing is lost. Parser extensions remain separate TDD cycles. |

## Chats Meet Docs

v2's `ContextEdge` routes chat transcripts between chats. The generalization: **a doc can
be a context source in the same edge system.** A "chat against a document" = a ChatNode
with edges from the doc and (transitively) its references. "Chat with the canvas" = a
ChatNode fed by everything placed on that canvas. Docs contribute `assembleDocContext`
blocks where chats contribute transcripts — one context pipeline, not two.

`assembleDocContext(ws, docId, {budget})` is implemented and tested in
`graph-core/src/doc-context.ts`: BFS over placements, cycle-safe, deepest-first ordering
(mirrors v2's ancestors-before-own-messages), budget degrades distant docs to title-only,
the target doc is never degraded.

## Two Structures, Not One

The hand-drawn sequence sketches (`docs/sketches/`) revealed the real architecture:

- **Nesting is a tree.** Canvas → box → child canvas → deeper. The home icon walks back up.
- **References are a graph.** One doc (e.g. Frontend Architecture) is *placed* on many
  canvases via 🔗 references. One entity, one body — edit it anywhere, every canvas sees it.

Consequence: **canvases contain placements, not documents.** A placement is
`{docId, position}`. Docs live in one global table per workspace.

The payoff: the top-level "how it all meshes" map is never drawn or maintained.
Every doc = a node, every reference = an edge — the global graph is a *query*, not a document.
(Obsidian's graph view, but the nodes hold conversations and diagrams, not just text.)

## Mermaid Is Not a Sync Target

Worth stating plainly, because it removes a whole class of work:

Mermaid text is an **input** (the LLM writes it to propose a structure) and an **export**
(you press a button to get Mermaid back out). It is never a live two-way binding.

Regenerating Mermaid from the graph is useful for exactly two things:

1. **Getting structure out** — GitHub, Notion, and most Markdown renderers display Mermaid natively.
2. **Cheap context** — handing the model a compact one-line summary of a doc set's shape,
   instead of every document body.

Neither reaches back and overwrites human edits. There is no bidirectional sync to build.

## Rendering Stack: What We Deliberately Are Not Using

How Obsidian's graph view actually works, and why we diverge:

| Stage | Obsidian | FCW |
|---|---|---|
| Parse | scan `.md` for `[[wikilinks]]` → edges | same idea (`parseWikilinks`) |
| Layout | **d3-force** simulation in a Web Worker | tldraw + dagre |
| Render | **PIXI.js / WebGL**, 10k+ nodes at 50+ FPS | tldraw shapes |

Obsidian needs d3-force and a GPU pipeline because it renders one enormous global graph.
FCW's canvases are **scoped** — a few dozen shapes each — and tldraw already owns layout
and rendering. So **we add neither d3-force nor PIXI.js.** The transferable insight from
Obsidian is that the graph is *data* and the diagram is *rendering*, cleanly separable:
90% of the value is in the parser, which is why `graph-core` owns the parsing and the
frontend owns nothing but shapes.

One place this may need revisiting: the global "how it all meshed together" view
(sketch 04). If that view ever holds thousands of nodes, a force layout becomes relevant
again — but only for that one view, and only once it exists.

## Storage Path (deferred, not blocked)

The PoC embeds Markdown in `.fcw.json`. The natural next step is one `.md` file per box —
an Obsidian-style vault, git-friendly and readable outside FCW. At that point `parseWikilinks`
(already in `graph-core`) earns its keep: `[[links]]` between docs become canvas edges,
and the doc set becomes navigable both as files and as a graph.

Nothing in the PoC forecloses this.

## Build Order

1. ~~`parseMermaid(text) → {nodes, edges}`~~ — pure, tested, in `graph-core`. **Done.**
2. ~~`mermaidToDocNodes(graph)`~~ — maps parsed nodes onto doc nodes. **Done** (`graph-core` `mermaid-docs.ts`).
3. ~~Auto-layout positions~~ — dagre via `layoutDocNodes`. **Done** (frontend `doc-layout.ts`).
4. ~~Canvas rendering~~ — `DocShape` plus view-swap navigation. **Done** (`packages/frontend`).
5. ~~Expansion UI~~ — doc side panel: Markdown body editor, doc chat, Apply to doc. **Done** (`packages/frontend`).
6. ~~`graphToMermaid(canvas, ws) → string`~~ — the export direction. **Done** (`graph-core`; "Export Mermaid" button).

Build order for the full app now lives in `PLAN.md` (branch `structure-first-app`).
The structure-first prototype (`src/proto/`, `npm run proto`) was deleted in M6.2 after
its behaviour was proven in the real app (parity table: `PLAN.md` § M5.3).

## Parser Scope (current)

Supported today: `graph`/`flowchart` directives (skipped), `A[Label]` node declarations,
`-->` edges, bare re-references (`A --> C`), chained edges on one line, first-seen node ordering.

Not yet: other edge operators (`---`, `-.->`, `==>`), edge labels (`A -->|text| B`),
alternate node shapes (`(round)`, `{diamond}`, `((circle))`), subgraphs, quoted labels.
Each is its own TDD cycle when needed.
