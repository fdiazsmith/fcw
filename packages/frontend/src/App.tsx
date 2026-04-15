import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Tldraw,
  Editor,
} from 'tldraw';
import 'tldraw/tldraw.css';
import './tldraw-overrides.css';
import { GraphNodeShapeUtil, GraphNodeShape } from './shapes/GraphNodeShape';
import { createWsClient, WsClient } from './ws-client';
import { computeLayout } from './layout';
import { createDemoGraph } from './demo-data';
import { getEdgeStyle } from './edge-styles';
import { getVisibleNodes, getVisibleEdges, CollapsedState, collapseSubtree, expandSubtree } from './collapse';
import { InputBar } from './components/InputBar';
import { SearchBar } from './components/SearchBar';
import { BranchInput } from './components/BranchInput';
import { NodeActions } from './components/NodeActions';
import { DocumentPicker } from './components/DocumentPicker';
import { LogSidebar } from './components/LogSidebar';
import { exportAsMarkdown, exportAsJson } from './export';
import type { GraphDocument, ServerMessage, GraphNode, EdgeType } from '@fcw/graph-core';

const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8080';
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8009';

const customShapes = [GraphNodeShapeUtil];

function makeShapeId(nodeId: string) {
  return `shape:${nodeId}` as `shape:${string}`;
}

function makeArrowId(from: string, to: string) {
  return `shape:edge-${from}-${to}` as `shape:${string}`;
}

function makeBindingId(arrowId: string, terminal: string) {
  return `binding:${arrowId}-${terminal}` as `binding:${string}`;
}

function edgeDash(type: EdgeType): 'draw' | 'solid' | 'dashed' | 'dotted' {
  const style = getEdgeStyle(type);
  if (style.dash === 'dashed') return 'dashed';
  if (style.dash === 'dotted') return 'dotted';
  return 'solid';
}

