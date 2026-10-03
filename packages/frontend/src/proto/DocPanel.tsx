// PROTOTYPE — the side panel (copilot layout, per MERMAID-DOCS.md § Doc-chat placement).
//
// Three things worth looking at while clicking around:
//   · "Placed on" — a doc listing two canvases is the placement model working
//   · the context strip — real `assembleDocContext` output, degrading live as
//     you drop the budget
//   · Apply to doc — the chat NEVER writes the body on its own

import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { assembleDocContext } from '@fcw/graph-core';
import type { ProtoState } from './store';
import { placedOn } from './store';

export interface DocPanelProps {
  state: ProtoState;
  docId: string;
  onClose: () => void;
  onTitle: (docId: string, title: string) => void;
  onBody: (docId: string, body: string) => void;
  onNavigate: (docId: string) => void;
  onPlaceExisting: (docId: string) => void;
  onUnplace: (docId: string) => void;
  /** The canvas the panel was opened from — where a reference would land. */
  canvasId: string;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  draft?: string;
}

/** Canned doc-builder. Deterministic: drafts from the title and the real context blocks. */
function draftFor(title: string, prompt: string, refs: string[]): Turn {
  const cites = refs.length > 0 ? `\n\nRelated: ${refs.map((r) => `[[${r}]]`).join(', ')}.` : '';
  const draft = [
    `## ${title}`,
    '',
    `${prompt.trim() || `Notes on ${title}.`}`,
    '',
    '### Decisions',
    '',
    `- ${title} owns its own state; callers pass identifiers, not objects.`,
    '- Failure is explicit — no silent fallbacks.',
    '',
    '### Open questions',
    '',
    '- What happens on the unhappy path?',
    `- Who else depends on ${title}?${cites}`,
  ].join('\n');

  return {
    role: 'assistant',
    text: `Drafted a body for **${title}** using ${refs.length} referenced doc${refs.length === 1 ? '' : 's'} as context. Press Apply to write it — nothing is saved until you do.`,
    draft,
  };
}

