// Inspection view of what a doc-builder chat would receive as context.
import { assembleDocContext } from '@fcw/graph-core';
import type { DocWorkspace } from '@fcw/graph-core';

export interface DocContextSummary {
  blocks: { docId: string; title: string; degraded: boolean; chars: number }[];
  usedChars: number;
  budget: number;
  degradedCount: number;
}

export function docContextSummary(
  state: DocWorkspace,
  docId: string,
  budget: number,
): DocContextSummary {
  const blocks = assembleDocContext(state, docId, { budget }).map((b) => ({
    docId: b.docId,
    title: b.title,
    degraded: b.degraded,
    chars: b.body.length,
  }));
  return {
    blocks,
    usedChars: blocks.reduce((sum, b) => sum + b.chars, 0),
    budget,
    degradedCount: blocks.filter((b) => b.degraded).length,
  };
}
