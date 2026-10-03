// M7.3: hosts the projects of one storage dir — one ChatSessionManager per
// open project (lazily created, each saving to its own file).
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chatGraphToJSON, createChatGraph, projectSummary } from '@fcw/graph-core';
import type { ChatGraph, ProjectSummary } from '@fcw/graph-core';
import { ChatSessionManager } from './chat-session.js';
import { createProject, listProjects, loadProject, saveChatGraph, trashProject } from './chat-graph-store.js';

export interface ProjectHostOptions {
  storageDir: string;
  /** Titles that count as "never named" (besides Untitled): renamed Sandbox on first launch. */
  defaultTitle?: string;
  /** Builds a manager for a loaded graph (streams/generators wired by the caller). */
  createManager?: (graph: ChatGraph) => ChatSessionManager;
}

const SANDBOX = 'Sandbox';
const STATE_FILE = '.fcw-state.json';

/** Emits 'message' (projectId, msg) for every open manager's chat-graph event. */
export class ProjectHost extends EventEmitter {
  private readonly storageDir: string;
  private readonly createManager: (graph: ChatGraph) => ChatSessionManager;
  private readonly managers = new Map<string, ChatSessionManager>();
  private defaultId: string;

  constructor(options: ProjectHostOptions) {
    super();
    this.storageDir = options.storageDir;
    this.createManager = options.createManager ?? ((graph) => new ChatSessionManager(undefined, {}, graph));
    const state = this.readState();
    if (state === undefined) {
      this.defaultId = this.firstLaunchDefault(options.defaultTitle ?? 'Untitled');
    } else if (state.lastOpened && this.exists(state.lastOpened)) {
      this.defaultId = state.lastOpened;
    } else {
      this.defaultId = listProjects(this.storageDir)[0]?.id ?? this.createSync(SANDBOX).id;
    }
  }

  private readState(): { lastOpened?: string } | undefined {
    const path = join(this.storageDir, STATE_FILE);
    if (!existsSync(path)) return undefined;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as { lastOpened?: string };
    } catch {
      return {};
    }
  }

  private setLastOpened(id: string): void {
    this.defaultId = id;
    writeFileSync(join(this.storageDir, STATE_FILE), JSON.stringify({ lastOpened: id }), 'utf-8');
  }

  private exists(id: string): boolean {
    return listProjects(this.storageDir).some((p) => p.id === id);
  }

  /** Newest graph (renamed Sandbox if it still has a default title), else a new Sandbox. */
  private firstLaunchDefault(defaultTitle: string): string {
    const newest = listProjects(this.storageDir)[0];
    if (!newest) return this.createSync(SANDBOX).id;
    if (newest.title === 'Untitled' || newest.title === defaultTitle) {
      const graph = loadProject(this.storageDir, newest.id);
      graph.meta.title = SANDBOX;
      this.writeSync(graph);
    }
    return newest.id;
  }

  defaultProjectId(): string {
    return this.defaultId;
  }

  /** The project's manager (loaded on first use); also records it as last-opened. */
  open(id: string): ChatSessionManager {
    let manager = this.managers.get(id);
    if (!manager) {
      manager = this.createManager(loadProject(this.storageDir, id));
      const graph = manager.graph;
      manager.setSaveHandler(() => saveChatGraph(this.storageDir, graph));
      manager.on('message', (msg) => this.emit('message', id, msg));
      this.managers.set(id, manager);
    }
    this.setLastOpened(id);
    return manager;
  }

  /** Summary of a project, from its in-memory graph when open. */
  summary(id: string): ProjectSummary {
    const path = join(this.storageDir, `${id}.fcw2.json`);
    const updatedAt = existsSync(path) ? statSync(path).mtime.toISOString() : new Date().toISOString();
    return projectSummary(this.managers.get(id)?.graph ?? loadProject(this.storageDir, id), updatedAt);
  }

  list(): ProjectSummary[] {
    return listProjects(this.storageDir);
  }

  async create(title: string): Promise<ProjectSummary> {
    const graph = await createProject(this.storageDir, title);
    return projectSummary(graph, new Date().toISOString());
  }

  rename(id: string, title: string): Promise<void> {
    return this.edit(id, (graph) => { graph.meta.title = title; });
  }

  setSettings(id: string, settings: NonNullable<ChatGraph['meta']['settings']>): Promise<void> {
    return this.edit(id, (graph) => { graph.meta.settings = settings; });
  }

  /** Stops the project's running turns, unloads it and moves its file to
   *  .trash/. Trashing the last-opened project moves the default to the most
   *  recent remaining one (a new Sandbox if none). */
  async trash(id: string): Promise<void> {
    const manager = this.managers.get(id);
    if (manager) {
      manager.setSaveHandler(null);
      for (const chatId of Object.keys(manager.graph.chats)) manager.stop(chatId);
      this.managers.delete(id);
    }
    await trashProject(this.storageDir, id);
    if (id === this.defaultId) {
      this.setLastOpened(listProjects(this.storageDir)[0]?.id ?? this.createSync(SANDBOX).id);
    }
  }

  /** Edits the open manager's graph (so a later save keeps it) or the file. */
  private async edit(id: string, change: (graph: ChatGraph) => void): Promise<void> {
    const graph = this.managers.get(id)?.graph ?? loadProject(this.storageDir, id);
    change(graph);
    await saveChatGraph(this.storageDir, graph);
  }

  private createSync(title: string): ChatGraph {
    const graph = createChatGraph(title);
    this.writeSync(graph);
    return graph;
  }

  private writeSync(graph: ChatGraph): void {
    writeFileSync(join(this.storageDir, `${graph.id}.fcw2.json`), chatGraphToJSON(graph), 'utf-8');
  }
}
