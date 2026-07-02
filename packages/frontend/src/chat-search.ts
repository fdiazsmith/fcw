// Pure cross-chat search over the frontend ChatState.
import type { ChatState } from './chat-store';

export interface ChatSearchResult {
  chatId: string;
  title: string;
  snippet: string;
}

const SNIPPET_RADIUS = 40;

/** Extract ±radius chars around the first match of needle in haystack. */
function snippetAround(haystack: string, lowerHaystack: string, needle: string): string {
  const idx = lowerHaystack.indexOf(needle);
  if (idx === -1) return '';
  const start = Math.max(0, idx - SNIPPET_RADIUS);
  const end = Math.min(haystack.length, idx + needle.length + SNIPPET_RADIUS);
  let snippet = haystack.slice(start, end);
  if (start > 0) snippet = '…' + snippet;
  if (end < haystack.length) snippet = snippet + '…';
  return snippet;
}

/** Rank chats matching `query` in title or message content (case-insensitive).
 *  Title matches rank above message-only matches. */
export function searchChats(state: ChatState, query: string): ChatSearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const results: Array<ChatSearchResult & { rank: number }> = [];

  for (const chat of Object.values(state.chats)) {
    const titleLower = chat.title.toLowerCase();
    const titleHit = titleLower.includes(needle);

    let msgSnippet = '';
    for (const m of chat.messages) {
      const lower = m.content.toLowerCase();
      if (lower.includes(needle)) {
        msgSnippet = snippetAround(m.content, lower, needle);
        break;
      }
    }

    if (!titleHit && !msgSnippet) continue;

    results.push({
      chatId: chat.id,
      title: chat.title,
      // Prefer a content snippet when the title alone matched but content did too;
      // otherwise show the title as the snippet.
      snippet: msgSnippet || chat.title,
      rank: titleHit ? 0 : 1,
    });
  }

  results.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.chatId < b.chatId ? -1 : 1));
  return results.map(({ rank, ...r }) => r);
}
