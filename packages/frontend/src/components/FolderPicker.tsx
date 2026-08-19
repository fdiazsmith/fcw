import React, { useState } from 'react';

export interface DirListing {
  path: string;
  parent: string;
  dirs: { name: string; path: string }[];
}

export interface FolderPickerProps {
  /** Currently selected absolute path, if any. */
  value?: string;
  onSelect: (path: string) => void;
  /** Lists subdirectories of a path; no arg means the server default (home). */
  listDirs: (path?: string) => Promise<DirListing>;
}

const buttonStyle: React.CSSProperties = {
  font: 'inherit',
  fontSize: 12,
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  padding: '2px 6px',
  background: '#fff',
  cursor: 'pointer',
};

/** Compact server-backed directory browser for picking a chat's working folder. */
export function FolderPicker({ value, onSelect, listDirs }: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<DirListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const browse = async (path?: string) => {
    setError(null);
    try {
      setListing(await listDirs(path));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    void browse(value);
  };

  const label = value ? value.split('/').filter(Boolean).pop() ?? value : 'cwd';

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="Working directory"
        title={value ?? 'Pick a working directory'}
        onClick={toggle}
        style={buttonStyle}
      >
        📁 {label}
      </button>
      {open && (
        <div
          data-testid="folder-browser"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            width: 240,
            maxHeight: 260,
            overflowY: 'auto',
            background: '#fff',
            border: '1px solid #CBD5E1',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
            zIndex: 20,
            fontSize: 12,
          }}
        >
          {error && (
            <div style={{ color: '#B91C1C', padding: '6px 8px' }}>{error}</div>
          )}
          {listing && (
            <>
              <div
                style={{
                  padding: '6px 8px',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                }}
              >
                <button
                  type="button"
                  aria-label="Up one level"
                  title="Up one level"
                  onClick={() => void browse(listing.parent)}
                  style={buttonStyle}
                >
                  ↑
                </button>
                <span
                  title={listing.path}
                  style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl' }}
                >
                  {listing.path}
                </span>
              </div>
              {listing.dirs.map((d) => (
                <button
                  key={d.path}
                  type="button"
                  onClick={() => void browse(d.path)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '4px 8px',
                    border: 'none',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  📁 <span>{d.name}</span>
                </button>
              ))}
              <div style={{ padding: '6px 8px', borderTop: '1px solid #E2E8F0' }}>
                <button
                  type="button"
                  aria-label="Use this folder"
                  onClick={() => {
                    onSelect(listing.path);
                    setOpen(false);
                  }}
                  style={{ ...buttonStyle, width: '100%', background: '#3B82F6', color: '#fff', border: '1px solid #3B82F6' }}
                >
                  Use this folder
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
