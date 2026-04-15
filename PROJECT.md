# FCW — Flow Canvas for Work

## Problem

Chat interfaces are linear scrolls. Thinking isn't. Conversations branch, loop, reference earlier points. A chatbot's reasoning is a graph forced into a list.

## Core Idea

Replace the chat window with a **tldraw canvas** where the bot places its output as **nodes in a diagram**. Each thought, answer, code block, or tool result becomes a node connected to its context. Conversations become saveable, loadable graph documents.

## Architecture

**Hybrid: API stream + MCP.** The server owns the Claude API connection directly (captures the token stream for live rendering) AND exposes MCP tools for structural graph mutations. Two channels: **stream for content, MCP for structure.**

```
                        ┌─── Claude API (token stream) ───┐
                        │                                  ▼
[Claude Code] --MCP tools--> [Local Server] --WebSocket--> [tldraw Frontend]
                                   │                            │
                              [Graph Store]              [Linear Log Sidebar]
                             (file-based docs)            (toggleable)
```

The server is the **orchestrator**, not a passthrough.

### Components

1. **Graph Server (Orchestrator)** — Local Node/Bun server. Owns graph state. Proxies Claude API for streaming. Exposes MCP tools for graph structure. Pushes mutations to frontend via WebSocket.
2. **tldraw Frontend** — Renders the graph as a canvas. User can pan, zoom, select nodes, branch conversations. Color-coded nodes by type.
3. **Linear Log Sidebar** — Toggleable collapsible panel showing a traditional linear chat log. Optional secondary view for reading/export.
4. **Graph Documents** — JSON files. Each file = one conversation graph. Load to resume, save to persist.
5. **MCP Tool Layer** — Structural interface: create nodes, connect edges, branch. The bot uses these for graph mutations while the API stream handles content delivery.

## Graph Schema

