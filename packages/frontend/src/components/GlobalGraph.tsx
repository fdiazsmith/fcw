// Sketch 04: the global graph as a plain-SVG modal. A query, not a document —
// positions come from a small deterministic spring sim run once per graph.
import React, { useEffect, useMemo, useState } from 'react';
import { simulate, GRAPH_W, GRAPH_H } from '../global-graph';
import type { GlobalGraphData } from '../global-graph';

export interface GlobalGraphProps {
  graph: GlobalGraphData;
  onPick: (docId: string) => void;
  onClose: () => void;
}

/** Graphs this small label every node; larger ones label on hover only. */
const ALWAYS_LABEL_MAX = 12;

export function GlobalGraph({ graph, onPick, onClose }: GlobalGraphProps) {
  const [hover, setHover] = useState<string | null>(null);
  const positions = useMemo(() => simulate(graph), [graph]);
  const labelAll = graph.nodes.length <= ALWAYS_LABEL_MAX;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div data-testid="global-graph" style={S.modal} onClick={(e) => e.stopPropagation()}>
        <header style={S.head}>
          <div>
            <strong style={{ fontSize: 14 }}>Global graph</strong>
            <span style={S.sub}>
              {graph.nodes.length} nodes · {graph.edges.length} references — a query, not a document
            </span>
          </div>
          <button data-testid="global-graph-close" onClick={onClose} style={S.x}>
            ✕
          </button>
        </header>
        <svg width={GRAPH_W} height={GRAPH_H} style={{ display: 'block', background: '#0F172A' }}>
          {graph.edges.map((e, i) => {
            const a = positions.get(e.from);
            const b = positions.get(e.to);
            if (!a || !b) return null;
            const lit = hover === e.from || hover === e.to;
            return (
              <line
                key={i}
                data-testid="global-graph-edge"
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lit ? '#818CF8' : '#334155'}
                strokeWidth={lit ? 1.6 : 0.8}
                strokeDasharray={e.kind === 'edge' ? '4 3' : undefined}
              />
            );
          })}
          {graph.nodes.map((n) => {
            const p = positions.get(n.id)!;
            const r = 3.5 + Math.min(n.degree, 8) * 0.9;
            const lit = hover === n.id;
            return (
              <g key={n.id}>
                <circle
                  data-testid="global-graph-node"
                  data-doc-id={n.id}
                  cx={p.x}
                  cy={p.y}
                  r={lit ? r + 2.5 : r}
                  fill={n.hasBody ? '#818CF8' : '#475569'}
                  stroke={lit ? '#fff' : 'none'}
                  strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onPick(n.id)}
                />
                {(lit || labelAll) && (
                  <text x={p.x + r + 6} y={p.y + 4} fill="#F8FAFC" fontSize={12} style={{ pointerEvents: 'none' }}>
                    {n.title}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <footer style={S.foot}>
          <span>
            <span style={{ ...S.dot, background: '#818CF8' }} /> has prose
            <span style={{ ...S.dot, background: '#475569', marginLeft: 14 }} /> empty
          </span>
          <span>click a node to open its canvas</span>
        </footer>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15,23,42,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    background: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' },
  sub: { marginLeft: 10, fontSize: 12, color: '#64748B' },
  x: { border: 'none', background: 'transparent', fontSize: 15, cursor: 'pointer', color: '#64748B' },
  foot: { display: 'flex', justifyContent: 'space-between', padding: '8px 14px', fontSize: 11, color: '#64748B' },
  dot: { display: 'inline-block', width: 8, height: 8, borderRadius: 8, marginRight: 5 },
};
