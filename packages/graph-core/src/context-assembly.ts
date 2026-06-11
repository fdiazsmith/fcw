// Context assembly: compile the message history a chat sees at query time.
// Re-wiring edges changes the output of this function — that IS the product.
import type { ChatGraph, ChatMessage } from './chat-graph.js';

export interface AssembleOptions {
  /** Max total tokens. Ancestors degrade (summary, then drop) most-distant-first. */
  budget?: number;
  /** Token estimator per message. Default: ~4 chars per token. */
  estimateTokens?: (message: ChatMessage) => number;
}

const defaultEstimator = (m: ChatMessage): number => Math.ceil(m.content.length / 4);

export function assembleContext(
  graph: ChatGraph,
  chatId: string,
  options?: AssembleOptions,
): ChatMessage[] {
  const chat = graph.chats[chatId];
  if (!chat) throw new Error(`unknown chat: ${chatId}`);

  // One block per ancestor (most distant first), then the chat's own messages.
  const blocks = ancestorOrder(graph, chatId).map((id) => {
    const ancestor = graph.chats[id];
    return { ancestor, messages: [...ancestor.messages] };
  });
  const own = [...chat.messages];

  const budget = options?.budget;
  if (budget !== undefined) {
    const estimate = options?.estimateTokens ?? defaultEstimator;
    const cost = (ms: ChatMessage[]) => ms.reduce((sum, m) => sum + estimate(m), 0);
    const total = () => blocks.reduce((sum, b) => sum + cost(b.messages), cost(own));

    // Own messages are never degraded; ancestors degrade most-distant-first.
    for (const block of blocks) {
      if (total() <= budget) break;
      const summary = block.ancestor.summary;
      block.messages = summary
        ? [{ role: 'assistant', content: summary, createdAt: block.ancestor.createdAt }]
        : [];
      if (block.messages.length > 0 && total() > budget) block.messages = [];
    }
  }

  return [...blocks.flatMap((b) => b.messages), ...own];
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