Not GraphQL (that's a query language). We need a **graph data format** — nodes + edges with types.

```jsonc
{
  "id": "doc_001",
  "meta": { "created": "...", "title": "..." },
  "nodes": {
    "n1": {
      "type": "user_prompt",      // or: "response", "code", "tool_call", "tool_result", "thought", "summary"
      "content": "how do I ...",
      "position": { "x": 0, "y": 0 },  // tldraw coords, computed by layout engine
      "created": "...",
      "status": "complete"              // or: "streaming", "error"
    }
  },
  "edges": [
    { "from": "n1", "to": "n2", "type": "reply_to" }
    // edge types: "reply_to", "branches_from", "references", "tool_call", "tool_result"
  ]
}
```

### Node Types

Color-coded by type for scannability.

| Type | What it represents | Color |
|---|---|---|
| `user_prompt` | User message / question | Blue |
| `response` | Bot's prose answer | Green |
| `code` | Code block (with language metadata) | Dark / monospace |
| `tool_call` | Bot invoked a tool | Orange |
| `tool_result` | Result from a tool | Yellow |
| `thought` | Intermediate reasoning step | Gray |
| `summary` | Collapsed summary of a subtree | Purple |
| `annotation` | User-added note on the canvas | Light yellow |

## MCP Tools (Bot-Facing API)

The bot doesn't parse freeform text into nodes. It gets **explicit graph mutation tools**:

```
canvas_create_node(type, content, parent_id?, metadata?)
  → creates a node, auto-connects to parent, returns node_id

canvas_update_node(node_id, content)
  → appends/replaces content in a node (for streaming)

canvas_connect(from_id, to_id, edge_type)
  → creates an edge between existing nodes

canvas_branch(from_id)
  → signals the start of an alternative path

canvas_set_status(node_id, status)
  → marks node as "streaming" | "complete" | "error"

canvas_get_context(node_id?)
  → returns the subgraph around a node (so bot can read back the canvas)
```

The bot calls these tools AS it thinks. This is the most reliable approach — tool use is structured, consistent, and already what Claude Code does well.

## User Input

Two input modes:

1. **Floating input bar** — persistent bar at bottom of canvas for new top-level prompts. Creates a new `user_prompt` node at a layout-determined position.
2. **Click-on-node** — click an existing node to branch from that point. Opens inline text field. Creates a `user_prompt` node connected to the clicked node via `branches_from` edge.

## Dual-Channel Streaming Protocol

The server uses **two channels** to get bot output onto the canvas:

- **Claude API stream** — token-by-token content. Server intercepts the stream, creates/updates nodes, and pushes content to frontend via WebSocket in real time.
- **MCP tools** — structural mutations. Claude calls `canvas_create_node`, `canvas_connect`, `canvas_branch` to control graph topology. These are coarse, intentional actions.

The state machine:

```
1. User types prompt (floating bar or click-on-node)
2. Server creates `user_prompt` node, pushes to frontend
3. Server calls Claude API with graph context
4. As tokens stream back:
   a. Server creates a "response" node (status: "streaming"), pushes to frontend
   b. Server forwards token chunks via WebSocket → frontend renders live
   c. If Claude emits a tool_use block:
      - Server creates "tool_call" node, connects to response
      - Executes tool, creates "tool_result" node
      - Resumes streaming into a new or existing response node
   d. On stream end: server sets node status to "complete"
5. During the response, Claude may also call MCP tools:
   - canvas_create_node → explicit structural decisions (new branch, summary, etc.)
   - canvas_connect → cross-references between nodes
   - canvas_branch → fork the conversation
```

The frontend receives all mutations over WebSocket and updates tldraw shapes in real time.

## Context Loading (Resume Conversation)

When loading an old `.fcw.json` graph:

1. **Compressed summary** injected into system prompt — graph structure, key decisions, topic flow. Keeps token cost bounded.
2. **`canvas_get_context(node_id?)`** tool available for Claude to drill into specific nodes/branches on demand.

This balances token cost (don't send the whole graph) with access (Claude can query what it needs).

## Auto-Layout

tldraw doesn't auto-layout. We need a layout engine:

- **dagre** or **elkjs** for directed graph layout
- Run layout on graph changes, animate nodes to new positions
- User can drag nodes to override — pinned positions survive re-layout
- Collapse/expand subtrees to manage complexity

## Document Format & Persistence

- Each conversation = one `.fcw.json` file
- Save: serialize graph state to file
- Load: deserialize, run layout, render on canvas
- Could later support export to other formats (mermaid, dot, markdown)

## User Interactions

- Click canvas to start a new prompt (creates `user_prompt` node)
- Click a node to branch from that point (fork the conversation)
- Collapse a subtree into a summary node
- Drag to rearrange (pins position)
- Select nodes to copy/export content
- Search across node contents

## Resolved Decisions

- **Data flow**: Hybrid — API stream for content, MCP tools for structure
- **User input**: Floating bar for new prompts + click-on-node for branching
- **Context loading**: Compressed summary in system prompt + tool-based drill-down
- **Node visuals**: Color-coded by type, same shape (cards)
- **Secondary view**: Toggleable linear log sidebar
- **Streaming UX**: Growing node — node starts small, physically expands as content streams in. Layout adjusts dynamically.
- **Graph summary**: LLM-generated summary on save. Load stays fast (no LLM call needed on resume).
- **Navigation**: Auto-follow active node. Canvas auto-pans to keep streaming/recent node in view. Manual pan breaks auto-follow.
- **Node content**: Markdown rendered inside nodes. Code gets syntax highlighting. Max height with scroll-to-expand on click.
- **Concurrency**: Multiple nodes can stream simultaneously. Parallel tool calls each get their own node updating in real time.

## Open Questions

1. **Node granularity control** — decide during prototype. Server splits at tool_use boundaries. Within a single response, one node vs split by heading TBD.
2. **Layout algorithm choice** — dagre (simple) vs elkjs (powerful). Prototype both.

## Tech Stack

- **Frontend**: tldraw + React
- **Server**: Node.js or Bun
- **Protocol**: WebSocket (server↔frontend), MCP (Claude Code↔server)
- **Layout**: dagre or elkjs
- **Storage**: local JSON files (`.fcw.json`)
- **Scope**: Claude Code-specific via MCP/skills first. Generalize later.

## Phase 1 — MVP

1. Local server with graph state in memory
2. MCP tools registered with Claude Code
3. tldraw frontend rendering nodes + edges
4. Basic dagre layout
5. Save/load `.fcw.json` files
6. Single-branch conversation (no forking yet)
