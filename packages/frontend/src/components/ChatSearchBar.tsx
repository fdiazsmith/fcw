import React, { useMemo, useState } from 'react';
import type { ChatState } from '../chat-store';
import { searchChats } from '../chat-search';

export interface ChatSearchBarProps {
  /** Provider of the current chat state (read on each keystroke). */
  getState: () => ChatState;
  /** Called with the chatId of a clicked result. */
  onSelect: (chatId: string) => void;
}

/** Top-left search overlay: type to search across all chats, click to jump. */
export function ChatSearchBar({ getState, onSelect }: ChatSearchBarProps) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const results = useMemo(() => searchChats(getState(), query), [getState, query]);
  const showResults = focused && query.trim().length > 0;

  return (
    <div
      data-testid="chat-search-bar"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 1000,
        width: 280,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        // Delay so a result click registers before the dropdown unmounts.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search chats…"
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 12px',
          borderRadius: 8,
          border: '1px solid #CBD5E1',
          background: '#fff',
          fontSize: 13,
          boxShadow: '0 1px 4px rgba(15,23,42,0.1)',
        }}
      />
      {showResults && (
        <div
          data-testid="chat-search-results"
          style={{
            marginTop: 4,
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(15,23,42,0.14)',
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#94A3B8' }}>
              No matches
            </div>
          ) : (
            results.map((r) => (
              <button
                key={r.chatId}
                data-testid="chat-search-result"
                onMouseDown={(e) => {
                  // mousedown fires before input blur — keeps focus logic simple
                  e.preventDefault();
                  onSelect(r.chatId);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  borderBottom: '1px solid #F1F5F9',
                  background: '#fff',
                  padding: '8px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  {r.title || 'New chat'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#64748B',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.snippet}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
