import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { createWsServer } from './ws-server.js';
import { StateManager } from './state-manager.js';

function startServer(
  httpServer: ReturnType<typeof createServer>,
): Promise<void> {
  return new Promise((resolve) => httpServer.listen(0, resolve));
}

function stopServer(
  httpServer: ReturnType<typeof createServer>,
): Promise<void> {
  return new Promise((resolve, reject) =>
    httpServer.close((err) => (err ? reject(err) : resolve())),
  );
}

function connectWs(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

describe('WebSocket Server', () => {
  let httpServer: ReturnType<typeof createServer>;
  let wss: WebSocketServer;
  let manager: StateManager;
  let port: number;

  beforeEach(async () => {
    manager = new StateManager();
    httpServer = createServer();
    wss = createWsServer(httpServer, manager);
    await startServer(httpServer);
    port = (httpServer.address() as { port: number }).port;
  });

  afterEach(async () => {
    manager.destroy();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await stopServer(httpServer);
  });

  it('accepts WebSocket connections', async () => {
    const ws = await connectWs(port);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('broadcasts node_created event to connected clients', async () => {
    const ws = await connectWs(port);
    const msgPromise = nextMessage(ws);
    manager.createNode('user_prompt', 'Hello');
    const msg = await msgPromise;
    expect((msg as { type: string }).type).toBe('node_created');
    expect((msg as { node: { content: string } }).node.content).toBe('Hello');
    ws.close();
  });

  it('broadcasts node_updated event to connected clients', async () => {
    const nodeId = manager.createNode('user_prompt', 'Original');
    const ws = await connectWs(port);
    const msgPromise = nextMessage(ws);
    manager.updateNodeContent(nodeId, 'Updated');
    const msg = await msgPromise;
    expect((msg as { type: string }).type).toBe('node_updated');
    ws.close();
  });

  it('broadcasts node_deleted event to connected clients', async () => {
    const nodeId = manager.createNode('user_prompt', 'To delete');
    const ws = await connectWs(port);
    const msgPromise = nextMessage(ws);
    manager.deleteNode(nodeId);
    const msg = await msgPromise;
    expect((msg as { type: string }).type).toBe('node_deleted');
    ws.close();
  });

  it('client sending user_prompt_submitted creates user_prompt node', async () => {
    const ws = await connectWs(port);
    const msgPromise = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'user_prompt_submitted', content: 'My prompt' }));
    const msg = await msgPromise;
    expect((msg as { type: string }).type).toBe('node_created');
    expect((msg as { node: { type: string } }).node.type).toBe('user_prompt');
    expect((msg as { node: { content: string } }).node.content).toBe('My prompt');
    ws.close();
  });

  it('client sending branch_requested creates user_prompt node with parent edge', async () => {
    const parentId = manager.createNode('response', 'Parent response');
    const ws = await connectWs(port);
    const msgPromise = nextMessage(ws);
    ws.send(JSON.stringify({ type: 'branch_requested', fromNodeId: parentId, content: 'Branch prompt' }));
    const msg = await msgPromise;
    expect((msg as { type: string }).type).toBe('node_created');
    const newNode = (msg as { node: { id: string } }).node;
    const edge = manager.document.edges.find(
      (e) => e.from === parentId && e.to === newNode.id,
    );
    expect(edge).toBeDefined();
    ws.close();
  });
});
