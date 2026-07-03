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

  it('broadcasts execution_status_changed event to connected clients', async () => {
    const nodeId = manager.createNode('response', 'A response');
    const ws = await connectWs(port);
    const msgPromise = nextMessage(ws);
    manager.setExecutionStatus(nodeId, 'in_progress');
    const msg = await msgPromise as { type: string; nodeId: string; executionStatus: string };
    expect(msg.type).toBe('execution_status_changed');
    expect(msg.nodeId).toBe(nodeId);
    expect(msg.executionStatus).toBe('in_progress');
    ws.close();
  });

  it('broadcasts path_status_changed event to connected clients', async () => {
    const nodeId = manager.createNode('response', 'A response');
    const ws = await connectWs(port);
    const msgPromise = nextMessage(ws);
    manager.setPathStatus(nodeId, 'archived');
    const msg = await msgPromise as { type: string; nodeId: string; pathStatus: string };
    expect(msg.type).toBe('path_status_changed');
    expect(msg.nodeId).toBe(nodeId);
    expect(msg.pathStatus).toBe('archived');
    ws.close();
  });

  it('pushes chat_capabilities on connect when a provider is given', async () => {
    const capsHttp = createServer();
    const capsWss = createWsServer(capsHttp, new StateManager(), {
      capabilities: async () => ({
        models: [{ id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' }],
        commands: [{ name: 'review', description: 'review a PR' }],
      }),
    });
    await startServer(capsHttp);
    const capsPort = (capsHttp.address() as { port: number }).port;
    // Attach the message listener before the socket opens so the connect-time
    // push can't race ahead of it.
    const ws = new WebSocket(`ws://localhost:${capsPort}`);
    const firstMessage = new Promise<{ type: string; models: unknown[]; commands: unknown[] }>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });
    const msg = await firstMessage;
    expect(msg.type).toBe('chat_capabilities');
    expect(msg.models).toEqual([{ id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' }]);
    expect(msg.commands).toEqual([{ name: 'review', description: 'review a PR' }]);
    ws.close();
    await new Promise<void>((r) => capsWss.close(() => r()));
    await stopServer(capsHttp);
  });

  it('broadcasts node_auto_collapsed event with only nodeId', async () => {
    const nodeId = manager.createNode('response', 'A response');
    // Set executionStatus first (no auto-collapse yet since pathStatus is 'active')
    manager.setExecutionStatus(nodeId, 'completed');
    const ws = await connectWs(port);

    // Collect exactly 2 messages before asserting
    const twoMessages = new Promise<unknown[]>((resolve) => {
      const msgs: unknown[] = [];
      ws.on('message', (data) => {
        msgs.push(JSON.parse(data.toString()));
        if (msgs.length === 2) resolve(msgs);
      });
    });

    // Setting pathStatus to 'archived' with executionStatus 'completed' triggers auto-collapse
    // This emits path_status_changed then node_auto_collapsed synchronously
    manager.setPathStatus(nodeId, 'archived');

    const [firstMsg, secondMsg] = await twoMessages as [{ type: string }, { type: string; nodeId: string }];
    expect(firstMsg.type).toBe('path_status_changed');
    expect(secondMsg.type).toBe('node_auto_collapsed');
    expect(secondMsg.nodeId).toBe(nodeId);
    ws.close();
  });
});
