// Mermaid generation: constrain the model to the supported subset, validate
// with graph-core's parseMermaid, retry once with the parse error.
import { parseMermaid } from '@fcw/graph-core';
import type { MermaidGraph } from '@fcw/graph-core';

export type DiagramResult =
  | { ok: true; mermaid: string; graph: MermaidGraph }
  | { ok: false; raw: string; error: string };

// Mirrors the segment grammar in graph-core mermaid.ts, which silently skips
// segments it can't read — so we check every line ourselves.
const SEGMENT_RE = /^[A-Za-z0-9_]+(?:\[[^\]]+\])?$/;
const DIRECTIVE_RE = /^(graph|flowchart)\b/;
const FENCE_RE = /```(?:mermaid)?[ \t]*\n([\s\S]*?)```/;

function extractMermaid(text: string): string {
  const fenced = FENCE_RE.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/** Extracts Mermaid from a model reply and checks it fits the supported subset. */
export function validateMermaid(text: string): DiagramResult {
  const mermaid = extractMermaid(text);
  const fail = (error: string): DiagramResult => ({ ok: false, raw: text, error });

  const lines = mermaid.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || DIRECTIVE_RE.test(line)) continue;
    // "end" is a reserved word in Mermaid (closes subgraphs), unusable as an id.
    const bad = line
      .split('-->')
      .find((seg) => !SEGMENT_RE.test(seg.trim()) || /^end\b/i.test(seg.trim()));
    if (bad !== undefined) {
      return fail(
        `Line ${i + 1} "${line}" is not supported: only "A[Label] --> B[Label]" edges, ` +
          `plain node ids, and the graph/flowchart directive are allowed.`,
      );
    }
  }

  let graph: MermaidGraph;
  try {
    graph = parseMermaid(mermaid);
  } catch (err) {
    return fail(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (graph.nodes.length === 0) return fail('The diagram contains no nodes.');
  return { ok: true, mermaid, graph };
}
