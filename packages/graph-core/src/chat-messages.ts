// v2 WebSocket protocol: chat-graph messages (shared server <-> frontend language).
import type { ChatGraph, ChatMessage, ChatNode, ContextEdge, ChatSettings, TokenUsage } from './chat-graph.js';
import type { Doc, DocEdge, DocPlacement } from './docs.js';
import type { Position } from './types.js';

/** Canvas address of graph.rootCanvas. Any other canvasId is a docId: that doc's child canvas. */
export const ROOT_CANVAS_ID = 'root';

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
  | { type: 'doc_created'; doc: Doc }
  | { type: 'doc_updated'; docId: string; title?: string; body?: string; generated?: Doc['generated'] }
  | { type: 'doc_placed'; canvasId: string; placement: DocPlacement }
  | { type: 'doc_unplaced'; canvasId: string; kind: DocPlacement['kind']; id: string }
  | { type: 'doc_moved'; canvasId: string; kind: DocPlacement['kind']; id: string; position: Position }
  | { type: 'doc_linked'; canvasId: string; placedDocId: string; existingDocId: string }
  // After the per-box doc_created/doc_placed; the client lays the boxes out (M3.4).
  | { type: 'doc_chat_ready'; docId: string; chatId: string }
  | { type: 'diagram_created'; canvasId: string; docIds: string[]; edges: DocEdge[]; error?: string };

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
  | { type: 'chat_compact_requested'; chatIds: string[]; canvasId?: string }
  | { type: 'doc_create_requested'; canvasId: string; title: string; position: Position }
  | { type: 'doc_update_requested'; docId: string; title?: string; body?: string }
  | { type: 'doc_place_requested'; canvasId: string; kind: DocPlacement['kind']; id: string; position: Position }
  | { type: 'doc_unplace_requested'; canvasId: string; kind: DocPlacement['kind']; id: string }
  | { type: 'doc_move_requested'; canvasId: string; kind: DocPlacement['kind']; id: string; position: Position }
  | { type: 'doc_link_requested'; canvasId: string; placedDocId: string; existingDocId: string }
  | { type: 'doc_regenerate_requested'; docId: string }
  | { type: 'diagram_requested'; canvasId: string; prompt: string }
  | { type: 'doc_chat_requested'; docId: string }
  | { type: 'doc_apply_requested'; docId: string; chatId: string; messageIndex: number };
