import { graphToMermaid } from '@fcw/graph-core';
import type { ChatState } from './chat-store';
import { canvasById } from './chat-store';

/** Mermaid text for one canvas (root or a doc's own). An export, never a live binding. */
export function exportCanvasMermaid(state: ChatState, canvasId: string): string {
  return graphToMermaid(canvasById(state, canvasId) ?? { placements: [], edges: [] }, state);
}
