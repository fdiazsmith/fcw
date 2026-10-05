import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ArchivedChats } from './ArchivedChats';

afterEach(cleanup);

const chats = [
  { id: 'a', title: 'Alpha' },
  { id: 'b', title: '' },
];

describe('ArchivedChats', () => {
  it('renders nothing when no chat is archived', () => {
    const { container } = render(<ArchivedChats chats={[]} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows the count and lists the chats when opened', () => {
    render(<ArchivedChats chats={chats} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('archived-toggle').textContent).toBe('Archived (2)');
    expect(screen.queryByTestId('archived-list')).toBeNull();
    fireEvent.click(screen.getByTestId('archived-toggle'));
    expect(screen.getAllByTestId('archived-item').map((el) => el.textContent)).toEqual([
      expect.stringContaining('Alpha'),
      expect.stringContaining('New chat'),
    ]);
  });

  it('Restore restores that chat', () => {
    const onRestore = vi.fn();
    render(<ArchivedChats chats={chats} onRestore={onRestore} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTestId('archived-toggle'));
    fireEvent.click(screen.getAllByTestId('archived-restore')[1]);
    expect(onRestore).toHaveBeenCalledWith('b');
  });

  it('Delete asks to confirm inline before deleting; Cancel backs out', () => {
    const onDelete = vi.fn();
    render(<ArchivedChats chats={chats} onRestore={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('archived-toggle'));
    fireEvent.click(screen.getAllByTestId('archived-delete')[0]);
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('archived-delete-cancel'));
    expect(screen.queryByTestId('archived-delete-confirm')).toBeNull();
    fireEvent.click(screen.getAllByTestId('archived-delete')[0]);
    fireEvent.click(screen.getByTestId('archived-delete-confirm'));
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  it('closes once the list empties, so it starts closed next time', () => {
    const p = { onRestore: vi.fn(), onDelete: vi.fn() };
    const { rerender } = render(<ArchivedChats chats={chats} {...p} />);
    fireEvent.click(screen.getByTestId('archived-toggle'));
    rerender(<ArchivedChats chats={[]} {...p} />);
    rerender(<ArchivedChats chats={chats} {...p} />);
    expect(screen.queryByTestId('archived-list')).toBeNull();
  });
});
