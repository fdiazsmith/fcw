// v2 frontend state: pure reducer over chat server messages.
import type { ChatServerMessage, ChatMessage, ChatNode } from '@fcw/graph-core';

export interface ChatView {
  id: string;
  title: string;
  position: { x: number; y: number };
  messages: ChatMessage[];
  streamingText: string | null;
  error: string | null;
}

export interface ChatState {
  chats: Record<string, ChatView>;
}

export function emptyChatState(): ChatState {
  return { chats: {} };
}

function viewFrom(chat: ChatNode): ChatView {
  return {
    id: chat.id,
    title: chat.title,
    position: chat.position,
    messages: [...chat.messages],
    streamingText: null,
    error: null,
  };
}

export function applyChatMessage(state: ChatState, msg: ChatServerMessage): ChatState {
  if (msg.type === 'chat_created') {
    return { chats: { ...state.chats, [msg.chat.id]: viewFrom(msg.chat) } };
  }

  const existing = state.chats[msg.chatId];
  if (!existing) return state;

  const update = (patch: Partial<ChatView>): ChatState => ({
    chats: { ...state.chats, [msg.chatId]: { ...existing, ...patch } },
  });

  switch (msg.type) {
    case 'chat_user_message':
      return update({ messages: [...existing.messages, msg.message], error: null });
    case 'chat_stream_started':
      return update({ streamingText: '', error: null });
    case 'chat_stream_delta':
      return update({ streamingText: (existing.streamingText ?? '') + msg.delta });
    case 'chat_stream_completed':
      return update({ streamingText: null, messages: [...existing.messages, msg.message] });
    case 'chat_error':
      return update({ streamingText: null, error: msg.message });
    default:
      return state;
  }
}
