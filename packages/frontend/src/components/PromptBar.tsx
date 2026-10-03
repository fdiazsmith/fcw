import React, { useState } from 'react';

export type PromptMode = 'chat' | 'diagram';

export interface PromptBarProps {
  onSubmit: (mode: PromptMode, text: string) => void;
}

const MODES: { mode: PromptMode; label: string }[] = [
  { mode: 'chat', label: 'Chat' },
  { mode: 'diagram', label: 'Diagram' },
];

/** Canvas-level prompt bar (bottom centre). Enter submits, Shift+Enter is a newline. */
export function PromptBar({ onSubmit }: PromptBarProps) {
  const [mode, setMode] = useState<PromptMode>('chat');
  const [text, setText] = useState('');

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit(mode, text);
    setText('');
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 8,
        background: '#fff',
        border: '1px solid #CBD5E1',
        borderRadius: 12,
        padding: 8,
        boxShadow: '0 2px 10px rgba(15,23,42,0.12)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', gap: 4 }}>
        {MODES.map(({ mode: m, label }) => (
          <button
            key={m}
            data-testid={`prompt-mode-${m}`}
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid #CBD5E1',
              background: mode === m ? '#0F172A' : '#fff',
              color: mode === m ? '#fff' : '#334155',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        data-testid="prompt-bar"
        value={text}
        rows={1}
        placeholder={mode === 'chat' ? 'Ask in a new chat…' : 'Describe a diagram, or paste Mermaid…'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        style={{
          width: 420,
          resize: 'none',
          border: 'none',
          outline: 'none',
          fontSize: 14,
          fontFamily: 'inherit',
          padding: '6px 4px',
        }}
      />
    </div>
  );
}
