// Pure projection helpers for rendering compactions on the canvas:
// which page a chat lives on, which edges are visible, what the card shows.
import type { ChatState } from './chat-store';
import { compactionIsStale } from './chat-store';

/** The compaction a chat is folded into, or null when it lives on the main canvas. */
export function compactionForChat(state: ChatState, chatId: string): string | null {
  for (const compaction of Object.values(state.compactions)) {
    if (compaction.memberIds.includes(chatId)) return compaction.id;
  }
  return null;
}

/** Stable tldraw page-id fragment for a compaction's inner canvas. */
export function compactionPageSlug(compactionId: string): string {
  return `cmp-${compactionId}`;
}

/** An edge renders as an arrow only when both chats share a container —
 *  the same compaction page, or both on the main canvas. Cross-boundary
 *  edges stay in the graph but cannot be drawn across tldraw pages. */
export function edgeVisible(state: ChatState, from: string, to: string): boolean {
  return compactionForChat(state, from) === compactionForChat(state, to);
}

export interface CompactCardModel {
  compactionId: string;
  title: string;
  document: string;
  memberCount: number;
  stale: boolean;
  generating: boolean;
}

/** Shape props for a compaction card, staleness included. */
export function compactCardModel(state: ChatState, compactionId: string): CompactCardModel {
  const c = state.compactions[compactionId];
  if (!c) throw new Error(`unknown compaction: ${compactionId}`);
  return {
    compactionId: c.id,
    title: c.title,
    document: c.document,
    memberCount: c.memberIds.length,
    stale: compactionIsStale(state, compactionId),
    generating: c.status === 'generating',
  };
}
