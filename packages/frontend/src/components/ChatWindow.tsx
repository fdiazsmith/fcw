import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatView } from '../chat-store';

export interface ChatWindowProps {
  chat: ChatView;
  onSend: (content: string) => void;
  onStop?: () => void;
  onRegenerate?: () => void;
}

/** Prefixes text as a markdown blockquote: '> line' per line, then a blank line. */
function asBlockquote(content: string): string {
  return content.split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
}

/** Presentational chat UI. Lives inside a tldraw shape, but knows nothing about tldraw. */
export function ChatWindow({ chat, onSend, onStop, onRegenerate }: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const streaming = chat.streamingText !== null;
  const lastMessage = chat.messages[chat.messages.length - 1];
  const canRegenerate = !streaming && lastMessage?.role === 'assistant';

  const quote = (content: string) => setDraft((prev) => asBlockquote(content) + prev);

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
        {chat.messages.map((m, i) => {
          const isTool = m.role === 'tool';
          const isUser = m.role === 'user';
          return (
            <div
              key={i}
              data-role={m.role}
              className="fcw-message"
              style={{
                position: 'relative',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '6px 10px',
                borderRadius: isTool ? 4 : 10,
                background: isTool ? '#FFFBEB' : isUser ? '#3B82F6' : '#F1F5F9',
                color: isTool ? '#92400E' : isUser ? '#fff' : '#0F172A',
                borderLeft: isTool ? '3px solid #F59E0B' : undefined,
                fontFamily: isTool
                  ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
                  : undefined,
                whiteSpace: isTool ? 'pre-wrap' : undefined,
                fontSize: isTool ? 12 : undefined,
              }}
            >
              {m.role === 'assistant' ? <ReactMarkdown>{m.content}</ReactMarkdown> : m.content}
              <button
                type="button"
                aria-label="Quote this message"
                title="Quote"
                onClick={() => quote(m.content)}
                className="fcw-quote-btn"
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  height: 18,
                  padding: '0 6px',
                  borderRadius: 9,
                  border: '1px solid #CBD5E1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 10,
                  lineHeight: '16px',
                  cursor: 'pointer',
                }}
              >
                quote
              </button>
            </div>
          );
        })}
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
        {(streaming || canRegenerate) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            {streaming && (
              <button
                type="button"
                onClick={() => onStop?.()}
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  background: '#fff',
                  color: '#DC2626',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Stop
              </button>
            )}
            {canRegenerate && (
              <button
                type="button"
                onClick={() => onRegenerate?.()}
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Regenerate
              </button>
            )}
          </div>
        )}
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
