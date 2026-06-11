// v2: owns the chat-graph and runs stateless chat turns against it.
import { EventEmitter } from 'node:events';
import { createChatGraph, addChat, appendMessage } from '@fcw/graph-core';
import type { ChatGraph, Position } from '@fcw/graph-core';

export class ChatSessionManager extends EventEmitter {
  readonly graph: ChatGraph;

  constructor(title = 'Untitled') {
    super();
    this.graph = createChatGraph(title);
  }

  createChat(position: Position, title?: string): string {
    const id = addChat(this.graph, { position, title });
    this.emit('message', { type: 'chat_created', chat: this.graph.chats[id] });
    return id;
  }

  async prompt(chatId: string, content: string): Promise<void> {
    appendMessage(this.graph, chatId, 'user', content);
    const messages = this.graph.chats[chatId].messages;
    this.emit('message', {
      type: 'chat_user_message',
      chatId,
      message: messages[messages.length - 1],
    });
  }
}
