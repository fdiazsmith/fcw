# Phase 7 — Persistence & Context Resume

**Type**: Sequential (requires Phase 6 — needs full pipeline working)
**Blocks**: Nothing — this is the final MVP phase
**Human Review**: YES — final end-to-end review before calling MVP done

## Goal

Save conversations as `.fcw.json` documents. Load them to resume. Generate LLM summaries on save so context loading is fast. Linear log sidebar as secondary view.

## Tasks

### 7.1 Save Flow
- [ ] Auto-save on every mutation (debounced, already scaffolded in Phase 2)
- [ ] Manual save via UI button or Cmd+S
- [ ] On save: serialize full graph state (nodes, edges, positions, pinned flags)
- [ ] On save: call Claude to generate a compressed graph summary, store in document meta
- [ ] Save summary generation is async — don't block the UI

### 7.2 Load Flow
- [ ] Document picker: list saved `.fcw.json` files
- [ ] Load: deserialize graph, run layout (respecting pinned positions), render on canvas
- [ ] Inject saved summary into system prompt for Claude's context
- [ ] `canvas_get_context` tool available for Claude to drill into specifics
- [ ] UI shows document title, last modified

### 7.3 New Document
- [ ] "New conversation" button → creates empty graph document
- [ ] Auto-title from first user prompt (editable)

### 7.4 Linear Log Sidebar
- [ ] Toggleable panel (right side or bottom)
- [ ] Shows conversation in traditional linear order (traverse graph depth-first)
- [ ] Syncs with canvas: clicking a log entry pans canvas to that node
- [ ] Clicking a canvas node highlights it in the log
- [ ] Toggle via keyboard shortcut (Cmd+L or similar)

### 7.5 Export
- [ ] Export graph as markdown (depth-first traversal, indented for branches)
- [ ] Export as JSON (raw `.fcw.json`)

## Acceptance Criteria

- [ ] Save a conversation with 10+ nodes → close app → reopen → load document → graph is identical
- [ ] Loaded document includes LLM summary in meta
- [ ] Claude can resume a loaded conversation meaningfully (references prior context)
- [ ] Linear log sidebar shows all messages in readable order
- [ ] Clicking log entry pans to node, clicking node highlights in log
- [ ] New document starts clean, auto-titles from first prompt
- [ ] Markdown export produces readable document with branch indentation

## TDD Anchors

1. RED: test that save + load round-trip preserves all nodes, edges, and positions
2. GREEN: implement serialization
3. RED: test that loading a document injects summary into system prompt builder
4. GREEN: wire summary into prompt construction
5. RED: test that linear log traversal produces correct depth-first order for a branched graph
6. GREEN: implement graph traversal for log view

## Risks

| Risk | Mitigation |
|------|-----------|
| LLM summary quality varies | Include structural skeleton as fallback. Summary is best-effort enrichment. |
| Large graphs slow to serialize | Profile early. Consider incremental save (only changed nodes). |
| Resume context insufficient — Claude forgets | Test with 3+ turn conversations. Iterate on summary prompt. |

## HUMAN REVIEW CHECKPOINT — MVP GATE

This is the **MVP milestone**. After this phase, review end-to-end:

1. Start a new conversation on the canvas
2. Have a multi-turn exchange with Claude (including tool calls)
3. Save the document
4. Close and reopen. Load the document.
5. Continue the conversation — does Claude have context?
6. Toggle the linear log — is it readable?
7. Branch from an earlier node — does the branch make sense?

**Ship/no-ship decision happens here.**
