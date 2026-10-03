# Branch: `structure-first-app`

> Checkpoint branch. Each branch in this repo captures a distinct architectural
> idea or stage, and grows out of the one before it. **These branches are not
> meant to merge back into each other.** `BRANCH.md` tells you which one you're
> standing in.

## The idea: build the full app

The experiments proved out. This branch is the attempt to build the **full
structure-first app** as laid out in `MERMAID-DOCS.md`, on top of everything the
parent branches built: the v2 chat-graph, the full agent chat windows, compaction,
and the structure-first engine and prototype.

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
- Throwaway prototype: `npm run proto`. Its verdict (in `src/proto/README.md`):
  view-swap navigation wins, spatial zoom is parked

## Decisions settled (2026-10-03)

1. **Compaction = Doc.** One entity; a compaction is a generated doc whose child canvas holds the chats.
2. **Generate new docs, offer "link instead?"** on title matches. No auto-linking.
3. **Doc chat = the real agent `ChatWindow` in a side panel**, with Apply to doc.
4. **Mermaid: constrain, validate, retry once, then fall back to a raw box.**

Build plan: `PLAN.md`. Master agent prompt: `ORCHESTRATOR.md`.
Full rationale in `MERMAID-DOCS.md`; the parent's notes are in the `mermaid-docs` `BRANCH.md`.
