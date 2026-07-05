import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { CompactCard, CompactCardProps } from './CompactCard';

const props = (over: Partial<CompactCardProps> = {}): CompactCardProps => ({
  title: 'Auth research',
  document: '# Notes\n\nUse OAuth.',
  memberCount: 3,
  stale: false,
  generating: false,
  editable: false,
  onEnter: vi.fn(),
  onRegenerate: vi.fn(),
  onDocumentChange: vi.fn(),
  ...over,
});

afterEach(() => vi.useRealTimers());

describe('CompactCard', () => {
  it('renders the title, member count and rich document', async () => {
    render(<CompactCard {...props()} />);
    expect(screen.getByText('Auth research')).toBeDefined();
    expect(screen.getByText(/3 chats/)).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Notes' })).toBeDefined();
    expect(screen.getByText('Use OAuth.')).toBeDefined();
  });

  it('the open button enters the compaction', () => {
    const onEnter = vi.fn();
    render(<CompactCard {...props({ onEnter })} />);
    fireEvent.click(screen.getByTitle(/open compacted chats/i));
    expect(onEnter).toHaveBeenCalledOnce();
  });

  it('hides the regenerate button while the document is fresh', () => {
    render(<CompactCard {...props({ stale: false })} />);
    expect(screen.queryByText(/regenerate/i)).toBeNull();
  });

  it('offers regeneration when the inner chats changed', () => {
    const onRegenerate = vi.fn();
    render(<CompactCard {...props({ stale: true, onRegenerate })} />);
    const button = screen.getByText(/regenerate/i);
    fireEvent.click(button);
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('shows a generating indicator instead of the regenerate button', () => {
    render(<CompactCard {...props({ stale: true, generating: true })} />);
    expect(screen.getByText(/generating/i)).toBeDefined();
    expect(screen.queryByText(/regenerate/i)).toBeNull();
  });

  it('debounces edits into onDocumentChange as markdown', async () => {
    vi.useFakeTimers();
    const onDocumentChange = vi.fn();
    let editor: Editor | null = null;
    render(
      <CompactCard
        {...props({ editable: true, onDocumentChange })}
        editorRef={(e) => (editor = e)}
      />,
    );
    expect(editor).not.toBeNull();
    act(() => {
      editor!.commands.insertContentAt(editor!.state.doc.content.size, ' Decided.');
    });
    expect(onDocumentChange).not.toHaveBeenCalled(); // debounced
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onDocumentChange).toHaveBeenCalledOnce();
    expect(onDocumentChange.mock.calls[0][0]).toContain('Decided.');
    expect(onDocumentChange.mock.calls[0][0]).toContain('# Notes');
  });

  it('applies external document updates when not focused', async () => {
    const p = props();
    const { rerender } = render(<CompactCard {...p} />);
    await screen.findByRole('heading', { name: 'Notes' });
    rerender(<CompactCard {...p} document={'# Revised\n\nNew text.'} />);
    expect(await screen.findByRole('heading', { name: 'Revised' })).toBeDefined();
    expect(screen.getByText('New text.')).toBeDefined();
  });
});
