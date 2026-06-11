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
});

export const ChatClientMessageSchema = z.discriminatedUnion('type', [
  ChatCreateRequestedSchema,
  ChatPromptSubmittedSchema,
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
    await sessions.prompt(msg.chatId, msg.content);
  }
}
