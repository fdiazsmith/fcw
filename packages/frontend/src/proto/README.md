# Structure-first prototype

Throwaway. No server, no WebSocket, no `.fcw.json` — state is `localStorage`, the
"LLM" is a keyword match. It exists to answer one question:

> **Do multiple canvases of diagrams, where every box is a document, actually work?**

```bash
npm run proto          # from the repo root → opens /proto.html on :8008
```

The main app is untouched; this is a second Vite entry (`proto.html`).

---

## What to click

It boots with the scenario from `docs/sketches/`, three levels deep.

| Do this | Because |
|---|---|
| Look at the root canvas | Sketch 01. The sign-in flow is **real shapes**, one per Mermaid box, not a picture. Every one is already a document. |
| `⤢ Canvas · 4` on **Sign in** | Sketch 02. A scoped canvas holding references, prose and room to sketch. |
| `Write` on **API calls** | 🔗 **REFERENCE · 2 CANVASES**. One doc, placed on Sign in *and* Frontend Architecture. Edit the body; both canvases show it. **This is the load-bearing claim.** |
| Drag the **budget** slider down | Context blocks degrade to title-only from the most distant inward, and the target never degrades. Real `assembleDocContext`, not a mock. |
| Type in the chat → `Apply to doc` | The draft sits there until you press the green button. Chats never silently write. |
| **Global graph** | Sketch 04. Every doc a node, every placement an edge — computed, never stored or maintained. |
| Draw with the pencil, then navigate away and back | Freehand survives. The store owns doc boxes; tldraw owns everything else. |
| Prompt bar → `⌥` → paste any Mermaid | `graph TD` / `flowchart`, `A[Label]`, `-->`, chains. Anything else falls back to a generic scaffold. |

`Reset · sketches` reloads the scenario. `Reset · empty` starts from sketch 01's
blank canvas and a prompt bar.

---

## What this establishes

- **Box = doc from birth works.** No promotion step was ever wanted while
  clicking. A box with an empty body and an empty canvas is not an awkward
  state, it's just a box you haven't filled in yet.
- **Placements, not documents, is right.** The reference case is the one that
  would have been painful to retrofit, and it falls out for free. `pathToRoot`,
  the breadcrumb, "placed on", and the global graph are all queries over the
  same table.
- **`assembleDocContext` behaves.** 12 blocks on the Sign in canvas, ordered
  deepest-first, degrading correctly under budget. It was written blind against
  tests and needed no changes to drive a UI.
- **Docs and freehand coexist.** Sketch 02 mixes generated diagrams, prose and a
  wireframe on one surface; nothing about that fights tldraw.

## What it does not answer

- **Nothing is persisted server-side.** `.fcw.json`, the WebSocket and the MCP
  path are untouched.
- **Generating vs referencing is a fork in the road.** Generating a diagram
  always mints *new* docs, even when a box is named the same as one that already
  exists — the second `API calls` under Auth is a different document from the
  seeded one. Deduplicating by title, or offering "link to the existing one
  instead", is an open product question this prototype deliberately leaves open.
- **No `graphToMermaid`.** Export is step 6 and isn't here.

---

## Spatial zoom — parked

The toggle still says `Spatial zoom (parked)` and the code is in
`SpatialCanvas.tsx`, kept for reference rather than deleted.

It works: every canvas is drawn on one page, nested geometrically inside its
parent and scaled to fit, and diving is a camera move. `DocShape` grew a
three-way level-of-detail rule (`surrounding` / `card` / `block`) specifically
to make it survivable, because a box you have zoomed *into* otherwise renders
its own title at 300pt and its buttons the size of the viewport.

Two limits are structural rather than incidental, and worth remembering if it is
ever revived:

1. **Depth costs zoom exponentially.** Each level scales by roughly 0.15, so
   depth 3 lands near 2% and needs a 64× camera. Nesting is capped at
   `MAX_DEPTH = 3`; past it the camera has nowhere to go and the UI says so.
2. **References can't nest.** A doc placed inside its own ancestry would recurse
   forever, so the walk cuts on cycles. Nesting is a tree; references are a
   graph — spatial rendering can only ever show the tree half.

View-swap has neither problem: it's flat, unbounded in depth, and a reference is
just another box.

---

## Layout

| File | |
|---|---|
| `store.ts` | Workspace state + actions. Immutable, `localStorage`. |
| `seed.ts` | Canned diagrams and the three-level sketch scenario. |
| `DocShape.tsx` | The box that is a doc, with the level-of-detail rule. |
| `sync.ts` | Project the store onto tldraw shapes; leave user shapes alone. |
| `SwapCanvas.tsx` | Navigation: one tldraw page per canvas. **The direction.** |
| `SpatialCanvas.tsx` | Navigation: geometric nesting. **Parked.** |
| `DocPanel.tsx` | Body editor, references, doc-builder chat. |
| `GlobalGraph.tsx` | Sketch 04, ~30 lines of springs. No d3-force. |

Two things graduated out of the prototype into tested code, because they're
steps 2 and 3 of `MERMAID-DOCS.md` § Build Order and were going to be written
anyway:

- `graph-core/src/mermaid-docs.ts` — `mermaidToDocNodes`, 5 tests
- `frontend/src/doc-layout.ts` — `layoutDocNodes` (dagre, top-left corners), 4 tests

Everything else in this folder is untested by design. Delete the folder when the
question is settled.
