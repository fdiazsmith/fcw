// @fcw/graph-core - Graph data model for Flow Canvas

// Types
export type {
  NodeType,
  EdgeType,
  NodeStatus,
  ExecutionStatus,
  PathStatus,
  Position,
  GraphNode,
  GraphEdge,
  DocumentMeta,
  GraphDocument,
} from './types.js';

// Operations
export {
  createDocument,
  createNode,
  updateNodeContent,
  deleteNode,
} from './operations.js';

// Edges
export {
  createEdge,
  deleteEdge,
  getEdgesFrom,
  getEdgesTo,
} from './edges.js';

// Subgraph
export { getSubgraph } from './subgraph.js';

// Serialization
export { toJSON, fromJSON } from './serialization.js';

// Validation
export { validateDocument } from './validation.js';
export type { ValidationResult } from './validation.js';

// Summary
export { generateStructuralSummary } from './summary.js';
export type { GenerateSummary } from './summary.js';

// WebSocket Messages
export type { ServerMessage, ClientMessage } from './messages.js';
