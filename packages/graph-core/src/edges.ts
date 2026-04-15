import type { GraphDocument, EdgeType, GraphEdge } from './types.js';

export function createEdge(
  doc: GraphDocument,
  from: string,
  to: string,
  type: EdgeType,
): void {
  if (!doc.nodes[from]) {
    throw new Error(`Node "${from}" not found`);
  }
  if (!doc.nodes[to]) {
    throw new Error(`Node "${to}" not found`);
  }
  doc.edges.push({ from, to, type });
}

export function deleteEdge(
  doc: GraphDocument,
  fromId: string,
  toId: string,
  type?: EdgeType,
): void {
  doc.edges = doc.edges.filter(
    (e) =>
      !(e.from === fromId && e.to === toId && (type === undefined || e.type === type)),
  );
}

export function getEdgesFrom(doc: GraphDocument, nodeId: string): GraphEdge[] {
  return doc.edges.filter((e) => e.from === nodeId);
}

export function getEdgesTo(doc: GraphDocument, nodeId: string): GraphEdge[] {
  return doc.edges.filter((e) => e.to === nodeId);
}
