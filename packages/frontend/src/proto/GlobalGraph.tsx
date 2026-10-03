// PROTOTYPE — sketch 04, "how all our thinking meshed together".
//
// Nobody draws or maintains this. It is a *query*: every doc a node, every
// placement an edge. Deliberately unlabelled until you hover — at this zoom the
// shape is the information.
//
// The force sim is ~30 lines of springs and repulsion, run once on open. Real
// d3-force stays out (MERMAID-DOCS.md § Rendering Stack) until this view has to
// hold thousands of nodes, which it doesn't.

import React, { useMemo, useState } from 'react';
import { globalGraph } from './store';
import type { ProtoState } from './store';

interface P {
  id: string;
  x: number;
  y: number;
}

const W = 620;
const H = 460;

function simulate(ids: string[], links: { from: string; to: string }[]): Map<string, P> {
  // Deterministic ring start — no Math.random, so the picture is stable.
  const nodes: P[] = ids.map((id, i) => ({
    id,
    x: W / 2 + Math.cos((i / ids.length) * Math.PI * 2) * 150,
    y: H / 2 + Math.sin((i / ids.length) * Math.PI * 2) * 150,
  }));
  const index = new Map(nodes.map((n, i) => [n.id, i]));

  for (let step = 0; step < 260; step++) {
    // Repulsion: every pair pushes apart.
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = Math.max(dx * dx + dy * dy, 25);
        const f = 1400 / d2;
        const d = Math.sqrt(d2);
        a.x -= (dx / d) * f;
        a.y -= (dy / d) * f;
        b.x += (dx / d) * f;
        b.y += (dy / d) * f;
      }
    }
    // Springs: linked docs pull together.
    for (const link of links) {
      const a = nodes[index.get(link.from)!];
      const b = nodes[index.get(link.to)!];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const f = (d - 90) * 0.012;
      a.x += (dx / d) * f;
      a.y += (dy / d) * f;
      b.x -= (dx / d) * f;
      b.y -= (dy / d) * f;
    }
    // Weak pull to centre so nothing drifts off-screen.
    for (const n of nodes) {
      n.x += (W / 2 - n.x) * 0.008;
      n.y += (H / 2 - n.y) * 0.008;
    }
  }

  return new Map(nodes.map((n) => [n.id, n]));
}

export interface GlobalGraphProps {
  state: ProtoState;
  onPick: (docId: string) => void;
  onClose: () => void;
}

export function GlobalGraph({ state, onPick, onClose }: GlobalGraphProps) {
  const [hover, setHover] = useState<string | null>(null);
  const { nodes, links } = useMemo(() => globalGraph(state), [state]);
  const positions = useMemo(
    () => simulate(nodes.map((n) => n.id), links),
    [nodes, links],
  );

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const l of links) {
      d.set(l.from, (d.get(l.from) ?? 0) + 1);
      d.set(l.to, (d.get(l.to) ?? 0) + 1);
    }
    return d;
  }, [links]);

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <header style={S.head}>
          <div>
            <strong style={{ fontSize: 14 }}>Global graph</strong>
            <span style={S.sub}>
              {nodes.length} docs · {links.length} references — a query, not a document
            </span>
          </div>
          <button onClick={onClose} style={S.x}>
            ✕
          </button>
        </header>

        <svg width={W} height={H} style={{ display: 'block', background: '#0F172A' }}>
          {links.map((l, i) => {
            const a = positions.get(l.from);
            const b = positions.get(l.to);
            if (!a || !b) return null;
            const lit = hover === l.from || hover === l.to;
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lit ? '#818CF8' : '#334155'}
                strokeWidth={lit ? 1.6 : 0.8}
              />
            );
          })}
          {nodes.map((n) => {
            const p = positions.get(n.id)!;
            const r = 3.5 + Math.min(degree.get(n.id) ?? 0, 8) * 0.9;
            const lit = hover === n.id;
            return (
              <g key={n.id}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={lit ? r + 2.5 : r}
                  fill={n.body ? '#818CF8' : '#475569'}
                  stroke={lit ? '#fff' : 'none'}
                  strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(n.id)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onPick(n.id)}
                />
                {lit && (
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
          <span>hover to label · click to open</span>
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
    zIndex: 500,
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
