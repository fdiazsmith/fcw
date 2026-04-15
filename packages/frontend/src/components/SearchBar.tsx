import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Editor } from 'tldraw';
import type { GraphDocument } from '@fcw/graph-core';
import { searchNodes, SearchResult } from '../search';

export interface SearchBarProps {
  editor: Editor | null;
  doc: GraphDocument;
}

function makeShapeId(nodeId: string) {
  return `shape:${nodeId}` as `shape:${string}`;
}

export function SearchBar({ editor, doc }: SearchBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Cmd+F to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
        setResults([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Update results on query change
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    setResults(searchNodes(doc, query));
  }, [query, doc]);

  // Highlight matching nodes on canvas
  useEffect(() => {
    if (!editor) return;
    const matchIds = new Set(results.map((r) => r.nodeId));
    const shapes = editor.getCurrentPageShapes();

    editor.batch(() => {
      for (const shape of shapes) {
        if (shape.type !== 'graph-node') continue;
        const nodeId = shape.id.replace('shape:', '');
        const isMatch = matchIds.has(nodeId);
        // Use opacity to dim non-matching when search active
        if (query && results.length > 0) {
          editor.updateShape({
            id: shape.id,
            type: 'graph-node',
            opacity: isMatch ? 1 : 0.3,
          });
        } else {
          editor.updateShape({
            id: shape.id,
            type: 'graph-node',
            opacity: 1,
          });
        }
      }
    });
  }, [editor, results, query]);

  const panToNode = useCallback(
    (nodeId: string) => {
      if (!editor) return;
      const shapeId = makeShapeId(nodeId);
      const shape = editor.getShape(shapeId);
      if (shape) {
        editor.centerOnPoint({ x: shape.x + 140, y: shape.y + 100 });
        editor.select(shapeId);
      }
    },
    [editor],
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(500px, 90vw)',
        background: '#1E293B',
        borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        zIndex: 1001,
        overflow: 'hidden',
      }}
      data-testid="search-bar"
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search nodes..."
        style={{
          width: '100%',
          background: '#0F172A',
          border: 'none',
          borderBottom: '1px solid #334155',
          color: '#E2E8F0',
          padding: '12px 16px',
          fontSize: 14,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {results.length > 0 && (
        <div style={{ maxHeight: 240, overflow: 'auto' }}>
          {results.map((r) => (
            <div
              key={r.nodeId}
              onClick={() => panToNode(r.nodeId)}
              style={{
                padding: '8px 16px',
                color: '#CBD5E1',
                fontSize: 13,
                cursor: 'pointer',
                borderBottom: '1px solid #1E293B',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <strong style={{ color: '#94A3B8', marginRight: 8 }}>{r.nodeId}</strong>
              {r.content.slice(0, 80)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
