import type { ChatState, ChatView } from './chat-store';

export interface DocChatBinding {
  /** The doc-chat to show, once the store has it. */
  chat: ChatView | null;
  /** True when the doc has no doc-chat yet: send `doc_chat_requested`. */
  needsRequest: boolean;
}

/** Which chat the doc panel shows for a doc, and whether to ask for one. */
export function docChatBinding(state: Pick<ChatState, 'chats' | 'docChats'>, docId: string): DocChatBinding {
  const chatId = state.docChats[docId];
  if (!chatId) return { chat: null, needsRequest: true };
  return { chat: state.chats[chatId] ?? null, needsRequest: false };
}
