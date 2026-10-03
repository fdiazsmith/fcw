import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectMenu, type ProjectMenuProps } from './ProjectMenu';

const p = (id: string, title: string) => ({ id, title, updatedAt: 't', chatCount: 0, docCount: 0 });
const alpha = p('a', 'Alpha');
const beta = p('b', 'Beta');

function setup(extra: Partial<ProjectMenuProps> = {}) {
  const props: ProjectMenuProps = {
    project: alpha,
    projects: [alpha, beta],
    fallbackLabel: 'Canvas',
    onOpen: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onSaveSettings: vi.fn(),
    onTrash: vi.fn(),
    ...extra,
  };
  render(<ProjectMenu {...props} />);
  return props;
}

const open = () => fireEvent.click(screen.getByTestId('project-menu'));
const titleInput = () => screen.getByTestId('project-title-input') as HTMLInputElement;
const enter = (value: string) => {
  fireEvent.change(titleInput(), { target: { value } });
  fireEvent.keyDown(titleInput(), { key: 'Enter' });
};

describe('ProjectMenu', () => {
  it('shows the project title with a caret, falling back to the label', () => {
    setup();
    expect(screen.getByTestId('project-menu').textContent).toBe('Alpha ▾');
  });

  it('falls back to the label before a project is open', () => {
    setup({ project: undefined });
    expect(screen.getByTestId('project-menu').textContent).toBe('Canvas ▾');
  });

  it('toggles a list of projects; picking another opens it and closes the popover', () => {
    const props = setup();
    expect(screen.queryAllByTestId('project-item')).toHaveLength(0);
    open();
    const items = screen.getAllByTestId('project-item');
    expect(items.map((i) => i.getAttribute('data-project-id'))).toEqual(['a', 'b']);
    fireEvent.click(items[1]);
    expect(props.onOpen).toHaveBeenCalledWith('b');
    expect(screen.queryAllByTestId('project-item')).toHaveLength(0);
  });

  it('New: Enter submits the trimmed title and closes', () => {
    const props = setup();
    open();
    fireEvent.click(screen.getByTestId('project-new'));
    expect(titleInput().value).toBe('');
    enter('  Gamma ');
    expect(props.onCreate).toHaveBeenCalledWith('Gamma');
    expect(screen.queryByTestId('project-title-input')).toBeNull();
  });

  it('rejects an empty or whitespace title', () => {
    const props = setup();
    open();
    fireEvent.click(screen.getByTestId('project-new'));
    enter('   ');
    expect(props.onCreate).not.toHaveBeenCalled();
    expect(screen.getByTestId('project-title-input')).toBeTruthy();
  });

  it('Rename is prefilled with the current title', () => {
    const props = setup();
    open();
    fireEvent.click(screen.getByTestId('project-rename'));
    expect(titleInput().value).toBe('Alpha');
    enter('Alpha 2');
    expect(props.onRename).toHaveBeenCalledWith('a', 'Alpha 2');
  });

  it('Trash asks for confirmation first', () => {
    const props = setup();
    open();
    fireEvent.click(screen.getByTestId('project-trash'));
    expect(props.onTrash).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('project-trash-confirm'));
    expect(props.onTrash).toHaveBeenCalledWith('a');
    expect(screen.queryByTestId('project-trash-confirm')).toBeNull();
  });

  it('Settings: prefilled from the project settings, saved without empty fields', () => {
    const props = setup({ settings: { cwd: '/work', effort: 'high' } });
    open();
    fireEvent.click(screen.getByTestId('project-settings'));
    expect((screen.getByLabelText('Working directory') as HTMLInputElement).value).toBe('/work');
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'opus' } });
    fireEvent.change(screen.getByLabelText('Effort'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('project-settings-save'));
    expect(props.onSaveSettings).toHaveBeenCalledWith('a', { cwd: '/work', model: 'opus' });
    expect(screen.queryByTestId('project-settings-save')).toBeNull();
  });
});
