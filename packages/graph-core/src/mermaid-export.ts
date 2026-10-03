// Export a doc canvas as Mermaid flowchart text (the inverse of parseMermaid
// for the supported subset). Pure — an export, never a live binding.

import type { DocCanvas, DocWorkspace } from './docs.js';

const SAFE_ID = /^[A-Za-z0-9_]+$/;

// Doc ids that already are Mermaid identifiers are kept; the rest are
// sanitized (invalid chars -> '_') and de-duplicated against every other id.
function mapIds(ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>(ids.filter((id) => SAFE_ID.test(id)));
  for (const id of ids) {
    if (SAFE_ID.test(id)) {
      map.set(id, id);
      continue;
    }
    const base = id.replace(/[^A-Za-z0-9_]/g, '_') || 'n';
    let safe = base;
    for (let i = 2; used.has(safe); i++) safe = `${base}_${i}`;
    used.add(safe);
    map.set(id, safe);
  }
  return map;
}

// The parser can't take [, ], newlines or the '-->' operator inside a label.
function safeLabel(title: string): string {
  return title
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/-->/g, '->')
    .replace(/\s+/g, ' ')
    .trim();
}

export function graphToMermaid(canvas: DocCanvas, ws: Pick<DocWorkspace, 'docs'>): string {
  const docIds = canvas.placements.filter((p) => p.kind === 'doc').map((p) => p.id);
  const ids = mapIds(docIds);
  const lines = ['graph TD'];
  for (const id of docIds) {
    lines.push(`  ${ids.get(id)}[${safeLabel(ws.docs[id]?.title ?? '') || ids.get(id)}]`);
  }
  for (const e of canvas.edges) {
    const from = ids.get(e.from);
    const to = ids.get(e.to);
    if (from && to) lines.push(`  ${from} --> ${to}`);
  }
  return lines.join('\n');
}
