import React from 'react';
import type { DocCardModel } from '../doc-view';

export interface DocCardProps extends DocCardModel {
  /** Slot for the link chip (filled by M3.5). */
  linkChip?: React.ReactNode;
  onOpenCanvas: () => void;
  onRegenerate: () => void;
  onSelect: () => void;
}

const INK = '#0F172A';
const REF = '#7C3AED';

const button: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  borderRadius: 6,
  border: '1px solid #CBD5E1',
  background: '#fff',
  color: '#475569',
  whiteSpace: 'nowrap',
};

export function DocCard(p: DocCardProps) {
  // Keep tldraw from starting a drag when the user presses a control.
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <div
      data-testid="doc-shape"
      data-doc-id={p.docId}
      data-doc-title={p.title}
      onClick={p.onSelect}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        border: `2px ${p.isReference ? 'dashed' : 'solid'} ${p.isReference ? REF : INK}`,
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
          background: p.isReference ? '#F5F3FF' : '#F8FAFC',
          flexShrink: 0,
        }}
      >
        {p.isReference && (
          <span data-testid="doc-ref-marker" title="Placed on more than one canvas" style={{ fontSize: 12 }}>
            🔗 <span style={{ fontSize: 10, color: REF }}>{p.refCount} canvases</span>
          </span>
        )}
        <span
          data-testid="doc-title"
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
          {p.title}
        </span>
        {p.linkChip}
      </div>

      <div style={{ flex: 1, padding: '8px 9px', fontSize: 12, lineHeight: 1.45, overflow: 'hidden' }}>
        {p.preview ? (
          <span style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{p.preview}</span>
        ) : (
          <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>empty document</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderTop: '1px solid #F1F5F9', flexShrink: 0 }}>
        <button
          data-testid="doc-open-canvas"
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            p.onOpenCanvas();
          }}
          style={button}
        >
          {p.childCount > 0 ? `⤢ Canvas · ${p.childCount}` : '⤢ Canvas'}
        </button>
        {p.generated === 'generating' ? (
          <span style={{ fontSize: 11, color: '#7C3AED' }}>generating…</span>
        ) : (
          p.stale && (
            <>
              <span data-testid="doc-stale" style={{ fontSize: 11, color: '#B45309' }}>
                generated · stale →
              </span>
              <button
                data-testid="doc-regenerate"
                onPointerDown={stop}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onRegenerate();
                }}
                style={button}
              >
                regenerate?
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}
