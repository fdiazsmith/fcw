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
  removeLastMessage,
  updateChatSettings,
  markSessionStale,
  addTurnUsage,
  addCompaction,
  compactionDigest,
  completeCompactionGeneration,
  setCompactionDocument,
  setCompactionStatus,
  setCompactionPosition,
  createDoc,
  linkPlacement,
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
} from '@fcw/graph-core';
import { structuralCompactionDocument, type GenerateCompactionDoc } from './compaction-doc.js';
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
    const lastUser = [...context].reverse().find((m) => m.role === 'user');
    const latest = lastUser?.content ?? '';
    const attachments = lastUser?.attachments ?? [];
    const fresh = !chat.sessionId || chat.sessionStale === true;

    const controller = new AbortController();
    this.controllers.set(chatId, controller);

    const ctx: TurnContext = {
      context,
      latest,
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

  /** Fold chats behind a new compaction node and synthesize its document. */
  async compact(chatIds: string[]): Promise<string> {
    const id = addCompaction(this.graph, chatIds);
    // Snapshot copy: generation mutates the live object right after this emit.
    const c = this.graph.compactions[id];
    this.emit('message', {
      type: 'chat_compaction_created',
      compaction: { ...c, memberIds: [...c.memberIds] },
    });
    this.scheduleSave();
    await this.generateInto(id);
    return id;
  }

  /** Re-synthesize the document from the members' current transcripts. */
  async regenerateCompaction(id: string): Promise<void> {
    setCompactionStatus(this.graph, id, 'generating');
    this.emitCompactionDocument(id);
    await this.generateInto(id);
  }

  /** User edit of the document — the generation digest is untouched. */
  updateCompactionDocument(id: string, document: string): void {
    setCompactionDocument(this.graph, id, document);
    this.emitCompactionDocument(id);
    this.scheduleSave();
  }

  moveCompaction(id: string, position: Position): void {
    setCompactionPosition(this.graph, id, position);
    this.scheduleSave();
  }

  /** Generate the document for a compaction, pinning the digest to the
   *  transcripts the generator actually saw. */
  private async generateInto(id: string): Promise<void> {
    const compaction = this.graph.compactions[id];
    const members = compaction.memberIds.map((m) => this.graph.chats[m]);
    const digest = compactionDigest(members);
    const document = await this.generateCompactionDoc(members).catch(() =>
      structuralCompactionDocument(members),
    );
    completeCompactionGeneration(this.graph, id, document, digest);
    this.emitCompactionDocument(id);
    this.scheduleSave();
  }

  private emitCompactionDocument(id: string): void {
    const c = this.graph.compactions[id];
    this.emit('message', {
      type: 'chat_compaction_document',
      compactionId: id,
      document: c.document,
      sourceDigest: c.sourceDigest,
      status: c.status,
    });
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
    this.emit('message', { type: 'doc_unplaced', canvasId, kind, id });
    this.scheduleSave();
  }

  /** Swap a placed box for a placement of an existing doc. The replaced doc
   *  is deleted when it is now an empty orphan (no body, empty child canvas,
   *  placed nowhere); doc_linked is the only message — clients drop it too. */
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
      !placedAnywhere
    ) {
      delete this.graph.docs[placedDocId];
    }
    this.emit('message', { type: 'doc_linked', canvasId, placedDocId, existingDocId });
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
