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
} from '@fcw/graph-core';
import type { ChatGraph, ChatMessage, Position, ChatSettings, Attachment } from '@fcw/graph-core';
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

export class ChatSessionManager extends EventEmitter {
  readonly graph: ChatGraph;
  private saveHandler: SaveHandler | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** In-flight turns keyed by chat, so stop() can abort them. */
  private readonly controllers = new Map<string, AbortController>();
  /** requestId -> resolver for pending agent permission prompts. */
  private readonly pendingPermissions = new Map<string, (d: PermissionDecision) => void>();

  constructor(
    title = 'Untitled',
    private readonly streams: ManagerStreams = {},
    initialGraph?: ChatGraph,
    private readonly attachmentResolver?: AttachmentResolver,
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
    const resolve = this.pendingPermissions.get(requestId);
    if (!resolve) return;
    this.pendingPermissions.delete(requestId);
    resolve(decision);
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
      for await (const ev of stream(ctx)) {
        if (controller.signal.aborted) break;
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
        }
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

  /** Append a role 'tool' message with structured fields and broadcast it. */
  private appendToolMessage(
    chatId: string,
    content: string,
    fields: { toolUseId?: string; toolName?: string; toolInput?: unknown },
  ): void {
    appendMessage(this.graph, chatId, 'tool', content);
    const msgs = this.graph.chats[chatId].messages;
    const msg = msgs[msgs.length - 1];
    Object.assign(msg, fields);
    this.emit('message', { type: 'chat_tool_message', chatId, message: msg });
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
      this.pendingPermissions.set(requestId, (decision) => {
        clearTimeout(timer);
        resolve(decision);
      });
    });
  }

  /** Stops the in-flight turn for a chat; the loop breaks and settles the turn. */
  stop(chatId: string): void {
    this.controllers.get(chatId)?.abort();
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
