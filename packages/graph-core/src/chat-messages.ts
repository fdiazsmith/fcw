// v2 WebSocket protocol: chat-graph messages (shared server <-> frontend language).
import type { ChatGraph, ChatMessage, ChatNode, ContextEdge, ChatSettings, TokenUsage } from './chat-graph.js';
import type { Compaction, CompactionStatus } from './compaction.js';
import type { Position } from './types.js';

export interface CapabilityModel {
  id: string;
  displayName: string;
}
export interface CapabilityCommand {
  name: string;
  description: string;
}

// Server -> Client
export type ChatServerMessage =
  | { type: 'chat_snapshot'; graph: ChatGraph }
  | { type: 'chat_created'; chat: ChatNode }
  | { type: 'chat_connected'; edge: ContextEdge }
  | { type: 'chat_disconnected'; from: string; to: string }
  | { type: 'chat_user_message'; chatId: string; message: ChatMessage }
  | { type: 'chat_stream_started'; chatId: string }
  | { type: 'chat_stream_delta'; chatId: string; delta: string }
  | { type: 'chat_stream_completed'; chatId: string; message: ChatMessage }
  | { type: 'chat_title_changed'; chatId: string; title: string }
  | { type: 'chat_last_message_removed'; chatId: string }
  | { type: 'chat_error'; chatId: string; message: string }
  | { type: 'chat_settings_changed'; chatId: string; settings: ChatSettings }
  | { type: 'chat_usage_updated'; chatId: string; usage: TokenUsage; contextChats: number }
  | { type: 'chat_tool_message'; chatId: string; message: ChatMessage }
  | { type: 'chat_capabilities'; models: CapabilityModel[]; commands: CapabilityCommand[] }
  | { type: 'chat_permission_requested'; chatId: string; requestId: string; toolName: string; input: unknown }
  | { type: 'chat_permission_resolved'; chatId: string; requestId: string }
  | { type: 'chat_compaction_created'; compaction: Compaction }
  | { type: 'chat_compaction_document'; compactionId: string; document: string; sourceDigest: string; status: CompactionStatus };

// Client -> Server
export type ChatClientMessage =
  | { type: 'chat_create_requested'; position: Position; title?: string }
  | { type: 'chat_prompt_submitted'; chatId: string; content: string; attachmentIds?: string[] }
  | { type: 'chat_branch_requested'; parentId: string; position: Position }
  | { type: 'chat_connect_requested'; from: string; to: string }
  | { type: 'chat_disconnect_requested'; from: string; to: string }
  | { type: 'chat_move_requested'; chatId: string; position: Position }
  | { type: 'chat_stop_requested'; chatId: string }
  | { type: 'chat_regenerate_requested'; chatId: string }
  | { type: 'chat_settings_updated'; chatId: string; settings: Partial<ChatSettings> }
  | { type: 'chat_permission_decision'; chatId: string; requestId: string; behavior: 'allow' | 'deny'; message?: string }
  | { type: 'chat_compact_requested'; chatIds: string[] }
  | { type: 'chat_compaction_regenerate_requested'; compactionId: string }
  | { type: 'chat_compaction_document_updated'; compactionId: string; document: string }
  | { type: 'chat_compaction_move_requested'; compactionId: string; position: Position };
