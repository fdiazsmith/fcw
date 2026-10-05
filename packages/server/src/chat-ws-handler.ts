// v2 WS dispatch: validates and routes chat client messages to the session manager.
import { z } from 'zod';
import type { ChatClientMessage } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';

const ChatCreateRequestedSchema = z.object({
  type: z.literal('chat_create_requested'),
  position: z.object({ x: z.number(), y: z.number() }),
  title: z.string().optional(),
});

const ChatPromptSubmittedSchema = z.object({
  type: z.literal('chat_prompt_submitted'),
  chatId: z.string(),
  content: z.string(),
  attachmentIds: z.array(z.string()).optional(),
});

const ChatSettingsSchema = z.object({
  engine: z.enum(['api', 'agent']).optional(),
  model: z.string().optional(),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
  permissionMode: z.enum(['default', 'acceptEdits', 'bypassPermissions']).optional(),
  cwd: z.string().optional(),
});

const ChatSettingsUpdatedSchema = z.object({
  type: z.literal('chat_settings_updated'),
  chatId: z.string(),
  settings: ChatSettingsSchema,
});

const ChatPermissionDecisionSchema = z.object({
  type: z.literal('chat_permission_decision'),
  chatId: z.string(),
  requestId: z.string(),
  behavior: z.enum(['allow', 'deny']),
  message: z.string().optional(),
});

const ChatBranchRequestedSchema = z.object({
  type: z.literal('chat_branch_requested'),
  parentId: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
});

const ChatConnectRequestedSchema = z.object({
  type: z.literal('chat_connect_requested'),
  from: z.string(),
  to: z.string(),
});

const ChatDisconnectRequestedSchema = z.object({
  type: z.literal('chat_disconnect_requested'),
  from: z.string(),
  to: z.string(),
});

const ChatMoveRequestedSchema = z.object({
  type: z.literal('chat_move_requested'),
  chatId: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
});

const ChatStopRequestedSchema = z.object({
  type: z.literal('chat_stop_requested'),
  chatId: z.string(),
});

const ChatRegenerateRequestedSchema = z.object({
  type: z.literal('chat_regenerate_requested'),
  chatId: z.string(),
});

const ChatCompactRequestedSchema = z.object({
  type: z.literal('chat_compact_requested'),
  chatIds: z.array(z.string()).min(1),
  canvasId: z.string().optional(),
});

const ChatArchiveRequestedSchema = z.object({
  type: z.literal('chat_archive_requested'),
  chatId: z.string(),
});

const ChatUnarchiveRequestedSchema = z.object({
  type: z.literal('chat_unarchive_requested'),
  chatId: z.string(),
});

const ChatDeleteRequestedSchema = z.object({
  type: z.literal('chat_delete_requested'),
  chatId: z.string(),
});

const PositionSchema = z.object({ x: z.number(), y: z.number() });
const PlacementKindSchema = z.enum(['doc', 'chat']);

const DocCreateRequestedSchema = z.object({
  type: z.literal('doc_create_requested'),
  canvasId: z.string(),
  title: z.string(),
  position: PositionSchema,
});

const DocUpdateRequestedSchema = z.object({
  type: z.literal('doc_update_requested'),
  docId: z.string(),
  title: z.string().optional(),
  body: z.string().optional(),
});

const DocPlaceRequestedSchema = z.object({
  type: z.literal('doc_place_requested'),
  canvasId: z.string(),
  kind: PlacementKindSchema,
  id: z.string(),
  position: PositionSchema,
});

const DocUnplaceRequestedSchema = z.object({
  type: z.literal('doc_unplace_requested'),
  canvasId: z.string(),
  kind: PlacementKindSchema,
  id: z.string(),
});

const DocMoveRequestedSchema = z.object({
  type: z.literal('doc_move_requested'),
  canvasId: z.string(),
  kind: PlacementKindSchema,
  id: z.string(),
  position: PositionSchema,
});

const DocRegenerateRequestedSchema = z.object({
  type: z.literal('doc_regenerate_requested'),
  docId: z.string(),
});

const DocLinkRequestedSchema = z.object({
  type: z.literal('doc_link_requested'),
  canvasId: z.string(),
  placedDocId: z.string(),
  existingDocId: z.string(),
});

const DiagramRequestedSchema = z.object({
  type: z.literal('diagram_requested'),
  canvasId: z.string(),
  prompt: z.string(),
});

const DocChatRequestedSchema = z.object({
  type: z.literal('doc_chat_requested'),
  docId: z.string(),
});

