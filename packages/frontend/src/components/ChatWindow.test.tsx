import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatWindow } from './ChatWindow';
import type { ChatView } from '../chat-store';

const view = (over: Partial<ChatView> = {}): ChatView => ({
  id: 'c1',
  title: 'My chat',
  position: { x: 0, y: 0 },
  messages: [],
  streamingText: null,
  error: null,
  ...over,
});

describe('ChatWindow', () => {
  it('renders transcript messages with role styling', () => {
    render(
      <ChatWindow
        chat={view({
          messages: [
            { role: 'user', content: 'hi there', createdAt: 't1' },
            { role: 'assistant', content: 'hello back', createdAt: 't2' },
          ],
        })}
        onSend={() => {}}
      />,
    );
    expect(screen.getByText('hi there')).toBeTruthy();
    expect(screen.getByText('hello back')).toBeTruthy();
    expect(screen.getByText('hi there').closest('[data-role="user"]')).toBeTruthy();
    expect(screen.getByText('hello back').closest('[data-role="assistant"]')).toBeTruthy();
  });

  it('renders the live streaming bubble', () => {
    render(<ChatWindow chat={view({ streamingText: 'typing…' })} onSend={() => {}} />);
    expect(screen.getByText('typing…').closest('[data-streaming="true"]')).toBeTruthy();
  });

  it('submits input on Enter, then clears it', () => {
    const onSend = vi.fn();
    render(<ChatWindow chat={view()} onSend={onSend} />);
    const input = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'a question' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledWith('a question');
    expect(input.value).toBe('');
  });

  it('Shift+Enter does not submit, empty input does not submit', () => {
    const onSend = vi.fn();
    render(<ChatWindow chat={view()} onSend={onSend} />);
    const input = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'line' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input while streaming and shows errors', () => {
    render(
      <ChatWindow chat={view({ streamingText: 'x', error: null })} onSend={() => {}} />,
    );
    expect((screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement).disabled).toBe(true);

    render(<ChatWindow chat={view({ error: 'boom' })} onSend={() => {}} />);
    expect(screen.getByText(/boom/)).toBeTruthy();
  });

  it('renders markdown in assistant messages', () => {
    render(
      <ChatWindow
        chat={view({ messages: [{ role: 'assistant', content: '**bold** word', createdAt: 't' }] })}
        onSend={() => {}}
      />,
    );
    expect(screen.getByText('bold').tagName).toBe('STRONG');
  });
});
