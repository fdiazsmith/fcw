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
} from '@fcw/graph-core';
import type { ChatGraph, ChatMessage, Position } from '@fcw/graph-core';

/** Streams assistant text for an assembled context. Injected for testability. */
export type StreamTextFn = (messages: ChatMessage[]) => AsyncIterable<string>;

export type SaveHandler = (graph: ChatGraph) => Promise<void>;

const SAVE_DEBOUNCE_MS = 500;

export class ChatSessionManager extends EventEmitter {
  readonly graph: ChatGraph;
  private saveHandler: SaveHandler | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Chats whose in-flight stream has been asked to stop. */
  private readonly stopped = new Set<string>();

  constructor(
    title = 'Untitled',
    private readonly streamText?: StreamTextFn,
    initialGraph?: ChatGraph,
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
    this.emit('message', { type: 'chat_connected', edge });
    this.scheduleSave();
  }

  disconnect(from: string, to: string): void {
    removeContextEdge(this.graph, from, to);
    this.emit('message', { type: 'chat_disconnected', from, to });
    this.scheduleSave();
  }

  /** Branch: new chat that inherits the parent's history via a context edge. */
  branch(parentId: string, position: Position): string {
    const child = this.createChat(position);
    this.connect(parentId, child);
    return child;
  }

  async prompt(chatId: string, content: string): Promise<void> {
    appendMessage(this.graph, chatId, 'user', content);
    const own = this.graph.chats[chatId].messages;
    this.emit('message', { type: 'chat_user_message', chatId, message: own[own.length - 1] });
    this.scheduleSave();

    await this.runStream(chatId);
  }

  /** Streams an assistant turn from the chat's current assembled context.
   *  Reused by prompt() and regenerate() — never appends a user message. */
  private async runStream(chatId: string): Promise<void> {
    if (!this.streamText) return;

    const own = this.graph.chats[chatId].messages;
    const context = assembleContext(this.graph, chatId);
    this.emit('message', { type: 'chat_stream_started', chatId });
    this.stopped.delete(chatId);
    try {
      let text = '';
      for await (const delta of this.streamText(context)) {
        if (this.stopped.has(chatId)) break;
        text += delta;
        this.emit('message', { type: 'chat_stream_delta', chatId, delta });
      }
      this.stopped.delete(chatId);
      appendMessage(this.graph, chatId, 'assistant', text);
      this.emit('message', {
        type: 'chat_stream_completed',
        chatId,
        message: own[own.length - 1],
      });
      this.maybeAutoTitle(chatId);
      this.scheduleSave();
    } catch (err) {
      this.stopped.delete(chatId);
      this.emit('message', {
        type: 'chat_error',
        chatId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Stops the in-flight stream for a chat; the loop breaks and settles the turn. */
  stop(chatId: string): void {
    this.stopped.add(chatId);
  }

  /** Re-runs the last turn: drops a trailing assistant message and streams again. */
  async regenerate(chatId: string): Promise<void> {
    const chat = this.graph.chats[chatId];
    if (!chat) throw new Error(`unknown chat: ${chatId}`);
    const last = chat.messages[chat.messages.length - 1];
    if (!last || last.role !== 'assistant') return;
    removeLastMessage(this.graph, chatId);
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
