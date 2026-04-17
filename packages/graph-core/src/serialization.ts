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

  // Migrate old files: 'complete' -> 'completed'
  const doc = parsed as GraphDocument;
  if (doc.nodes) {
    for (const node of Object.values(doc.nodes)) {
      if ((node as any).status === 'complete') {
        (node as any).status = 'completed';
      }
      // Backfill Phase 1 fields for old documents that lack them
      if ((node as any).executionStatus === undefined) {
        (node as any).executionStatus = 'completed';
      }
      if ((node as any).pathStatus === undefined) {
        (node as any).pathStatus = 'active';
      }
    }
  }

  return doc;
}
