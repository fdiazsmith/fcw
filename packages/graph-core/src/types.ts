export type NodeType =
  | 'user_prompt'
  | 'response'
  | 'code'
  | 'tool_call'
  | 'tool_result'
  | 'thought'
  | 'summary'
  | 'annotation';

export type EdgeType =
  | 'reply_to'
  | 'branches_from'
  | 'references'
  | 'tool_call'
  | 'tool_result';

export type NodeStatus = 'streaming' | 'complete' | 'error';

export interface Position {
  x: number;
  y: number;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  content: string;
  position: Position;
  created: string;
  status: NodeStatus;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
}

export interface DocumentMeta {
  created: string;
  title: string;
  summary?: string;
}

export interface GraphDocument {
  id: string;
  meta: DocumentMeta;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}
