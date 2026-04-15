import React, { useState, useEffect, useCallback } from 'react';
import type { GraphDocument } from '@fcw/graph-core';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8009';

export interface DocumentPickerProps {
  onLoad: (doc: GraphDocument) => void;
  onNew: () => void;
  onExportMd?: () => void;
  onExportJson?: () => void;
}

export function DocumentPicker({ onLoad, onNew, onExportMd, onExportJson }: DocumentPickerProps) {
  const [docs, setDocs] = useState<GraphDocument[]>([]);
  const [open, setOpen] = useState(false);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/documents`);
      if (res.ok) setDocs(await res.json());
    } catch {
      // offline
    }
  }, []);

  useEffect(() => {
    if (open) fetchDocs();
  }, [open, fetchDocs]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          background: '#1E293B',
          color: '#E2E8F0',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '6px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          zIndex: 1000,
        }}
        data-testid="doc-picker-toggle"
      >
        Documents
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: 300,
        height: '100vh',
        background: '#0F172A',
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1001,
      }}
      data-testid="doc-picker"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #334155' }}>
        <span style={{ color: '#E2E8F0', fontWeight: 600, fontSize: 14 }}>Documents</span>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 18 }}
        >
          x
        </button>
      </div>

      <div style={{ padding: '8px 16px', display: 'flex', gap: 6 }}>
        <button
          onClick={() => { onNew(); setOpen(false); }}
          style={{
            flex: 1,
            background: '#3B82F6',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 0',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
          data-testid="new-doc-btn"
        >
          New
        </button>
        {onExportMd && (
          <button
            onClick={onExportMd}
            style={{
              background: '#334155',
              color: '#E2E8F0',
              border: 'none',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
            data-testid="export-md-btn"
          >
            .md
          </button>
        )}
        {onExportJson && (
          <button
            onClick={onExportJson}
            style={{
              background: '#334155',
              color: '#E2E8F0',
              border: 'none',
              borderRadius: 6,
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
            data-testid="export-json-btn"
          >
            .json
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {docs.length === 0 && (
          <div style={{ color: '#64748B', padding: '16px', fontSize: 13, textAlign: 'center' }}>
            No saved documents
          </div>
        )}
        {docs.map((doc) => (
          <button
            key={doc.id}
            onClick={() => { onLoad(doc); setOpen(false); }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid #1E293B',
              padding: '10px 16px',
              cursor: 'pointer',
              color: '#E2E8F0',
            }}
            data-testid="doc-item"
          >
            <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.meta.title || 'Untitled'}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
              {new Date(doc.meta.created).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
