// M7.3: ProjectHost — one ChatSessionManager per open project, last-opened
// remembered in <dir>/.fcw-state.json, first launch yields a "Sandbox".
import { describe, it, expect } from 'vitest';
import { mkdtempSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectHost } from './project-host.js';
import { createProject, listProjects, loadProject } from './chat-graph-store.js';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'fcw-host-'));
}

describe('ProjectHost first launch', () => {
  it('creates an empty "Sandbox" when the folder holds no project', () => {
    const dir = tempDir();
    const host = new ProjectHost({ storageDir: dir });
    const id = host.defaultProjectId();
    expect(listProjects(dir).map((p) => [p.id, p.title])).toEqual([[id, 'Sandbox']]);
    expect(host.open(id).graph.meta.title).toBe('Sandbox');
  });

  it('the newest existing graph becomes the default; a default title is renamed Sandbox', async () => {
    for (const title of ['Untitled', 'My title']) {
      const dir = tempDir();
      const old = await createProject(dir, 'Older');
      utimesSync(join(dir, `${old.id}.fcw2.json`), new Date(1000), new Date(1000));
      const newest = await createProject(dir, title);

      const host = new ProjectHost({ storageDir: dir });
      expect(host.defaultProjectId()).toBe(newest.id);
      expect(listProjects(dir)).toHaveLength(2);
      const expected = title === 'Untitled' ? 'Sandbox' : 'My title';
      expect(loadProject(dir, newest.id).meta.title).toBe(expected);
      expect(host.open(newest.id).graph.meta.title).toBe(expected);
      expect(loadProject(dir, old.id).meta.title).toBe('Older');
    }
  });

  it('the createApp title option also counts as a default title', async () => {
    const dir = tempDir();
    const g = await createProject(dir, 'Workspace');
    new ProjectHost({ storageDir: dir, defaultTitle: 'Workspace' });
    expect(loadProject(dir, g.id).meta.title).toBe('Sandbox');
  });
});
