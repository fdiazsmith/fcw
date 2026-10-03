# FCW — Flow Canvas for Work

## Thesis

**The context window that ran out wasn't the model's. It was mine.**

The industry keeps making the machine's memory bigger, and the human's still fits in a scrollbar. Weeks of context, many threads, and the only way to move through it is scrolling. Chat is a single timeline: your head has to hold the structure. Real work branches, depends on other work, and loops back.

A spatial interface doesn't just look nicer. It's **memory that lives outside your head.** When a system can be seen as nodes, the complexity a person can handle grows enormously — the same lesson as patching a TouchDesigner network for an immersive installation. The screen remembers the structure, so you don't have to.

Everything below follows from that. Token savings for the model are a side effect; the scarce context window FCW is built to extend is the human's. Design decisions are judged by it:

- **Placements, not copies** — one doc, seen everywhere; you never track which version is current.
- **The global graph is a query, never maintained** — the screen holds the map, not your memory.
- **Compaction keeps history behind the node** — you can safely forget the details because they're still there.
- **Explicit apply** — the model never silently rewrites what you're holding in your head.

## The Problem with Chat

Every major LLM interface today works the same way: a linear scroll of messages. You type, the model responds, you type again. The conversation moves in one direction — down.

But thinking doesn't work like that. When you're working through a problem with an LLM, the conversation naturally wants to branch. You want to explore one idea, then go back and try a different angle from the same starting point. You want to see how a tool call led to a result that led to a follow-up question. You want to collapse the parts you've already resolved and focus on what's still open. You want to annotate, rearrange, and see the shape of your thinking.

A chat scroll can't give you any of that. It forces a graph into a list.

## What FCW Does

FCW replaces the chat window with a **canvas**. Your conversation with an LLM becomes a visible, navigable graph — nodes connected by edges on a zoomable, pannable surface powered by tldraw.

Every piece of the conversation becomes a discrete node on the canvas: your prompts, the model's responses, code blocks, tool calls, tool results, reasoning steps. These nodes are connected by edges that show the actual relationships — what replied to what, what branched from where, what tool call produced what result.

The key interactions:

- **Talk to the LLM from anywhere in the graph.** Type in the input bar to start a new thread, or click any existing node and branch from that point. The conversation forks naturally — no copy-pasting old context into a new chat.
- **See the shape of your conversation.** The graph auto-layouts using dagre, so you can see at a glance how a conversation evolved, where it branched, and what paths were explored. Nodes are color-coded by type (blue for your prompts, green for responses, orange for tool calls, and so on).
- **Resume from any point.** Click a node from three turns ago and ask a new question. The LLM gets the relevant context from that branch, not the entire linear history. This is conversation-level version control.
- **Collapse what you don't need.** Subtrees you've resolved can be collapsed into a summary node. The canvas stays manageable even for long sessions.
- **Save and reload entire conversations.** The graph serializes to a `.fcw.json` file. Close the session, come back tomorrow, load the file, and pick up exactly where you left off — with the full structure intact, not just a flat transcript.
- **Export when you need to.** Pull out the conversation as markdown or JSON when you need to share it or archive it.

## Why a Graph

The graph isn't a visualization gimmick. It changes how you interact with the LLM in three concrete ways.

**Branching means you stop losing context.** In a normal chat, if you want to try a different approach, you either edit your last message (destroying the previous response) or start a new conversation (losing all prior context). In FCW, you branch. Both paths exist. You can compare them. You can come back to either one.

**Structure means the LLM can be smarter about context.** Instead of dumping the entire conversation history into every API call, FCW can send the relevant subgraph — the path from root to the node you're branching from, plus summaries of adjacent branches. This is both cheaper (fewer tokens) and more focused (less noise for the model).

**Visibility means you can think at a higher level.** When you can see that your debugging session has five branches, three of which dead-ended and two of which converged on the same fix, that's information. A chat scroll buries that structure. A graph shows it.

## How It Works

FCW has three components that work together:

**The graph core** is a pure data model — nodes, edges, types, CRUD operations, serialization. It defines the vocabulary: a `user_prompt` node, a `response` node, a `tool_call` node, edge types like `reply_to` and `branches_from`. This is the shared language between server and frontend.

**The server** is the orchestrator. It owns the graph state in memory, talks to the Claude API for streaming responses, exposes MCP tools so Claude Code can manipulate the graph directly, and pushes all mutations to the frontend over WebSocket. When you type a prompt, the server creates a user node, calls Claude with the relevant context, and as tokens stream back it creates and updates response nodes in real time. If Claude makes tool calls, those become their own nodes too — the graph grows as the conversation happens.

**The frontend** is a tldraw canvas with custom node shapes. It receives mutations from the server via WebSocket and renders them as colored, typed cards on the canvas. Dagre computes the layout. You can pan, zoom, select nodes, branch conversations, collapse subtrees, search across content, and toggle a traditional linear log sidebar for when you just want to read through things sequentially.

The dual-channel design is deliberate: the Claude API stream handles content delivery (token by token for live rendering), while MCP tools handle structural decisions (creating branches, connecting cross-references, setting up summaries). Content flows fast; structure flows intentionally.

## Current State

The project is structured as a monorepo with three packages (`graph-core`, `server`, `frontend`). The graph data model is implemented and tested. The server has WebSocket handling, Claude API streaming, MCP tool integration, state management, context building, and document persistence. The frontend has the tldraw canvas with custom graph node shapes, dagre layout, the input bar, branching UI, node actions (branch/collapse/copy), search, a log sidebar, document picker, and export to markdown and JSON.

All seven implementation phases have been planned out. The foundation is built. The core loop — type a prompt, see it appear as a node, get a streaming response that grows on the canvas, branch from any point — is functional.

## Who This Is For

FCW is built for people who use LLMs as thinking partners, not just answer machines. If you regularly find yourself in multi-turn conversations where you wish you could go back and try a different approach without losing your current thread, or where you want to see the overall shape of a complex problem-solving session, this is the interface you've been missing.

The initial scope is Claude Code via MCP — FCW plugs into the existing Claude Code workflow as an alternative rendering surface. The architecture is designed to generalize beyond that, but the first version is opinionated about its integration point.
