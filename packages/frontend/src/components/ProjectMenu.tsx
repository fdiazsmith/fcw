import React, { useState } from 'react';
import type { ChatGraph, ChatSettings, ProjectSummary } from '@fcw/graph-core';
import type { Capabilities } from '../chat-store';
import { FolderPicker, type DirListing } from './FolderPicker';

type ProjectSettings = NonNullable<ChatGraph['meta']['settings']>;

export interface ProjectMenuProps {
  project?: ProjectSummary;
  projects: ProjectSummary[];
  /** Shown before a project is open. */
  fallbackLabel: string;
  /** The open project's defaults for new chats (prefills the settings form). */
  settings?: ProjectSettings;
  capabilities?: Capabilities;
  listDirs?: (path?: string) => Promise<DirListing>;
  onOpen: (id: string) => void;
  onCreate: (title: string) => void;
  onRename: (id: string, title: string) => void;
  onSaveSettings: (id: string, settings: ProjectSettings) => void;
  onTrash: (id: string) => void;
}

const EFFORTS: NonNullable<ChatSettings['effort']>[] = ['low', 'medium', 'high', 'xhigh', 'max'];

type Mode = 'closed' | 'list' | 'new' | 'rename' | 'settings' | 'trash';

const itemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  padding: '4px 8px',
  font: 'inherit',
  fontSize: 13,
  color: '#334155',
  cursor: 'pointer',
  borderRadius: 4,
};

const fieldStyle: React.CSSProperties = {
  font: 'inherit',
  fontSize: 12,
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  padding: '3px 6px',
};

/** M7.7: the root breadcrumb item — project title ▾ with switch / new / rename / settings / trash. */
export function ProjectMenu(props: ProjectMenuProps) {
  const { project, projects, fallbackLabel, capabilities, listDirs } = props;
  const [mode, setMode] = useState<Mode>('closed');
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState<ProjectSettings>({});

  const close = () => setMode('closed');

  const startTitle = (next: 'new' | 'rename') => {
    setTitle(next === 'rename' ? (project?.title ?? '') : '');
    setMode(next);
  };

  const submitTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (mode === 'new') props.onCreate(trimmed);
    else if (mode === 'rename' && project) props.onRename(project.id, trimmed);
    close();
  };

  const saveSettings = () => {
    if (!project) return;
    const settings: ProjectSettings = {};
    if (draft.cwd) settings.cwd = draft.cwd;
    if (draft.model) settings.model = draft.model;
    if (draft.effort) settings.effort = draft.effort;
    props.onSaveSettings(project.id, settings);
    close();
  };

  const models = capabilities?.models ?? [];

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        data-testid="project-menu"
        onClick={() => setMode(mode === 'closed' ? 'list' : 'closed')}
        style={{ border: 'none', background: 'transparent', color: '#334155', fontSize: 13, cursor: 'pointer', padding: 0, fontWeight: 600 }}
      >
        {project?.title ?? fallbackLabel} ▾
      </button>
      {mode !== 'closed' && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: -10,
            minWidth: 220,
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: 6,
            boxShadow: '0 4px 14px rgba(15,23,42,0.16)',
            zIndex: 1002,
          }}
        >
          {mode === 'list' && (
            <>
              {projects.map((p) => (
                <button
                  key={p.id}
                  data-testid="project-item"
                  data-project-id={p.id}
                  onClick={() => {
                    if (p.id !== project?.id) props.onOpen(p.id);
                    close();
                  }}
                  style={{ ...itemStyle, fontWeight: p.id === project?.id ? 700 : 400 }}
                >
                  {p.title}
                </button>
              ))}
              <div style={{ borderTop: '1px solid #E2E8F0', margin: '4px 0' }} />
              <button data-testid="project-new" onClick={() => startTitle('new')} style={itemStyle}>
                New project
              </button>
              <button data-testid="project-rename" onClick={() => startTitle('rename')} style={itemStyle} disabled={!project}>
                Rename
              </button>
              <button
                data-testid="project-settings"
                onClick={() => {
                  setDraft({ ...props.settings });
                  setMode('settings');
                }}
                style={itemStyle}
                disabled={!project}
              >
                Project settings
              </button>
              <button data-testid="project-trash" onClick={() => setMode('trash')} style={{ ...itemStyle, color: '#B91C1C' }} disabled={!project}>
                Move to trash
              </button>
            </>
          )}
          {(mode === 'new' || mode === 'rename') && (
            <input
              data-testid="project-title-input"
              autoFocus
              placeholder={mode === 'new' ? 'New project title' : 'Project title'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTitle();
                else if (e.key === 'Escape') close();
              }}
              style={{ ...fieldStyle, width: '100%', boxSizing: 'border-box' }}
            />
          )}
          {mode === 'settings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <span style={{ color: '#64748B' }}>Defaults for new chats</span>
              {listDirs ? (
                <FolderPicker value={draft.cwd} onSelect={(cwd) => setDraft({ ...draft, cwd })} listDirs={listDirs} />
              ) : (
                <input
                  aria-label="Working directory"
                  placeholder="cwd"
                  value={draft.cwd ?? ''}
                  onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
                  style={fieldStyle}
                />
              )}
              {models.length > 0 ? (
                <select aria-label="Model" value={draft.model ?? ''} onChange={(e) => setDraft({ ...draft, model: e.target.value })} style={fieldStyle}>
                  <option value="">(default)</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Model"
                  placeholder="model"
                  value={draft.model ?? ''}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  style={fieldStyle}
                />
              )}
              <select
                aria-label="Effort"
                value={draft.effort ?? ''}
                onChange={(e) => setDraft({ ...draft, effort: (e.target.value || undefined) as ChatSettings['effort'] })}
                style={fieldStyle}
              >
                <option value="">effort</option>
                {EFFORTS.map((eff) => (
                  <option key={eff} value={eff}>
                    {eff}
                  </option>
                ))}
              </select>
              <button data-testid="project-settings-save" onClick={saveSettings} style={{ ...fieldStyle, cursor: 'pointer', background: '#F8FAFC' }}>
                Save
              </button>
            </div>
          )}
          {mode === 'trash' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
              <span>Move “{project?.title}” to the trash?</span>
              <button
                data-testid="project-trash-confirm"
                onClick={() => {
                  if (project) props.onTrash(project.id);
                  close();
                }}
                style={{ ...fieldStyle, cursor: 'pointer', background: '#FEF2F2', color: '#B91C1C' }}
              >
                Move to trash
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
