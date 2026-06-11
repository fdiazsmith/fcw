// v2 WebSocket protocol: chat-graph messages (shared server <-> frontend language).
import type { ChatMessage, ChatNode, ContextEdge } from './chat-graph.js';
import type { Position } from './types.js';

// Server -> Client
export type ChatServerMessage =
  | { type: 'chat_created'; chat: ChatNode }
  | { type: 'chat_connected'; edge: ContextEdge }
  | { type: 'chat_disconnected'; from: string; to: string }
  | { type: 'chat_user_message'; chatId: string; message: ChatMessage }
  | { type: 'chat_stream_started'; chatId: string }
  | { type: 'chat_stream_delta'; chatId: string; delta: string }
  | { type: 'chat_stream_completed'; chatId: string; message: ChatMessage }
  | { type: 'chat_error'; chatId: string; message: string };

// Client -> Server
export type ChatClientMessage =
  | { type: 'chat_create_requested'; position: Position; title?: string }
  | { type: 'chat_prompt_submitted'; chatId: string; content: string }
  | { type: 'chat_branch_requested'; parentId: string; position: Position }
  | { type: 'chat_connect_requested'; from: string; to: string }
  | { type: 'chat_disconnect_requested'; from: string; to: string };
