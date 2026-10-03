import React from 'react';
import type { ChatState } from '../chat-store';
import { MarkdownEditor } from './MarkdownEditor';

export interface DocPanelProps {
  state: ChatState;
  docId: string;
  onClose: () => void;
  /** Debounced hand edits of the body, as markdown. */
  onBodyChange: (body: string) => void;
}

/** Side panel for the selected doc (MERMAID-DOCS.md § Doc-chat placement). */
export function DocPanel({ state, docId, onClose, onBodyChange }: DocPanelProps) {
  const doc = state.docs[docId];
  if (!doc) return null;

  return (
    <aside
      data-testid="doc-panel"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        zIndex: 1002,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderLeft: '1px solid #E2E8F0',
        boxShadow: '-4px 0 16px rgba(15,23,42,0.08)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid #E2E8F0',
        }}
      >
        <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{doc.title}</span>
        <button
          onClick={onClose}
          title="Close"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#64748B' }}
        >
          ✕
        </button>
      </header>
      <section style={{ flex: '0 1 auto', maxHeight: '40%', overflow: 'auto', padding: '8px 12px', fontSize: 13 }}>
        <div data-testid="doc-body-editor">
          {/* Remount per doc so a pending debounced edit never lands on another doc. */}
          <MarkdownEditor key={docId} markdown={doc.body} editable onChange={onBodyChange} />
        </div>
      </section>
    </aside>
  );
}
