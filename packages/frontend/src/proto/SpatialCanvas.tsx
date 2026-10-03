// PROTOTYPE — navigation option B: SPATIAL ZOOM-IN.
//
// Every canvas in the workspace is drawn on ONE tldraw page, each child canvas
// nested geometrically inside its parent's box and scaled to fit. Diving in is
// a camera move, not a view change — the parent stays around you.
//
// This is the choice MERMAID-DOCS.md flags as highest-risk. Things to judge:
//   · does "the parent is still visible" actually help, or is it noise?
//   · depth 3 lands around 2% scale — is that still legible while navigating?
//   · references can't nest (a doc placed inside itself), so recursion is cut
//     at MAX_DEPTH and on cycles — see `onPath` below. Does the cut show?

import React, { useCallback, useEffect, useRef } from 'react';
import { Tldraw, Editor, Box } from 'tldraw';
import 'tldraw/tldraw.css';
import { DocShapeUtil, docActions } from './DocShape';
import { syncCanvas, docShapeId, arrowShapeId, propsFor, DesiredDoc, DesiredArrow } from './sync';
import { chrome, persistenceKey } from './chrome';
import { isReference, DOC_W, DOC_H } from './store';
import type { ProtoState } from './store';
import type { Position } from '@fcw/graph-core';

const shapeUtils = [DocShapeUtil];

/** How deep the nesting is drawn. Beyond this a box is a leaf you must swap into. */
const MAX_DEPTH = 3;
const PAD = 12;
const HEADER = 34;

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Built {
  docs: DesiredDoc[];
  arrows: DesiredArrow[];
  /** path.join('>') → the box that path occupies. */
  regions: Map<string, Frame>;
  /** path.join('>') → just the nested-canvas area inside that box. Diving
   *  targets this, so the parent's own title and buttons don't fill the
   *  viewport at the moment you arrive. */
  contentRegions: Map<string, Frame>;
}

function extentOf(placements: { position: Position }[]): Frame {
  const xs = placements.map((p) => p.position.x);
  const ys = placements.map((p) => p.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) + DOC_W - minX, h: Math.max(...ys) + DOC_H - minY };
}

export function buildSpatial(state: ProtoState): Built {
  const built: Built = { docs: [], arrows: [], regions: new Map(), contentRegions: new Map() };
  const root = state.docs[state.rootId];
  if (!root || root.canvas.placements.length === 0) return built;

  const emit = (canvasId: string, frame: Frame, depth: number, path: string[]): void => {
    const host = state.docs[canvasId];
    if (!host || host.canvas.placements.length === 0) return;

    const extent = extentOf(host.canvas.placements);
    const k = Math.min(frame.w / extent.w, frame.h / extent.h);
    // abs = origin + local * k, so dragging inverts to local = (abs - origin) / k
    const ox = frame.x - extent.x * k;
    const oy = frame.y - extent.y * k;

    for (const p of host.canvas.placements) {
      const childPath = [...path, p.docId];
      const key = childPath.join('>');
      const box: Frame = {
        x: ox + p.position.x * k,
        y: oy + p.position.y * k,
        w: DOC_W * k,
        h: DOC_H * k,
      };
      // Recurse into the child's own canvas, drawn inside the child's box.
      const onPath = path.includes(p.docId); // a reference pointing back up
      const willNest =
        depth + 1 < MAX_DEPTH && !onPath && !!state.docs[p.docId]?.canvas.placements.length;

      built.regions.set(key, box);
      built.docs.push({
        id: docShapeId(`sp-${key}`),
        x: box.x,
        y: box.y,
        props: propsFor(state, p.docId, k, depth, isReference(state, p.docId), DOC_W, DOC_H, willNest),
        meta: { fcwDoc: true, canvasId, docId: p.docId, ox, oy, k },
      });

      if (willNest) {
        const inner: Frame = {
          x: box.x + PAD * k,
          y: box.y + HEADER * k,
          w: box.w - 2 * PAD * k,
          h: box.h - (HEADER + PAD) * k,
        };
        built.contentRegions.set(key, inner);
        emit(p.docId, inner, depth + 1, childPath);
      }
    }

    const placed = new Set(host.canvas.placements.map((p) => p.docId));
    for (const e of host.canvas.edges) {
      if (!placed.has(e.from) || !placed.has(e.to)) continue;
      const from = [...path, e.from].join('>');
      const to = [...path, e.to].join('>');
      built.arrows.push({
        id: arrowShapeId(`sp-${from}-${to}`),
        from: docShapeId(`sp-${from}`),
        to: docShapeId(`sp-${to}`),
      });
    }
  };

  emit(state.rootId, extentOf(root.canvas.placements), 0, [state.rootId]);
  return built;
}

