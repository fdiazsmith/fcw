// Join the Mermaid parser to the doc model (see MERMAID-DOCS.md § Build Order, step 2).
//
// Every box in a diagram becomes a doc from birth — title from the label, empty
// body, empty child canvas. No promotion step, one entity type. Positions are
// deliberately absent: layout is a separate concern (step 3), so this stays pure
// and free of any layout dependency.

import type { MermaidGraph } from './mermaid.js';
import type { Doc, DocEdge } from './docs.js';

export interface MermaidDocNodes {
  docs: Doc[];
  edges: DocEdge[];
}

export interface MermaidToDocNodesOptions {
  // Mermaid node ids are local to their diagram ('A', 'B'), so two diagrams
  // would collide in the workspace-wide doc table. Callers namespace them.
  idPrefix?: string;
}

export function mermaidToDocNodes(
  graph: MermaidGraph,
  options: MermaidToDocNodesOptions = {},
): MermaidDocNodes {
  const prefix = options.idPrefix ?? '';
  const docId = (mermaidId: string): string => `${prefix}${mermaidId}`;

  // First-seen order comes from the parser and is preserved here, so the same
  // diagram text always lays out the same way.
  const docs: Doc[] = graph.nodes.map((node) => ({
    id: docId(node.id),
    title: node.label,
    body: '',
    canvas: { placements: [], edges: [] },
  }));

  const edges: DocEdge[] = graph.edges.map((edge) => ({
    from: docId(edge.from),
    to: docId(edge.to),
  }));

  return { docs, edges };
}
