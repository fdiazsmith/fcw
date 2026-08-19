// FCW v2 chat-graph: node = chat window, edges = context inheritance.
import type { Position } from './types.js';
import type { Compaction } from './compaction.js';

export type ChatRole = 'user' | 'assistant' | 'tool';

/** File attached to a prompt. Stored on disk; messages reference it by id. */
export interface Attachment {
  id: string;
  name: string;
  mediaType: string;
  path: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  createdAt: string;
  attachments?: Attachment[];
  /** Set on role 'tool' messages produced by agent tool use/results. */
  toolUseId?: string;
  toolName?: string;
  toolInput?: unknown;
  /** True on emitted copies whose toolInput was truncated to fit a WS frame. */
  toolInputTruncated?: boolean;
}

/** Accumulated token usage for a chat. One entry per completed turn. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
  turns: number;
}

/** Per-chat engine configuration. `engine: 'api'` is the default. */
export interface ChatSettings {
  engine: 'api' | 'agent';
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
  cwd?: string;
}

export interface ChatNode {
  id: string;
  title: string;
  messages: ChatMessage[];
  position: Position;
  createdAt: string;
  summary?: string;
  settings?: ChatSettings;
  /** Agent-engine SDK session id, captured from the init message. */
  sessionId?: string;
  /** When true, the next prompt starts a fresh session with a re-assembled preamble. */
  sessionStale?: boolean;
  /** Accumulated token usage across this chat's turns. */
  usage?: TokenUsage;
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
  /** Chats folded behind editable document nodes. Absent in pre-compaction docs. */
  compactions: Record<string, Compaction>;
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
    compactions: {},
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

/** Merge a partial settings patch onto a chat, defaulting to the api engine. */
export function updateChatSettings(
  graph: ChatGraph,
  chatId: string,
  patch: Partial<ChatSettings>,
): void {
  const chat = graph.chats[chatId];
  if (!chat) throw new Error(`unknown chat: ${chatId}`);
  chat.settings = { engine: 'api', ...chat.settings, ...patch };
}

/** Marks a chat and every downstream descendant sessionStale (via enabled or
 *  disabled edges, mirroring reaches()). Used when edges change so the agent
 *  session is rebuilt with a re-assembled preamble. */
export function markSessionStale(graph: ChatGraph, chatId: string): void {
  if (!graph.chats[chatId]) throw new Error(`unknown chat: ${chatId}`);
  const stack = [chatId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    graph.chats[current].sessionStale = true;
    for (const e of graph.edges) {
      if (e.from === current) stack.push(e.to);
    }
  }
}

/** Accumulate one turn's token usage onto a chat. */
export function addTurnUsage(
  graph: ChatGraph,
  chatId: string,
  turn: Omit<TokenUsage, 'turns'>,
): void {
  const chat = graph.chats[chatId];
  if (!chat) throw new Error(`unknown chat: ${chatId}`);
  const prev = chat.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    costUSD: 0,
    turns: 0,
  };
  chat.usage = {
    inputTokens: prev.inputTokens + turn.inputTokens,
    outputTokens: prev.outputTokens + turn.outputTokens,
    cacheReadInputTokens: prev.cacheReadInputTokens + turn.cacheReadInputTokens,
    cacheCreationInputTokens: prev.cacheCreationInputTokens + turn.cacheCreationInputTokens,
    costUSD: prev.costUSD + turn.costUSD,
    turns: prev.turns + 1,
  };
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
