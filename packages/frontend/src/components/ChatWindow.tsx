import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatView } from '../chat-store';

export interface ChatWindowProps {
  chat: ChatView;
  onSend: (content: string) => void;
}

/** Presentational chat UI. Lives inside a tldraw shape, but knows nothing about tldraw. */
export function ChatWindow({ chat, onSend }: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const streaming = chat.streamingText !== null;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.streamingText]);

  const submit = () => {
    const content = draft.trim();
    if (!content || streaming) return;
    onSend(content);
    setDraft('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid #E2E8F0',
          fontWeight: 600,
          color: '#334155',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {chat.title || 'New chat'}
      </div>

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {chat.messages.map((m, i) => (
          <div
            key={i}
            data-role={m.role}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '6px 10px',
              borderRadius: 10,
              background: m.role === 'user' ? '#3B82F6' : '#F1F5F9',
              color: m.role === 'user' ? '#fff' : '#0F172A',
            }}
          >
            {m.role === 'assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
          </div>
        ))}
        {streaming && (
          <div
            data-streaming="true"
            style={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              padding: '6px 10px',
              borderRadius: 10,
              background: '#F1F5F9',
              color: '#0F172A',
              opacity: 0.9,
            }}
          >
            <ReactMarkdown>{chat.streamingText || '…'}</ReactMarkdown>
          </div>
        )}
        {chat.error && (
          <div style={{ color: '#DC2626', fontSize: 12 }}>Error: {chat.error}</div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #E2E8F0', padding: 8 }}>
        <textarea
          value={draft}
          disabled={streaming}
          placeholder="Message…"
          rows={2}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          style={{
            width: '100%',
            resize: 'none',
            border: '1px solid #CBD5E1',
            borderRadius: 8,
            padding: '6px 8px',
            font: 'inherit',
            boxSizing: 'border-box',
            background: streaming ? '#F8FAFC' : '#fff',
          }}
        />
      </div>
    </div>
  );
}
