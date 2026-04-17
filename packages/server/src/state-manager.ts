import { EventEmitter } from 'node:events';
import {
  createDocument,
  createNode as coreCreateNode,
  updateNodeContent as coreUpdateNodeContent,
  deleteNode as coreDeleteNode,
  createEdge as coreCreateEdge,
} from '@fcw/graph-core';
import type { GraphDocument, NodeType, EdgeType, NodeStatus, ExecutionStatus, PathStatus } from '@fcw/graph-core';

type SaveHandler = (doc: GraphDocument) => Promise<void>;

export class StateManager extends EventEmitter {
  document: GraphDocument;
  private saveHandler: SaveHandler | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly DEBOUNCE_MS = 500;

  constructor(title = 'Untitled') {
    super();
    this.document = createDocument(title);
  }

  createNode(type: NodeType, content: string, parentId?: string, options?: { status?: NodeStatus; executionStatus?: ExecutionStatus; pathStatus?: PathStatus }): string {
    const prevEdgeCount = this.document.edges.length;
    const id = coreCreateNode(this.document, type, content, parentId, options);
    const node = this.document.nodes[id];
    this.emit('node_created', { type: 'node_created', node });

    // coreCreateNode auto-adds reply_to edges when parentId is provided.
    // Emit edge_created for those implicit edges so WS clients can render arrows immediately.
    if (this.document.edges.length > prevEdgeCount) {
      for (let i = prevEdgeCount; i < this.document.edges.length; i++) {
        this.emit('edge_created', { type: 'edge_created', edge: this.document.edges[i] });
      }
    }

    this.scheduleSave();
    return id;
  }

  updateNodeContent(nodeId: string, content: string): void {
    coreUpdateNodeContent(this.document, nodeId, content);
    this.emit('node_updated', { type: 'node_updated', nodeId, content });
    this.scheduleSave();
  }

  deleteNode(nodeId: string): void {
    coreDeleteNode(this.document, nodeId);
    this.emit('node_deleted', { type: 'node_deleted', nodeId });
    this.scheduleSave();
  }

  createEdge(from: string, to: string, type: EdgeType): void {
    coreCreateEdge(this.document, from, to, type);
    const edge = this.document.edges.find((e) => e.from === from && e.to === to && e.type === type);
    this.emit('edge_created', { type: 'edge_created', edge });
    this.scheduleSave();
  }

  setNodeStatus(nodeId: string, status: NodeStatus): void {
    if (!this.document.nodes[nodeId]) {
      throw new Error(`Node "${nodeId}" not found`);
    }
    this.document.nodes[nodeId].status = status;
    this.emit('node_status_changed', { type: 'node_status_changed', nodeId, status });
    this.scheduleSave();
  }

  setExecutionStatus(nodeId: string, executionStatus: ExecutionStatus): void {
    if (!this.document.nodes[nodeId]) {
      throw new Error(`Node "${nodeId}" not found`);
    }
    this.document.nodes[nodeId].executionStatus = executionStatus;
    this.emit('execution_status_changed', { type: 'execution_status_changed', nodeId, executionStatus });
    this.checkAutoCollapse(nodeId);
    this.scheduleSave();
  }

  setPathStatus(nodeId: string, pathStatus: PathStatus): void {
    if (!this.document.nodes[nodeId]) {
      throw new Error(`Node "${nodeId}" not found`);
    }
    this.document.nodes[nodeId].pathStatus = pathStatus;
    this.emit('path_status_changed', { type: 'path_status_changed', nodeId, pathStatus });
    this.checkAutoCollapse(nodeId);
    this.scheduleSave();
  }

  private checkAutoCollapse(nodeId: string): void {
    const node = this.document.nodes[nodeId];
    if (node && node.executionStatus === 'completed' && node.pathStatus === 'archived') {
      this.emit('node_auto_collapsed', { type: 'node_auto_collapsed', nodeId });
    }
  }

  computeActivePath(tipNodeId: string): Set<string> {
    const visited = new Set<string>();
    let current = tipNodeId;
    while (current) {
      visited.add(current);
      const parentEdge = this.document.edges.find(
        (e) => e.to === current && (e.type === 'reply_to' || e.type === 'branches_from'),
      );
      if (!parentEdge) break;
      current = parentEdge.from;
    }
    return visited;
  }

  getToolNodeChildren(nodeId: string): string[] {
    const result: string[] = [];
    const toolCallEdges = this.document.edges.filter(
      (e) => e.from === nodeId && e.type === 'tool_call',
    );
    for (const tcEdge of toolCallEdges) {
      result.push(tcEdge.to);
      const toolResultEdges = this.document.edges.filter(
        (e) => e.from === tcEdge.to && e.type === 'tool_result',
      );
      for (const trEdge of toolResultEdges) {
        result.push(trEdge.to);
      }
    }
    return result;
  }

  applyBranchPathUpdate(branchTipId: string): void {
    const activePath = this.computeActivePath(branchTipId);

    // Tool children of active-path nodes are also protected — compute once upfront
    const protectedToolChildren = new Set<string>();
    for (const nodeId of activePath) {
      for (const toolChildId of this.getToolNodeChildren(nodeId)) {
        protectedToolChildren.add(toolChildId);
      }
    }

    for (const [nodeId, node] of Object.entries(this.document.nodes)) {
      if (!activePath.has(nodeId) && !protectedToolChildren.has(nodeId) && node.pathStatus === 'active') {
        this.setPathStatus(nodeId, 'archived');
        for (const toolChildId of this.getToolNodeChildren(nodeId)) {
          if (this.document.nodes[toolChildId]?.pathStatus === 'active') {
            this.setPathStatus(toolChildId, 'archived');
          }
        }
      }
    }

    for (const nodeId of activePath) {
      const node = this.document.nodes[nodeId];
      if (node && node.pathStatus === 'archived') {
        this.setPathStatus(nodeId, 'active');
        for (const toolChildId of this.getToolNodeChildren(nodeId)) {
          if (this.document.nodes[toolChildId]?.pathStatus === 'archived') {
            this.setPathStatus(toolChildId, 'active');
          }
        }
      }
    }
  }

  setSaveHandler(handler: SaveHandler): void {
    this.saveHandler = handler;
  }

  private scheduleSave(): void {
    if (!this.saveHandler) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveHandler!(this.document);
      this.saveTimer = null;
    }, this.DEBOUNCE_MS);
  }

  destroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.removeAllListeners();
  }
}
