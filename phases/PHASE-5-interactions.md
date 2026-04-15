# Phase 5 — User Input & Interactions

**Type**: Sequential (requires Phase 4)
**Blocks**: Phase 6 (MCP)
**Human Review**: Yes — UX feel for input modes and branching

## Goal

User can submit prompts via floating bar or click-on-node. Branching, collapsing subtrees, copy/export, search.

## Tasks

### 5.1 Floating Input Bar
- [ ] Persistent input bar at bottom of canvas
- [ ] Submit sends prompt to server → server calls Claude API
- [ ] Creates `user_prompt` node at layout-determined position
- [ ] Input clears on submit, shows loading state while waiting for first token
- [ ] Keyboard shortcut: focus input bar (Cmd+K or similar)

### 5.2 Click-on-Node Branching
- [ ] Click a node → shows "branch from here" action
- [ ] Opens inline text field attached to the node
- [ ] Submit creates `user_prompt` node connected via `branches_from` edge
- [ ] Server sends only the branch's context to Claude (not the full graph)

### 5.3 Subtree Collapse
- [ ] Right-click or button to collapse a subtree
- [ ] Collapsed subtree becomes a single `summary` placeholder node
- [ ] Expand restores all child nodes
- [ ] Layout re-runs on collapse/expand

### 5.4 Node Actions
- [ ] Select node → copy content to clipboard
- [ ] Select multiple nodes → export as markdown
- [ ] Delete annotation nodes (user-created only)
- [ ] Add annotation: click empty canvas → create `annotation` node

### 5.5 Search
- [ ] Search bar (Cmd+F) filters/highlights nodes by content match
- [ ] Matching nodes glow, non-matching nodes dim
- [ ] Click search result → pan to that node

## Acceptance Criteria

- [ ] Can submit prompts from floating bar, see response appear on canvas
- [ ] Can click a node, type a follow-up, see a branched response
- [ ] Branched conversations form visible forks in the graph
- [ ] Can collapse a 5-node subtree into one summary node and expand it back
- [ ] Copy node content works (clipboard)
- [ ] Search highlights matching nodes and pans to selected result

## TDD Anchors

1. RED: test that submitting from floating bar creates a `user_prompt` node via server
2. GREEN: implement floating bar → server → node creation flow
3. RED: test that branching from node N creates an edge of type `branches_from` from N
4. GREEN: implement branch flow
5. RED: test that collapsing a subtree hides child nodes and shows summary
6. GREEN: implement collapse logic

## Risks

| Risk | Mitigation |
|------|-----------|
| Branch context selection is wrong (sends too much/little to Claude) | Start simple: send the path from root to branch point. Iterate. |
| tldraw event handling conflicts with custom interactions | Use tldraw's tool API for custom interactions, don't fight the framework |
| Collapse/expand breaks layout | Test with graphs of various shapes before considering done |
