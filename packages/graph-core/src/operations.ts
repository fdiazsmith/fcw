import type { GraphDocument, NodeType, NodeStatus, ExecutionStatus, PathStatus } from './types.js';
import { createEdge } from './edges.js';

let docCounter = 0;
let nodeCounter = 0;

function generateDocId(): string {
  return `doc_${Date.now()}_${++docCounter}`;
}

function generateNodeId(): string {
  return `n_${Date.now()}_${++nodeCounter}`;
}

export function createDocument(title: string): GraphDocument {
  return {
    id: generateDocId(),
    meta: {
      created: new Date().toISOString(),
      title,
    },
    nodes: {},
    edges: [],
  };
}

export function createNode(
  doc: GraphDocument,
  type: NodeType,
  content: string,
  parentId?: string,
  options?: { status?: NodeStatus; executionStatus?: ExecutionStatus; pathStatus?: PathStatus },
): string {
  const id = generateNodeId();
  doc.nodes[id] = {
    id,
    type,
    content,
    position: { x: 0, y: 0 },
    created: new Date().toISOString(),
    status: options?.status ?? 'completed',
    executionStatus: options?.executionStatus ?? 'completed',
    pathStatus: options?.pathStatus ?? 'active',
  };

  if (parentId) {
    createEdge(doc, parentId, id, 'reply_to');
  }

  return id;
}

export function updateNodeContent(
  doc: GraphDocument,
  nodeId: string,
  content: string,
): void {
  if (!doc.nodes[nodeId]) {
    throw new Error(`Node "${nodeId}" not found`);
  }
  doc.nodes[nodeId].content = content;
}

export function deleteNode(doc: GraphDocument, nodeId: string): void {
  if (!doc.nodes[nodeId]) {
    throw new Error(`Node "${nodeId}" not found`);
  }
  delete doc.nodes[nodeId];
  doc.edges = doc.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
}
