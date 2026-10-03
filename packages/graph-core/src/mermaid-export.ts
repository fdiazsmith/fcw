// Export a doc canvas as Mermaid flowchart text (the inverse of parseMermaid
// for the supported subset). Pure — an export, never a live binding.

import type { DocCanvas, DocWorkspace } from './docs.js';

export function graphToMermaid(canvas: DocCanvas, ws: Pick<DocWorkspace, 'docs'>): string {
  const docIds = canvas.placements.filter((p) => p.kind === 'doc').map((p) => p.id);
  const lines = ['graph TD'];
  for (const id of docIds) lines.push(`  ${id}[${ws.docs[id]?.title || id}]`);
  for (const e of canvas.edges) {
    if (docIds.includes(e.from) && docIds.includes(e.to)) lines.push(`  ${e.from} --> ${e.to}`);
  }
  return lines.join('\n');
}
