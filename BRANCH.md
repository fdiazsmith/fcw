# Branch: `compacting`

> Checkpoint branch. Each branch in this repo captures a distinct architectural
> idea or stage. **These branches are not meant to merge back into each other** —
> some explore genuinely different architectures. `BRANCH.md` tells you which one
> you're standing in.

## What this checkpoint is

Builds on the **v2 chat-graph** model (node = chat window, edges = context
inheritance — see `PROJECT-V2.md`) and adds **compaction**: the ability to collapse
one or more chats into a generated document node that stands in for them as context.

## What's here

**Compaction** (committed earlier in this branch)

- `graph-core`: compaction model, digest-based staleness detection, WS protocol types
- `server`: document generator with structural fallback, session manager ops
  (compact / regenerate / edit / move), WS routing
- `frontend`: `CompactShape` with a TipTap markdown editor, store state + staleness
  helper, canvas pages with dive-in navigation and breadcrumb, compact button
- Smoke gate against a real server, plus a nested-dependency check fix

**Token usage + folder picker** (this commit — work in flight when the checkpoint was taken)

- `TokenUsage` type and `addTurnUsage` in `graph-core/chat-graph.ts` — per-turn input,
  output, cache-read and cache-creation tokens, cost, and turn count accumulated per chat
- Chat state carries `usage` and `contextChats`, surfaced through server routes,
  turn events, and the chat window UI
- `FolderPicker` component + directory-listing route, so a local working folder can be
  chosen from the UI (groundwork for running FCW against a real project directory)

## State

Committed as a checkpoint, not as finished work. The compaction feature is built out
across all three packages; the token-usage and folder-picker work was mid-flight and is
captured here so the branch is a complete, restorable snapshot.

```bash
npm test          # all workspaces
npm run dev       # server + frontend
```

## Related branches

- `v2` — the chat-graph inversion this branch builds on
- `mermaid-docs` — structure-first direction: diagrams generate documents (different
  architecture, does not merge with this one)
- `main`, `agent-chat-windows`, `collapse-system`, `phase5-chat-features`, `phase7-polish`
