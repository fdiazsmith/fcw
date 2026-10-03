import React, { useEffect } from 'react';
import type { ChatState } from '../chat-store';
import { docChatBinding } from '../doc-panel-model';
import { chatActions } from '../shapes/ChatShape';
import { ChatWindow } from './ChatWindow';
import { MarkdownEditor } from './MarkdownEditor';

export interface DocPanelProps {
  state: ChatState;
  docId: string;
  onClose: () => void;
  /** Debounced hand edits of the body, as markdown. */
  onBodyChange: (body: string) => void;
  /** The doc has no doc-chat yet: ask the server for one (`doc_chat_requested`). */
  onRequestChat: () => void;
}

const notConnected = () => Promise.reject(new Error('not connected'));

/** Side panel for the selected doc (MERMAID-DOCS.md § Doc-chat placement). */
export function DocPanel({ state, docId, onClose, onBodyChange, onRequestChat }: DocPanelProps) {
  const doc = state.docs[docId];
  const { chat, needsRequest } = docChatBinding(state, docId);
  const caps = state.capabilities;
  const hasCaps = caps.models.length > 0 || caps.commands.length > 0;

  const exists = !!doc;
  // Once per doc while its doc-chat is missing; the reply fills docChats.
  useEffect(() => {
    if (exists && needsRequest) onRequestChat();
  }, [docId, exists, needsRequest]);

  if (!doc) return null;

  return (
    <aside
      data-testid="doc-panel"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
        zIndex: 1002,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        borderLeft: '1px solid #E2E8F0',
        boxShadow: '-4px 0 16px rgba(15,23,42,0.08)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          borderBottom: '1px solid #E2E8F0',
        }}
      >
        <span style={{ flex: 1, fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{doc.title}</span>
        <button
          onClick={onClose}
          title="Close"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: '#64748B' }}
        >
          ✕
        </button>
      </header>
      <section style={{ flex: '0 1 auto', maxHeight: '40%', overflow: 'auto', padding: '8px 12px', fontSize: 13 }}>
        <div data-testid="doc-body-editor">
          {/* Remount per doc so a pending debounced edit never lands on another doc. */}
          <MarkdownEditor key={docId} markdown={doc.body} editable onChange={onBodyChange} />
        </div>
      </section>
      <section style={{ flex: 1, minHeight: 0, borderTop: '1px solid #E2E8F0' }}>
        {chat ? (
          // Same paths as canvas chat cards: the registered chat actions.
          <ChatWindow
            chat={chat}
            capabilities={hasCaps ? caps : undefined}
            onSend={(content, attachmentIds) =>
              attachmentIds
                ? chatActions()?.sendPrompt(chat.id, content, attachmentIds)
                : chatActions()?.sendPrompt(chat.id, content)
            }
            onStop={() => chatActions()?.stopStream(chat.id)}
            onRegenerate={() => chatActions()?.regenerate(chat.id)}
            onUpdateSettings={(patch) => chatActions()?.updateSettings(chat.id, patch)}
            onPermissionDecision={(requestId, behavior) =>
              chatActions()?.permissionDecision(chat.id, requestId, behavior)
            }
            uploadAttachment={(file) => chatActions()?.uploadAttachment(file) ?? notConnected()}
            listDirs={(path) => chatActions()?.listDirs(path) ?? notConnected()}
          />
        ) : (
          <div style={{ padding: 12, fontSize: 12, color: '#94A3B8' }}>Starting doc chat…</div>
        )}
      </section>
    </aside>
  );
}
