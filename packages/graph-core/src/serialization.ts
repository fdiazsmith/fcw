import type { GraphDocument } from './types.js';

export function toJSON(doc: GraphDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function fromJSON(json: string): GraphDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON string');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('id' in parsed) ||
    !('meta' in parsed) ||
    !('nodes' in parsed) ||
    !('edges' in parsed)
  ) {
    throw new Error(
      'Invalid GraphDocument: missing required fields (id, meta, nodes, edges)',
    );
  }

  return parsed as GraphDocument;
}
