import type { GraphDocument, NodeType } from './types.js';

export type GenerateSummary = (doc: GraphDocument) => Promise<string>;

export function generateStructuralSummary(doc: GraphDocument): string {
  const nodes = Object.values(doc.nodes);
  const nodeCount = nodes.length;
  const edgeCount = doc.edges.length;

  // Type breakdown
  const typeCounts = new Map<NodeType, number>();
  for (const node of nodes) {
    typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1);
  }

  const typeBreakdown = Array.from(typeCounts.entries())
    .map(([type, count]) => `  ${type}: ${count}`)
    .join('\n');

  // User prompt previews
  const prompts = nodes
    .filter((n) => n.type === 'user_prompt')
    .map((n) => `  - ${n.content.slice(0, 50)}`)
    .join('\n');

  const parts = [
    `Graph: ${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'}, ${edgeCount} ${edgeCount === 1 ? 'edge' : 'edges'}`,
  ];

  if (typeBreakdown) {
    parts.push(`Node types:\n${typeBreakdown}`);
  }

  if (prompts) {
    parts.push(`User prompts:\n${prompts}`);
  }

  return parts.join('\n');
}
