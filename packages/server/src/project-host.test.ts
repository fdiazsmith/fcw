// M7.3: ProjectHost — one ChatSessionManager per open project, last-opened
// remembered in <dir>/.fcw-state.json, first launch yields a "Sandbox".
import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectHost } from './project-host.js';
import { createProject, listProjects, loadProject } from './chat-graph-store.js';
import { ChatSessionManager } from './chat-session.js';
import type { StreamTurnFn } from './turn-events.js';

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

describe('ProjectHost open', () => {
  it('caches one manager per project, each saving to its own file', async () => {
    const dir = tempDir();
    const a = await createProject(dir, 'A');
    const b = await createProject(dir, 'B');
    const host = new ProjectHost({ storageDir: dir });
    const ma = host.open(a.id);
    expect(host.open(a.id)).toBe(ma);
    const mb = host.open(b.id);
    expect(mb).not.toBe(ma);

    ma.createChat({ x: 0, y: 0 }, 'in A');
    mb.createDoc('root', 'in B', { x: 0, y: 0 });

    await vi.waitFor(() => {
      expect(Object.values(loadProject(dir, a.id).chats).map((c) => c.title)).toEqual(['in A']);
      expect(Object.values(loadProject(dir, b.id).docs).map((d) => d.title)).toEqual(['in B']);
    }, { timeout: 3000, interval: 50 });
    expect(loadProject(dir, a.id).docs).toEqual({});
    expect(loadProject(dir, b.id).chats).toEqual({});
  });

  it('restart (new host on the same dir) reopens the last-opened project', async () => {
    const dir = tempDir();
    const a = await createProject(dir, 'A');
    const b = await createProject(dir, 'B');
    utimesSync(join(dir, `${b.id}.fcw2.json`), new Date(1000), new Date(1000));
    const host = new ProjectHost({ storageDir: dir });
    expect(host.defaultProjectId()).toBe(a.id);
    host.open(b.id);
    expect(host.defaultProjectId()).toBe(b.id);
    expect(JSON.parse(readFileSync(join(dir, '.fcw-state.json'), 'utf-8'))).toEqual({ lastOpened: b.id });

    expect(new ProjectHost({ storageDir: dir }).defaultProjectId()).toBe(b.id);
  });

  it('a state file naming a missing project falls back to the newest one', async () => {
    const dir = tempDir();
    const a = await createProject(dir, 'A');
    writeFileSync(join(dir, '.fcw-state.json'), JSON.stringify({ lastOpened: 'cg_gone' }));
    expect(new ProjectHost({ storageDir: dir }).defaultProjectId()).toBe(a.id);
  });

  it('create / list / rename / setSettings, and an open manager sees the change', async () => {
    const host = new ProjectHost({ storageDir: tempDir() });
    const sandbox = host.defaultProjectId();
    const created = await host.create('Research');
    expect(created).toMatchObject({ title: 'Research', chatCount: 0, docCount: 0 });
    expect(host.list().map((p) => p.title).sort()).toEqual(['Research', 'Sandbox']);

    const m = host.open(created.id);
    await host.rename(created.id, 'Deep research');
    await host.setSettings(created.id, { cwd: '/tmp/x', model: 'claude-opus-4-8', effort: 'high' });
    expect(m.graph.meta.title).toBe('Deep research');
    expect(m.graph.meta.settings).toEqual({ cwd: '/tmp/x', model: 'claude-opus-4-8', effort: 'high' });
    expect(host.list().find((p) => p.id === created.id)?.title).toBe('Deep research');

    // Not-open projects are edited on disk.
    await host.rename(sandbox, 'Play');
    expect(host.list().find((p) => p.id === sandbox)?.title).toBe('Play');
  });

  it('trash stops running turns, unloads the manager and moves the file to .trash/', async () => {
    const dir = tempDir();
    let aborted = false;
    const stream: StreamTurnFn = async function* (ctx) {
      yield { type: 'text_delta', text: 'partial' };
      await new Promise<void>((r) => ctx.signal?.addEventListener('abort', () => r()));
      aborted = ctx.signal?.aborted ?? false;
    };
    const host = new ProjectHost({
      storageDir: dir,
      createManager: (graph) => new ChatSessionManager(undefined, { api: stream }, graph),
    });
    const p = await host.create('Doomed');
    const m = host.open(p.id);
    const chat = m.createChat({ x: 0, y: 0 });
    const turn = m.prompt(chat, 'hi');
    await new Promise((r) => setTimeout(r, 10));

    await host.trash(p.id);
    await turn;
    expect(aborted).toBe(true);
    expect(existsSync(join(dir, `${p.id}.fcw2.json`))).toBe(false);
    expect(readdirSync(join(dir, '.trash'))).toEqual([`${p.id}.fcw2.json`]);
    // The pending debounced save must not resurrect the file.
    await new Promise((r) => setTimeout(r, 700));
    expect(existsSync(join(dir, `${p.id}.fcw2.json`))).toBe(false);
    expect(() => host.open(p.id)).toThrow(/unknown project/);
  });

  it('trashing the last-opened project falls back to the most recent one, else a new Sandbox', async () => {
    const dir = tempDir();
    const host = new ProjectHost({ storageDir: dir });
    const sandbox = host.defaultProjectId();
    const other = await host.create('Other');
    host.open(other.id);
    await host.trash(other.id);
    expect(host.defaultProjectId()).toBe(sandbox);
    expect(new ProjectHost({ storageDir: dir }).defaultProjectId()).toBe(sandbox);

    await host.trash(sandbox);
    const fresh = host.defaultProjectId();
    expect(fresh).not.toBe(sandbox);
    expect(host.list().map((p) => [p.id, p.title])).toEqual([[fresh, 'Sandbox']]);
  });

  it('opening an unknown project throws', () => {
    const host = new ProjectHost({ storageDir: tempDir() });
    expect(() => host.open('cg_nope')).toThrow(/unknown project/);
  });
});
