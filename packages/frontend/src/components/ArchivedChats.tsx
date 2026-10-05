import React, { useState } from 'react';

export interface ArchivedChatsProps {
  chats: { id: string; title: string }[];
  onRestore: (chatId: string) => void;
  onDelete: (chatId: string) => void;
}

const actionStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  padding: '2px 4px',
};

/** "Archived (n)" in the canvas actions bar: restore a chat or delete it for good. */
export function ArchivedChats({ chats, onRestore, onDelete }: ArchivedChatsProps) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  if (chats.length === 0) {
    if (open) setOpen(false); // start closed next time
    return null;
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        data-testid="archived-toggle"
        onClick={() => {
          setOpen(!open);
          setConfirming(null);
        }}
        style={{
          padding: '8px 14px',
          borderRadius: 8,
          border: '1px solid #CBD5E1',
          background: '#fff',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 1px 4px rgba(15,23,42,0.1)',
        }}
      >
        Archived ({chats.length})
      </button>
      {open && (
        <div
          data-testid="archived-list"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 260,
            maxHeight: 320,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: 6,
            boxShadow: '0 4px 14px rgba(15,23,42,0.16)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 13,
            color: '#334155',
            zIndex: 1002,
          }}
        >
          {chats.map((c) => (
            <div
              key={c.id}
              data-testid="archived-item"
              data-chat-id={c.id}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px' }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title || 'New chat'}
              </span>
              {confirming === c.id ? (
                <>
                  <span style={{ fontSize: 12, color: '#B91C1C' }}>Delete forever?</span>
                  <button
                    data-testid="archived-delete-confirm"
                    onClick={() => {
                      setConfirming(null);
                      onDelete(c.id);
                    }}
                    style={{ ...actionStyle, color: '#B91C1C' }}
                  >
                    Delete
                  </button>
                  <button data-testid="archived-delete-cancel" onClick={() => setConfirming(null)} style={{ ...actionStyle, color: '#475569' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button data-testid="archived-restore" onClick={() => onRestore(c.id)} style={{ ...actionStyle, color: '#2563EB' }}>
                    Restore
                  </button>
                  <button data-testid="archived-delete" onClick={() => setConfirming(c.id)} style={{ ...actionStyle, color: '#B91C1C' }}>
                    Delete permanently
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
