// Chat-graph persistence: the newest *.fcw2.json in the storage dir is the
// workspace. Loading migrates legacy compactions into generated docs (M2.1).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { chatGraphFromJSON, chatGraphToJSON, createChatGraph, migrateCompactions, projectSummary } from '@fcw/graph-core';
import type { ChatGraph, ProjectSummary } from '@fcw/graph-core';

export function loadLatestChatGraph(storageDir: string): ChatGraph | undefined {
  const files = readdirSync(storageDir)
    .filter((f) => f.endsWith('.fcw2.json'))
    .map((f) => ({ f, mtime: statSync(join(storageDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) return undefined;
  const graph = chatGraphFromJSON(readFileSync(join(storageDir, files[0].f), 'utf-8'));
  migrateCompactions(graph);
  return graph;
}

export async function saveChatGraph(storageDir: string, graph: ChatGraph): Promise<void> {
  await writeFile(join(storageDir, `${graph.id}.fcw2.json`), chatGraphToJSON(graph), 'utf-8');
}

export async function createProject(storageDir: string, title: string): Promise<ChatGraph> {
  const graph = createChatGraph(title);
  await saveChatGraph(storageDir, graph);
  return graph;
}

function projectPath(storageDir: string, id: string): string {
  const path = join(storageDir, `${id}.fcw2.json`);
  if (basename(id) !== id || !existsSync(path)) throw new Error(`unknown project: ${id}`);
  return path;
}

export function loadProject(storageDir: string, id: string): ChatGraph {
  const graph = chatGraphFromJSON(readFileSync(projectPath(storageDir, id), 'utf-8'));
  migrateCompactions(graph);
  return graph;
}

export async function renameProject(storageDir: string, id: string, title: string): Promise<void> {
  const graph = loadProject(storageDir, id);
  graph.meta.title = title;
  await saveChatGraph(storageDir, graph);
}

// Removal is a move into <dir>/.trash/ — project files are never deleted.
export async function trashProject(storageDir: string, id: string): Promise<string> {
  const from = projectPath(storageDir, id);
  const trashDir = join(storageDir, '.trash');
  await mkdir(trashDir, { recursive: true });
  let to = join(trashDir, `${id}.fcw2.json`);
  if (existsSync(to)) to = join(trashDir, `${id}.${Date.now()}.fcw2.json`);
  await rename(from, to);
  return to;
}

export function listProjects(storageDir: string): ProjectSummary[] {
  const out: ProjectSummary[] = [];
  for (const f of readdirSync(storageDir)) {
    if (!f.endsWith('.fcw2.json')) continue;
    try {
      const path = join(storageDir, f);
      const graph = chatGraphFromJSON(readFileSync(path, 'utf-8'));
      out.push(projectSummary(graph, statSync(path).mtime.toISOString()));
    } catch (err) {
      console.error(`[chat-graph-store] skipping unreadable project ${f}:`, err);
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
