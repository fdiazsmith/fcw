// v2: owns the chat-graph and runs stateless chat turns against it.
// Every prompt re-assembles context from the graph — re-wiring edges rewrites history.
import { EventEmitter } from 'node:events';
import {
  createChatGraph,
  addChat,
  appendMessage,
  addContextEdge,
  assembleContext,
} from '@fcw/graph-core';
import type { ChatGraph, ChatMessage, Position } from '@fcw/graph-core';

/** Streams assistant text for an assembled context. Injected for testability. */
export type StreamTextFn = (messages: ChatMessage[]) => AsyncIterable<string>;

export class ChatSessionManager extends EventEmitter {
  readonly graph: ChatGraph;

  constructor(
    title = 'Untitled',
    private readonly streamText?: StreamTextFn,
  ) {
    super();
    this.graph = createChatGraph(title);
  }

  createChat(position: Position, title?: string): string {
    const id = addChat(this.graph, { position, title });
    this.emit('message', { type: 'chat_created', chat: this.graph.chats[id] });
    return id;
  }

  connect(from: string, to: string): void {
    addContextEdge(this.graph, from, to);
  }

  async prompt(chatId: string, content: string): Promise<void> {
    appendMessage(this.graph, chatId, 'user', content);
    const own = this.graph.chats[chatId].messages;
    this.emit('message', { type: 'chat_user_message', chatId, message: own[own.length - 1] });

    if (!this.streamText) return;

    const context = assembleContext(this.graph, chatId);
    this.emit('message', { type: 'chat_stream_started', chatId });
    try {
      let text = '';
      for await (const delta of this.streamText(context)) {
        text += delta;
        this.emit('message', { type: 'chat_stream_delta', chatId, delta });
      }
      appendMessage(this.graph, chatId, 'assistant', text);
      this.emit('message', {
        type: 'chat_stream_completed',
        chatId,
        message: own[own.length - 1],
      });
    } catch (err) {
      this.emit('message', {
        type: 'chat_error',
        chatId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
