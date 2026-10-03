// M7.3: hosts the projects of one storage dir — one ChatSessionManager per
// open project (lazily created, each saving to its own file).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chatGraphToJSON, createChatGraph } from '@fcw/graph-core';
import type { ChatGraph } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';
import { loadProject, saveChatGraph } from './chat-graph-store.js';

export interface ProjectHostOptions {
  storageDir: string;
  /** Builds a manager for a loaded graph (streams/generators wired by the caller). */
  createManager?: (graph: ChatGraph) => ChatSessionManager;
}

const SANDBOX = 'Sandbox';

export class ProjectHost {
  private readonly storageDir: string;
  private readonly createManager: (graph: ChatGraph) => ChatSessionManager;
  private readonly managers = new Map<string, ChatSessionManager>();
  private defaultId: string;

  constructor(options: ProjectHostOptions) {
    this.storageDir = options.storageDir;
    this.createManager = options.createManager ?? ((graph) => new ChatSessionManager(undefined, {}, graph));
    this.defaultId = this.createSync(SANDBOX).id;
  }

  defaultProjectId(): string {
    return this.defaultId;
  }

  open(id: string): ChatSessionManager {
    let manager = this.managers.get(id);
    if (!manager) {
      manager = this.createManager(loadProject(this.storageDir, id));
      const graph = manager.graph;
      manager.setSaveHandler(() => saveChatGraph(this.storageDir, graph));
      this.managers.set(id, manager);
    }
    return manager;
  }

  private createSync(title: string): ChatGraph {
    const graph = createChatGraph(title);
    writeFileSync(join(this.storageDir, `${graph.id}.fcw2.json`), chatGraphToJSON(graph), 'utf-8');
    return graph;
  }
}
