import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatWindow } from './ChatWindow';
import type { ChatView, Capabilities } from '../chat-store';

const view = (over: Partial<ChatView> = {}): ChatView => ({
  id: 'c1',
  title: 'My chat',
  position: { x: 0, y: 0 },
  messages: [],
  streamingText: null,
  error: null,
  settings: { engine: 'api' },
  pendingPermission: null,
  ...over,
});

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  models: [{ id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' }],
  commands: [{ name: 'review', description: 'review a PR' }],
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

  it('shows a Stop button while streaming and calls onStop', () => {
    const onStop = vi.fn();
    render(<ChatWindow chat={view({ streamingText: 'typing…' })} onSend={() => {}} onStop={onStop} />);
    const stop = screen.getByRole('button', { name: /stop/i });
    fireEvent.click(stop);
    expect(onStop).toHaveBeenCalled();
  });

  it('does not show a Stop button when not streaming', () => {
    render(<ChatWindow chat={view()} onSend={() => {}} onStop={() => {}} />);
    expect(screen.queryByRole('button', { name: /stop/i })).toBeNull();
  });

  it('shows a Regenerate button when last message is assistant and not streaming', () => {
    const onRegenerate = vi.fn();
    render(
      <ChatWindow
        chat={view({
          messages: [
            { role: 'user', content: 'q', createdAt: 't1' },
            { role: 'assistant', content: 'a', createdAt: 't2' },
          ],
        })}
        onSend={() => {}}
        onRegenerate={onRegenerate}
      />,
    );
    const regen = screen.getByRole('button', { name: /regenerate/i });
    fireEvent.click(regen);
    expect(onRegenerate).toHaveBeenCalled();
  });

  it('hides Regenerate when last message is not assistant or while streaming', () => {
    const { rerender } = render(
      <ChatWindow
        chat={view({ messages: [{ role: 'user', content: 'q', createdAt: 't1' }] })}
        onSend={() => {}}
        onRegenerate={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull();
    rerender(
      <ChatWindow
        chat={view({
          messages: [{ role: 'assistant', content: 'a', createdAt: 't2' }],
          streamingText: 'x',
        })}
        onSend={() => {}}
        onRegenerate={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /regenerate/i })).toBeNull();
  });

  it('quotes a message into the draft as a markdown blockquote', () => {
    render(
      <ChatWindow
        chat={view({ messages: [{ role: 'assistant', content: 'line one\nline two', createdAt: 't' }] })}
        onSend={() => {}}
      />,
    );
    const quote = screen.getByRole('button', { name: /quote/i });
    fireEvent.click(quote);
    const input = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
    expect(input.value).toBe('> line one\n> line two\n\n');
  });

  it('quoting preserves an existing draft', () => {
    render(
      <ChatWindow
        chat={view({ messages: [{ role: 'user', content: 'hello', createdAt: 't' }] })}
        onSend={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'my reply' } });
    fireEvent.click(screen.getByRole('button', { name: /quote/i }));
    expect(input.value).toBe('> hello\n\nmy reply');
  });

  it('renders tool messages as a distinct callout', () => {
    render(
      <ChatWindow
        chat={view({ messages: [{ role: 'tool', content: 'ran tool', createdAt: 't' }] })}
        onSend={() => {}}
      />,
    );
    const el = screen.getByText('ran tool').closest('[data-role="tool"]');
    expect(el).toBeTruthy();
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

  it('toolbar changes engine and (in agent mode) model via onUpdateSettings', () => {
    const onUpdateSettings = vi.fn();
    const { rerender } = render(
      <ChatWindow chat={view()} capabilities={caps()} onSend={() => {}} onUpdateSettings={onUpdateSettings} />,
    );
    fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'agent' } });
    expect(onUpdateSettings).toHaveBeenCalledWith({ engine: 'agent' });
    // now render in agent mode so the model dropdown appears
    rerender(
      <ChatWindow
        chat={view({ settings: { engine: 'agent' } })}
        capabilities={caps()}
        onSend={() => {}}
        onUpdateSettings={onUpdateSettings}
      />,
    );
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'claude-opus-4-8' } });
    expect(onUpdateSettings).toHaveBeenCalledWith({ model: 'claude-opus-4-8' });
  });

  it('falls back to a free-text model input when no capabilities are loaded', () => {
    render(
      <ChatWindow chat={view({ settings: { engine: 'agent' } })} onSend={() => {}} onUpdateSettings={() => {}} />,
    );
    const model = screen.getByLabelText('Model') as HTMLInputElement;
    expect(model.tagName).toBe('INPUT');
  });

  it('permission banner renders and Allow/Deny call onPermissionDecision', () => {
    const onPermissionDecision = vi.fn();
    render(
      <ChatWindow
        chat={view({ pendingPermission: { requestId: 'r1', toolName: 'Bash', input: { command: 'ls' } } })}
        onSend={() => {}}
        onPermissionDecision={onPermissionDecision}
      />,
    );
    expect(screen.getByTestId('permission-banner')).toBeTruthy();
    expect(screen.getByText('Bash')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /allow/i }));
    expect(onPermissionDecision).toHaveBeenCalledWith('r1', 'allow');
    fireEvent.click(screen.getByRole('button', { name: /deny/i }));
    expect(onPermissionDecision).toHaveBeenCalledWith('r1', 'deny');
  });

  it('shows a slash-command popup and inserts the selected command', () => {
    render(<ChatWindow chat={view()} capabilities={caps()} onSend={() => {}} />);
    const input = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '/rev' } });
    const popup = screen.getByTestId('command-popup');
    expect(popup).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /\/review/ }));
    expect(input.value).toBe('/review ');
  });

  it('uploads an attachment, renders a chip, and sends its id', async () => {
    const onSend = vi.fn();
    const uploadAttachment = vi
      .fn()
      .mockResolvedValue({ id: 'a1', name: 'pic.png', mediaType: 'image/png', path: '/d/a1.png' });
    render(<ChatWindow chat={view()} onSend={onSend} uploadAttachment={uploadAttachment} />);
    const fileInput = screen.getByLabelText('File input') as HTMLInputElement;
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(uploadAttachment).toHaveBeenCalledWith(file);
    await screen.findByText(/pic\.png/);

    const input = screen.getByPlaceholderText(/message/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'about this' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('about this', ['a1']));
  });

  it('renders a tool message with its name and collapsed input', () => {
    render(
      <ChatWindow
        chat={view({
          messages: [
            {
              role: 'tool',
              content: '→ Read',
              createdAt: 't',
              toolUseId: 'tu1',
              toolName: 'Read',
              toolInput: { path: '/x' },
            },
          ],
        })}
        onSend={() => {}}
      />,
    );
    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.getByText(/"path": "\/x"/)).toBeTruthy();
  });
});
