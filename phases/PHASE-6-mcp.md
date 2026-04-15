# Phase 6 — MCP Tool Layer

**Type**: Sequential (requires Phase 5 — needs working graph + streaming first)
**Blocks**: Phase 7 (Persistence)
**Parallel with**: Nothing — this is the Claude Code integration layer
**Human Review**: YES — test with real Claude Code sessions. Does the bot use the tools well?

## Goal

Expose MCP tools so Claude Code can structurally mutate the graph. This is the "structure" channel of the hybrid architecture — Claude decides when to branch, cross-reference, or create summary nodes.

## Tasks

### 6.1 MCP Server Setup
- [ ] MCP server implementation (using @modelcontextprotocol/sdk)
- [ ] Register as a Claude Code MCP server (stdio or HTTP transport)
- [ ] Server advertises available tools to Claude Code

### 6.2 MCP Tools Implementation

```
canvas_create_node(type, content, parent_id?, metadata?)
  → Creates node, auto-connects to parent via reply_to edge
  → Returns { node_id, position }

canvas_update_node(node_id, content)
  → Replaces content of existing node
  → Returns { success }

canvas_connect(from_id, to_id, edge_type)
  → Creates edge between existing nodes
  → Returns { success }

canvas_branch(from_id)
  → Creates a branch point marker
  → Returns { branch_id } (use as parent_id for the branch's first node)

canvas_set_status(node_id, status)
  → Sets node status: "streaming" | "complete" | "error"
  → Returns { success }

canvas_get_context(node_id?, depth?)
  → Returns subgraph around node_id (default: root, depth: 2)
  → Includes: node types, content summaries, edge structure
  → Used by Claude to "read" the canvas state
```

### 6.3 Tool Descriptions for Claude
- [ ] Write clear, concise tool descriptions that guide Claude on *when* to use each tool
- [ ] Include examples in descriptions (e.g., "use canvas_branch when the user asks to explore an alternative approach")
- [ ] System prompt fragment that explains the canvas paradigm to Claude

### 6.4 Integration with Stream Pipeline
- [ ] MCP tool calls from Claude Code arrive alongside or between API stream segments
- [ ] Server applies MCP mutations to the same graph state as stream-created nodes
- [ ] Conflicts: MCP mutation wins if it targets a node the stream is also updating

## Acceptance Criteria

- [ ] Claude Code can discover and list FCW's MCP tools
- [ ] `canvas_create_node` from Claude Code creates a visible node on the canvas
- [ ] `canvas_connect` draws an edge between two existing nodes
- [ ] `canvas_get_context` returns accurate subgraph data that Claude can reason about
- [ ] Claude uses tools appropriately when instructed (e.g., "create a branch exploring option B")
- [ ] MCP mutations and stream mutations coexist without conflicts

## TDD Anchors

1. RED: test that MCP `canvas_create_node` call adds a node to graph state
2. GREEN: implement tool handler
3. RED: test that `canvas_get_context` returns correct subgraph structure
4. GREEN: implement context retrieval
5. RED: test that MCP mutation broadcasts to WS clients (same as stream mutations)
6. GREEN: wire MCP handlers through the same state manager

## Risks

| Risk | Mitigation |
|------|-----------|
| Claude doesn't use the tools well | Iterate on tool descriptions. Test with varied prompts. This needs human review. |
| MCP + stream race conditions | Single-threaded state manager with mutation queue. No parallel writes. |
| MCP transport choice (stdio vs HTTP) | Start with stdio (simplest for Claude Code). Add HTTP later if needed. |

## HUMAN REVIEW CHECKPOINT

After this phase, **test with real Claude Code sessions**:
- Give Claude a task. Does it use canvas tools to structure its thinking?
- Are the tool descriptions guiding Claude well?
- Does the graph output feel more useful than a chat log?
- What tool calls is Claude making that are unhelpful? Adjust descriptions.

This is the integration point — the whole thesis depends on Claude using these tools meaningfully.
