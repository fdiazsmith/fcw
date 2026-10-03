// PROTOTYPE — the box that IS a doc.
//
// One shape type, no promotion step: a box always has a title, a body (maybe
// empty) and a child canvas (maybe empty). The glyphs report which of those
// are filled in — 🔗 placed on more than one canvas, ⤢ has a child canvas.
//
// The level-of-detail rule below is what makes spatial zoom survivable. Without
// it, a box you have zoomed *into* renders its own title at 300pt and its
// buttons the size of the viewport. Three renderings by on-screen size:
//
//   surrounding  — you are inside this box; it is the room, not an object.
//                  Border and a small pinned label only.
//   card         — normal. Title, body preview, actions.
//   block        — too small to read. A coloured tile that still shows
//                  structure and stays clickable.

import React from 'react';
import { BaseBoxShapeUtil, HTMLContainer, RecordProps, T, TLBaseShape, useValue, useEditor } from 'tldraw';

export type DocShapeProps = {
  w: number;
  h: number;
  docId: string;
  title: string;
  preview: string;
  isRef: boolean;
  children: number;
  depth: number;
  /** Spatial mode: this box's child canvas is drawn inside it, so the body
   *  preview would sit underneath the nested boxes. Yield the space. */
  nested: boolean;
};

export type DocShape = TLBaseShape<'fcw-doc', DocShapeProps>;

/** Set by the canvas components; the shape is rendered by tldraw, not by React tree. */
export const docActions = {
  open: (_docId: string) => {},
  dive: (_docId: string) => {},
};

const INK = '#0F172A';
const REF = '#7C3AED';

type Detail = 'surrounding' | 'card' | 'block';

function DocBody({ shape }: { shape: DocShape }) {
  const editor = useEditor();
  const { title, preview, isRef, children, docId, nested, w } = shape.props;
  const hasCanvas = children > 0;

  // Recomputed on every camera move — this is the whole trick.
  const detail = useValue<Detail>(
    'doc detail',
    () => {
      const onScreen = w * editor.getZoomLevel();
      if (onScreen > editor.getViewportScreenBounds().w * 1.4) return 'surrounding';
      if (onScreen < 90) return 'block';
      return 'card';
    },
    [editor, w],
  );

  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const border = isRef ? REF : INK;

  if (detail === 'block') {
    return (
      <HTMLContainer style={{ width: '100%', height: '100%', pointerEvents: 'all' }}>
        <div
          onDoubleClick={() => docActions.dive(docId)}
          title={title}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 10,
            border: `2px ${isRef ? 'dashed' : 'solid'} ${border}`,
            background: preview ? '#E0E7FF' : '#F1F5F9',
          }}
        />
      </HTMLContainer>
    );
  }

  if (detail === 'surrounding') {
    // You are inside this box. Show the frame, not the furniture.
    return (
      <HTMLContainer style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 10,
            border: `2px ${isRef ? 'dashed' : 'solid'} ${border}`,
            background: '#fff',
            opacity: 0.55,
          }}
        />
      </HTMLContainer>
    );
  }

  return (
    <HTMLContainer style={{ width: '100%', height: '100%', pointerEvents: 'all' }}>
      <div
        onDoubleClick={() => (hasCanvas ? docActions.dive(docId) : docActions.open(docId))}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fff',
          border: `2px ${isRef ? 'dashed' : 'solid'} ${border}`,
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(15,23,42,0.12)',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 9px',
            borderBottom: '1px solid #E2E8F0',
            background: isRef ? '#F5F3FF' : '#F8FAFC',
            flexShrink: 0,
          }}
        >
          {isRef && <span title="Placed on more than one canvas">🔗</span>}
          <span
            style={{
              fontWeight: 650,
              fontSize: 14,
              color: INK,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
            }}
          >
            {title}
          </span>
        </div>

        <div style={{ flex: 1, padding: '8px 9px', fontSize: 12, lineHeight: 1.45, overflow: 'hidden' }}>
          {nested ? null : preview ? (
            <span style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{preview}</span>
          ) : (
            <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>empty document</span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '6px 8px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
          <button onPointerDown={stop} onClick={() => docActions.open(docId)} style={btn(false)}>
            Write
          </button>
          <button onPointerDown={stop} onClick={() => docActions.dive(docId)} style={btn(hasCanvas)}>
            ⤢ {hasCanvas ? `Canvas · ${children}` : 'Canvas'}
          </button>
        </div>
      </div>
    </HTMLContainer>
  );
}

export class DocShapeUtil extends BaseBoxShapeUtil<DocShape> {
  static override type = 'fcw-doc' as const;

  static override props: RecordProps<DocShape> = {
    w: T.number,
    h: T.number,
    docId: T.string,
    title: T.string,
    preview: T.string,
    isRef: T.boolean,
    children: T.number,
    depth: T.number,
    nested: T.boolean,
  };

  override getDefaultProps(): DocShapeProps {
    return {
      w: 260,
      h: 150,
      docId: '',
      title: 'Untitled',
      preview: '',
      isRef: false,
      children: 0,
      depth: 0,
      nested: false,
    };
  }

  override canEdit() {
    return false;
  }

  override canResize() {
    return false;
  }

  override component(shape: DocShape) {
    return <DocBody shape={shape} />;
  }

  override indicator(shape: DocShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={10} />;
  }
}

const btn = (filled: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '4px 6px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  borderRadius: 6,
  border: `1px solid ${filled ? INK : '#CBD5E1'}`,
  background: filled ? INK : '#fff',
  color: filled ? '#fff' : '#475569',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
});
