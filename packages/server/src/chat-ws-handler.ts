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
  }
}
