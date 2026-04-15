import type { GraphDocument, EdgeType } from './types.js';

const VALID_EDGE_TYPES: EdgeType[] = [
  'reply_to',
  'branches_from',
  'references',
  'tool_call',
  'tool_result',
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateDocument(doc: GraphDocument): ValidationResult {
  const errors: string[] = [];

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
