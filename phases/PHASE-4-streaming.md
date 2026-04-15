# Phase 4 — Dual-Channel Streaming Pipeline

**Type**: Sequential (requires Phase 2 + Phase 3)
**Blocks**: Phase 5 (Interactions), Phase 6 (MCP)
**Human Review**: YES — this is the core value proposition. Review streaming UX end-to-end.

## Goal

Wire the hybrid data flow: server proxies Claude API (captures token stream for live rendering) while MCP tools handle structural graph mutations. This is where the product comes alive.

## Tasks

### 4.1 Claude API Integration
- [ ] Server-side Claude API client (Anthropic SDK)
- [ ] Streaming response handler (SSE from API)
- [ ] API key config (env var or config file)
- [ ] System prompt construction: include graph summary + MCP tool descriptions

### 4.2 Stream-to-Graph Mapper
- [ ] As tokens arrive, server creates/updates graph nodes:
  - First text block → create `response` node (status: `streaming`)
  - Token chunks → update node content, broadcast via WS
  - `tool_use` block detected → create `tool_call` node, connect to response
  - Tool result received → create `tool_result` node
  - New text block after tool → new `response` node or continue existing
  - Stream end → set all active nodes to `complete`
- [ ] Handle `stop_reason` variants: `end_turn`, `tool_use`, `max_tokens`
- [ ] Error handling: stream failures set node status to `error`

### 4.3 Concurrent Node Streaming
- [ ] Support multiple nodes streaming simultaneously
- [ ] Parallel tool calls each get their own `tool_call` + `tool_result` node pair
- [ ] WS broadcasts include `node_id` so frontend knows which shape to update

### 4.4 Tool Execution
- [ ] Server executes tool calls on behalf of Claude
- [ ] Results fed back into the API conversation
- [ ] Multi-turn: tool results trigger continued generation

### 4.5 Frontend Streaming UX
- [ ] Growing node: node physically expands as content streams in
- [ ] Layout engine adjusts as nodes grow (debounced re-layout)
- [ ] Auto-follow tracks the active streaming node
- [ ] Multiple streaming nodes visible simultaneously

## Acceptance Criteria

- [ ] User submits a prompt → sees a `user_prompt` node appear
- [ ] Claude's response streams token-by-token into a growing `response` node
- [ ] Tool calls appear as separate `tool_call` → `tool_result` node pairs
- [ ] After tool results, Claude's continued response appears in a new connected node
- [ ] Stream errors show node with `error` status and error message
- [ ] Parallel tool calls produce concurrent streaming nodes
- [ ] Full round-trip latency from prompt submit to first visible token: < 2s (network permitting)

## TDD Anchors

1. RED: test that a mock SSE stream of text_delta events produces a `response` node with accumulated content
2. GREEN: implement stream-to-graph mapper for text blocks
3. RED: test that a `tool_use` event in the stream creates a `tool_call` node connected to the response
4. GREEN: implement tool_use detection and node creation
5. RED: test that parallel tool_use blocks create concurrent nodes
6. GREEN: implement concurrent node tracking

## Risks

| Risk | Mitigation |
|------|-----------|
| Claude API streaming format changes | Pin SDK version, integration tests against mock streams |
| Growing nodes cause layout thrashing | Debounce re-layout (100-200ms). Only re-layout on significant size changes. |
| Tool execution failures mid-stream | Graceful error nodes. Don't crash the stream. |
| Token cost during development | Use haiku for dev/testing, opus for production |

## HUMAN REVIEW CHECKPOINT

After this phase completes, **stop and review**:
- Does the streaming feel responsive? Is the growing-node UX natural?
- Are tool call nodes clear? Can you follow the reasoning flow?
- Does the layout stay stable during streaming or does it jump around?
- Is this *better* than a chat scroll? This is the existential question.

If this doesn't feel better than chat, we need to rethink before proceeding.
