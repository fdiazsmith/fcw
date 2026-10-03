// M7.3: ProjectHost — one ChatSessionManager per open project, last-opened
// remembered in <dir>/.fcw-state.json, first launch yields a "Sandbox".
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectHost } from './project-host.js';
import { listProjects } from './chat-graph-store.js';

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
});
