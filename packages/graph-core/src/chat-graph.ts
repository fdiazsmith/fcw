// FCW v2 chat-graph: node = chat window, edges = context inheritance.
import type { Position } from './types.js';

export type ChatRole = 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ChatNode {
  id: string;
  title: string;
  messages: ChatMessage[];
  position: Position;
  createdAt: string;
  summary?: string;
}

export interface ContextEdge {
  from: string;
  to: string;
  enabled: boolean;
  priority: number;
}

export interface ChatGraph {
  id: string;
  version: 2;
  meta: { title: string; created: string };
  chats: Record<string, ChatNode>;
  edges: ContextEdge[];
}

let graphCounter = 0;
let chatCounter = 0;

export function createChatGraph(title: string): ChatGraph {
  return {
    id: `cg_${Date.now()}_${++graphCounter}`,
    version: 2,
    meta: { title, created: new Date().toISOString() },
    chats: {},
    edges: [],
  };
}

export function addChat(
  graph: ChatGraph,
  options?: { title?: string; position?: Position },
): string {
  const id = `chat_${Date.now()}_${++chatCounter}`;
  graph.chats[id] = {
    id,
    title: options?.title ?? '',
    messages: [],
    position: options?.position ?? { x: 0, y: 0 },
    createdAt: new Date().toISOString(),
  };
  return id;
}

export function appendMessage(
  graph: ChatGraph,
  chatId: string,
  role: ChatRole,
  content: string,
): void {
  const chat = graph.chats[chatId];
  if (!chat) throw new Error(`unknown chat: ${chatId}`);
  chat.messages.push({ role, content, createdAt: new Date().toISOString() });
}

export function addContextEdge(
  graph: ChatGraph,
  from: string,
  to: string,
  options?: { priority?: number },
): void {
  if (!graph.chats[from]) throw new Error(`unknown chat: ${from}`);
  if (!graph.chats[to]) throw new Error(`unknown chat: ${to}`);
  if (from === to) throw new Error('self-edges are not allowed');
  if (graph.edges.some((e) => e.from === from && e.to === to)) {
    throw new Error(`edge already exists: ${from} -> ${to}`);
  }
  graph.edges.push({ from, to, enabled: true, priority: options?.priority ?? 0 });
}
