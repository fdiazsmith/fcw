import type { GraphDocument, EdgeType, ExecutionStatus, PathStatus } from './types.js';

const VALID_EDGE_TYPES: EdgeType[] = [
  'reply_to',
  'branches_from',
  'references',
  'tool_call',
  'tool_result',
];

const VALID_EXECUTION_STATUSES: ExecutionStatus[] = [
  'pending',
  'in_progress',
  'completed',
];

const VALID_PATH_STATUSES: PathStatus[] = ['active', 'archived'];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDocument(doc: GraphDocument): ValidationResult {
  const errors: string[] = [];

  for (const node of Object.values(doc.nodes)) {
    if (
      node.executionStatus !== undefined &&
      !VALID_EXECUTION_STATUSES.includes(node.executionStatus)
    ) {
      errors.push(
        `Node "${node.id}" has invalid executionStatus "${node.executionStatus}"`,
      );
    }
    if (
      node.pathStatus !== undefined &&
      !VALID_PATH_STATUSES.includes(node.pathStatus)
    ) {
      errors.push(
        `Node "${node.id}" has invalid pathStatus "${node.pathStatus}"`,
      );
    }
  }

  for (const edge of doc.edges) {
    if (!doc.nodes[edge.from]) {
      errors.push(`Edge references non-existent from node "${edge.from}"`);
    }
    if (!doc.nodes[edge.to]) {
      errors.push(`Edge references non-existent to node "${edge.to}"`);
    }
    if (!VALID_EDGE_TYPES.includes(edge.type)) {
      errors.push(`Edge has invalid type "${edge.type}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
