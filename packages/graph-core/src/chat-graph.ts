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

/** Removes and returns the last message of a chat, or undefined if empty. */
export function removeLastMessage(graph: ChatGraph, chatId: string): ChatMessage | undefined {
  const chat = graph.chats[chatId];
  if (!chat) throw new Error(`unknown chat: ${chatId}`);
  return chat.messages.pop();
}

export function setChatPosition(graph: ChatGraph, chatId: string, position: Position): void {
  const chat = graph.chats[chatId];
  if (!chat) throw new Error(`unknown chat: ${chatId}`);
  chat.position = position;
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
  if (reaches(graph, to, from)) {
    throw new Error(`edge would create a cycle: ${from} -> ${to}`);
  }
  graph.edges.push({ from, to, enabled: true, priority: options?.priority ?? 0 });
}

function findEdge(graph: ChatGraph, from: string, to: string): ContextEdge {
  const edge = graph.edges.find((e) => e.from === from && e.to === to);
  if (!edge) throw new Error(`no edge: ${from} -> ${to}`);
  return edge;
}

export function setEdgeEnabled(
  graph: ChatGraph,
  from: string,
  to: string,
  enabled: boolean,
): void {
  findEdge(graph, from, to).enabled = enabled;
}

export function removeContextEdge(graph: ChatGraph, from: string, to: string): void {
  const edge = findEdge(graph, from, to);
  graph.edges.splice(graph.edges.indexOf(edge), 1);
}

/** True if `target` is reachable from `start` by following edges downstream.
 *  Disabled edges count: a cycle must be impossible even after re-enabling. */
function reaches(graph: ChatGraph, start: string, target: string): boolean {
  const stack = [start];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const e of graph.edges) {
      if (e.from === current) stack.push(e.to);
    }
  }
  return false;
}
