// Chat-graph persistence: the newest *.fcw2.json in the storage dir is the
// workspace. Loading migrates legacy compactions into generated docs (M2.1).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chatGraphFromJSON, chatGraphToJSON, migrateCompactions } from '@fcw/graph-core';
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
