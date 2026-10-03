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

// ── structure-first: diagrams generate documents (see MERMAID-DOCS.md) ──

// Wikilinks
export { parseWikilinks } from './wikilinks.js';

// Mermaid → graph
export { parseMermaid } from './mermaid.js';
export type { MermaidNode, MermaidEdge, MermaidGraph } from './mermaid.js';

// Mermaid → docs: every box is a doc from birth
export { mermaidToDocNodes } from './mermaid-docs.js';
export type { MermaidDocNodes, MermaidToDocNodesOptions } from './mermaid-docs.js';

// Docs: box = doc, canvases hold placements not documents
export { createWorkspace, createDoc, placeDoc, updateDocBody } from './docs.js';
export type { Doc, DocCanvas, DocPlacement, DocEdge, DocWorkspace } from './docs.js';

// Doc-builder chat context: recursive over references, cycle-safe, budgeted
export { assembleDocContext } from './doc-context.js';
export type { DocContextBlock, DocContextOptions } from './doc-context.js';

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
  TokenUsage,
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
  addTurnUsage,
} from './chat-graph.js';
export type { Compaction, CompactionStatus, CompactionMember } from './compaction.js';
export {
  addCompaction,
  compactionDigest,
  isCompactionStale,
  setCompactionDocument,
  completeCompactionGeneration,
  setCompactionStatus,
  setCompactionPosition,
} from './compaction.js';
export { compactChats, docIsStale, migrateCompactions } from './doc-compaction.js';
export { assembleContext } from './context-assembly.js';
export type { AssembleOptions } from './context-assembly.js';
export { chatGraphToJSON, chatGraphFromJSON } from './chat-graph-serialization.js';
export type {
  ChatServerMessage,
  ChatClientMessage,
  CapabilityModel,
  CapabilityCommand,
} from './chat-messages.js';

// WI-1 probe: lets server tests assert they resolve graph-core SOURCE, not a
// possibly-stale dist. If a test imports this and fails, the vitest alias is
// gone AND dist is stale — re-add the alias (see packages/server/vitest.config.ts).
export const __graphCoreSrcProbe = true;
