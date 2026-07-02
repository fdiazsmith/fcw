// Export one chat branch (with inherited parent context) as Markdown.
import { assembleContext } from '@fcw/graph-core';
import type { ChatGraph, ChatNode, ChatRole } from '@fcw/graph-core';
import type { ChatState } from './chat-store';

const ROLE_LABEL: Record<ChatRole, string> = {
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool',
};

/** Rebuild a ChatGraph from frontend state so we can reuse assembleContext. */
function graphFromState(state: ChatState): ChatGraph {
  const chats: Record<string, ChatNode> = {};
  for (const view of Object.values(state.chats)) {
    chats[view.id] = {
      id: view.id,
      title: view.title,
      messages: [...view.messages],
      position: view.position,
      createdAt: '',
    };
  }
  return {
    id: 'export',
    version: 2,
    meta: { title: '', created: '' },
    chats,
    edges: state.edges.map((e) => ({ ...e })),
  };
}

/** Markdown for a chat branch: its title header plus the assembled context
 *  (inherited parent messages first, then the chat's own), one block per message. */
export function exportBranchMarkdown(state: ChatState, chatId: string): string {
  const chat = state.chats[chatId];
  if (!chat) return '';

  const graph = graphFromState(state);
  const messages = assembleContext(graph, chatId);

  const header = `## ${chat.title || chatId}`;
  const body = messages.map((m) => `**${ROLE_LABEL[m.role]}:**\n\n${m.content}`);

  return [header, ...body].join('\n\n') + '\n';
}
