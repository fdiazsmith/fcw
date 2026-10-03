import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Doc } from '@fcw/graph-core';
import { emptyChatState, ChatState } from '../chat-store';
import { DocPanel, DocPanelProps } from './DocPanel';

// The TipTap editor has its own tests; here a textarea stands in so the
// panel's wiring (seed + onChange) is observable in jsdom.
vi.mock('./MarkdownEditor', () => ({
  MarkdownEditor: (p: { markdown: string; onChange: (md: string) => void }) => (
    <textarea aria-label="body" value={p.markdown} onChange={(e) => p.onChange(e.target.value)} />
  ),
}));

const doc = (id: string, title: string, body = ''): Doc => ({
  id,
  title,
  body,
  canvas: { placements: [], edges: [] },
});

const stateWith = (over: Partial<ChatState> = {}): ChatState => ({
  ...emptyChatState(),
  docs: { d1: doc('d1', 'Auth', 'Use OAuth.') },
  ...over,
});

const props = (over: Partial<DocPanelProps> = {}): DocPanelProps => ({
  state: stateWith(),
  docId: 'd1',
  onClose: vi.fn(),
  onBodyChange: vi.fn(),
  ...over,
});

describe('DocPanel', () => {
  it('shows the doc title and a body editor seeded from the store', () => {
    render(<DocPanel {...props()} />);
    const panel = screen.getByTestId('doc-panel');
    expect(panel.textContent).toContain('Auth');
    const editor = within(screen.getByTestId('doc-body-editor')).getByLabelText('body') as HTMLTextAreaElement;
    expect(editor.value).toBe('Use OAuth.');
  });

  it('sends body edits and closes', () => {
    const p = props();
    render(<DocPanel {...p} />);
    fireEvent.change(screen.getByLabelText('body'), { target: { value: 'Hand edit' } });
    expect(p.onBodyChange).toHaveBeenCalledWith('Hand edit');
    fireEvent.click(screen.getByTitle('Close'));
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it('renders nothing for an unknown doc', () => {
    render(<DocPanel {...props({ docId: 'gone' })} />);
    expect(screen.queryByTestId('doc-panel')).toBeNull();
  });
});
