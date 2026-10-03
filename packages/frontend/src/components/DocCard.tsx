import React from 'react';
import ReactMarkdown from 'react-markdown';
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

// Compact type scale for card-sized markdown: headings barely above body text.
const tight = (extra: React.CSSProperties = {}): React.CSSProperties => ({ margin: '8px 0', ...extra });
const previewMarkdown = {
  p: (props: React.HTMLAttributes<HTMLElement>) => <p style={tight()} {...props} />,
  h1: (props: React.HTMLAttributes<HTMLElement>) => <h1 style={tight({ fontSize: 14, fontWeight: 700 })} {...props} />,
  h2: (props: React.HTMLAttributes<HTMLElement>) => <h2 style={tight({ fontSize: 13, fontWeight: 700 })} {...props} />,
  h3: (props: React.HTMLAttributes<HTMLElement>) => <h3 style={tight({ fontSize: 12, fontWeight: 700 })} {...props} />,
  ul: (props: React.HTMLAttributes<HTMLElement>) => <ul style={tight({ paddingLeft: 18 })} {...props} />,
  ol: (props: React.HTMLAttributes<HTMLElement>) => <ol style={tight({ paddingLeft: 18 })} {...props} />,
  pre: (props: React.HTMLAttributes<HTMLElement>) => (
    <pre style={tight({ fontSize: 11, background: '#F8FAFC', padding: 6, borderRadius: 4, overflow: 'hidden' })} {...props} />
  ),
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

      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '0 9px',
          fontSize: 12,
          lineHeight: 1.45,
          color: '#334155',
          overflow: 'hidden',
          // Clipped bodies fade out instead of cutting a line in half.
          maskImage: 'linear-gradient(to bottom, #000 calc(100% - 24px), transparent)',
        }}
      >
        {p.preview ? (
          <ReactMarkdown components={previewMarkdown}>{p.preview}</ReactMarkdown>
        ) : (
          <p style={{ margin: '8px 0', color: '#94A3B8', fontStyle: 'italic' }}>empty document</p>
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
