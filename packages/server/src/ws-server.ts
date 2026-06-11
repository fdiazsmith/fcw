import { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { StateManager } from './state-manager.js';
import { handleClientMessage } from './ws-handler.js';
import type { ClaudeClient } from './claude-client.js';
import type { ToolExecutor } from './prompt-handler.js';
import type { ServerMessage, ClientMessage, ChatServerMessage } from '@fcw/graph-core';
import { formatErrorMessage } from './error-format.js';
import { ChatSessionManager } from './chat-session.js';
import { isChatClientMessage, handleChatClientMessage } from './chat-ws-handler.js';

export interface WsServerOptions {
  claudeClient?: ClaudeClient;
  toolExecutor?: ToolExecutor;
  chatSessions?: ChatSessionManager;
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

  // v2: forward chat-graph events to all WS clients
  options?.chatSessions?.on('message', (msg: ChatServerMessage) => {
    broadcast(msg as unknown as ServerMessage);
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
    console.log('[ws] client connected');

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        console.log('[ws] failed to parse message:', raw.toString().slice(0, 100));
        return;
      }

      console.log('[ws] received:', msg.type);

      // v2: chat-graph messages take their own path
      if (options?.chatSessions && isChatClientMessage(msg)) {
        handleChatClientMessage(msg, options.chatSessions).catch((err) => {
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

    ws.on('close', () => console.log('[ws] client disconnected'));
  });

  return wss;
}
