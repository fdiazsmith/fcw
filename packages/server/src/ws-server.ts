import { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { StateManager } from './state-manager.js';
import { handleClientMessage } from './ws-handler.js';
import type { ClaudeClient } from './claude-client.js';
import type { ToolExecutor } from './prompt-handler.js';
import type { ServerMessage, ClientMessage, ChatServerMessage } from '@fcw/graph-core';
import { formatErrorMessage } from './error-format.js';
import { ChatSessionManager } from './chat-session.js';
import { isChatClientMessage, handleChatClientMessage } from './chat-ws-handler.js';
import type { ProjectHost } from './project-host.js';

const ProjectClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('project_list_requested') }),
  z.object({ type: z.literal('project_open_requested'), id: z.string() }),
  z.object({ type: z.literal('project_create_requested'), title: z.string() }),
  z.object({ type: z.literal('project_rename_requested'), id: z.string(), title: z.string() }),
  z.object({ type: z.literal('project_trash_requested'), id: z.string() }),
  z.object({
    type: z.literal('project_settings_requested'),
    id: z.string(),
    settings: z.object({
      cwd: z.string().optional(),
      model: z.string().optional(),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
    }),
  }),
]);

export interface WsServerOptions {
  claudeClient?: ClaudeClient;
  toolExecutor?: ToolExecutor;
  chatSessions?: ChatSessionManager;
  /** M7.4: per-connection projects. When set, `chatSessions` is ignored. */
  projects?: ProjectHost;
  /** Lazily-loaded model/command capabilities, pushed to each client on connect. */
  capabilities?: () => Promise<{
    models: { id: string; displayName: string }[];
    commands: { name: string; description: string }[];
  }>;
}

export function createWsServer(
  httpServer: Server,
  manager: StateManager,
  options?: WsServerOptions,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  function broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  // Forward state manager events to all WS clients
  manager.on('node_created', (msg: ServerMessage) => { console.log('[ws] broadcasting node_created'); broadcast(msg); });
  manager.on('node_updated', (msg: ServerMessage) => { console.log('[ws] broadcasting node_updated'); broadcast(msg); });
  manager.on('node_deleted', (msg: ServerMessage) => broadcast(msg));
  manager.on('edge_created', (msg: ServerMessage) => { console.log('[ws] broadcasting edge_created'); broadcast(msg); });
  manager.on('node_status_changed', (msg: ServerMessage) => broadcast(msg));
  manager.on('execution_status_changed', (msg: ServerMessage) => broadcast(msg));
  manager.on('path_status_changed', (msg: ServerMessage) => broadcast(msg));
  manager.on('node_auto_collapsed', (msg: ServerMessage) => broadcast(msg));

  // M7.4: each socket is bound to one project's manager.
  const projects = options?.projects;

  // v2 (single graph, no projects): forward chat-graph events to all WS clients
  if (!projects) {
    options?.chatSessions?.on('message', (msg: ChatServerMessage) => {
      broadcast(msg as unknown as ServerMessage);
    });
  }
  const bindings = new Map<WebSocket, { id: string; sessions: ChatSessionManager }>();

  function send(ws: WebSocket, msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  projects?.on('message', (id: string, msg: ChatServerMessage) => {
    for (const [ws, binding] of bindings) if (binding.id === id) send(ws, msg);
  });

  function bind(ws: WebSocket, host: ProjectHost, id: string): void {
    const sessions = host.open(id);
    bindings.set(ws, { id, sessions });
    send(ws, { type: 'project_opened', project: host.summary(id) });
    send(ws, { type: 'project_list', projects: host.list() });
    send(ws, { type: 'chat_snapshot', graph: sessions.graph });
  }

  async function handleProjectMessage(
    ws: WebSocket,
    host: ProjectHost,
    msg: z.infer<typeof ProjectClientMessageSchema>,
  ): Promise<void> {
    if (msg.type === 'project_list_requested') {
      send(ws, { type: 'project_list', projects: host.list() });
    } else if (msg.type === 'project_open_requested') {
      bind(ws, host, msg.id);
    } else {
      if (msg.type === 'project_create_requested') await host.create(msg.title);
      else if (msg.type === 'project_rename_requested') await host.rename(msg.id, msg.title);
      else if (msg.type === 'project_settings_requested') await host.setSettings(msg.id, msg.settings);
      else if (msg.type === 'project_trash_requested') {
        await host.trash(msg.id);
        for (const [client, binding] of bindings) {
          if (binding.id !== msg.id) continue;
          send(client, { type: 'project_closed', id: msg.id, reason: 'trashed' });
          bind(client, host, host.defaultProjectId());
        }
      }
      const list = { type: 'project_list', projects: host.list() };
      for (const client of wss.clients) send(client, list);
    }
  }

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    console.log('[ws] client connected');

    if (projects) {
      const requested = new URL(req.url ?? '/', 'http://localhost').searchParams.get('project');
      try {
        bind(ws, projects, requested ?? projects.defaultProjectId());
      } catch {
        bind(ws, projects, projects.defaultProjectId());
      }
    } else if (options?.chatSessions) {
      // v2: sync the full chat-graph so refreshes/restarts restore the canvas
      ws.send(JSON.stringify({ type: 'chat_snapshot', graph: options.chatSessions.graph }));
    }

    // v2: push agent model/command capabilities once they resolve
    if (options?.capabilities) {
      options
        .capabilities()
        .then((caps) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'chat_capabilities', ...caps }));
          }
        })
        .catch((err) => console.error('[ws] capabilities failed:', err));
    }

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        console.log('[ws] failed to parse message:', raw.toString().slice(0, 100));
        return;
      }

      console.log('[ws] received:', msg.type);

      // M7.4: project messages
      const projectMsg = ProjectClientMessageSchema.safeParse(msg);
      if (projects && projectMsg.success) {
        handleProjectMessage(ws, projects, projectMsg.data).catch((err) => {
          console.error('[ws] project error:', err);
          send(ws, { type: 'error', message: formatErrorMessage(err) });
        });
        return;
      }

      // v2: chat-graph messages take their own path
      const sessions = bindings.get(ws)?.sessions ?? options?.chatSessions;
      if (sessions && isChatClientMessage(msg)) {
        handleChatClientMessage(msg, sessions).catch((err) => {
          console.error('[ws] chat error:', err);
          ws.send(JSON.stringify({ type: 'error', message: formatErrorMessage(err) }));
        });
        return;
      }
      handleClientMessage(msg, manager, options?.claudeClient, options?.toolExecutor)
        .then(() => console.log('[ws] handled:', msg.type))
        .catch((err) => {
          console.error('[ws] error handling', msg.type, ':', err);
          const errorMsg: ServerMessage = { type: 'error', message: formatErrorMessage(err) };
          ws.send(JSON.stringify(errorMsg));
        });
    });

    ws.on('close', () => {
      bindings.delete(ws);
      console.log('[ws] client disconnected');
    });
  });

  return wss;
}
