# Phase 1 — Foundation

**Type**: Sequential (everything depends on this)
**Blocks**: All other phases
**Human Review**: Yes — review graph schema before building on it

## Goal

Project scaffolding, test infrastructure, and the core graph data model. This is the bedrock — every other phase imports from here.

## Tasks

### 1.1 Project Setup
- [ ] Init monorepo (npm workspaces or turborepo)
- [ ] `packages/graph-core` — graph data model (pure logic, no I/O)
- [ ] `packages/server` — graph server
- [ ] `packages/frontend` — tldraw app
- [ ] Shared tsconfig, eslint, prettier
- [ ] Test framework (vitest)
- [ ] CI: lint + test on every commit

### 1.2 Graph Data Model (`packages/graph-core`)
- [ ] `GraphDocument` type — id, meta, nodes map, edges array
- [ ] `GraphNode` type — id, type, content, position, status, created
- [ ] `GraphEdge` type — from, to, type
- [ ] Node types enum: `user_prompt`, `response`, `code`, `tool_call`, `tool_result`, `thought`, `summary`, `annotation`
- [ ] Edge types enum: `reply_to`, `branches_from`, `references`, `tool_call`, `tool_result`
- [ ] Status enum: `streaming`, `complete`, `error`
- [ ] CRUD operations: `createNode`, `updateNode`, `deleteNode`, `createEdge`, `deleteEdge`
- [ ] `getSubgraph(nodeId, depth)` — returns a node and its neighborhood
- [ ] Serialization: `toJSON` / `fromJSON` for `.fcw.json` files
- [ ] Validation: ensure edges reference existing nodes, no orphan edges

### 1.3 Graph Summary Generator
- [ ] `generateSummary(graph)` — produces a compressed text summary of the graph for system prompt injection
- [ ] Interface only in this phase (actual LLM call wired in Phase 6)
- [ ] Structural fallback: type counts, node titles, edge structure

## Acceptance Criteria

- [ ] `npm test` runs from root, executes graph-core tests
- [ ] Can create a graph, add nodes/edges, serialize to JSON, deserialize back, and get identical structure
- [ ] `getSubgraph` returns correct neighborhood at depth 1 and 2
- [ ] Validation rejects edges pointing to non-existent nodes
- [ ] All node/edge types are typed (TypeScript enums or unions)

## TDD Anchors

Every task in 1.2 starts with a failing test. Example sequence:
1. RED: test that `createNode` returns a node with the correct type
2. GREEN: implement `createNode`
3. RED: test that `createEdge` rejects non-existent node references
4. GREEN: implement validation in `createEdge`

## Risks

| Risk | Mitigation |
|------|-----------|
| Schema changes late break everything | Human review gate before Phase 2 starts. Schema must be approved. |
| Over-engineering the data model | Keep it minimal. No features we don't need in MVP. |
