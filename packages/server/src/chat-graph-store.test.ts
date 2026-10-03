// M2.1: the server's chat-graph load path migrates legacy compactions into
// generated docs, and docs + rootCanvas survive save -> reload.
import { describe, it, expect } from 'vitest';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createProject, listProjects, loadLatestChatGraph, loadProject, renameProject, saveChatGraph } from './chat-graph-store.js';

const FIXTURE = resolve(__dirname, '..', '..', 'graph-core', 'src', '__fixtures__', 'compacting-v2.fcw.json');

function fixtureDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fcw-store-'));
  copyFileSync(FIXTURE, join(dir, 'cg_1773900000000_1.fcw2.json'));
  return dir;
}

describe('loadLatestChatGraph', () => {
  it('returns undefined when the directory holds no chat-graph', () => {
    expect(loadLatestChatGraph(mkdtempSync(join(tmpdir(), 'fcw-empty-')))).toBeUndefined();
  });

  it('migrates compactions from a compacting-branch file into generated docs, losslessly', () => {
    const raw = JSON.parse(readFileSync(FIXTURE, 'utf-8'));
    const graph = loadLatestChatGraph(fixtureDir())!;

    expect(graph.compactions).toEqual({});
    const old = Object.values(raw.compactions) as Array<{
      id: string; title: string; memberIds: string[]; document: string;
      sourceDigest: string; position: { x: number; y: number }; createdAt: string; status: string;
    }>;
    expect(old.length).toBeGreaterThan(0);
    for (const c of old) {
      const doc = graph.docs[c.id];
      expect(doc).toMatchObject({
        id: c.id,
        title: c.title,
        body: c.document,
        createdAt: c.createdAt,
        generated: { sourceDigest: c.sourceDigest, status: c.status },
      });
      expect(doc.canvas.placements.map((p) => [p.kind, p.id])).toEqual(
        c.memberIds.map((m) => ['chat', m]),
      );
      expect(graph.rootCanvas.placements).toContainEqual({ kind: 'doc', id: c.id, position: c.position });
    }
    // Chats and context edges are untouched.
    expect(graph.chats).toEqual(raw.chats);
    expect(graph.edges).toEqual(raw.edges);
  });

  it('save -> reload keeps docs and rootCanvas identical', async () => {
    const dir = fixtureDir();
    const first = loadLatestChatGraph(dir)!;
    await saveChatGraph(dir, first);
    const second = loadLatestChatGraph(dir)!;
    expect(second.docs).toEqual(first.docs);
    expect(second.rootCanvas).toEqual(first.rootCanvas);
    // Migration is idempotent: nothing is placed twice on reload.
    expect(second.rootCanvas.placements).toHaveLength(first.rootCanvas.placements.length);
  });
});

describe('listProjects', () => {
  it('lists *.fcw2.json files newest first, skipping .trash, v1 files, and corrupt files', async () => {
    const dir = fixtureDir();
    const a = await createProject(dir, 'Alpha');
    utimesSync(join(dir, `${a.id}.fcw2.json`), new Date('2030-01-01'), new Date('2030-01-01'));
    mkdirSync(join(dir, '.trash'));
    copyFileSync(FIXTURE, join(dir, '.trash', 'old.fcw2.json'));
    writeFileSync(join(dir, 'legacy.fcw.json'), '{}');
    writeFileSync(join(dir, 'bad.fcw2.json'), '{not json');

    const list = listProjects(dir);
    expect(list.map((p) => p.id)).toEqual([a.id, 'cg_1773900000000_1']);
    expect(list[0]).toMatchObject({ title: 'Alpha', updatedAt: '2030-01-01T00:00:00.000Z', chatCount: 0, docCount: 0 });
    expect(existsSync(join(dir, 'bad.fcw2.json'))).toBe(true);
  });
});

describe('loadProject / renameProject', () => {
  it('loadProject migrates compactions and throws "unknown project" for a missing id', () => {
    const dir = fixtureDir();
    const graph = loadProject(dir, 'cg_1773900000000_1');
    expect(graph.compactions).toEqual({});
    expect(Object.keys(graph.docs).length).toBeGreaterThan(0);
    expect(() => loadProject(dir, 'nope')).toThrow(/unknown project/);
  });

  it('renameProject updates meta.title on disk; unknown id throws', async () => {
    const dir = fixtureDir();
    await renameProject(dir, 'cg_1773900000000_1', 'Renamed');
    expect(loadProject(dir, 'cg_1773900000000_1').meta.title).toBe('Renamed');
    await expect(renameProject(dir, 'nope', 'x')).rejects.toThrow(/unknown project/);
  });
});
