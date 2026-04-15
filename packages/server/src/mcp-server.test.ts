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

  it('lists all 6 canvas tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'canvas_branch',
      'canvas_connect',
      'canvas_create_node',
      'canvas_get_context',
      'canvas_set_status',
      'canvas_update_node',
    ]);
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

  it('canvas_branch creates branch marker via MCP protocol', async () => {
    const nodeId = manager.createNode('user_prompt', 'Origin');
    const res = await client.callTool({
      name: 'canvas_branch',
      arguments: { from_id: nodeId },
    });
    const parsed = JSON.parse((res.content as any)[0].text);
    expect(parsed.branch_id).toBeDefined();
    expect(manager.document.nodes[parsed.branch_id].type).toBe('annotation');
  });

  it('tools have descriptions', async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(10);
    }
  });
});
