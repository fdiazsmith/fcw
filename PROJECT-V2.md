# FCW v2 — Chat-Graph

## The Inversion

v1: node = message, edges record what happened.
v2: **node = chat window, edges = context inheritance.** The graph is a live context-routing surface, not a transcript visualization.

A chat shape on the tldraw canvas is a full chat window — streaming, tool calls, callouts, quoting. Chats are stateless: every query compiles history fresh by walking incoming edges upward. Therefore **re-wiring an edge rewrites history**. Connect a chat to a different parent and its next query runs against a different past.

## Core Interactions

- **Double-click canvas** → new empty chat shape (a root).
- **Hover a chat's edge** → branch handle (+) → drag out a child chat that inherits the parent's full transcript as context.
- **Connect/disconnect edges** between any chats. A chat may have **multiple parents**; their histories merge into its context.
- **Toggle edges** to switch which past a chat sees. History is rebuilt on the next query — no migration step.

## Data Model (graph-core v2)

```ts
ChatNode {
  id: string
  title: string            // auto-named after first exchange
  messages: Message[]      // this chat's own transcript
  meta: { position, createdAt, collapsed }
}

ContextEdge {
  from: ChatNodeId         // parent (context source)
  to: ChatNodeId           // child (context consumer)
  enabled: boolean         // toggle without deleting
  priority: number         // tie-break for merge ordering
}
```

Constraints: DAG (cycle prevention on edge create), edges carry no content — they only route.

### Context Assembly (the heart of v2)

`assembleContext(graph, chatId) -> Message[]`

1. Collect all ancestors reachable via **enabled** edges.
2. **Dedup** shared ancestors (diamond: A→B, A→C, B+C→D ⇒ A's transcript appears once).
3. **Topological sort**; ties broken by edge priority, then createdAt. Deterministic — same graph, same context, always.
4. Concatenate ancestor transcripts in order, then the chat's own messages.
5. Apply token budget: distant ancestors degrade to summaries (salvage `llm-summary`) before truncation.

Pure function, no I/O. This is where TDD pays off most — write the diamond, multi-root, disabled-edge, cycle, and budget cases first.

## Architecture

| Layer | Salvage from v1 | Rewrite |
|-------|-----------------|---------|
| graph-core | serialization patterns, validation approach | ChatNode/ContextEdge types, context assembly |
| server | claude-client, ws-server, stream-mapper, state-manager skeleton, persistence | prompt-handler (keyed to chat node), context-builder → assembler |
| frontend | ws-client, colors, export concepts | ChatShape (the big one), edge UI, branch handle |

Retired: GraphNodeShape, dagre layout, collapse system, log sidebar, per-message node types. v2 lives on a `v2` branch; old code deleted there, not contorted.

**MCP layer: deferred.** v2's first job is proving the chat-graph UX with direct API streaming. Re-introduce MCP once the surface is stable.

## Known Risks

1. **Rich UI inside tldraw shapes.** Scrollable, selectable, interactive chat inside a canvas shape means fighting pointer-event capture, wheel-zoom vs scroll, text selection vs drag. Prototype this in Phase 2 before anything else depends on it.
2. **Merged-context token explosion.** Multiple parents multiply history. Budget + ancestor summarization is required, not optional.
3. **Merge ordering surprises.** Deterministic topo order may still feel wrong to a user ("why is Chat C's history before Chat A's?"). Surface the assembled order in UI (context inspector) so it's never a mystery.

## Phases

```
1 core → 2 ChatShape → 3 branch → 4 re-wire → 5 chat features → 6 persistence → 7 polish
                ▲                       ▲
          kill criterion          core bet review
```

### Phase 1 — Chat-Graph Core
ChatNode/ContextEdge types, CRUD, cycle prevention, `assembleContext` with merge + dedup + budget. All pure, all tested.
**Review: merge semantics approved before UI exists.**

### Phase 2 — ChatShape MVP
One chat shape on canvas: double-click to create, type, streamed response renders inside (markdown, code). No edges yet.
**Review: does a chat inside a tldraw shape feel right? If the shape fights the canvas, stop and rethink the container.**

### Phase 3 — Branching
Hover-edge + handle → child chat. Child's queries include parent transcript. Visual edge with direction.

### Phase 4 — Re-wiring
Connect/disconnect/toggle edges between existing chats. Multiple parents merge. Context inspector shows what the chat will see.
**Review: the core bet — does switching a parent and getting a different past feel as good as it sounds?**

### Phase 5 — Chat Features
Tool calling rendered as callouts in-chat, quoting (quote any message into the input), auto-titling, stop/regenerate.

### Phase 6 — Persistence
`.fcw.json` format v2 (versioned). Save/load full canvas. v1 docs: no migration — different species.

### Phase 7 — Polish
Collapse chat to a pill, cross-chat search, export branch-as-markdown, multi-select.

## TDD Discipline (unchanged)

Red-Green-Refactor per CLAUDE.md. Phase 1 is pure functions — strictest TDD. Phase 2's shape-interaction work gets tests at the logic layer (state, message flow) plus manual review gates for feel.
