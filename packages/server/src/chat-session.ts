// v2: owns the chat-graph and runs stateless chat turns against it.
// Every prompt re-assembles context from the graph — re-wiring edges rewrites history.
import { EventEmitter } from 'node:events';
import {
  createChatGraph,
  addChat,
  appendMessage,
  addContextEdge,
  removeContextEdge,
  setChatPosition,
  assembleContext,
  assembleDocContext,
  removeLastMessage,
  updateChatSettings,
  markSessionStale,
  addTurnUsage,
  compactionDigest,
  compactChats,
  createDoc,
  linkPlacement,
  mermaidToDocNodes,
  applyToDoc,
  newDocId,
  ROOT_CANVAS_ID,
} from '@fcw/graph-core';
import type {
  ChatGraph,
  ChatMessage,
  Position,
  ChatSettings,
  Attachment,
  Doc,
  DocCanvas,
  DocPlacement,
  DocEdge,
  DocContextBlock,
} from '@fcw/graph-core';
import { structuralCompactionDocument, type GenerateCompactionDoc } from './compaction-doc.js';
import { createDiagramGenerator, type GenerateDiagram } from './diagram-gen.js';
import type { StreamTurnFn, TurnContext, PermissionDecision } from './turn-events.js';

/** Per-engine turn streams, selected by chat.settings.engine. */
export interface ManagerStreams {
  api?: StreamTurnFn;
  agent?: StreamTurnFn;
}

/** Resolves an uploaded attachment id to its metadata (backed by disk). */
export type AttachmentResolver = (id: string) => Attachment | undefined;

export type SaveHandler = (graph: ChatGraph) => Promise<void>;

const SAVE_DEBOUNCE_MS = 500;
const DIAGRAM_GRID_COLS = 4;
/** Max chars of doc bodies in a chat's preamble (~6k tokens); past it the most
 *  distant references degrade to title-only. */
export const DEFAULT_DOC_CONTEXT_BUDGET = 24_000;
/** Auto-deny a permission prompt after this long so a turn never hangs forever. */
const PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;
/** Cap toolInput size in emitted WS tool messages (full input stays on disk). */
const TOOL_INPUT_EMIT_MAX = 4096;

export class ChatSessionManager extends EventEmitter {
  readonly graph: ChatGraph;
  private saveHandler: SaveHandler | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** In-flight turns keyed by chat, so stop() can abort them. */
  private readonly controllers = new Map<string, AbortController>();
  /** requestId -> pending agent permission prompt (chatId lets stop() deny per chat). */
  private readonly pendingPermissions = new Map<
    string,
    { chatId: string; resolve: (d: PermissionDecision) => void }
  >();

  constructor(
    title = 'Untitled',
    private readonly streams: ManagerStreams = {},
    initialGraph?: ChatGraph,
    private readonly attachmentResolver?: AttachmentResolver,
    private readonly generateCompactionDoc: GenerateCompactionDoc = async (members) =>
      structuralCompactionDocument(members),
    // Keyless default still handles pasted Mermaid (M2.5 decision).
    private readonly generateDiagram: GenerateDiagram = createDiagramGenerator({}).generate,
  ) {
    super();
    this.graph = initialGraph ?? createChatGraph(title);
  }

  setSaveHandler(handler: SaveHandler | null): void {
    this.saveHandler = handler;
  }