export function DocPanel(props: DocPanelProps) {
  const { state, docId, canvasId, onClose, onTitle, onBody, onNavigate, onPlaceExisting, onUnplace } = props;
  const doc = state.docs[docId];
  const [preview, setPreview] = useState(false);
  const [budget, setBudget] = useState(1200);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [prompt, setPrompt] = useState('');
  const [picking, setPicking] = useState(false);

  const blocks = useMemo(
    () => assembleDocContext({ docs: state.docs }, docId, { budget }),
    [state.docs, docId, budget],
  );
  const hosts = useMemo(() => placedOn(state, docId), [state, docId]);

  if (!doc) return null;

  const send = () => {
    const refs = blocks.filter((b) => b.docId !== docId && !b.degraded).map((b) => b.title);
    setTurns((t) => [...t, { role: 'user', text: prompt }, draftFor(doc.title, prompt, refs)]);
    setPrompt('');
  };

  const candidates = Object.values(state.docs).filter(
    (d) => d.id !== docId && !doc.canvas.placements.some((p) => p.id === d.id),
  );

  return (
    <aside style={S.panel}>
      <header style={S.head}>
        <input
          value={doc.title}
          onChange={(e) => onTitle(docId, e.target.value)}
          style={S.title}
          aria-label="Document title"
        />
        <button onClick={onClose} style={S.x} title="Close">
          ✕
        </button>
      </header>

      <div style={S.scroll}>
        {/* ── one doc, many canvases ─────────────────────────────────── */}
        <section style={S.section}>
          <div style={S.label}>
            Placed on {hosts.length > 1 && <span style={S.badge}>🔗 reference · {hosts.length} canvases</span>}
          </div>
          <div style={S.chips}>
            {hosts.length === 0 && <span style={S.muted}>nowhere yet</span>}
            {hosts.map((h) => (
              <button key={h} onClick={() => onNavigate(h)} style={S.chip}>
                {state.docs[h].title}
              </button>
            ))}
          </div>
        </section>

        {/* ── body ───────────────────────────────────────────────────── */}
        <section style={S.section}>
          <div style={S.label}>
            Body
            <button onClick={() => setPreview((p) => !p)} style={S.link}>
              {preview ? 'edit' : 'preview'}
            </button>
          </div>
          {preview ? (
            <div style={S.preview}>
              {doc.body ? <ReactMarkdown>{doc.body}</ReactMarkdown> : <span style={S.muted}>empty</span>}
            </div>
          ) : (
            <textarea
              value={doc.body}
              onChange={(e) => onBody(docId, e.target.value)}
              placeholder={`Write about ${doc.title}…`}
              style={S.textarea}
            />
          )}
        </section>

        {/* ── this doc's own canvas ──────────────────────────────────── */}
        <section style={S.section}>
          <div style={S.label}>
            Its canvas holds
            <button onClick={() => setPicking((p) => !p)} style={S.link}>
              {picking ? 'cancel' : '+ place existing'}
            </button>
          </div>
          {picking && (
            <div style={S.picker}>
              {candidates.length === 0 && <span style={S.muted}>nothing else exists yet</span>}
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onPlaceExisting(c.id);
                    setPicking(false);
                  }}
                  style={S.pickRow}
                >
                  🔗 {c.title}
                </button>
              ))}
            </div>
          )}
          <div style={S.chips}>
            {doc.canvas.placements.length === 0 && <span style={S.muted}>empty canvas</span>}
            {doc.canvas.placements.map((p) => (
              <span key={p.id} style={S.chipRow}>
                <button onClick={() => onNavigate(p.id)} style={S.chip}>
                  {state.docs[p.id]?.title ?? p.id}
                </button>
                <button onClick={() => onUnplace(p.id)} style={S.tiny} title="Remove from this canvas">
                  ✕
                </button>
              </span>
            ))}
          </div>
        </section>

        {/* ── doc-builder chat ───────────────────────────────────────── */}
        <section style={{ ...S.section, borderTop: '4px solid #F1F5F9', paddingTop: 14 }}>
          <div style={S.label}>Doc-builder chat</div>

          <div style={S.ctxHead}>
            <span>
              context · {blocks.length} block{blocks.length === 1 ? '' : 's'}
            </span>
            <label style={S.budget}>
              budget {budget}
              <input
                type="range"
                min={0}
                max={3000}
                step={100}
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                style={{ width: 90 }}
              />
            </label>
          </div>
          <div style={S.chips}>
            {blocks.map((b) => (
              <span
                key={b.docId}
                title={b.degraded ? 'over budget — title only' : `${b.body.length} chars of body`}
                style={{
                  ...S.ctxChip,
                  opacity: b.degraded ? 0.45 : 1,
                  borderStyle: b.degraded ? 'dashed' : 'solid',
                  fontWeight: b.docId === docId ? 700 : 400,
                }}
              >
                {b.title}
                {b.docId === docId && ' (target)'}
                {b.degraded && ' · title only'}
              </span>
            ))}
          </div>

          <div style={S.turns}>
            {turns.length === 0 && (
              <span style={S.muted}>Ask for a draft. Referenced docs above are fed in as context.</span>
            )}
            {turns.map((t, i) => (
              <div key={i} style={t.role === 'user' ? S.userTurn : S.botTurn}>
                <ReactMarkdown>{t.text}</ReactMarkdown>
                {t.draft && (
                  <>
                    <pre style={S.draft}>{t.draft}</pre>
                    <button onClick={() => onBody(docId, t.draft!)} style={S.apply}>
                      Apply to doc
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={S.composer}>
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder="Draft this document…"
              style={S.input}
            />
            <button onClick={send} style={S.send}>
              Send
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    width: 380,
    flexShrink: 0,
    borderLeft: '1px solid #E2E8F0',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
  head: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid #E2E8F0' },
  title: { flex: 1, fontSize: 16, fontWeight: 650, border: 'none', outline: 'none', color: '#0F172A' },
  x: { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 15, color: '#64748B' },
  scroll: { flex: 1, overflowY: 'auto' },
  section: { padding: '12px 12px 4px' },
  label: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#64748B',
    marginBottom: 6,
  },
  badge: { background: '#EDE9FE', color: '#6D28D9', borderRadius: 20, padding: '2px 8px', fontSize: 10 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  chipRow: { display: 'inline-flex', alignItems: 'center', gap: 2 },
  chip: {
    border: '1px solid #CBD5E1',
    background: '#F8FAFC',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 12,
    cursor: 'pointer',
    color: '#0F172A',
  },
  ctxChip: { border: '1px solid #A5B4FC', background: '#EEF2FF', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#3730A3' },
  tiny: { border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', fontSize: 11 },
  muted: { color: '#94A3B8', fontSize: 12, fontStyle: 'italic' },
  link: { border: 'none', background: 'transparent', color: '#2563EB', cursor: 'pointer', fontSize: 11, textTransform: 'none' },
  textarea: {
    width: '100%',
    minHeight: 130,
    resize: 'vertical',
    padding: 8,
    fontSize: 13,
    lineHeight: 1.5,
    fontFamily: 'ui-monospace, monospace',
    border: '1px solid #CBD5E1',
    borderRadius: 8,
    outline: 'none',
    boxSizing: 'border-box',
  },
  preview: { border: '1px solid #E2E8F0', borderRadius: 8, padding: '2px 10px', fontSize: 13, minHeight: 130 },
  picker: { border: '1px solid #E2E8F0', borderRadius: 8, marginBottom: 8, maxHeight: 150, overflowY: 'auto' },
  pickRow: {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    border: 'none',
    borderBottom: '1px solid #F1F5F9',
    background: '#fff',
    padding: '6px 9px',
    fontSize: 12,
    cursor: 'pointer',
  },
  ctxHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748B', marginBottom: 5 },
  budget: { display: 'flex', alignItems: 'center', gap: 5 },
  turns: { display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' },
  userTurn: { alignSelf: 'flex-end', background: '#0F172A', color: '#fff', borderRadius: 10, padding: '2px 10px', fontSize: 13, maxWidth: '85%' },
  botTurn: { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '2px 10px', fontSize: 13 },
  draft: {
    background: '#0F172A',
    color: '#E2E8F0',
    borderRadius: 8,
    padding: 9,
    fontSize: 11,
    lineHeight: 1.45,
    maxHeight: 160,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
  },
  apply: {
    width: '100%',
    padding: '6px 8px',
    marginBottom: 8,
    border: 'none',
    borderRadius: 7,
    background: '#16A34A',
    color: '#fff',
    fontWeight: 650,
    fontSize: 12,
    cursor: 'pointer',
  },
  composer: { display: 'flex', gap: 6, padding: '4px 0 14px' },
  input: { flex: 1, padding: '7px 9px', fontSize: 13, border: '1px solid #CBD5E1', borderRadius: 8, outline: 'none' },
  send: { padding: '7px 12px', border: 'none', borderRadius: 8, background: '#0F172A', color: '#fff', fontSize: 12, fontWeight: 650, cursor: 'pointer' },
};
