import type { GraphNode, GraphEdge, NodeStatus } from './types.js';

// Server -> Client messages
export type ServerMessage =
  | { type: 'node_created'; node: GraphNode }
  | { type: 'node_updated'; nodeId: string; content: string }
  | { type: 'node_status_changed'; nodeId: string; status: NodeStatus }
  | { type: 'edge_created'; edge: GraphEdge }
  | { type: 'node_deleted'; nodeId: string }
  | { type: 'document_loaded'; documentId: string }
  | { type: 'error'; message: string };

// Client -> Server messages
export type ClientMessage =
  | { type: 'user_prompt_submitted'; content: string; parentId?: string }
  | { type: 'branch_requested'; fromNodeId: string; content: string };
