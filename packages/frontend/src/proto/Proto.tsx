// PROTOTYPE — the shell. Toolbar, breadcrumb, prompt bar, panel, and the
// navigation-mode toggle that is the whole point of the exercise.
//
// Not wired to the server. State is localStorage. See proto/README.md.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Position } from '@fcw/graph-core';
import * as store from './store';
import type { ProtoState } from './store';
import { respond, seedSketchScenario, CANNED_LABELS } from './seed';
import { SwapCanvas } from './SwapCanvas';
import { SpatialCanvas } from './SpatialCanvas';
import { DocPanel } from './DocPanel';
import { GlobalGraph } from './GlobalGraph';
import { persistenceKey } from './chrome';

type Mode = 'spatial' | 'swap';

const MAX_SPATIAL_DEPTH = 3;

export default function Proto() {
  const [state, setState] = useState<ProtoState>(() => store.load() ?? seedSketchScenario());
  const [mode, setMode] = useState<Mode>('swap');
  const [path, setPath] = useState<string[]>([state.rootId]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showGraph, setShowGraph] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [via, setVia] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => store.save(state), [state]);

  const canvasId = path[path.length - 1];
  const update = useCallback((fn: (s: ProtoState) => ProtoState) => setState((s) => fn(s)), []);

  // ── navigation ─────────────────────────────────────────────────────────────

  const dive = useCallback((docId: string) => {
    setPath((p) => (p[p.length - 1] === docId ? p : [...p, docId]));
    setSelected(docId);
  }, []);

  /** Jump anywhere (breadcrumb, global graph, "placed on") — rebuild the path. */
  const navigate = useCallback((docId: string) => {
    const next = store.pathToRoot(stateRef.current, docId);
    setPath(next.length > 0 ? next : [stateRef.current.rootId]);
    setSelected(docId);
    setShowGraph(false);
  }, []);

  // ── edits ──────────────────────────────────────────────────────────────────

  const onMove = useCallback(
    (canvas: string, docId: string, position: Position) =>
      update((s) => store.move(s, canvas, docId, position)),
    [update],
  );

  const submit = useCallback(() => {
    if (!prompt.trim()) return;
    const { mermaid, via: how } = respond(prompt);
    update((s) => store.generate(s, canvasId, mermaid));
    setVia(how);
    setPrompt('');
    setPaste(false);
  }, [prompt, canvasId, update]);

  const addBlank = useCallback(() => {
    update((s) => {
      const existing = s.docs[canvasId].canvas.placements.length;
      const [next] = store.createBlank(s, canvasId, 'New doc', {
        x: (existing % 4) * 300,
        y: Math.floor(existing / 4) * 200 - 220,
      });
      return next;
    });
  }, [canvasId, update]);

  const reset = (seeded: boolean) => {
    store.clearSaved();
    const next = seeded ? seedSketchScenario() : store.emptyState();
    setState(next);
    setPath([next.rootId]);
    setSelected(null);
    // tldraw keeps freehand + shapes in IndexedDB under its own keys.
    for (const mode of ['swap', 'spatial'] as const) {
      indexedDB.deleteDatabase(`TLDRAW_DOCUMENT_v2${persistenceKey(mode)}`);
    }
    setTimeout(() => window.location.reload(), 60);
  };

  const tooDeep = mode === 'spatial' && path.length > MAX_SPATIAL_DEPTH;

  return (
    <div style={S.app}>
      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <header style={S.bar}>
        <div style={S.modes}>
          {(['swap', 'spatial'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={S.mode(mode === m)}
              title={m === 'spatial' ? 'Parked — kept for reference, not the direction' : undefined}
            >
              {m === 'swap' ? 'View-swap' : 'Spatial zoom (parked)'}
            </button>
          ))}
        </div>

        <nav style={S.crumbs}>
          <button onClick={() => navigate(state.rootId)} style={S.crumb(false)} title="Home">
            ⌂
          </button>
          {path.map((id, i) => (
            <React.Fragment key={`${id}-${i}`}>
              <span style={S.sep}>/</span>
              <button onClick={() => setPath(path.slice(0, i + 1))} style={S.crumb(i === path.length - 1)}>
                {state.docs[id]?.title ?? id}
              </button>
            </React.Fragment>
          ))}
        </nav>

        <div style={S.right}>
          <button onClick={addBlank} style={S.ghost}>
            + Box
          </button>
          <button onClick={() => setShowGraph(true)} style={S.ghost}>
            Global graph
          </button>
          <button onClick={() => reset(true)} style={S.ghost} title="Reload the sketch scenario">
            Reset · sketches
          </button>
          <button onClick={() => reset(false)} style={S.ghost} title="Start from an empty canvas">
            Reset · empty
          </button>
        </div>
      </header>

      {tooDeep && (
        <div style={S.warn}>
          Spatial nesting is drawn {MAX_SPATIAL_DEPTH} levels deep; this canvas is deeper, so the camera
          has nowhere to go. Switch to View-swap to keep descending — a real limit of the spatial choice,
          not a bug.
        </div>
      )}

      <div style={S.body}>
        <div style={S.canvas}>
          {mode === 'swap' ? (
            <SwapCanvas
              state={state}
              canvasId={canvasId}
              onMove={onMove}
              onOpen={setSelected}
              onDive={dive}
            />
          ) : (
            <SpatialCanvas state={state} path={path} onMove={onMove} onOpen={setSelected} onDive={dive} />
          )}

          {/* ── prompt bar (sketch 01) ─────────────────────────────────── */}
          <div style={S.promptWrap}>
            <div style={S.hints}>
              {CANNED_LABELS.map((label) => (
                <button
                  key={label}
                  onClick={() => {
                    setPrompt(label);
                    setPaste(false);
                  }}
                  style={S.hint}
                >
                  {label}
                </button>
              ))}
            </div>
            {via && <div style={S.via}>{via}</div>}
            {paste ? (
              <textarea
                autoFocus
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={'graph TD\n  A[Sign in] --> B[Auth]'}
                style={S.pasteBox}
              />
            ) : null}
            <div style={S.prompt}>
              <button onClick={() => setPaste((p) => !p)} style={S.pasteToggle} title="Paste Mermaid">
                {paste ? '✕' : '⌥'}
              </button>
              {!paste && (
                <input
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  placeholder={`Create a diagram on “${state.docs[canvasId]?.title ?? ''}”…`}
                  style={S.promptInput}
                />
              )}
              <button onClick={submit} style={S.go}>
                Generate
              </button>
            </div>
          </div>
        </div>

        {selected && state.docs[selected] && (
          <DocPanel
            state={state}
            docId={selected}
            canvasId={canvasId}
            onClose={() => setSelected(null)}
            onTitle={(id, title) => update((s) => store.setTitle(s, id, title))}
            onBody={(id, body) => update((s) => store.setBody(s, id, body))}
            onNavigate={navigate}
            onPlaceExisting={(refId) =>
              update((s) => {
                const n = s.docs[selected].canvas.placements.length;
                return store.placeExisting(s, selected, refId, {
                  x: (n % 3) * 320,
                  y: Math.floor(n / 3) * 220,
                });
              })
            }
            onUnplace={(refId) => update((s) => store.unplace(s, selected, refId))}
          />
        )}
      </div>

      {showGraph && <GlobalGraph state={state} onPick={navigate} onClose={() => setShowGraph(false)} />}
    </div>
  );
}

