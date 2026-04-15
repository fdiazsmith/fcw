import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { WsClient } from '../ws-client';

export interface BranchInputProps {
  fromNodeId: string;
  wsClient: WsClient | null;
  onClose: () => void;
  position: { x: number; y: number };
}

export function BranchInput({ fromNodeId, wsClient, onClose, position }: BranchInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || !wsClient) return;
    wsClient.sendMessage({
      type: 'branch_requested',
      fromNodeId,
      content: trimmed,
    });
    onClose();
  }, [value, wsClient, fromNodeId, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [handleSubmit, onClose],
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 999,
        display: 'flex',
        gap: 4,
        background: '#1E293B',
        borderRadius: 8,
        padding: 6,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
      data-testid="branch-input"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Branch prompt..."
        style={{
          width: 240,
          background: '#0F172A',
          border: '1px solid #334155',
          borderRadius: 6,
          color: '#E2E8F0',
          padding: '6px 10px',
          fontSize: 13,
          outline: 'none',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        style={{
          background: value.trim() ? '#3B82F6' : '#334155',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          padding: '6px 12px',
          fontSize: 13,
          cursor: value.trim() ? 'pointer' : 'default',
        }}
      >
        Branch
      </button>
    </div>
  );
}
