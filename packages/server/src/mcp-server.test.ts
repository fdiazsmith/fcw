import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StateManager } from './state-manager.js';
import { createMcpServer } from './mcp-server.js';

describe('MCP Server', () => {
  let manager: StateManager;
  let client: Client;

  beforeEach(async () => {
    manager = new StateManager();
    const mcpServer = createMcpServer(manager);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '0.0.1' });
    await client.connect(clientTransport);
  });

  afterEach(() => {
    manager.destroy();
  });

  it('canvas_branch is NOT registered', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('canvas_branch');
  });

  it('lists all 9 canvas tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'annotate_node',
      'branch_from_node',
      'canvas_connect',
      'canvas_create_node',
      'canvas_get_context',
      'canvas_set_status',
      'canvas_update_node',
      'collapse_subtree',
      'mark_active',
      'mark_archived',
    ]);
  });

  it('branch_from_node is registered', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('branch_from_node');
  });

  it('collapse_subtree is registered', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('collapse_subtree');
  });

  it('annotate_node is registered', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('annotate_node');
  });

  it('mark_archived is registered', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('mark_archived');
  });

  it('mark_active is registered', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('mark_active');
  });

  it('canvas_create_node creates node via MCP protocol', async () => {
    const res = await client.callTool({
      name: 'canvas_create_node',
      arguments: { type: 'thought', content: 'MCP test node' },
    });
    const parsed = JSON.parse((res.content as any)[0].text);
    expect(parsed.node_id).toBeDefined();
    expect(manager.document.nodes[parsed.node_id].content).toBe('MCP test node');
  });

  it('canvas_get_context returns graph state via MCP protocol', async () => {
    manager.createNode('user_prompt', 'Hello');
    const res = await client.callTool({
      name: 'canvas_get_context',
      arguments: {},
    });
    const parsed = JSON.parse((res.content as any)[0].text);
    expect(Object.keys(parsed.nodes)).toHaveLength(1);
  });

  it('branch_from_node creates branch via MCP protocol', async () => {
    const nodeId = manager.createNode('user_prompt', 'Origin');
    const res = await client.callTool({
      name: 'branch_from_node',
      arguments: { node_id: nodeId },
    });
    const parsed = JSON.parse((res.content as any)[0].text);
    expect(parsed.branch_id).toBeDefined();
    expect(parsed.position).toBeDefined();
    expect(manager.document.nodes[parsed.branch_id].type).toBe('annotation');
  });

  it('collapse_subtree archives subtree via MCP protocol', async () => {
    const n1 = manager.createNode('user_prompt', 'Root');
    const n2 = manager.createNode('response', 'Child', n1);
    const res = await client.callTool({
      name: 'collapse_subtree',
      arguments: { node_id: n1 },
    });
    const parsed = JSON.parse((res.content as any)[0].text);
    expect(parsed.success).toBe(true);
    expect(manager.document.nodes[n1].pathStatus).toBe('archived');
    expect(manager.document.nodes[n2].pathStatus).toBe('archived');
  });

  it('annotate_node creates annotation via MCP protocol', async () => {
    const targetId = manager.createNode('response', 'Target');
    const res = await client.callTool({
      name: 'annotate_node',
      arguments: { node_id: targetId, text: 'A note' },
    });
    const parsed = JSON.parse((res.content as any)[0].text);
    expect(parsed.annotation_id).toBeDefined();
    expect(parsed.position).toBeDefined();
  });

  it('mark_archived sets pathStatus via MCP protocol', async () => {
    const nodeId = manager.createNode('response', 'Main');
    manager.setPathStatus(nodeId, 'active');
    const res = await client.callTool({
      name: 'mark_archived',
      arguments: { node_id: nodeId },
    });
    const parsed = JSON.parse((res.content as any)[0].text);
    expect(parsed.success).toBe(true);
    expect(manager.document.nodes[nodeId].pathStatus).toBe('archived');
  });

  it('mark_active sets pathStatus via MCP protocol', async () => {
    const nodeId = manager.createNode('response', 'Main');
    manager.setPathStatus(nodeId, 'archived');
    const res = await client.callTool({
      name: 'mark_active',
      arguments: { node_id: nodeId },
    });
    const parsed = JSON.parse((res.content as any)[0].text);
    expect(parsed.success).toBe(true);
    expect(manager.document.nodes[nodeId].pathStatus).toBe('active');
  });

  it('tools have descriptions', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(10);
    }
  });
});
