import type { ChatGraph } from './chat-graph.js';

/** One row of the project list: a chat graph seen from the outside. */
export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  chatCount: number;
  docCount: number;
}

export function projectSummary(graph: ChatGraph, updatedAt: string): ProjectSummary {
  return {
    id: graph.id,
    title: graph.meta.title,
    updatedAt,
    chatCount: Object.keys(graph.chats).length,
    docCount: Object.keys(graph.docs).length,
  };
}
