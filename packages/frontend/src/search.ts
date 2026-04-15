import type { GraphDocument } from '@fcw/graph-core';

export interface SearchResult {
  nodeId: string;
  content: string;
}

export function searchNodes(doc: GraphDocument, query: string): SearchResult[] {
  if (!query) return [];
  const lower = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.content.toLowerCase().includes(lower)) {
      results.push({ nodeId: id, content: node.content });
    }
  }
  return results;
}