const DocApplyRequestedSchema = z.object({
  type: z.literal('doc_apply_requested'),
  docId: z.string(),
  chatId: z.string(),
  messageIndex: z.number().int().nonnegative(),
});

export const ChatClientMessageSchema = z.discriminatedUnion('type', [
  ChatCreateRequestedSchema,
  ChatPromptSubmittedSchema,
  ChatBranchRequestedSchema,
  ChatConnectRequestedSchema,
  ChatDisconnectRequestedSchema,
  ChatMoveRequestedSchema,
  ChatStopRequestedSchema,
  ChatRegenerateRequestedSchema,
  ChatSettingsUpdatedSchema,
  ChatPermissionDecisionSchema,
  ChatCompactRequestedSchema,
  ChatArchiveRequestedSchema,
  ChatUnarchiveRequestedSchema,
  ChatDeleteRequestedSchema,
  DocCreateRequestedSchema,
  DocUpdateRequestedSchema,
  DocPlaceRequestedSchema,
  DocUnplaceRequestedSchema,
  DocMoveRequestedSchema,
  DocLinkRequestedSchema,
  DocRegenerateRequestedSchema,
  DiagramRequestedSchema,
  DocChatRequestedSchema,
  DocApplyRequestedSchema,
]);

export function isChatClientMessage(value: unknown): value is ChatClientMessage {
  return ChatClientMessageSchema.safeParse(value).success;
}

export async function handleChatClientMessage(
  msg: ChatClientMessage,
  sessions: ChatSessionManager,
): Promise<void> {
  if (msg.type === 'chat_create_requested') {
    sessions.createChat(msg.position, msg.title);
  } else if (msg.type === 'chat_prompt_submitted') {
    await sessions.prompt(msg.chatId, msg.content, msg.attachmentIds);
  } else if (msg.type === 'chat_settings_updated') {
    sessions.updateSettings(msg.chatId, msg.settings);
  } else if (msg.type === 'chat_permission_decision') {
    sessions.resolvePermission(msg.chatId, msg.requestId, {
      behavior: msg.behavior,
      message: msg.message,
    });
  } else if (msg.type === 'chat_branch_requested') {
    sessions.branch(msg.parentId, msg.position);
  } else if (msg.type === 'chat_connect_requested') {
    sessions.connect(msg.from, msg.to);
  } else if (msg.type === 'chat_disconnect_requested') {
    sessions.disconnect(msg.from, msg.to);
  } else if (msg.type === 'chat_move_requested') {
    sessions.moveChat(msg.chatId, msg.position);
  } else if (msg.type === 'chat_stop_requested') {
    sessions.stop(msg.chatId);
  } else if (msg.type === 'chat_regenerate_requested') {
    await sessions.regenerate(msg.chatId);
  } else if (msg.type === 'chat_compact_requested') {
    await sessions.compact(msg.chatIds, msg.canvasId);
  } else if (msg.type === 'chat_archive_requested') {
    sessions.setChatArchived(msg.chatId, true);
  } else if (msg.type === 'chat_unarchive_requested') {
    sessions.setChatArchived(msg.chatId, false);
  } else if (msg.type === 'chat_delete_requested') {
    sessions.deleteChat(msg.chatId);
  } else if (msg.type === 'doc_regenerate_requested') {
    await sessions.regenerateDoc(msg.docId);
  } else if (msg.type === 'doc_create_requested') {
    sessions.createDoc(msg.canvasId, msg.title, msg.position);
  } else if (msg.type === 'doc_update_requested') {
    sessions.updateDoc(msg.docId, { title: msg.title, body: msg.body });
  } else if (msg.type === 'doc_place_requested') {
    sessions.placeOnCanvas(msg.canvasId, msg.kind, msg.id, msg.position);
  } else if (msg.type === 'doc_unplace_requested') {
    sessions.unplaceFromCanvas(msg.canvasId, msg.kind, msg.id);
  } else if (msg.type === 'doc_move_requested') {
    sessions.moveOnCanvas(msg.canvasId, msg.kind, msg.id, msg.position);
  } else if (msg.type === 'doc_link_requested') {
    sessions.linkDoc(msg.canvasId, msg.placedDocId, msg.existingDocId);
  } else if (msg.type === 'diagram_requested') {
    await sessions.requestDiagram(msg.canvasId, msg.prompt);
  } else if (msg.type === 'doc_chat_requested') {
    sessions.requestDocChat(msg.docId);
  } else if (msg.type === 'doc_apply_requested') {
    sessions.applyToDoc(msg.docId, msg.chatId, msg.messageIndex);
  }
}
