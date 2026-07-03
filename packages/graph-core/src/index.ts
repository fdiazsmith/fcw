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

// ── v2 chat-graph: node = chat window, edges = context inheritance ──
export type {
  ChatRole,
  ChatMessage,
  ChatNode,
  ContextEdge,
  ChatGraph,
  ChatSettings,
  Attachment,
} from './chat-graph.js';
export {
  createChatGraph,
  addChat,
  appendMessage,
  addContextEdge,
  setEdgeEnabled,
  removeContextEdge,
  setChatPosition,
  removeLastMessage,
  updateChatSettings,
  markSessionStale,
} from './chat-graph.js';
export { assembleContext } from './context-assembly.js';
export type { AssembleOptions } from './context-assembly.js';
export { chatGraphToJSON, chatGraphFromJSON } from './chat-graph-serialization.js';
export type {
  ChatServerMessage,
  ChatClientMessage,
  CapabilityModel,
  CapabilityCommand,
} from './chat-messages.js';
