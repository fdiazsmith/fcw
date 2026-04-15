# FCW Implementation Phases — Overview

## Phase Map

```
Phase 1: Foundation
    │
    ├──────────────────┐
    │                  │
    ▼                  ▼
Phase 2: Server    Phase 3: Frontend    ← PARALLEL
    │                  │
    └────────┬─────────┘
             │
             ▼
    Phase 4: Streaming Pipeline          ← HUMAN REVIEW: core UX
             │
             ▼
    Phase 5: User Input & Interactions
             │
             ▼
    Phase 6: MCP Tool Layer              ← HUMAN REVIEW: Claude integration
             │
             ▼
    Phase 7: Persistence & Context       ← HUMAN REVIEW: MVP gate
```

## Execution Summary

| Phase | Name | Depends On | Parallel? | Human Review? |
|-------|------|-----------|-----------|---------------|
| 1 | Foundation | — | No (first) | Yes: schema approval |
| 2 | Server | 1 | **Yes: with Phase 3** | No |
| 3 | Frontend | 1 | **Yes: with Phase 2** | **Yes: first visual** |
| 4 | Streaming | 2 + 3 | No (join point) | **Yes: core value prop** |
| 5 | Interactions | 4 | No | Yes: UX feel |
| 6 | MCP Tools | 5 | No | **Yes: Claude integration** |
| 7 | Persistence | 6 | No | **Yes: MVP ship/no-ship** |

## Human Review Checkpoints

### After Phase 1 — Schema Review
- Is the graph data model right before we build on it?
- Are we missing node types or edge types?

### After Phase 3 — First Visual
- Does the canvas feel right? Colors, sizes, layout?
- Is dagre producing readable graphs?
- Does the growing-node animation work?

### After Phase 4 — Core Value Prop
- Does streaming to canvas feel better than a chat scroll?
- Is the layout stable during streaming?
- Are tool call nodes clear and followable?
- **If this doesn't feel better than chat, stop and rethink.**

### After Phase 6 — Claude Integration
- Does Claude use MCP tools meaningfully?
- Are tool descriptions guiding Claude well?
- Does the graph output feel structured and useful?

### After Phase 7 — MVP Gate
- Full end-to-end: new conversation → multi-turn → save → load → resume → branch
- **Ship or no-ship decision.**

## Parallelization Opportunities

Only one parallelization window exists in MVP:

**Phase 2 (Server) + Phase 3 (Frontend)** can run simultaneously because:
- Phase 2 produces a WebSocket API (server-side)
- Phase 3 consumes a WebSocket API (client-side)
- Shared message types defined in Phase 1's `graph-core` package
- Both can develop against the shared types with mock data

Everything else is sequential — each phase builds on the previous.

## Estimated Scope

| Phase | Complexity | Key Risk |
|-------|-----------|----------|
| 1 | Low | Getting the schema right |
| 2 | Medium | WebSocket protocol design |
| 3 | High | tldraw custom shapes + dagre integration |
| 4 | High | Stream parsing + concurrent nodes |
| 5 | Medium | tldraw interaction model |
| 6 | Medium | Claude tool description quality |
| 7 | Medium | LLM summary quality for context resume |

Phase 3 and 4 are the hardest. Budget extra time and human review there.
