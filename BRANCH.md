# Branch: `mermaid-docs`

> Checkpoint branch. Each branch in this repo captures a distinct architectural
> idea or stage. **These branches are not meant to merge back into each other** —
> some explore genuinely different architectures. `BRANCH.md` tells you which one
> you're standing in.

## The idea: structure first

v1 and v2 both start with a **conversation** and let structure emerge from it.
This branch inverts that again: **start with structure, then fill it in.**

You ask for the shape of a problem, an LLM answers with a Mermaid diagram, and every
box in that diagram is a real document you can write into — or open as its own canvas
and keep thinking inside.

```
prompt → Mermaid text → boxes on canvas → each box IS a Markdown doc → expand with text
```

Sketch out a sign-in page. Select the "Sign in" box. Either write documentation into
it, or dive in and hold a focused conversation about what sign-in actually requires —
referencing the Frontend Architecture doc you already wrote. Dive into *that*, and you
find the diagrams and notes where those decisions were captured.

The point of the whole thing: **a tool for thinking through complex problems**, where the
structure of the thinking is visible and navigable instead of buried in a scroll.

> **Start here:** `docs/sketches/` holds the four hand-drawn frames this design came from,
> annotated. When a decision below seems arbitrary, the answer is usually in one of them.
> Full rationale in `MERMAID-DOCS.md`.

## Two structures, not one

- **Nesting is a tree.** Canvas → box → child canvas → deeper.
- **References are a graph.** One doc is *placed* on many canvases. One entity, one
  body: edit it anywhere, every canvas sees it.

So **canvases contain placements, not documents** — a placement is `{docId, position}`,
and docs live in one global table. The payoff: the top-level "how it all meshes" map is
never drawn or maintained. Every doc is a node, every reference an edge — the global
graph is a *query*, not a document. (Obsidian's graph view, except the nodes hold
conversations and diagrams, not just text.)

## What's implemented

All pure logic in `graph-core`, strict Red-Green-Refactor per `CLAUDE.md`. **10 tests, all
green**, clean under `strict: true`.

| Module | What it does |
|---|---|
| `wikilinks.ts` | `parseWikilinks` — extracts `[[targets]]` from Markdown |
| `mermaid.ts` | `parseMermaid` — flowchart text → `{nodes, edges}`; labels, `-->` edges, bare re-references, first-seen ordering |
| `docs.ts` | Uniform `Doc` (title, body, child canvas); `placeDoc` routes by id so one doc on two canvases stays one entity |
| `doc-context.ts` | `assembleDocContext` — BFS over references, deepest-first, cycle-safe, budget degrades distant docs to title-only; target never degrades |

```bash
cd packages/graph-core && npx vitest run
```

## Decisions locked

Full rationale in `MERMAID-DOCS.md`. In short:

- **Many shapes, one per box** — the diagram *is* the graph, not a picture of one
- **Box = doc from birth** — no promotion step, one entity type
- **Mermaid is input and export, never a live sync target** — your edits are truth;
  regenerating Mermaid is for getting structure *out* (GitHub, Notion) or as cheap
  context for the model
- **Chats live on canvases too** — two flavours, one pipeline: a **doc-builder chat**
  inherits its doc's references as context (recursively, with a token budget) and writes
  the body only on **explicit apply**; a **canvas chat** is fed by everything placed on
  the canvas, so you can talk to the whole surface. Docs contribute context blocks where
  v2 chats contribute transcripts — generalizing v2's `ContextEdge`, not competing with it
- **No d3-force, no PIXI.js** — Obsidian needs both for one giant global graph; our
  canvases are scoped and tldraw already owns layout and rendering. We take only the
  separable-parser insight (`MERMAID-DOCS.md` § Rendering Stack)
- **Spatial zoom-in** navigation (⚠ highest-risk choice — prototype with a kill criterion)
- Storage embedded in `.fcw.json` for the PoC; `.md` file export later, at which point
  `parseWikilinks` earns its keep

## What is NOT here

No UI. Nothing renders on the canvas, no chat panel, the server doesn't know about any
of this yet. Running the app looks exactly like the parent branch. This checkpoint is the
engine underneath — the pieces that are painful to change once UI depends on them.

Next, in order: `mermaidToDocNodes` (join parser to doc model), `applyToDoc`, dagre
positions, then the frontend slice.

## Related branches

- `compacting` — parent; v2 chat-graph plus compaction (see its own `BRANCH.md`)
- `v2` — the chat-graph inversion: node = chat window, edges = context inheritance
- `main`, `agent-chat-windows`, `collapse-system`, `phase5-chat-features`, `phase7-polish`