const EDGE_COLORS: Partial<Record<EdgeType, string>> = {
  reply_to: 'grey',
  branches_from: 'blue',
  references: 'violet',
  tool_call: 'orange',
  tool_result: 'yellow',
};

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const editorRef = useRef<Editor | null>(null);
  const docRef = useRef<GraphDocument>({
    id: '',
    meta: { created: '', title: '' },
    nodes: {},
    edges: [],
  });
  const autoFollowRef = useRef(true);
  const lastUpdatedRef = useRef<string | null>(null);
  const wsClientRef = useRef<WsClient | null>(null);
  const collapsedRef = useRef<CollapsedState>(new Set());

  const [wsClient, setWsClient] = useState<WsClient | null>(null);
  const [selectedNode, setSelectedNode] = useState<{ id: string; content: string; screenPos: { x: number; y: number } } | null>(null);
  const [branchTarget, setBranchTarget] = useState<{ nodeId: string; screenPos: { x: number; y: number } } | null>(null);
  const [logVisible, setLogVisible] = useState(false);
  const [activeLogNode, setActiveLogNode] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  const syncToCanvas = useCallback((doc: GraphDocument) => {
    const editor = editorRef.current;
    if (!editor) {
      console.log('[sync] no editor ref');
      return;
    }

    const collapsed = collapsedRef.current;
    const visibleNodes = getVisibleNodes(doc, collapsed);
    const visibleEdges = getVisibleEdges(doc, collapsed);
    console.log('[sync] nodes:', Object.keys(visibleNodes).length, 'edges:', visibleEdges.length);

    // Build a filtered doc for layout
    const filteredDoc: GraphDocument = {
      ...doc,
      nodes: visibleNodes,
      edges: visibleEdges,
    };

    const positions = computeLayout(filteredDoc);

    editor.batch(() => {
      for (const [id, node] of Object.entries(visibleNodes)) {
        const pos = positions.get(id) ?? node.position;
        const shapeId = makeShapeId(id);
        const existing = editor.getShape(shapeId);

        const isCollapsed = collapsed.has(id);
        const props = {
          nodeType: node.type,
          content: isCollapsed ? `[${Object.keys(doc.nodes).length} nodes collapsed]` : node.content,
          status: node.status,
          label: isCollapsed ? 'collapsed' : '',
        };

        if (existing) {
          editor.updateShape({
            id: shapeId,
            type: 'graph-node',
            x: pos.x,
            y: pos.y,
            props,
          });
        } else {
          editor.createShape<GraphNodeShape>({
            id: shapeId,
            type: 'graph-node',
            x: pos.x,
            y: pos.y,
            props: { ...props, w: 280, h: 200 },
          });
        }
      }

      // Create arrows for visible edges
      const existingArrowIds = new Set<string>();
      for (const edge of visibleEdges) {
        const arrowId = makeArrowId(edge.from, edge.to);
        existingArrowIds.add(arrowId);
        const fromShapeId = makeShapeId(edge.from);
        const toShapeId = makeShapeId(edge.to);

        if (!editor.getShape(fromShapeId) || !editor.getShape(toShapeId)) continue;

        const existingArrow = editor.getShape(arrowId);
        if (!existingArrow) {
          editor.createShape({
            id: arrowId as any,
            type: 'arrow',
            props: {
              dash: edgeDash(edge.type),
              color: EDGE_COLORS[edge.type] ?? 'grey',
              size: 's',
            },
          });

          editor.createBinding({
            id: makeBindingId(arrowId, 'start') as any,
            type: 'arrow',
            fromId: arrowId as any,
            toId: fromShapeId as any,
            props: {
              terminal: 'start',
              isExact: false,
              isPrecise: false,
              normalizedAnchor: { x: 0.5, y: 0.5 },
            },
          });

          editor.createBinding({
            id: makeBindingId(arrowId, 'end') as any,
            type: 'arrow',
            fromId: arrowId as any,
            toId: toShapeId as any,
            props: {
              terminal: 'end',
              isExact: false,
              isPrecise: false,
              normalizedAnchor: { x: 0.5, y: 0.5 },
            },
          });
        }
      }

      // Remove shapes for hidden/deleted nodes and orphaned arrows
      const allShapes = editor.getCurrentPageShapes();
      for (const shape of allShapes) {
        if (shape.type === 'graph-node') {
          const nodeId = shape.id.replace('shape:', '');
          if (!visibleNodes[nodeId]) {
            editor.deleteShape(shape.id);
          }
        }
        if (shape.type === 'arrow' && (shape.id as string).startsWith('shape:edge-')) {
          if (!existingArrowIds.has(shape.id)) {
            editor.deleteShape(shape.id);
          }
        }
      }
    });

    // Auto-follow most recently updated node
    if (autoFollowRef.current && lastUpdatedRef.current) {
      const shapeId = makeShapeId(lastUpdatedRef.current);
      const shape = editor.getShape(shapeId);
      if (shape) {
        editor.centerOnPoint({ x: shape.x + 140, y: shape.y + 100 });
      }
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+L toggle log sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        setLogVisible((v) => !v);
      }
      // Cmd+S manual save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const doc = docRef.current;
        if (doc.id) {
          fetch(`${API_URL}/documents/${doc.id}`, { method: 'PUT' }).catch(() => {});
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const client = createWsClient(WS_URL);
    wsClientRef.current = client;
    setWsClient(client);

    client.onMessage((msg: ServerMessage) => {
      const doc = docRef.current;

      switch (msg.type) {
        case 'node_created':
          doc.nodes[msg.node.id] = msg.node;
          lastUpdatedRef.current = msg.node.id;
          // Auto-title from first user_prompt
          if (msg.node.type === 'user_prompt' && doc.meta.title === 'Untitled') {
            doc.meta.title = msg.node.content.slice(0, 60);
          }
          break;
        case 'node_updated':
          if (doc.nodes[msg.nodeId]) {
            doc.nodes[msg.nodeId].content = msg.content;
            lastUpdatedRef.current = msg.nodeId;
          }
          break;
        case 'node_status_changed':
          if (doc.nodes[msg.nodeId]) {
            doc.nodes[msg.nodeId].status = msg.status;
          }
          break;
        case 'edge_created':
          doc.edges.push(msg.edge);
          break;
        case 'node_deleted':
          delete doc.nodes[msg.nodeId];
          break;
        case 'error': {
          const editor = editorRef.current;
          if (editor) {
            editor.addToast({
              title: 'Error',
              description: msg.message,
              severity: 'error',
            });
          }
          break;
        }
        default:
          break;
      }

      syncToCanvas(doc);
      forceUpdate((n) => n + 1);
    });

    return () => client.close();
  }, [syncToCanvas]);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Detect manual pan
    editor.on('camera', () => {
      if (editor.inputs.isDragging) {
        autoFollowRef.current = false;
      }
    });

    // Handle shape clicks for node actions
    editor.on('event', (info) => {
      if (info.type === 'pointer' && info.name === 'pointer_up') {
        const selectedIds = editor.getSelectedShapeIds();
        if (selectedIds.length === 1) {
          const shapeId = selectedIds[0];
          const shape = editor.getShape(shapeId);
          if (shape && shape.type === 'graph-node') {
            editor.setEditingShape(shape.id);
            const nodeId = (shapeId as string).replace('shape:', '');
            const node = docRef.current.nodes[nodeId];
            if (node) {
              const screenPt = editor.pageToScreen({ x: shape.x + 280, y: shape.y });
              setSelectedNode({
                id: nodeId,
                content: node.content,
                screenPos: { x: screenPt.x + 8, y: screenPt.y },
              });
              setBranchTarget(null);
              setActiveLogNode(nodeId);
            }
          } else {
            editor.setEditingShape(null);
            setSelectedNode(null);
            setBranchTarget(null);
          }
        } else {
          editor.setEditingShape(null);
          setSelectedNode(null);
          setBranchTarget(null);
        }
      }
    });

    // Double-click empty canvas -> annotation node
    editor.on('event', (info) => {
      if (info.type === 'pointer' && info.name === 'pointer_down' && (info as any).phase === 'settle') {
        // handled via native DOM double-click
      }
    });

    // Load demo graph if VITE_DEMO=true or no server URL
    const isDemo = import.meta.env.VITE_DEMO === 'true' || !import.meta.env.VITE_WS_URL;
    if (isDemo) {
      const demo = createDemoGraph();
      docRef.current = demo;
      setTimeout(() => syncToCanvas(demo), 100);
    }
  }, [syncToCanvas]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const editor = editorRef.current;
    if (!editor) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-testid="input-bar"]') || target.closest('[data-testid="search-bar"]') || target.closest('[data-testid="node-actions"]') || target.closest('[data-testid="branch-input"]') || target.closest('[data-testid="doc-picker"]') || target.closest('[data-testid="log-sidebar"]')) return;

    const shapes = editor.getSelectedShapeIds();
    if (shapes.length > 0) return;

    const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
    const doc = docRef.current;
    const id = `annotation-${Date.now()}`;
    const node: GraphNode = {
      id,
      type: 'annotation',
      content: 'New annotation',
      position: point,
      created: new Date().toISOString(),
      status: 'complete',
    };
    doc.nodes[id] = node;
    syncToCanvas(doc);
    forceUpdate((n) => n + 1);
  }, [syncToCanvas]);

  const handleBranch = useCallback(() => {
    if (!selectedNode) return;
    const editor = editorRef.current;
    if (!editor) return;
    const shape = editor.getShape(makeShapeId(selectedNode.id));
    if (!shape) return;
    const screenPt = editor.pageToScreen({ x: shape.x, y: shape.y + 200 });
    setBranchTarget({
      nodeId: selectedNode.id,
      screenPos: { x: screenPt.x, y: screenPt.y + 8 },
    });
    setSelectedNode(null);
  }, [selectedNode]);

  const handleCollapse = useCallback(() => {
    if (!selectedNode) return;
    const doc = docRef.current;
    const collapsed = collapsedRef.current;
    if (collapsed.has(selectedNode.id)) {
      expandSubtree(selectedNode.id, collapsed);
    } else {
      collapseSubtree(selectedNode.id, doc, collapsed);
    }
    setSelectedNode(null);
    syncToCanvas(doc);
    forceUpdate((n) => n + 1);
  }, [selectedNode, syncToCanvas]);

  const handleLoadDoc = useCallback((doc: GraphDocument) => {
    docRef.current = doc;
    collapsedRef.current = new Set();
    autoFollowRef.current = false;
    const editor = editorRef.current;
    if (editor) {
      // Clear canvas then sync
      const allShapes = editor.getCurrentPageShapes();
      for (const shape of allShapes) {
        editor.deleteShape(shape.id);
      }
    }
    syncToCanvas(doc);
    forceUpdate((n) => n + 1);
  }, [syncToCanvas]);

  const handleNewDoc = useCallback(() => {
    fetch(`${API_URL}/documents`, { method: 'POST', body: JSON.stringify({ title: 'Untitled' }) })
      .then((r) => r.json())
      .then((doc: GraphDocument) => handleLoadDoc(doc))
      .catch(() => {
        // Offline fallback
        handleLoadDoc({
          id: `doc_${Date.now()}`,
          meta: { created: new Date().toISOString(), title: 'Untitled' },
          nodes: {},
          edges: [],
        });
      });
  }, [handleLoadDoc]);

  const handleExportMd = useCallback(() => {
    const doc = docRef.current;
    const md = exportAsMarkdown(doc);
    const filename = `${doc.meta.title || 'conversation'}.md`;
    downloadFile(md, filename, 'text/markdown');
  }, []);

  const handleExportJson = useCallback(() => {
    const doc = docRef.current;
    const json = exportAsJson(doc);
    const filename = `${doc.meta.title || 'conversation'}.fcw.json`;
    downloadFile(json, filename, 'application/json');
  }, []);

  const handleLogEntryClick = useCallback((nodeId: string) => {
    setActiveLogNode(nodeId);
    const editor = editorRef.current;
    if (!editor) return;
    const shapeId = makeShapeId(nodeId);
    const shape = editor.getShape(shapeId);
    if (shape) {
      editor.centerOnPoint({ x: shape.x + 140, y: shape.y + 100 });
      editor.select(shapeId);
    }
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0 }} onDoubleClick={handleDoubleClick}>
      <Tldraw
        shapeUtils={customShapes}
        onMount={handleMount}
      />
      <InputBar wsClient={wsClient} />
      <SearchBar editor={editorRef.current} doc={docRef.current} />
      <DocumentPicker
        onLoad={handleLoadDoc}
        onNew={handleNewDoc}
        onExportMd={handleExportMd}
        onExportJson={handleExportJson}
      />
      <LogSidebar
        doc={docRef.current}
        visible={logVisible}
        activeNodeId={activeLogNode}
        onEntryClick={handleLogEntryClick}
      />
      {selectedNode && (
        <NodeActions
          content={selectedNode.content}
          nodeId={selectedNode.id}
          position={selectedNode.screenPos}
          onBranch={handleBranch}
          onCollapse={handleCollapse}
          isCollapsed={collapsedRef.current.has(selectedNode.id)}
        />
      )}
      {branchTarget && (
        <BranchInput
          fromNodeId={branchTarget.nodeId}
          wsClient={wsClient}
          onClose={() => setBranchTarget(null)}
          position={branchTarget.screenPos}
        />
      )}
    </div>
  );
}
