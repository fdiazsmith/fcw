// PROTOTYPE — navigation option A: VIEW-SWAP.
//
// One tldraw page per canvas doc. Diving in swaps the page; the breadcrumb and
// home glyph walk back up (sketch 03). Freehand drawings persist per page for
// free, because tldraw is already keeping them.
//
// The conventional choice. Compare against SpatialCanvas.

import React, { useCallback, useEffect, useRef } from 'react';
import { Tldraw, Editor, PageRecordType, TLPageId } from 'tldraw';
import 'tldraw/tldraw.css';
import { DocShapeUtil, docActions } from './DocShape';
import { syncCanvas, docShapeId, arrowShapeId, propsFor, DesiredDoc, DesiredArrow } from './sync';
import { chrome, persistenceKey } from './chrome';
import { isReference, DOC_W, DOC_H } from './store';
import type { ProtoState } from './store';
import type { Position } from '@fcw/graph-core';

const shapeUtils = [DocShapeUtil];

const pageIdFor = (docId: string): TLPageId =>
  PageRecordType.createId(docId.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40));

export interface SwapCanvasProps {
  state: ProtoState;
  canvasId: string;
  onMove: (canvasId: string, docId: string, position: Position) => void;
  onOpen: (docId: string) => void;
  onDive: (docId: string) => void;
}

export function SwapCanvas({ state, canvasId, onMove, onOpen, onDive }: SwapCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const syncing = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const canvasRef = useRef(canvasId);
  canvasRef.current = canvasId;

  docActions.open = onOpen;
  docActions.dive = onDive;

  const render = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const current = stateRef.current;
    const host = current.docs[canvasRef.current];
    if (!host) return;

    const pageId = pageIdFor(host.id);
    if (!editor.getPage(pageId)) {
      editor.createPage({ id: pageId, name: host.title });
    }
    if (editor.getCurrentPageId() !== pageId) editor.setCurrentPage(pageId);

    const docs: DesiredDoc[] = host.canvas.placements.map((p) => ({
      id: docShapeId(`${host.id}-${p.id}`),
      x: p.position.x,
      y: p.position.y,
      props: propsFor(current, p.id, 1, 0, isReference(current, p.id), DOC_W, DOC_H),
      meta: { fcwDoc: true, canvasId: host.id, docId: p.id, ox: 0, oy: 0, k: 1 },
    }));

    const placed = new Set(host.canvas.placements.map((p) => p.id));
    const arrows: DesiredArrow[] = host.canvas.edges
      .filter((e) => placed.has(e.from) && placed.has(e.to))
      .map((e) => ({
        id: arrowShapeId(`${host.id}-${e.from}-${e.to}`),
        from: docShapeId(`${host.id}-${e.from}`),
        to: docShapeId(`${host.id}-${e.to}`),
      }));

    syncing.current = true;
    try {
      syncCanvas(editor, pageId, docs, arrows);
    } finally {
      syncing.current = false;
    }
  }, []);

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Drag a box → the placement moves. Positions are canvas-local here, so
      // this is a straight copy (contrast with SpatialCanvas).
      editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
        if (syncing.current) return;
        if (!next.meta?.fcwDoc) return;
        if (prev.x === next.x && prev.y === next.y) return;
        onMove(next.meta.canvasId as string, next.meta.docId as string, { x: next.x, y: next.y });
      });

      render();
      editor.zoomToFit({ animation: { duration: 0 } });
    },
    [render, onMove],
  );

  // Re-render on any store change, and refit when the canvas itself changes.
  useEffect(() => {
    render();
  }, [state, render]);

  useEffect(() => {
    render();
    editorRef.current?.zoomToFit({ animation: { duration: 200 } });
  }, [canvasId, render]);

  return (
    <Tldraw
      shapeUtils={shapeUtils}
      components={chrome}
      persistenceKey={persistenceKey('swap')}
      onMount={onMount}
      cameraOptions={{ zoomSteps: [0.1, 0.25, 0.5, 1, 2, 4, 8] }}
    />
  );
}
