import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatSettings, Attachment } from '@fcw/graph-core';
import type { ChatView, Capabilities } from '../chat-store';

export interface ChatWindowProps {
  chat: ChatView;
  capabilities?: Capabilities;
  onSend: (content: string, attachmentIds?: string[]) => void;
  onStop?: () => void;
  onRegenerate?: () => void;
  onUpdateSettings?: (patch: Partial<ChatSettings>) => void;
  onPermissionDecision?: (requestId: string, behavior: 'allow' | 'deny') => void;
  uploadAttachment?: (file: File) => Promise<Attachment>;
}

const EFFORTS: ChatSettings['effort'][] = ['low', 'medium', 'high', 'xhigh', 'max'];
const PERMISSION_MODES: NonNullable<ChatSettings['permissionMode']>[] = [
  'default',
  'acceptEdits',
  'bypassPermissions',
];

/** Prefixes text as a markdown blockquote: '> line' per line, then a blank line. */
function asBlockquote(content: string): string {
  return content.split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
}

const selectStyle: React.CSSProperties = {
  font: 'inherit',
  fontSize: 12,
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  padding: '2px 4px',
  background: '#fff',
};

/** Presentational chat UI. Lives inside a tldraw shape, but knows nothing about tldraw. */
export function ChatWindow({
  chat,
  capabilities,
  onSend,
  onStop,
  onRegenerate,
  onUpdateSettings,
  onPermissionDecision,
  uploadAttachment,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streaming = chat.streamingText !== null;
  const lastMessage = chat.messages[chat.messages.length - 1];
  const canRegenerate = !streaming && lastMessage?.role === 'assistant';
  const settings = chat.settings;

  const quote = (content: string) => setDraft((prev) => asBlockquote(content) + prev);

  // '/'-command autocomplete: active while the draft is a single leading /token.
  const commandMatches = useMemo(() => {
    if (!draft.startsWith('/') || draft.includes(' ') || draft.includes('\n')) return [];
    const prefix = draft.slice(1).toLowerCase();
    return (capabilities?.commands ?? []).filter((c) => c.name.toLowerCase().startsWith(prefix));
  }, [draft, capabilities]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, chat.streamingText]);

  const submit = () => {
    const content = draft.trim();
    if (!content || streaming) return;
    if (attachments.length > 0) onSend(content, attachments.map((a) => a.id));
    else onSend(content);
    setDraft('');
    setAttachments([]);
  };

  const addFiles = async (files: FileList | File[]) => {
    if (!uploadAttachment) return;
    for (const file of Array.from(files)) {
      const att = await uploadAttachment(file);
      setAttachments((prev) => [...prev, att]);
    }
  };

  const update = (patch: Partial<ChatSettings>) => onUpdateSettings?.(patch);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#fff',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid #E2E8F0',
          fontWeight: 600,
          color: '#334155',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {chat.title || 'New chat'}
      </div>

      {/* Per-chat engine settings */}
      <div
        data-testid="chat-toolbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          padding: '4px 10px',
          borderBottom: '1px solid #E2E8F0',
          background: '#F8FAFC',
        }}
      >
        <select
          aria-label="Engine"
          value={settings.engine}
          onChange={(e) => update({ engine: e.target.value as ChatSettings['engine'] })}
          style={selectStyle}
        >
          <option value="api">API</option>
          <option value="agent">Agent</option>
        </select>

        {settings.engine === 'agent' && (
          <>
            {capabilities && capabilities.models.length > 0 ? (
              <select
                aria-label="Model"
                value={settings.model ?? ''}
                onChange={(e) => update({ model: e.target.value })}
                style={selectStyle}
              >
                <option value="">(default)</option>
                {capabilities.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label="Model"
                placeholder="model"
                value={settings.model ?? ''}
                onChange={(e) => update({ model: e.target.value })}
                style={{ ...selectStyle, width: 120 }}
              />
            )}

            <select
              aria-label="Effort"
              value={settings.effort ?? ''}
              onChange={(e) => update({ effort: (e.target.value || undefined) as ChatSettings['effort'] })}
              style={selectStyle}
            >
              <option value="">effort</option>
              {EFFORTS.map((eff) => (
                <option key={eff} value={eff}>
                  {eff}
                </option>
              ))}
            </select>

            <select
              aria-label="Permission mode"
              value={settings.permissionMode ?? 'default'}
              onChange={(e) =>
                update({ permissionMode: e.target.value as ChatSettings['permissionMode'] })
              }
              style={selectStyle}
            >
              {PERMISSION_MODES.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>

            <input
              aria-label="Working directory"
              placeholder="cwd"
              value={settings.cwd ?? ''}
              onChange={(e) => update({ cwd: e.target.value })}
              style={{ ...selectStyle, width: 110 }}
            />
          </>
        )}
      </div>

      <div
        ref={scrollRef}
        style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {chat.messages.map((m, i) => {
          const isTool = m.role === 'tool';
          const isUser = m.role === 'user';
          return (
            <div
              key={i}
              data-role={m.role}
              className="fcw-message"
              style={{
                position: 'relative',
                alignSelf: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '6px 10px',
                borderRadius: isTool ? 4 : 10,
                background: isTool ? '#FFFBEB' : isUser ? '#3B82F6' : '#F1F5F9',
                color: isTool ? '#92400E' : isUser ? '#fff' : '#0F172A',
                borderLeft: isTool ? '3px solid #F59E0B' : undefined,
                fontFamily: isTool ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
                whiteSpace: isTool ? 'pre-wrap' : undefined,
                fontSize: isTool ? 12 : undefined,
              }}
            >
              {isTool && m.toolName ? (
                <details>
                  <summary style={{ cursor: 'pointer' }}>{m.toolName}</summary>
                  {m.toolInput !== undefined && (
                    <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(m.toolInput, null, 2)}
                    </pre>
                  )}
                  {m.content && <div style={{ marginTop: 4 }}>{m.content}</div>}
                </details>
              ) : m.role === 'assistant' ? (
                <ReactMarkdown>{m.content}</ReactMarkdown>
              ) : (
                m.content
              )}
              {m.attachments && m.attachments.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.85 }}>
                  {m.attachments.map((a) => `📎 ${a.name}`).join('  ')}
                </div>
              )}
              <button
                type="button"
                aria-label="Quote this message"
                title="Quote"
                onClick={() => quote(m.content)}
                className="fcw-quote-btn"
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  height: 18,
                  padding: '0 6px',
                  borderRadius: 9,
                  border: '1px solid #CBD5E1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 10,
                  lineHeight: '16px',
                  cursor: 'pointer',
                }}
              >
                quote
              </button>
            </div>
          );
        })}
        {streaming && (
          <div
            data-streaming="true"
            style={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              padding: '6px 10px',
              borderRadius: 10,
              background: '#F1F5F9',
              color: '#0F172A',
              opacity: 0.9,
            }}
          >
            <ReactMarkdown>{chat.streamingText || '…'}</ReactMarkdown>
          </div>
        )}
        {chat.error && <div style={{ color: '#DC2626', fontSize: 12 }}>Error: {chat.error}</div>}
      </div>

      {/* Permission approval banner */}
      {chat.pendingPermission && (
        <div
          data-testid="permission-banner"
          style={{
            borderTop: '1px solid #FDE68A',
            background: '#FFFBEB',
            padding: '8px 10px',
            fontSize: 12,
            color: '#92400E',
          }}
        >
          <div style={{ marginBottom: 6 }}>
            Allow <strong>{chat.pendingPermission.toolName}</strong>?{' '}
            <code style={{ fontSize: 11 }}>
              {JSON.stringify(chat.pendingPermission.input)}
            </code>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => onPermissionDecision?.(chat.pendingPermission!.requestId, 'allow')}
              style={{ padding: '3px 12px', borderRadius: 6, border: '1px solid #16A34A', background: '#16A34A', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
            >
              Allow
            </button>
            <button
              type="button"
              onClick={() => onPermissionDecision?.(chat.pendingPermission!.requestId, 'deny')}
              style={{ padding: '3px 12px', borderRadius: 6, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontWeight: 600, cursor: 'pointer' }}
            >
              Deny
            </button>
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid #E2E8F0', padding: 8, position: 'relative' }}>
        {(streaming || canRegenerate) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
            {streaming && (
              <button
                type="button"
                onClick={() => onStop?.()}
                style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#fff', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Stop
              </button>
            )}
            {canRegenerate && (
              <button
                type="button"
                onClick={() => onRegenerate?.()}
                style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #CBD5E1', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Regenerate
              </button>
            )}
          </div>
        )}

        {/* '/'-command autocomplete popup */}
        {commandMatches.length > 0 && (
          <div
            data-testid="command-popup"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 8,
              right: 8,
              background: '#fff',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
              maxHeight: 160,
              overflowY: 'auto',
              zIndex: 10,
            }}
          >
            {commandMatches.map((c) => (
              <button
                key={c.name}
                type="button"
                onClick={() => setDraft(`/${c.name} `)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 8px', border: 'none', background: '#fff', cursor: 'pointer', fontSize: 12 }}
              >
                <strong>/{c.name}</strong>
                {c.description ? <span style={{ color: '#64748B' }}> — {c.description}</span> : null}
              </button>
            ))}
          </div>
        )}

        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {attachments.map((a) => (
              <span
                key={a.id}
                data-testid="attachment-chip"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#EEF2FF', color: '#3730A3', borderRadius: 12, padding: '2px 8px', fontSize: 11 }}
              >
                📎 {a.name}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#3730A3' }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
          {uploadAttachment && (
            <>
              <button
                type="button"
                aria-label="Attach file"
                title="Attach file"
                onClick={() => fileRef.current?.click()}
                style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid #CBD5E1', background: '#fff', cursor: 'pointer' }}
              >
                📎
              </button>
              <input
                ref={fileRef}
                type="file"
                aria-label="File input"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          )}
          <textarea
            value={draft}
            disabled={streaming}
            placeholder="Message…"
            rows={2}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length > 0 && uploadAttachment) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            style={{
              flex: 1,
              resize: 'none',
              border: '1px solid #CBD5E1',
              borderRadius: 8,
              padding: '6px 8px',
              font: 'inherit',
              boxSizing: 'border-box',
              background: streaming ? '#F8FAFC' : '#fff',
            }}
          />
        </div>
      </div>
    </div>
  );
}