const S = {
  app: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', fontFamily: 'ui-sans-serif, system-ui, sans-serif' } as React.CSSProperties,
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '7px 12px',
    borderBottom: '1px solid #E2E8F0',
    background: '#fff',
    zIndex: 300,
  } as React.CSSProperties,
  modes: { display: 'flex', border: '1px solid #CBD5E1', borderRadius: 8, overflow: 'hidden' } as React.CSSProperties,
  mode: (on: boolean): React.CSSProperties => ({
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 650,
    border: 'none',
    cursor: 'pointer',
    background: on ? '#0F172A' : '#fff',
    color: on ? '#fff' : '#475569',
  }),
  crumbs: { display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' } as React.CSSProperties,
  crumb: (last: boolean): React.CSSProperties => ({
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: last ? 700 : 450,
    color: last ? '#0F172A' : '#64748B',
    padding: '2px 4px',
    whiteSpace: 'nowrap',
  }),
  sep: { color: '#CBD5E1', fontSize: 12 } as React.CSSProperties,
  right: { display: 'flex', gap: 6 } as React.CSSProperties,
  ghost: {
    padding: '5px 10px',
    fontSize: 12,
    border: '1px solid #CBD5E1',
    borderRadius: 8,
    background: '#fff',
    color: '#475569',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,
  warn: { padding: '7px 14px', background: '#FEF3C7', color: '#92400E', fontSize: 12, borderBottom: '1px solid #FDE68A', zIndex: 300 } as React.CSSProperties,
  body: { flex: 1, display: 'flex', minHeight: 0 } as React.CSSProperties,
  canvas: { flex: 1, position: 'relative', minWidth: 0 } as React.CSSProperties,
  promptWrap: {
    position: 'absolute',
    // Clear of tldraw's own toolbar, which owns the bottom centre.
    bottom: 78,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'min(620px, 78%)',
    zIndex: 250,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    alignItems: 'center',
  } as React.CSSProperties,
  via: { fontSize: 11, color: '#475569', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 20, padding: '2px 10px' } as React.CSSProperties,
  pasteBox: {
    width: '100%',
    height: 110,
    padding: 10,
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    border: '1px solid #CBD5E1',
    borderRadius: 10,
    outline: 'none',
    boxShadow: '0 6px 20px rgba(15,23,42,0.12)',
    boxSizing: 'border-box',
    resize: 'none',
  } as React.CSSProperties,
  prompt: {
    display: 'flex',
    gap: 6,
    width: '100%',
    background: '#fff',
    border: '1px solid #CBD5E1',
    borderRadius: 12,
    padding: 5,
    boxShadow: '0 6px 22px rgba(15,23,42,0.14)',
  } as React.CSSProperties,
  pasteToggle: { width: 32, border: 'none', background: '#F1F5F9', borderRadius: 8, cursor: 'pointer', color: '#475569', fontSize: 13 } as React.CSSProperties,
  promptInput: { flex: 1, border: 'none', outline: 'none', fontSize: 14, padding: '6px 4px' } as React.CSSProperties,
  go: { padding: '7px 15px', border: 'none', borderRadius: 8, background: '#0F172A', color: '#fff', fontSize: 13, fontWeight: 650, cursor: 'pointer' } as React.CSSProperties,
  hints: { display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' } as React.CSSProperties,
  hint: {
    border: '1px solid #E2E8F0',
    background: 'rgba(255,255,255,0.92)',
    borderRadius: 20,
    padding: '3px 10px',
    fontSize: 11,
    color: '#475569',
    cursor: 'pointer',
  } as React.CSSProperties,
};