  private scheduleSave(): void {
    if (!this.saveHandler) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveHandler?.(this.graph).catch((err) =>
        console.error('[chat-session] save failed:', err),
      );
    }, SAVE_DEBOUNCE_MS);
  }

  moveChat(chatId: string, position: Position): void {
    setChatPosition(this.graph, chatId, position);
    this.scheduleSave();
  }

  createChat(position: Position, title?: string): string {
    const id = addChat(this.graph, { position, title });
    this.emit('message', { type: 'chat_created', chat: this.graph.chats[id] });
    this.scheduleSave();
    return id;
  }

  connect(from: string, to: string): void {
    addContextEdge(this.graph, from, to);
    const edge = this.graph.edges[this.graph.edges.length - 1];
    // Re-wiring context invalidates the target's agent session (and everything downstream).
    markSessionStale(this.graph, to);
    this.emit('message', { type: 'chat_connected', edge });
    this.scheduleSave();
  }

  disconnect(from: string, to: string): void {
    removeContextEdge(this.graph, from, to);
    markSessionStale(this.graph, to);
    this.emit('message', { type: 'chat_disconnected', from, to });
    this.scheduleSave();
  }

  /** Branch: new chat that inherits the parent's history via a context edge. */
  branch(parentId: string, position: Position): string {
    const child = this.createChat(position);
    this.connect(parentId, child);
    return child;
  }

  /** Merge partial settings, broadcast the result, and persist. */
  updateSettings(chatId: string, patch: Partial<ChatSettings>): void {
    updateChatSettings(this.graph, chatId, patch);
    this.emit('message', {
      type: 'chat_settings_changed',
      chatId,
      settings: this.graph.chats[chatId].settings,
    });
    this.scheduleSave();
  }

  /** Resolve a pending agent permission prompt and notify clients. */
  resolvePermission(chatId: string, requestId: string, decision: PermissionDecision): void {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return;
    this.pendingPermissions.delete(requestId);
    pending.resolve(decision);
    this.emit('message', { type: 'chat_permission_resolved', chatId, requestId });
  }

  async prompt(chatId: string, content: string, attachmentIds?: string[]): Promise<void> {
    appendMessage(this.graph, chatId, 'user', content);
    const own = this.graph.chats[chatId].messages;
    const userMsg = own[own.length - 1];
    const attachments = (attachmentIds ?? [])
      .map((id) => this.attachmentResolver?.(id))
      .filter((a): a is Attachment => Boolean(a));
    if (attachments.length > 0) userMsg.attachments = attachments;
    this.emit('message', { type: 'chat_user_message', chatId, message: userMsg });
    this.scheduleSave();

    await this.runStream(chatId);
  }

  /** Streams an assistant turn from the chat's current assembled context.
   *  Reused by prompt() and regenerate() — never appends a user message. */
  private async runStream(chatId: string): Promise<void> {
    const chat = this.graph.chats[chatId];
    const settings: ChatSettings = chat.settings ?? { engine: 'api' };
    const stream = settings.engine === 'agent' ? this.streams.agent : this.streams.api;
    if (!stream) return;

    const context = assembleContext(this.graph, chatId);
    const docContext = this.docContextFor(chatId);
    const lastUser = [...context].reverse().find((m) => m.role === 'user');
    const latest = lastUser?.content ?? '';
    const attachments = lastUser?.attachments ?? [];
    const fresh = !chat.sessionId || chat.sessionStale === true;

    const controller = new AbortController();
    this.controllers.set(chatId, controller);

    const ctx: TurnContext = {
      context,
      latest,
      docContext,
      settings,
      sessionId: fresh ? undefined : chat.sessionId,
      attachments,
      waitForPermission: (requestId) => this.awaitPermission(chatId, requestId),
      signal: controller.signal,
    };

    this.emit('message', { type: 'chat_stream_started', chatId });
    try {
      let text = '';
      let emittedAny = false;
      for await (const ev of stream(ctx)) {
        if (controller.signal.aborted) break;
        emittedAny = true;
        switch (ev.type) {
          case 'session':
            chat.sessionId = ev.sessionId;
            chat.sessionStale = false;
            break;
          case 'text_delta':
            text += ev.text;
            this.emit('message', { type: 'chat_stream_delta', chatId, delta: ev.text });
            break;
          case 'tool_use':
            this.appendToolMessage(chatId, `→ ${ev.name}`, {
              toolUseId: ev.toolUseId,
              toolName: ev.name,
              toolInput: ev.input,
            });
            break;
          case 'tool_result':
            this.appendToolMessage(chatId, ev.content, { toolUseId: ev.toolUseId });
            break;
          case 'permission_request':
            this.emit('message', {
              type: 'chat_permission_requested',
              chatId,
              requestId: ev.requestId,
              toolName: ev.toolName,
              input: ev.input,
            });
            break;
          case 'usage': {
            addTurnUsage(this.graph, chatId, ev.usage);
            const contextChats = this.graph.edges.filter(
              (e) => e.to === chatId && e.enabled,
            ).length;
            this.emit('message', {
              type: 'chat_usage_updated',
              chatId,
              usage: this.graph.chats[chatId].usage,
              contextChats,
            });
            break;
          }
        }
      }
      if (!emittedAny && text === '') {
        // The stream produced no output at all — surface as an error instead
        // of a blank assistant bubble.
        this.emit('message', {
          type: 'chat_error',
          chatId,
          message: 'stream produced no output',
        });
        return;
      }
      appendMessage(this.graph, chatId, 'assistant', text);
      const msgs = this.graph.chats[chatId].messages;
      this.emit('message', {
        type: 'chat_stream_completed',
        chatId,
        message: msgs[msgs.length - 1],
      });
      this.maybeAutoTitle(chatId);
      this.scheduleSave();
    } catch (err) {
      this.emit('message', {
        type: 'chat_error',
        chatId,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.controllers.delete(chatId);
    }
  }

  /** Doc blocks for a doc-chat's doc, else for the regular doc whose canvas
   *  holds this chat. A generated host is skipped: its body is derived from
   *  the chat itself. */
  private docContextFor(chatId: string): DocContextBlock[] {
    const boundDocId = this.graph.chats[chatId].docId;
    if (boundDocId !== undefined) {
      if (!this.graph.docs[boundDocId]) return [];
      return assembleDocContext(this.graph, boundDocId, { budget: DEFAULT_DOC_CONTEXT_BUDGET });
    }
    const host = Object.values(this.graph.docs).find(
      (d) => !d.generated && d.canvas.placements.some((p) => p.kind === 'chat' && p.id === chatId),
    );
    if (!host) return [];
    return assembleDocContext(this.graph, host.id, { budget: DEFAULT_DOC_CONTEXT_BUDGET });
  }

  /** A doc changed: every chat whose doc blocks include it must start a fresh
   *  agent session (the preamble is only sent on a fresh one). */
  private markDocReadersStale(docId: string): void {
    for (const chat of Object.values(this.graph.chats)) {
      if (this.docContextFor(chat.id).some((b) => b.docId === docId)) chat.sessionStale = true;
    }
  }

  /** The doc graph on a doc canvas changed; root holds no doc context. */
  private markCanvasReadersStale(canvasId: string): void {
    if (canvasId !== ROOT_CANVAS_ID) this.markDocReadersStale(canvasId);
  }

  /** Append a role 'tool' message with structured fields and broadcast it.
   *  The graph message keeps the full toolInput; the emitted WS copy is
   *  truncated so large tool outputs don't bloat frames. */
  private appendToolMessage(
    chatId: string,
    content: string,
    fields: { toolUseId?: string; toolName?: string; toolInput?: unknown },
  ): void {
    appendMessage(this.graph, chatId, 'tool', content);
    const msgs = this.graph.chats[chatId].messages;
    const msg = msgs[msgs.length - 1];
    Object.assign(msg, fields);
    this.emit('message', { type: 'chat_tool_message', chatId, message: this.emitCopy(msg) });
  }

  /** Shallow-copy a tool message, truncating toolInput to TOOL_INPUT_EMIT_MAX. */
  private emitCopy(msg: ChatMessage): ChatMessage {
    if (msg.toolInput === undefined) return { ...msg };
    const serialized = JSON.stringify(msg.toolInput);
    if (serialized.length <= TOOL_INPUT_EMIT_MAX) return { ...msg };
    const slice = serialized.slice(0, TOOL_INPUT_EMIT_MAX);
    const { toolInput, ...rest } = msg;
    return {
      ...rest,
      toolInput: slice,
      toolInputTruncated: true,
    };
  }

  /** Register a pending permission prompt; auto-deny after a timeout. */
  private awaitPermission(chatId: string, requestId: string): Promise<PermissionDecision> {
    return new Promise<PermissionDecision>((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingPermissions.delete(requestId)) {
          this.emit('message', { type: 'chat_permission_resolved', chatId, requestId });
          resolve({ behavior: 'deny', message: 'permission request timed out' });
        }
      }, PERMISSION_TIMEOUT_MS);
      this.pendingPermissions.set(requestId, {
        chatId,
        resolve: (decision) => {
          clearTimeout(timer);
          resolve(decision);
        },
      });
    });
  }

  /** Stops the in-flight turn for a chat; the loop breaks and settles the turn.
   *  Pending permission prompts are denied so the adapter never hangs on a
   *  turn the user already abandoned. */
  stop(chatId: string): void {
    this.controllers.get(chatId)?.abort();
    for (const [requestId, pending] of this.pendingPermissions) {
      if (pending.chatId !== chatId) continue;
      this.pendingPermissions.delete(requestId);
      pending.resolve({ behavior: 'deny', message: 'stopped by user' });
      this.emit('message', { type: 'chat_permission_resolved', chatId, requestId });
    }
  }

  /** Re-runs the last turn: drops a trailing assistant message and streams again. */
  async regenerate(chatId: string): Promise<void> {
    const chat = this.graph.chats[chatId];
    if (!chat) throw new Error(`unknown chat: ${chatId}`);
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    removeLastMessage(this.graph, chatId);
    // The agent SDK session already contains the turn being discarded, so the
    // regenerated turn must start fresh with a re-assembled preamble.
    if ((chat.settings?.engine ?? 'api') === 'agent') markSessionStale(this.graph, chatId);
    this.emit('message', { type: 'chat_last_message_removed', chatId });
    this.scheduleSave();
    await this.runStream(chatId);
  }

  /** Fold chats into a new generated doc on `canvasId` (root by default):
   *  the chats move onto the doc's child canvas, then the body is generated. */
  async compact(chatIds: string[], canvasId: string = ROOT_CANVAS_ID): Promise<string> {
    const source = this.canvasById(canvasId);
    const before = source.placements;
    const id = compactChats(
      this.graph,
      chatIds,
      canvasId === ROOT_CANVAS_ID ? undefined : { sourceCanvasDocId: canvasId },
    );
    // The chats now sit on a doc canvas: their doc context changed.
    for (const chatId of chatIds) this.graph.chats[chatId].sessionStale = true;
    // Snapshot copy: generation mutates the live doc right after this emit.
    this.emit('message', { type: 'doc_created', doc: structuredClone(this.graph.docs[id]) });
    for (const p of before) {
      if (p.kind === 'chat' && chatIds.includes(p.id)) {
        this.emit('message', { type: 'doc_unplaced', canvasId, kind: 'chat', id: p.id });
      }
    }
    const placement = this.placementOn(canvasId, 'doc', id);
    this.emit('message', { type: 'doc_placed', canvasId, placement: { ...placement } });
    this.scheduleSave();
    await this.generateInto(id);
    return id;
  }

  /** Re-generate a generated doc's body from the chats on its canvas. */
  async regenerateDoc(docId: string): Promise<void> {
    const doc = this.docById(docId);
    if (!doc.generated) throw new Error(`doc ${docId} is not generated`);
    doc.generated.status = 'generating';
    this.emit('message', { type: 'doc_updated', docId, generated: { ...doc.generated } });
    await this.generateInto(docId);
  }

  /** Generate a doc's body, pinning the digest to the transcripts the
   *  generator actually saw. */
  private async generateInto(id: string): Promise<void> {
    const doc = this.graph.docs[id];
    const members = doc.canvas.placements
      .filter((p) => p.kind === 'chat')
      .map((p) => this.graph.chats[p.id]);
    const sourceDigest = compactionDigest(members);
    const body = await this.generateCompactionDoc(members).catch(() =>
      structuralCompactionDocument(members),
    );
    doc.body = body;
    doc.generated = { sourceDigest, status: 'idle' };
    this.markDocReadersStale(id);
    this.emit('message', { type: 'doc_updated', docId: id, body, generated: { ...doc.generated } });
    this.scheduleSave();
  }

  // ── docs (structure-first): canvasId is ROOT_CANVAS_ID or a docId ──

  private canvasById(canvasId: string): DocCanvas {
    if (canvasId === ROOT_CANVAS_ID) return this.graph.rootCanvas;
    const doc = this.graph.docs[canvasId];
    if (!doc) throw new Error(`unknown canvas: ${canvasId}`);
    return doc.canvas;
  }

  private docById(docId: string): Doc {
    const doc = this.graph.docs[docId];
    if (!doc) throw new Error(`unknown doc: ${docId}`);
    return doc;
  }

  /** New empty doc, placed on the given canvas. */
  createDoc(canvasId: string, title: string, position: Position): string {
    const canvas = this.canvasById(canvasId);
    const [, doc] = createDoc({ docs: {} }, title);
    doc.createdAt = new Date().toISOString();
    this.graph.docs[doc.id] = doc;
    const placement: DocPlacement = { kind: 'doc', id: doc.id, position: { ...position } };
    canvas.placements.push(placement);
    this.emit('message', { type: 'doc_created', doc: structuredClone(doc) });
    this.emit('message', { type: 'doc_placed', canvasId, placement: { ...placement } });
    this.scheduleSave();
    return doc.id;
  }

  /** User edit of title and/or body. A generated doc keeps its digest. */
  updateDoc(docId: string, patch: { title?: string; body?: string }): void {
    const doc = this.docById(docId);
    if (patch.title !== undefined) doc.title = patch.title;
    if (patch.body !== undefined) doc.body = patch.body;
    this.markDocReadersStale(docId);
    this.emit('message', { type: 'doc_updated', docId, ...patch });
    this.scheduleSave();
  }

  /** Place an existing doc or chat on a canvas. Root never holds chat
   *  placements: a chat is on root iff no doc canvas places it. */
  placeOnCanvas(canvasId: string, kind: DocPlacement['kind'], id: string, position: Position): void {
    const canvas = this.canvasById(canvasId);
    if (kind === 'doc') this.docById(id);
    else if (!this.graph.chats[id]) throw new Error(`unknown chat: ${id}`);
    if (kind === 'chat' && canvasId === ROOT_CANVAS_ID) {
      throw new Error('chats are not placed on root; unplace them from their doc canvas instead');
    }
    if (canvas.placements.some((p) => p.kind === kind && p.id === id)) {
      throw new Error(`${kind} ${id} already placed on canvas ${canvasId}`);
    }
    const placement: DocPlacement = { kind, id, position: { ...position } };
    canvas.placements.push(placement);
    if (kind === 'chat') this.graph.chats[id].sessionStale = true;
    if (kind === 'doc') this.markCanvasReadersStale(canvasId);
    this.emit('message', { type: 'doc_placed', canvasId, placement: { ...placement } });
    this.scheduleSave();
  }

  moveOnCanvas(canvasId: string, kind: DocPlacement['kind'], id: string, position: Position): void {
    const placement = this.placementOn(canvasId, kind, id);
    placement.position = { ...position };
    this.emit('message', { type: 'doc_moved', canvasId, kind, id, position: { ...position } });
    this.scheduleSave();
  }

  unplaceFromCanvas(canvasId: string, kind: DocPlacement['kind'], id: string): void {
    const canvas = this.canvasById(canvasId);
    const placement = this.placementOn(canvasId, kind, id);
    canvas.placements = canvas.placements.filter((p) => p !== placement);
    if (kind === 'chat' && this.graph.chats[id]) this.graph.chats[id].sessionStale = true;
    if (kind === 'doc') this.markCanvasReadersStale(canvasId);
    this.emit('message', { type: 'doc_unplaced', canvasId, kind, id });
    this.scheduleSave();
  }

  /** Swap a placed box for a placement of an existing doc. The replaced doc
   *  is deleted when it is now an empty orphan (no body, empty child canvas,
   *  placed nowhere, no doc-chat); doc_linked is the only message — clients drop it too. */
  linkDoc(canvasId: string, placedDocId: string, existingDocId: string): void {
    const canvas = this.canvasById(canvasId);
    const linked = linkPlacement(this.graph, canvas, placedDocId, existingDocId);
    canvas.placements = linked.placements;
    canvas.edges = linked.edges;
    const replaced = this.graph.docs[placedDocId];
    const placedAnywhere = [this.graph.rootCanvas, ...Object.values(this.graph.docs).map((d) => d.canvas)]
      .some((c) => c.placements.some((p) => p.kind === 'doc' && p.id === placedDocId));
    if (
      replaced &&
      replaced.body === '' &&
      replaced.canvas.placements.length === 0 &&
      replaced.canvas.edges.length === 0 &&
      !placedAnywhere &&
      !Object.values(this.graph.chats).some((c) => c.docId === placedDocId)
    ) {
      delete this.graph.docs[placedDocId];
    }
    this.markCanvasReadersStale(canvasId);
    this.emit('message', { type: 'doc_linked', canvasId, placedDocId, existingDocId });
    this.scheduleSave();
  }

  /** The doc's doc-chat, created on first request (title = doc title, placed
   *  nowhere). Always answers with doc_chat_ready. */
  requestDocChat(docId: string): string {
    const doc = this.docById(docId);
    let chat = Object.values(this.graph.chats).find((c) => c.docId === docId);
    if (!chat) {
      const id = addChat(this.graph, { position: { x: 0, y: 0 }, title: doc.title });
      chat = this.graph.chats[id];
      chat.docId = docId;
      this.emit('message', { type: 'chat_created', chat });
      this.scheduleSave();
    }
    this.emit('message', { type: 'doc_chat_ready', docId, chatId: chat.id });
    return chat.id;
  }

  /** Explicit "apply to doc": an assistant message of the doc's own doc-chat
   *  replaces the doc body. Never implicit. */
  applyToDoc(docId: string, chatId: string, messageIndex: number): void {
    this.docById(docId);
    const chat = this.graph.chats[chatId];
    if (!chat || chat.docId !== docId) throw new Error(`chat ${chatId} is not the doc-chat of ${docId}`);
    const message = chat.messages[messageIndex];
    if (!message || message.role !== 'assistant') {
      throw new Error(`message ${messageIndex} of ${chatId} is not an assistant message`);
    }
    this.graph.docs[docId] = applyToDoc(this.graph, docId, message.content).docs[docId];
    this.markDocReadersStale(docId);
    this.emit('message', { type: 'doc_updated', docId, body: message.content });
    this.scheduleSave();
  }

  /** Generate a diagram onto a canvas: one doc per box, edges on the canvas.
   *  Positions are a provisional grid; the client lays out (M3.4). */
  async requestDiagram(canvasId: string, prompt: string): Promise<void> {
    const canvas = this.canvasById(canvasId);
    const result = await this.generateDiagram(prompt);
    let docs: Doc[];
    let edges: DocEdge[];
    if (result.ok) {
      // Mermaid ids are diagram-local; namespace them per generation.
      ({ docs, edges } = mermaidToDocNodes(result.graph, { idPrefix: `${newDocId()}_` }));
    } else {
      // Unparseable: keep what the model produced in one box, nothing lost.
      const [, doc] = createDoc({ docs: {} }, prompt.trim().replace(/\s+/g, ' ').slice(0, 60).trimEnd());
      doc.body = result.raw ? '```mermaid\n' + result.raw.trim() + '\n```' : prompt;
      docs = [doc];
      edges = [];
    }
    docs.forEach((doc, i) => {
      doc.createdAt = new Date().toISOString();
      this.graph.docs[doc.id] = doc;
      const position = { x: (i % DIAGRAM_GRID_COLS) * 240, y: Math.floor(i / DIAGRAM_GRID_COLS) * 160 };
      const placement: DocPlacement = { kind: 'doc', id: doc.id, position };
      canvas.placements.push(placement);
      this.emit('message', { type: 'doc_created', doc: structuredClone(doc) });
      this.emit('message', { type: 'doc_placed', canvasId, placement: { ...placement, position: { ...position } } });
    });
    canvas.edges.push(...edges);
    this.markCanvasReadersStale(canvasId);
    this.emit('message', {
      type: 'diagram_created',
      canvasId,
      docIds: docs.map((d) => d.id),
      edges: edges.map((e) => ({ ...e })),
      ...(result.ok ? {} : { error: result.error }),
    });
    this.scheduleSave();
  }

  private placementOn(canvasId: string, kind: DocPlacement['kind'], id: string): DocPlacement {
    const placement = this.canvasById(canvasId).placements.find((p) => p.kind === kind && p.id === id);
    if (!placement) throw new Error(`${kind} ${id} is not placed on canvas ${canvasId}`);
    return placement;
  }

  private maybeAutoTitle(chatId: string): void {
    const chat = this.graph.chats[chatId];
    if (chat.title !== '') return;
    const firstUser = chat.messages.find((m) => m.role === 'user');
    if (!firstUser) return;
    const title = truncateTitle(firstUser.content);
    chat.title = title;
    this.emit('message', { type: 'chat_title_changed', chatId, title });
  }
}

const TITLE_MAX = 40;

/** Truncate to TITLE_MAX chars at a word boundary, adding '…' if shortened. */
function truncateTitle(content: string): string {
  const text = content.trim();
  if (text.length <= TITLE_MAX) return text;
  const cut = text.slice(0, TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return base.replace(/\s+$/, '') + '…';
}