export interface SpatialCanvasProps {
  state: ProtoState;
  /** docIds from root to the focused canvas. */
  path: string[];
  onMove: (canvasId: string, docId: string, position: Position) => void;
  onOpen: (docId: string) => void;
  onDive: (docId: string) => void;
}

export function SpatialCanvas({ state, path, onMove, onOpen, onDive }: SpatialCanvasProps) {
  const editorRef = useRef<Editor | null>(null);
  const syncing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const regionsRef = useRef<Map<string, Frame>>(new Map());
  const contentRef = useRef<Map<string, Frame>>(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;

  docActions.open = onOpen;
  docActions.dive = onDive;

  const render = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const { docs, arrows, regions, contentRegions } = buildSpatial(stateRef.current);
    regionsRef.current = regions;
    contentRef.current = contentRegions;
    syncing.current = true;
    try {
      syncCanvas(editor, editor.getCurrentPageId(), docs, arrows);
    } finally {
      syncing.current = false;
    }
  }, []);

  // Rebuilding mid-drag would yank the shape out from under the pointer:
  // every box below the dragged one has to be re-nested, so wait for pointer-up.
  const scheduleRender = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (editorRef.current?.inputs.isPointing) return scheduleRender();
      render();
    }, 120);
  }, [render]);

  const focusOn = useCallback((target: string[], duration: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (target.length <= 1) {
      editor.zoomToFit({ animation: { duration } });
      return;
    }
    const key = target.join('>');
    // Prefer the nested-canvas area; fall back to the whole box for a leaf.
    const box = contentRef.current.get(key) ?? regionsRef.current.get(key);
    if (box) {
      editor.zoomToBounds(new Box(box.x, box.y, box.w, box.h), {
        animation: { duration },
        inset: 24,
      });
    }
  }, []);

  const onMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      editor.sideEffects.registerAfterChangeHandler('shape', (prev, next) => {
        if (syncing.current) return;
        if (!next.meta?.fcwDoc) return;
        if (prev.x === next.x && prev.y === next.y) return;
        // Undo the nesting transform to recover the canvas-local position.
        const { ox, oy, k, canvasId, docId } = next.meta as {
          ox: number;
          oy: number;
          k: number;
          canvasId: string;
          docId: string;
        };
        onMove(canvasId, docId, { x: (next.x - ox) / k, y: (next.y - oy) / k });
      });

      render();
      editor.zoomToFit({ animation: { duration: 0 } });
    },
    [render, onMove],
  );

  useEffect(() => {
    scheduleRender();
  }, [state, scheduleRender]);

  // Camera follows the breadcrumb. Render first so the region exists.
  useEffect(() => {
    render();
    focusOn(path, 350);
  }, [path, render, focusOn]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <Tldraw
      shapeUtils={shapeUtils}
      components={chrome}
      persistenceKey={persistenceKey('spatial')}
      onMount={onMount}
      // Depth 3 lands near 2% scale, so the ceiling has to be far above tldraw's default 8.
      cameraOptions={{ zoomSteps: [0.02, 0.1, 0.5, 1, 4, 16, 64, 256] }}
    />
  );
}
