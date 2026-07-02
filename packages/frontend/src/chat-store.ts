// v2 frontend state: pure reducer over chat server messages.
import type { ChatServerMessage, ChatMessage, ChatNode, ContextEdge } from '@fcw/graph-core';

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
  edges: ContextEdge[];
}

export function emptyChatState(): ChatState {
  return { chats: {}, edges: [] };
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
  if (msg.type === 'chat_snapshot') {
    const chats: Record<string, ChatView> = {};
    for (const chat of Object.values(msg.graph.chats)) {
      chats[chat.id] = viewFrom(chat);
    }
    return { chats, edges: [...msg.graph.edges] };
  }

  if (msg.type === 'chat_created') {
    return { ...state, chats: { ...state.chats, [msg.chat.id]: viewFrom(msg.chat) } };
  }

  if (msg.type === 'chat_connected') {
    const exists = state.edges.some(
      (e) => e.from === msg.edge.from && e.to === msg.edge.to,
    );
    if (exists) return state;
    return { ...state, edges: [...state.edges, msg.edge] };
  }

  if (msg.type === 'chat_disconnected') {
    return {
      ...state,
      edges: state.edges.filter((e) => !(e.from === msg.from && e.to === msg.to)),
    };
  }

  const existing = state.chats[msg.chatId];
  if (!existing) return state;

  const update = (patch: Partial<ChatView>): ChatState => ({
    ...state,
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
    case 'chat_title_changed':
      return update({ title: msg.title });
    case 'chat_last_message_removed':
      return update({ messages: existing.messages.slice(0, -1) });
    case 'chat_error':
      return update({ streamingText: null, error: msg.message });
    default:
      return state;
  }
}
