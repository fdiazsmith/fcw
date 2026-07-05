import type { ChatGraph } from './chat-graph.js';

export function chatGraphToJSON(graph: ChatGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function chatGraphFromJSON(json: string): ChatGraph {
  const parsed = JSON.parse(json) as ChatGraph;
  if (parsed.version !== 2) {
    throw new Error(`unsupported document version: ${String((parsed as { version?: unknown }).version)}`);
  }
  for (const edge of parsed.edges) {
    if (!parsed.chats[edge.from]) throw new Error(`edge references unknown chat: ${edge.from}`);
    if (!parsed.chats[edge.to]) throw new Error(`edge references unknown chat: ${edge.to}`);
  }
  parsed.compactions ??= {}; // pre-compaction documents
  for (const compaction of Object.values(parsed.compactions)) {
    for (const memberId of compaction.memberIds) {
      if (!parsed.chats[memberId]) {
        throw new Error(`compaction ${compaction.id} references unknown chat: ${memberId}`);
      }
    }
  }
  return parsed;
}
