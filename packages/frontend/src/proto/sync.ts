// PROTOTYPE — project the doc workspace onto tldraw shapes.
//
// Division of labour: the store owns doc shapes (tagged meta.fcwDoc) and their
// connectors; tldraw owns everything else on the canvas, which is how freehand
// sketching survives a resync untouched (sketch 02's wireframe).

import { Editor, TLShapeId, TLParentId, createShapeId } from 'tldraw';
import type { DocShapeProps } from './DocShape';
import type { ProtoState } from './store';

export interface DesiredDoc {
  id: TLShapeId;
  x: number;
  y: number;
  props: DocShapeProps;
  /** Maps this shape back to a placement: which canvas, and the spatial transform. */
  meta: { fcwDoc: true; canvasId: string; docId: string; ox: number; oy: number; k: number };
}

export interface DesiredArrow {
  id: TLShapeId;
  from: TLShapeId;
  to: TLShapeId;
}

export const PREVIEW_CHARS = 150;

export function previewOf(body: string): string {
  const text = body
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join(' ')
    .replace(/[*`>_]/g, '')
    .trim();
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text;
}

export function docShapeId(scope: string): TLShapeId {
  return createShapeId(`doc-${scope}`);
}

export function arrowShapeId(scope: string): TLShapeId {
  return createShapeId(`edge-${scope}`);
}

/**
 * Make the canvas match `docs`/`arrows`. Anything previously created by us and
 * no longer wanted is removed; anything the user drew is left alone.
 */
export function syncCanvas(
  editor: Editor,
  parentId: TLParentId,
  docs: DesiredDoc[],
  arrows: DesiredArrow[],
): void {
  editor.run(
    () => {
      const wanted = new Set<string>([...docs.map((d) => d.id), ...arrows.map((a) => a.id)]);

      const stale = editor
        .getSortedChildIdsForParent(parentId)
        .map((id) => editor.getShape(id))
        .filter((s) => s && (s.meta?.fcwDoc || s.meta?.fcwEdge) && !wanted.has(s.id))
        .map((s) => s!.id);
      if (stale.length > 0) editor.deleteShapes(stale);

      for (const doc of docs) {
        const existing = editor.getShape(doc.id);
        if (!existing) {
          editor.createShape({
            id: doc.id,
            type: 'fcw-doc',
            parentId,
            x: doc.x,
            y: doc.y,
            props: doc.props,
            meta: doc.meta,
          });
        } else {
          editor.updateShape({
            id: doc.id,
            type: 'fcw-doc',
            x: doc.x,
            y: doc.y,
            props: doc.props,
            meta: doc.meta,
          });
        }
      }

      for (const arrow of arrows) {
        if (editor.getShape(arrow.id)) continue;
        if (!editor.getShape(arrow.from) || !editor.getShape(arrow.to)) continue;
        editor.createShape({
          id: arrow.id,
          type: 'arrow',
          parentId,
          meta: { fcwEdge: true },
          props: { color: 'grey', size: 's' },
        });
        for (const [terminal, target] of [
          ['start', arrow.from],
          ['end', arrow.to],
        ] as const) {
          editor.createBinding({
            type: 'arrow',
            fromId: arrow.id,
            toId: target,
            props: { terminal, isExact: false, isPrecise: false, normalizedAnchor: { x: 0.5, y: 0.5 } },
          });
        }
      }
    },
    { history: 'ignore' },
  );
}

/** Shared props builder so both navigation modes render identical boxes. */
export function propsFor(
  state: ProtoState,
  docId: string,
  scale: number,
  depth: number,
  isRef: boolean,
  baseW: number,
  baseH: number,
  nested = false,
): DocShapeProps {
  const doc = state.docs[docId];
  return {
    w: baseW * scale,
    h: baseH * scale,
    docId,
    title: doc.title,
    preview: previewOf(doc.body),
    isRef,
    children: doc.canvas.placements.length,
    depth,
    nested,
  };
}
