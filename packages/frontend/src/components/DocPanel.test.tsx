import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Doc } from '@fcw/graph-core';
import { emptyChatState, ChatState, ChatView } from '../chat-store';
import { registerChatActions, ChatActions } from '../shapes/ChatShape';
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
  onRequestChat: vi.fn(),
  ...over,
});

const chatView = (over: Partial<ChatView> = {}): ChatView => ({
  id: 'c1',
  title: 'Auth chat',
  position: { x: 0, y: 0 },
  messages: [],
  streamingText: null,
  error: null,
  settings: { engine: 'api' },
  pendingPermission: null,
  pendingPermissionQueue: [],
  usage: null,
  contextChats: 0,
  ...over,
});

const withDocChat = (over: Partial<ChatView> = {}) =>
  stateWith({
    chats: { c1: chatView(over) },
    docChats: { d1: 'c1' },
    capabilities: { models: [{ id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' }], commands: [] },
  });

const mockActions = (): ChatActions => ({
  sendPrompt: vi.fn(),
  requestBranch: vi.fn(),
  stopStream: vi.fn(),
  regenerate: vi.fn(),
  updateSettings: vi.fn(),
  permissionDecision: vi.fn(),
  uploadAttachment: vi.fn(),
  listDirs: vi.fn(),
  compact: vi.fn(),
});

afterEach(() => registerChatActions(null));

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

describe('DocPanel doc-chat', () => {
  it('requests a doc-chat when the doc has none', () => {
    const p = props();
    render(<DocPanel {...p} />);
    expect(p.onRequestChat).toHaveBeenCalledOnce();
    expect(screen.queryByPlaceholderText('Message…')).toBeNull();
  });

  it('mounts the real ChatWindow bound to the doc-chat, through the canvas chat actions', () => {
    const actions = mockActions();
    registerChatActions(actions);
    const p = props({ state: withDocChat({ settings: { engine: 'agent' } }) });
    render(<DocPanel {...p} />);
    expect(p.onRequestChat).not.toHaveBeenCalled();

    const composer = screen.getByPlaceholderText('Message…');
    fireEvent.change(composer, { target: { value: 'write it' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(actions.sendPrompt).toHaveBeenCalledWith('c1', 'write it');

    // Capabilities flow through: the model dropdown lists the server's models.
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'claude-opus-4-8' } });
    expect(actions.updateSettings).toHaveBeenCalledWith('c1', { model: 'claude-opus-4-8' });
  });
});
