import { EventEmitter } from 'node:events';
import {
  createDocument,
  createNode as coreCreateNode,
  updateNodeContent as coreUpdateNodeContent,
  deleteNode as coreDeleteNode,
  createEdge as coreCreateEdge,
} from '@fcw/graph-core';
import type { GraphDocument, NodeType, EdgeType, NodeStatus } from '@fcw/graph-core';

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

  createNode(type: NodeType, content: string, parentId?: string, options?: { status?: NodeStatus }): string {
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
