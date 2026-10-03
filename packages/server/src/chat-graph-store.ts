// Chat-graph persistence: the newest *.fcw2.json in the storage dir is the
// workspace. Loading migrates legacy compactions into generated docs (M2.1).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chatGraphFromJSON, chatGraphToJSON, createChatGraph, migrateCompactions } from '@fcw/graph-core';
import type { ChatGraph } from '@fcw/graph-core';

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

// Structurally identical to graph-core's ProjectSummary (M7.1); switch to the
// graph-core type at integration.
export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  chatCount: number;
  docCount: number;
}

export async function createProject(storageDir: string, title: string): Promise<ChatGraph> {
  const graph = createChatGraph(title);
  await saveChatGraph(storageDir, graph);
  return graph;
}

export function listProjects(storageDir: string): ProjectSummary[] {
  const out: ProjectSummary[] = [];
  for (const f of readdirSync(storageDir)) {
    if (!f.endsWith('.fcw2.json')) continue;
    try {
      const path = join(storageDir, f);
      const graph = chatGraphFromJSON(readFileSync(path, 'utf-8'));
      out.push({
        id: graph.id,
        title: graph.meta.title,
        updatedAt: statSync(path).mtime.toISOString(),
        chatCount: Object.keys(graph.chats).length,
        docCount: Object.keys(graph.docs).length,
      });
    } catch (err) {
      console.error(`[chat-graph-store] skipping unreadable project ${f}:`, err);
    }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
