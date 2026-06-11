// Context assembly: compile the message history a chat sees at query time.
// Re-wiring edges changes the output of this function — that IS the product.
import type { ChatGraph, ChatMessage } from './chat-graph.js';

export function assembleContext(graph: ChatGraph, chatId: string): ChatMessage[] {
  const chat = graph.chats[chatId];
  if (!chat) throw new Error(`unknown chat: ${chatId}`);
  const messages: ChatMessage[] = [];
  for (const id of ancestorOrder(graph, chatId)) {
    messages.push(...graph.chats[id].messages);
  }
  messages.push(...chat.messages);
  return messages;
}

/** Ancestors of `chatId` in deterministic topological order (most distant first).
 *  Post-order DFS over enabled incoming edges; first visit wins (diamond dedup). */
function ancestorOrder(graph: ChatGraph, chatId: string): string[] {
  const order: string[] = [];
  const emitted = new Set<string>([chatId]);

  function visit(id: string): void {
    if (emitted.has(id)) return;
    emitted.add(id);
    for (const parent of parentsOf(graph, id)) visit(parent);
    order.push(id);
  }

  for (const parent of parentsOf(graph, chatId)) visit(parent);
  return order;
}

/** Enabled parents of a chat, ordered by edge priority, then chat age, then id. */
function parentsOf(graph: ChatGraph, chatId: string): string[] {
  return graph.edges
    .filter((e) => e.to === chatId && e.enabled)
    .sort((x, y) => {
      if (x.priority !== y.priority) return x.priority - y.priority;
      const a = graph.chats[x.from];
      const b = graph.chats[y.from];
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    })
    .map((e) => e.from);
}
