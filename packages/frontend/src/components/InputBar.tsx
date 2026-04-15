import React, { useState, useRef, useCallback } from 'react';
import type { WsClient } from '../ws-client';

export interface InputBarProps {
  wsClient: WsClient | null;
}

export function InputBar({ wsClient }: InputBarProps) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || !wsClient) return;
    wsClient.sendMessage({ type: 'user_prompt_submitted', content: trimmed });
    setValue('');
    setSending(true);
    // Reset sending state after short delay (server will create node)
    setTimeout(() => setSending(false), 300);
  }, [value, wsClient]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(600px, 90vw)',
        display: 'flex',
        gap: 8,
        background: '#1E293B',
        borderRadius: 12,
        padding: 8,
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        zIndex: 1000,
      }}
      data-testid="input-bar"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask something..."
        rows={1}
        style={{
          flex: 1,
          background: '#0F172A',
          border: '1px solid #334155',
          borderRadius: 8,
          color: '#E2E8F0',
          padding: '8px 12px',
          fontSize: 14,
          fontFamily: 'inherit',
          resize: 'none',
          outline: 'none',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim() || sending}
        style={{
          background: value.trim() ? '#3B82F6' : '#334155',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '8px 16px',
          fontSize: 14,
          fontWeight: 600,
          cursor: value.trim() ? 'pointer' : 'default',
          opacity: sending ? 0.6 : 1,
        }}
      >
        {sending ? '...' : 'Send'}
      </button>
    </div>
  );
}
