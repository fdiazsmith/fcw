import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { createWsServer } from './ws-server.js';
import { StateManager } from './state-manager.js';
import { ChatSessionManager } from './chat-session.js';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectHost } from './project-host.js';

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

  it('snapshot carries docs + rootCanvas; an unknown docId gets an error reply, not a crash', async () => {
    const chatSessions = new ChatSessionManager();
    const docId = chatSessions.createDoc(ROOT_CANVAS_ID, 'Auth', { x: 0, y: 0 });
    const docHttp = createServer();
    const docWss = createWsServer(docHttp, new StateManager(), { chatSessions });
    await startServer(docHttp);
    const docPort = (docHttp.address() as { port: number }).port;
    const ws = new WebSocket(`ws://localhost:${docPort}`);
    const received: Array<Record<string, unknown>> = [];
    ws.on('message', (data) => received.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });
    const waitFor = async (type: string) => {
      for (let i = 0; i < 100 && !received.some((m) => m.type === type); i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      return received.find((m) => m.type === type);
    };

    const snap = (await waitFor('chat_snapshot')) as { graph: { docs: object; rootCanvas: object } };
    expect(Object.keys(snap.graph.docs)).toEqual([docId]);
    expect(snap.graph.rootCanvas).toEqual({ placements: [{ kind: 'doc', id: docId, position: { x: 0, y: 0 } }], edges: [] });

    ws.send(JSON.stringify({ type: 'doc_update_requested', docId: 'nope', body: 'x' }));
    const err = await waitFor('error');
    expect(err?.message).toMatch(/unknown doc/);

    // Still serving: a valid request after the error is applied and broadcast.
    ws.send(JSON.stringify({ type: 'doc_update_requested', docId, body: 'ok' }));
    expect(await waitFor('doc_updated')).toEqual({ type: 'doc_updated', docId, body: 'ok' });

    ws.close();
    await new Promise<void>((r) => docWss.close(() => r()));
    await stopServer(docHttp);
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

// M7.4: per-connection project routing.
describe('WebSocket Server project routing', () => {
  let httpServer: ReturnType<typeof createServer>;
  let wss: WebSocketServer;
  let host: ProjectHost;
  let port: number;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    host = new ProjectHost({ storageDir: mkdtempSync(join(tmpdir(), 'fcw-ws-proj-')) });
    httpServer = createServer();
    wss = createWsServer(httpServer, new StateManager(), { projects: host });
    await startServer(httpServer);
    port = (httpServer.address() as { port: number }).port;
  });

  afterEach(async () => {
    for (const ws of sockets.splice(0)) ws.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await stopServer(httpServer);
  });

  type Msg = Record<string, any>;
  async function client(query = ''): Promise<{ ws: WebSocket; received: Msg[] }> {
    const ws = new WebSocket(`ws://localhost:${port}${query}`);
    sockets.push(ws);
    const received: Msg[] = [];
    ws.on('message', (data) => received.push(JSON.parse(data.toString())));
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });
    return { ws, received };
  }
  async function until(received: Msg[], pred: (m: Msg) => boolean): Promise<Msg> {
    for (let i = 0; i < 200; i++) {
      const found = received.find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`timed out; got ${received.map((m) => m.type).join(', ')}`);
  }

  it('binds a plain connection to the default project: project_opened, project_list, then its snapshot', async () => {
    const { received } = await client();
    await until(received, (m) => m.type === 'chat_snapshot');
    expect(received.map((m) => m.type)).toEqual(['project_opened', 'project_list', 'chat_snapshot']);
    const id = host.defaultProjectId();
    expect(received[0].project).toMatchObject({ id, title: 'Sandbox' });
    expect(received[1].projects.map((p: Msg) => p.id)).toEqual([id]);
    expect(received[2].graph.id).toBe(id);
  });

  it('?project=<id> binds to that project; an unknown id falls back to the default', async () => {
    const other = await host.create('Other');
    const a = await client(`/?project=${other.id}`);
    expect((await until(a.received, (m) => m.type === 'chat_snapshot')).graph.id).toBe(other.id);
    expect(a.received[0].project.id).toBe(other.id);

    const fallback = host.defaultProjectId();
    const b = await client('/?project=cg_nope');
    expect((await until(b.received, (m) => m.type === 'chat_snapshot')).graph.id).toBe(fallback);
  });

  it('two clients on two projects: chat messages go to the bound manager, events stay in their project', async () => {
    const sandbox = host.defaultProjectId();
    const other = await host.create('Other');
    const a = await client();
    const b = await client(`/?project=${other.id}`);
    await until(b.received, (m) => m.type === 'chat_snapshot');

    a.ws.send(JSON.stringify({ type: 'chat_create_requested', position: { x: 0, y: 0 }, title: 'in A' }));
    b.ws.send(JSON.stringify({ type: 'doc_create_requested', canvasId: 'root', title: 'in B', position: { x: 0, y: 0 } }));
    await until(a.received, (m) => m.type === 'chat_created');
    await until(b.received, (m) => m.type === 'doc_created');
    await new Promise((r) => setTimeout(r, 50));

    expect(a.received.some((m) => m.type === 'doc_created')).toBe(false);
    expect(b.received.some((m) => m.type === 'chat_created')).toBe(false);
    expect(Object.values(host.open(sandbox).graph.chats).map((c) => c.title)).toEqual(['in A']);
    expect(Object.values(host.open(other.id).graph.docs).map((d) => d.title)).toEqual(['in B']);
    expect(host.open(sandbox).graph.docs).toEqual({});
  });

  it('project_open_requested rebinds the socket and makes it the last-opened project', async () => {
    const other = await host.create('Other');
    const a = await client();
    await until(a.received, (m) => m.type === 'chat_snapshot');
    a.received.length = 0;

    a.ws.send(JSON.stringify({ type: 'project_open_requested', id: other.id }));
    expect((await until(a.received, (m) => m.type === 'chat_snapshot')).graph.id).toBe(other.id);
    expect(a.received.map((m) => m.type)).toEqual(['project_opened', 'project_list', 'chat_snapshot']);
    expect(a.received[0].project.id).toBe(other.id);
    expect(host.defaultProjectId()).toBe(other.id);

    a.ws.send(JSON.stringify({ type: 'chat_create_requested', position: { x: 0, y: 0 } }));
    await until(a.received, (m) => m.type === 'chat_created');
    expect(Object.keys(host.open(other.id).graph.chats)).toHaveLength(1);

    a.ws.send(JSON.stringify({ type: 'project_open_requested', id: 'cg_nope' }));
    expect((await until(a.received, (m) => m.type === 'error')).message).toMatch(/unknown project/);

    a.received.length = 0;
    a.ws.send(JSON.stringify({ type: 'project_list_requested' }));
    expect((await until(a.received, (m) => m.type === 'project_list')).projects).toHaveLength(2);
  });
});
