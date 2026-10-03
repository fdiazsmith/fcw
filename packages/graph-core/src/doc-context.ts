// Context assembly for doc-builder chats (see MERMAID-DOCS.md).
// A chat attached to a doc inherits the doc's references as context:
// referenced docs first, the target doc last. Pure, no I/O.

import type { DocWorkspace } from './docs.js';

export interface DocContextBlock {
  docId: string;
  title: string;
  body: string;
  degraded: boolean; // true when reduced to title-only by the budget
}

function block(ws: DocWorkspace, docId: string): DocContextBlock {
  const doc = ws.docs[docId];
  return { docId, title: doc.title, body: doc.body, degraded: false };
}

export interface DocContextOptions {
  // Max total characters of block bodies. When exceeded, the most distant
  // references degrade to title-only (body: ''), nearest and target last to
  // suffer. A degraded doc still appears — the chat knows it exists. Later:
  // degrade to an llm-summary instead of title-only, and count tokens.
  budget?: number;
}

export function assembleDocContext(
  ws: DocWorkspace,
  docId: string,
  options: DocContextOptions = {},
): DocContextBlock[] {
  // BFS from the target through canvas placements. Placements may form
  // cycles (A references B, B references A) — the visited set makes
  // traversal terminate; first visit wins, so each doc appears once.
  const depth = new Map<string, number>();
  depth.set(docId, 0);
  const queue = [docId];
  const order: string[] = []; // discovery order, excluding the target

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const p of ws.docs[current].canvas.placements) {
      if (p.kind !== 'doc') continue; // chat placements contribute nothing yet
      if (depth.has(p.id)) continue;
      depth.set(p.id, depth.get(current)! + 1);
      order.push(p.id);
      queue.push(p.id);
    }
  }

  // Deepest (most distant) references first, target last — mirrors v2's
  // ancestors-then-own-messages ordering. Ties keep discovery order.
  const refs = order
    .map((id, i) => ({ id, i }))
    .sort((x, y) => depth.get(y.id)! - depth.get(x.id)! || x.i - y.i)
    .map(({ id }) => block(ws, id));

  const blocks = [...refs, block(ws, docId)];

  if (options.budget !== undefined) {
    // Blocks are already ordered deepest-first, target last — degrade from
    // the front until we fit.
    let total = blocks.reduce((sum, b) => sum + b.body.length, 0);
    for (const b of blocks) {
      if (total <= options.budget) break;
      if (b.docId === docId) break; // never degrade the target
      total -= b.body.length;
      b.body = '';
      b.degraded = true;
    }
  }

  return blocks;
}
