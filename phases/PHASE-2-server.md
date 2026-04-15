# Phase 2 — Graph Server

**Type**: Sequential (requires Phase 1)
**Blocks**: Phase 4 (Streaming), Phase 3 (MCP Tools)
**Parallel with**: Phase 3 (Frontend) — can start simultaneously once Phase 1 is done
**Human Review**: No — tested via integration tests

## Goal

Local server that owns graph state, exposes WebSocket for frontend mutations, and provides HTTP endpoints for graph document management.

## Tasks

### 2.1 Server Scaffold
- [ ] Bun or Node server in `packages/server`
- [ ] WebSocket server (ws or native Bun WebSocket)
- [ ] HTTP routes for document CRUD
- [ ] In-memory graph state (one active graph at a time for MVP)

### 2.2 WebSocket Protocol
- [ ] Define message types: `node_created`, `node_updated`, `node_status_changed`, `edge_created`, `node_deleted`
- [ ] Server pushes mutations to all connected clients
- [ ] Client sends: `user_prompt_submitted`, `branch_requested`
- [ ] Message schema validation (zod or similar)

### 2.3 Document HTTP API
- [ ] `GET /documents` — list saved `.fcw.json` files
- [ ] `POST /documents` — create new graph document
- [ ] `GET /documents/:id` — load a graph
- [ ] `PUT /documents/:id` — save current graph state
- [ ] `DELETE /documents/:id` — delete a document
- [ ] Storage directory: configurable, defaults to `~/.fcw/documents/`

### 2.4 Graph State Manager
- [ ] Wraps `graph-core` operations
- [ ] On every mutation: persist to active document (debounced auto-save)
- [ ] Broadcasts mutations to WebSocket clients
- [ ] Tracks active document ID

## Acceptance Criteria

- [ ] Server starts, accepts WebSocket connections
- [ ] Creating a node via state manager broadcasts `node_created` to connected WS clients
- [ ] Can create, list, load, save, and delete documents via HTTP
- [ ] Auto-save triggers after mutations (debounced)
- [ ] Loading a document restores full graph state

## TDD Anchors

1. RED: test that WS client receives `node_created` after `createNode` is called on state manager
2. GREEN: implement broadcast
3. RED: test that `GET /documents` returns saved files from storage dir
4. GREEN: implement file listing

## Risks

| Risk | Mitigation |
|------|-----------|
| WebSocket message format changes break frontend | Define message schema as shared types in `graph-core` |
| Auto-save conflicts with manual save | Debounce auto-save, skip if manual save in flight |
