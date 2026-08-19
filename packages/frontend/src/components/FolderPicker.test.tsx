import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FolderPicker, type DirListing } from './FolderPicker';

const listing = (path: string, dirs: string[]): DirListing => ({
  path,
  parent: path.split('/').slice(0, -1).join('/') || '/',
  dirs: dirs.map((name) => ({ name, path: `${path}/${name}` })),
});

describe('FolderPicker', () => {
  it('shows the folder name of the current value, or a placeholder', () => {
    const { rerender } = render(
      <FolderPicker value="/Users/me/projects/fcw" onSelect={() => {}} listDirs={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /working directory/i }).textContent).toContain('fcw');
    rerender(<FolderPicker value={undefined} onSelect={() => {}} listDirs={vi.fn()} />);
    expect(screen.getByRole('button', { name: /working directory/i }).textContent).toContain('cwd');
  });

  it('opens a browser at the current value and lists directories', async () => {
    const listDirs = vi.fn().mockResolvedValue(listing('/home/me', ['projects', 'work']));
    render(<FolderPicker value="/home/me" onSelect={() => {}} listDirs={listDirs} />);
    fireEvent.click(screen.getByRole('button', { name: /working directory/i }));
    await waitFor(() => expect(screen.getByText('projects')).toBeTruthy());
    expect(listDirs).toHaveBeenCalledWith('/home/me');
    expect(screen.getByText('work')).toBeTruthy();
  });

  it('navigates into a subdirectory and up to the parent', async () => {
    const listDirs = vi
      .fn()
      .mockResolvedValueOnce(listing('/home/me', ['projects']))
      .mockResolvedValueOnce(listing('/home/me/projects', ['fcw']))
      .mockResolvedValueOnce(listing('/home/me', ['projects']));
    render(<FolderPicker value="/home/me" onSelect={() => {}} listDirs={listDirs} />);
    fireEvent.click(screen.getByRole('button', { name: /working directory/i }));
    await waitFor(() => screen.getByText('projects'));
    fireEvent.click(screen.getByText('projects'));
    await waitFor(() => screen.getByText('fcw'));
    expect(listDirs).toHaveBeenLastCalledWith('/home/me/projects');
    fireEvent.click(screen.getByRole('button', { name: /up one level/i }));
    await waitFor(() => screen.getByText('projects'));
    expect(listDirs).toHaveBeenLastCalledWith('/home/me');
  });

  it('selects the browsed directory and closes', async () => {
    const onSelect = vi.fn();
    const listDirs = vi.fn().mockResolvedValue(listing('/home/me', ['projects']));
    render(<FolderPicker value="/home/me" onSelect={onSelect} listDirs={listDirs} />);
    fireEvent.click(screen.getByRole('button', { name: /working directory/i }));
    await waitFor(() => screen.getByText('projects'));
    fireEvent.click(screen.getByRole('button', { name: /use this folder/i }));
    expect(onSelect).toHaveBeenCalledWith('/home/me');
    expect(screen.queryByRole('button', { name: /use this folder/i })).toBeNull();
  });

  it('shows an error when listing fails', async () => {
    const listDirs = vi.fn().mockRejectedValue(new Error('server down'));
    render(<FolderPicker value={undefined} onSelect={() => {}} listDirs={listDirs} />);
    fireEvent.click(screen.getByRole('button', { name: /working directory/i }));
    await waitFor(() => expect(screen.getByText(/server down/)).toBeTruthy());
  });
});
