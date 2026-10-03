# FCW — Flow Canvas for Work

Canvas-based chatbot interface that replaces linear chat scrolls with a tldraw graph. Bot responses, tool calls, and reasoning steps appear as connected nodes on a visual canvas.

## Quick Start

```bash
# Install dependencies
npm install

# Copy env and add your API key
cp .env.example .env.local
# Edit .env.local → set ANTHROPIC_API_KEY

# Run server + frontend
npm run dev
```

Open http://localhost:8008

## Demo Mode (no API key needed)

```bash
npm run dev --workspace=packages/frontend
```

Without `VITE_WS_URL` set, the frontend loads a sample graph with 10 nodes showing all node types, colors, and arrows.

## Structure-first docs (this branch)

Boxes on the canvas are docs. Generate a diagram from a prompt or pasted Mermaid, dive into a box to get its own canvas, write the body in a side panel (with a doc chat and "Apply to doc"), compact chats into a doc, view the global graph, and export any canvas back to Mermaid. See `MERMAID-DOCS.md` for the design and `BRANCH.md` for what's implemented and how to run it.

## Architecture

```
[Claude API] ←stream→ [Server :8009] ←WebSocket→ [Frontend :8008]
                           │                           │
                      [.fcw.json]                 [tldraw canvas]
```

**Hybrid data flow**: Server proxies Claude API (token stream for live rendering) + MCP tools (structural graph mutations).

## Packages

| Package | What |
|---------|------|
| `packages/graph-core` | Graph data model, types, CRUD, serialization |
| `packages/server` | WebSocket + HTTP server, Claude API streaming, MCP tools |
| `packages/frontend` | tldraw canvas, custom shapes, dagre layout, UI components |

## Environment Variables

| Variable | Where | Default | Description |
|----------|-------|---------|-------------|
| `ANTHROPIC_API_KEY` | `.env.local` | — | Claude API key (required for live mode) |
| `PORT` | `.env.local` | `8080` | Server port |
| `FCW_STORAGE_DIR` | `.env.local` | `~/.fcw/documents/` | Document storage path |
| `VITE_WS_URL` | `packages/frontend/.env.local` | `ws://localhost:8080` | WebSocket server URL |
| `VITE_DEMO` | `packages/frontend/.env.local` | — | Set `true` to force demo mode |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit prompt (in input bar) |
| `Shift+Enter` | Newline in prompt |
| `Cmd+K` / `Cmd+F` | Search nodes |
| `Cmd+L` | Toggle linear log sidebar |
| `Cmd+S` | Manual save |
| `Escape` | Close search / cancel |

## Node Types & Colors

| Type | Color | Description |
|------|-------|-------------|
| user_prompt | Blue | User messages |
| response | Green | Bot responses (markdown) |
| code | Dark | Code blocks (monospace, syntax highlighted) |
| tool_call | Orange | Bot invoked a tool |
| tool_result | Yellow | Tool result |
| thought | Gray | Reasoning steps |
| summary | Purple | Collapsed subtree summaries |
| annotation | Light yellow | User notes on canvas |

## Canvas Interactions

- **Input bar** (bottom) — type prompts, creates nodes on canvas
- **Click node** — shows Branch / Copy / Collapse actions
- **Branch** — fork conversation from any node
- **Collapse** — hide a subtree, show summary placeholder
- **Drag node** — pins position (survives re-layout)
- **Double-click canvas** — create annotation node

## MCP Integration (Claude Code)

The server exposes MCP tools via stdio for Claude Code:

```json
{
  "mcpServers": {
    "fcw": {
      "command": "node",
      "args": ["packages/server/dist/mcp-entry.js"],
      "cwd": "/path/to/fcw"
    }
  }
}
```

Tools: `canvas_create_node`, `canvas_update_node`, `canvas_connect`, `canvas_branch`, `canvas_set_status`, `canvas_get_context`

## Documents

Conversations save as `.fcw.json` files in the storage directory. Each document includes an LLM-generated summary for fast context resume.

## Tests

```bash
# All tests
npm test

# Single package
npm run test --workspace=packages/graph-core
npm run test --workspace=packages/server
npm run test --workspace=packages/frontend

# End-to-end (Playwright; boots its own server :8009 and Vite :8008, so stop npm run dev first)
npm run e2e
```

## Agent-engine smoke test

The vitest suite mocks `@anthropic-ai/claude-agent-sdk`. To exercise the real
SDK (resume, `canUseTool`, partial-message streaming) locally:

```bash
npm run smoke:agent        # uses process.cwd() as the agent cwd
npm run smoke:agent -- /path/to/repo
```

Requires a local Claude Code install (`claude` on PATH) and `ANTHROPIC_API_KEY`
in `.env.local`. Not run by `npm test`.

Other smokes (also not run by `npm test`):

```bash
npm run smoke:compaction   # real server, keyless, free
npm run smoke:docs         # real API: needs ANTHROPIC_API_KEY, a few cents
```

## Tech Stack

tldraw, React, Vite, dagre, Anthropic SDK, MCP SDK, WebSocket (ws), zod, vitest
