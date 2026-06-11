// Context assembly: compile the message history a chat sees at query time.
// Re-wiring edges changes the output of this function — that IS the product.
import type { ChatGraph, ChatMessage } from './chat-graph.js';

export function assembleContext(graph: ChatGraph, chatId: string): ChatMessage[] {
  const chat = graph.chats[chatId];
  if (!chat) throw new Error(`unknown chat: ${chatId}`);
  return [...chat.messages];
}
