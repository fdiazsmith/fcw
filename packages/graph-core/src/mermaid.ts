// Parse Mermaid flowchart text into a plain {nodes, edges} graph.
// Pure — no I/O, no rendering. The canvas layer turns this into shapes.

export interface MermaidNode {
  id: string;
  label: string;
}

export interface MermaidEdge {
  from: string;
  to: string;
}

export interface MermaidGraph {
  nodes: MermaidNode[];
  edges: MermaidEdge[];
}

const SEGMENT_RE = /^([A-Za-z0-9_]+)(?:\[([^\]]+)\])?$/;
const DIRECTIVE_RE = /^(graph|flowchart)\b/;
const EDGE_OP = '-->';

export function parseMermaid(text: string): MermaidGraph {
  const nodes: MermaidNode[] = [];
  const edges: MermaidEdge[] = [];
  const seen = new Map<string, MermaidNode>();

  // Register a node id, preferring an explicit label over the id fallback.
  const register = (id: string, label?: string): void => {
    const existing = seen.get(id);
    if (existing) {
      if (label) existing.label = label;
      return;
    }
    const node: MermaidNode = { id, label: label ?? id };
    seen.set(id, node);
    nodes.push(node);
  };

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || DIRECTIVE_RE.test(line)) continue;

    const ids: string[] = [];
    for (const segment of line.split(EDGE_OP)) {
      const match = SEGMENT_RE.exec(segment.trim());
      if (!match) continue;
      const [, id, label] = match;
      register(id, label?.trim());
      ids.push(id);
    }

    for (let i = 0; i < ids.length - 1; i++) {
      edges.push({ from: ids[i], to: ids[i + 1] });
    }
  }

  return { nodes, edges };
}
