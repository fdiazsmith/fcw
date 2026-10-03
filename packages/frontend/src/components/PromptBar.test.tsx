import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromptBar } from './PromptBar';

const type = (text: string) => fireEvent.change(screen.getByTestId('prompt-bar'), { target: { value: text } });
const press = (key: string, shiftKey = false) => fireEvent.keyDown(screen.getByTestId('prompt-bar'), { key, shiftKey });

describe('PromptBar', () => {
  it('starts in chat mode', () => {
    render(<PromptBar onSubmit={vi.fn()} />);
    expect(screen.getByTestId('prompt-mode-chat').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('prompt-mode-diagram').getAttribute('aria-pressed')).toBe('false');
  });

  it('Enter submits the text with the current mode and clears the bar', () => {
    const onSubmit = vi.fn();
    render(<PromptBar onSubmit={onSubmit} />);
    type('hello');
    press('Enter');
    expect(onSubmit).toHaveBeenCalledWith('chat', 'hello');
    expect((screen.getByTestId('prompt-bar') as HTMLTextAreaElement).value).toBe('');
  });

  it('Shift+Enter does not submit (newline)', () => {
    const onSubmit = vi.fn();
    render(<PromptBar onSubmit={onSubmit} />);
    type('line one');
    press('Enter', true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('diagram mode submits as a diagram, keeping multi-line text', () => {
    const onSubmit = vi.fn();
    render(<PromptBar onSubmit={onSubmit} />);
    fireEvent.click(screen.getByTestId('prompt-mode-diagram'));
    expect(screen.getByTestId('prompt-mode-diagram').getAttribute('aria-pressed')).toBe('true');
    type('graph TD\n  A --> B');
    press('Enter');
    expect(onSubmit).toHaveBeenCalledWith('diagram', 'graph TD\n  A --> B');
  });

  it('blank input does not submit', () => {
    const onSubmit = vi.fn();
    render(<PromptBar onSubmit={onSubmit} />);
    type('   ');
    press('Enter');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
