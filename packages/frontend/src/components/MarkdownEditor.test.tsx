import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { MarkdownEditor, MarkdownEditorProps } from './MarkdownEditor';

// Moved from CompactCard.test.tsx (M3.6): the TipTap editor outlives the
// compaction card and is reused by the doc panel (M4.1).

const props = (over: Partial<MarkdownEditorProps> = {}): MarkdownEditorProps => ({
  markdown: '# Notes\n\nUse OAuth.',
  editable: false,
  onChange: vi.fn(),
  ...over,
});

afterEach(() => vi.useRealTimers());

describe('MarkdownEditor', () => {
  it('renders the markdown as rich text', async () => {
    render(<MarkdownEditor {...props()} />);
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeDefined();
    expect(screen.getByText('Use OAuth.')).toBeDefined();
  });

  it('debounces edits into onChange as markdown', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    let editor: Editor | null = null;
    render(<MarkdownEditor {...props({ editable: true, onChange })} editorRef={(e) => (editor = e)} />);
    expect(editor).not.toBeNull();
    act(() => {
      editor!.commands.insertContentAt(editor!.state.doc.content.size, ' Decided.');
    });
    expect(onChange).not.toHaveBeenCalled(); // debounced
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0]).toContain('Decided.');
    expect(onChange.mock.calls[0][0]).toContain('# Notes');
  });

  it('applies external markdown updates when not focused', async () => {
    const p = props();
    const { rerender } = render(<MarkdownEditor {...p} />);
    await screen.findByRole('heading', { name: 'Notes' });
    rerender(<MarkdownEditor {...p} markdown={'# Revised\n\nNew text.'} />);
    expect(await screen.findByRole('heading', { name: 'Revised' })).toBeDefined();
    expect(screen.getByText('New text.')).toBeDefined();
  });
});
