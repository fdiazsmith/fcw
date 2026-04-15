import { getSubgraph } from '@fcw/graph-core';
import type { NodeType, EdgeType, NodeStatus, GraphNode } from '@fcw/graph-core';
import type { StateManager } from './state-manager.js';

// --- Param types ---

export interface CreateNodeParams {
  type: NodeType;
  content: string;
  parent_id?: string;
  metadata?: { status?: NodeStatus };
}

export interface UpdateNodeParams {
  node_id: string;
  content: string;
}

export interface ConnectParams {
  from_id: string;
  to_id: string;
  edge_type: EdgeType;
}

export interface BranchParams {
  from_id: string;
}

export interface SetStatusParams {
  node_id: string;
  status: NodeStatus;
}

export interface GetContextParams {
  node_id?: string;
  depth?: number;
}

// --- Result types ---

export interface CreateNodeResult {
  node_id: string;
  position: { x: number; y: number };
}

export interface SuccessResult {
  success: true;
}

export interface BranchResult {
  branch_id: string;
}

export interface ContextNodeSummary {
  type: NodeType;
  content_preview: string;
  status: NodeStatus;
}

export interface GetContextResult {
  nodes: Record<string, ContextNodeSummary>;
  edges: Array<{ from: string; to: string; type: EdgeType }>;
}

// --- Constants ---

const PREVIEW_LENGTH = 200;

const VALID_NODE_TYPES: Set<string> = new Set([
  'user_prompt', 'response', 'code', 'tool_call', 'tool_result', 'thought', 'summary', 'annotation',
]);

// --- Handlers ---

export function handleCreateNode(params: CreateNodeParams, sm: StateManager): CreateNodeResult {
  if (!VALID_NODE_TYPES.has(params.type)) {
    throw new Error(`Invalid node type: "${params.type}"`);
  }
  const options = params.metadata?.status ? { status: params.metadata.status } : undefined;
  const nodeId = sm.createNode(params.type, params.content, params.parent_id, options);
  const node = sm.document.nodes[nodeId];
  return { node_id: nodeId, position: node.position };
}

export function handleUpdateNode(params: UpdateNodeParams, sm: StateManager): SuccessResult {
  sm.updateNodeContent(params.node_id, params.content);
  return { success: true };
}

export function handleConnect(params: ConnectParams, sm: StateManager): SuccessResult {
  sm.createEdge(params.from_id, params.to_id, params.edge_type);
  return { success: true };
}

export function handleBranch(params: BranchParams, sm: StateManager): BranchResult {
  if (!sm.document.nodes[params.from_id]) {
    throw new Error(`Node "${params.from_id}" not found`);
  }
  const branchId = sm.createNode('annotation', '[branch]');
  sm.createEdge(params.from_id, branchId, 'branches_from');
  return { branch_id: branchId };
}

export function handleSetStatus(params: SetStatusParams, sm: StateManager): SuccessResult {
  sm.setNodeStatus(params.node_id, params.status);
  return { success: true };
}

export function handleGetContext(params: GetContextParams, sm: StateManager): GetContextResult {
  const depth = params.depth ?? 2;

  let rawNodes: Record<string, GraphNode>;
  let rawEdges: Array<{ from: string; to: string; type: EdgeType }>;

  if (params.node_id) {
    const sub = getSubgraph(sm.document, params.node_id, depth);
    rawNodes = sub.nodes;
    rawEdges = sub.edges;
  } else {
    rawNodes = sm.document.nodes;
    rawEdges = sm.document.edges;
  }

  const nodes: Record<string, ContextNodeSummary> = {};
  for (const [id, node] of Object.entries(rawNodes)) {
    nodes[id] = {
      type: node.type,
      content_preview: node.content.length > PREVIEW_LENGTH
        ? node.content.slice(0, PREVIEW_LENGTH) + '...'
        : node.content,
      status: node.status,
    };
  }

  return { nodes, edges: rawEdges };
}
