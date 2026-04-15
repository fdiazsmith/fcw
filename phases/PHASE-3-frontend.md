# Phase 3 — Frontend Core

**Type**: Parallel with Phase 2 (both start after Phase 1)
**Blocks**: Phase 4 (Streaming), Phase 5 (Interactions)
**Human Review**: YES — first visual milestone. Review canvas rendering, node design, layout feel.

## Goal

tldraw canvas that renders graph nodes and edges. Color-coded by type. Auto-layout via dagre. Connects to server via WebSocket and reacts to mutations.

## Tasks

### 3.1 App Scaffold
- [ ] React + Vite app in `packages/frontend`
- [ ] tldraw as main canvas component
- [ ] WebSocket client connecting to server

### 3.2 Custom Node Shapes
- [ ] Custom tldraw shape for graph nodes
- [ ] Render markdown content inside nodes (use a lightweight md renderer)
- [ ] Syntax highlighting for `code` type nodes
- [ ] Max height with scroll-to-expand on click
- [ ] Color coding by node type:
  - `user_prompt` → Blue
  - `response` → Green
  - `code` → Dark / monospace
  - `tool_call` → Orange
  - `tool_result` → Yellow
  - `thought` → Gray
  - `summary` → Purple
  - `annotation` → Light yellow
- [ ] Status indicator: `streaming` nodes show growing animation

### 3.3 Edge Rendering
- [ ] Render edges as arrows between nodes
- [ ] Edge style varies by type (solid for `reply_to`, dashed for `references`, etc.)

### 3.4 Layout Engine
- [ ] Integrate dagre for directed graph layout
- [ ] Compute positions on graph change
- [ ] Animate nodes to new positions (tldraw transition)
- [ ] Pinned positions: if user drags a node, mark it pinned — survives re-layout
- [ ] Collapse/expand subtrees (collapsed → summary node placeholder)

### 3.5 WebSocket Integration
- [ ] Listen for server mutations (`node_created`, `node_updated`, etc.)
- [ ] On `node_created`: add shape to canvas, run layout
- [ ] On `node_updated`: update shape content, grow node if needed
- [ ] On `node_status_changed`: update visual status indicator
- [ ] On `edge_created`: add arrow, run layout

### 3.6 Auto-Follow
- [ ] Canvas auto-pans to keep the most recently active node in view
- [ ] Manual pan/zoom breaks auto-follow
- [ ] Clicking a streaming node re-enables auto-follow on it

## Acceptance Criteria

- [ ] Canvas renders a test graph with 5+ nodes and edges
- [ ] Each node type has correct color
- [ ] Dagre layout produces readable left-to-right or top-to-bottom graph
- [ ] Dragging a node pins it; re-layout doesn't move pinned nodes
- [ ] WebSocket mutations from server appear on canvas in real time
- [ ] Markdown renders inside nodes, code blocks have syntax highlighting
- [ ] Growing animation visible on streaming-status nodes

## TDD Anchors

Frontend tests use vitest + testing-library or playwright for e2e:
1. RED: test that a `node_created` WS message adds a shape to the canvas
2. GREEN: implement WS listener + shape creation
3. RED: test that node color matches its type
4. GREEN: implement color mapping

## Risks

| Risk | Mitigation |
|------|-----------|
| tldraw custom shapes API is complex | Prototype a single custom shape first before building all types |
| Dagre layout looks bad at scale | Start with small graphs. Layout algorithm is swappable (elkjs later) |
| Markdown rendering perf in many nodes | Lazy-render: only render visible nodes' content |

## HUMAN REVIEW CHECKPOINT

After this phase completes, **stop and review**:
- Does the canvas feel right? Node sizes, colors, spacing?
- Is the layout algorithm producing readable graphs?
- Does the growing node animation feel natural?
- Is the auto-follow behavior intuitive?

This is the first time the product is *visual*. Get it right before building streaming on top.
