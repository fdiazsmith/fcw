# FCW — Flow Canvas for Work

## TDD Imperative

**No production code without a failing test first. No exceptions.**

This project follows strict Red-Green-Refactor. If you write implementation before a test, delete it and start over.

1. **RED** — Write a failing test for the next piece of functionality. Run it. It must fail.
2. **GREEN** — Write the minimum code to pass that test. Nothing more.
3. **REFACTOR** — Clean up. Tests must stay green.
4. **REPEAT**.

## Project Overview

Canvas-based chatbot interface replacing linear chat scroll with a tldraw graph. See `PROJECT.md` for full spec.

- **Stack**: tldraw + React, Node/Bun server, WebSocket, MCP, dagre/elkjs
- **Scope**: Claude Code-specific via MCP first
- **Storage**: `.fcw.json` graph documents

## Rules

- One test, one feature per cycle
- Run tests after every change
- Keep commits atomic — one TDD cycle per commit when possible
- Prefer editing existing files over creating new ones
- No over-engineering. No "while I'm here" additions
