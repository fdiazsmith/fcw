import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './state-manager.js';
import {
  handleCreateNode,
  handleUpdateNode,
  handleConnect,
  handleBranch,
  handleSetStatus,
  handleGetContext,
} from './mcp-tools.js';

describe('MCP Tool Handlers', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('handleCreateNode', () => {
    it('creates node and returns node_id + position', () => {
      const result = handleCreateNode(
        { type: 'user_prompt', content: 'Hello world' },
        manager,
      );
      expect(result.node_id).toBeDefined();
      expect(result.position).toBeDefined();
      expect(result.position.x).toBeTypeOf('number');
      expect(result.position.y).toBeTypeOf('number');
      expect(manager.document.nodes[result.node_id].content).toBe('Hello world');
    });

    it('creates node with parent and auto-connects via reply_to', () => {
      const parentId = manager.createNode('user_prompt', 'Parent');
      const result = handleCreateNode(
        { type: 'response', content: 'Child', parent_id: parentId },
        manager,
      );
      const edge = manager.document.edges.find(
        (e) => e.from === parentId && e.to === result.node_id && e.type === 'reply_to',
      );
      expect(edge).toBeDefined();
    });

    it('creates node with metadata status', () => {
      const result = handleCreateNode(
        { type: 'response', content: 'Streaming', metadata: { status: 'streaming' } },
        manager,
      );
      expect(manager.document.nodes[result.node_id].status).toBe('streaming');
    });

    it('throws on invalid node type', () => {
      expect(() =>
        handleCreateNode({ type: 'invalid_type' as any, content: 'x' }, manager),
      ).toThrow();
    });
  });

  describe('handleUpdateNode', () => {
    it('updates content and returns success', () => {
      const nodeId = manager.createNode('user_prompt', 'Original');
      const result = handleUpdateNode({ node_id: nodeId, content: 'Updated' }, manager);
      expect(result.success).toBe(true);
      expect(manager.document.nodes[nodeId].content).toBe('Updated');
    });

    it('throws on non-existent node', () => {
      expect(() =>
        handleUpdateNode({ node_id: 'nonexistent', content: 'x' }, manager),
      ).toThrow();
    });
  });

  describe('handleConnect', () => {
    it('creates edge and returns success', () => {
      const fromId = manager.createNode('user_prompt', 'From');
      const toId = manager.createNode('response', 'To');
      const result = handleConnect(
        { from_id: fromId, to_id: toId, edge_type: 'references' },
        manager,
      );
      expect(result.success).toBe(true);
      const edge = manager.document.edges.find(
        (e) => e.from === fromId && e.to === toId && e.type === 'references',
      );
      expect(edge).toBeDefined();
    });

    it('throws on non-existent source node', () => {
      const toId = manager.createNode('response', 'To');
      expect(() =>
        handleConnect({ from_id: 'bad', to_id: toId, edge_type: 'references' }, manager),
      ).toThrow();
    });
  });

  describe('handleBranch', () => {
    it('creates branch marker node and returns branch_id', () => {
      const fromId = manager.createNode('user_prompt', 'Origin');
      const result = handleBranch({ from_id: fromId }, manager);
      expect(result.branch_id).toBeDefined();
      const branchNode = manager.document.nodes[result.branch_id];
      expect(branchNode).toBeDefined();
      expect(branchNode.type).toBe('annotation');
      // Branch should be connected to origin via branches_from edge
      const edge = manager.document.edges.find(
        (e) => e.from === fromId && e.to === result.branch_id && e.type === 'branches_from',
      );
      expect(edge).toBeDefined();
    });

    it('throws on non-existent from_id', () => {
      expect(() => handleBranch({ from_id: 'nonexistent' }, manager)).toThrow();
    });
  });

  describe('handleSetStatus', () => {
    it('sets node status and returns success', () => {
      const nodeId = manager.createNode('response', 'Hello');
      const result = handleSetStatus({ node_id: nodeId, status: 'complete' }, manager);
      expect(result.success).toBe(true);
      expect(manager.document.nodes[nodeId].status).toBe('complete');
    });

    it('throws on non-existent node', () => {
      expect(() =>
        handleSetStatus({ node_id: 'bad', status: 'complete' }, manager),
      ).toThrow();
    });
  });

  describe('handleGetContext', () => {
    it('returns full graph when no node_id specified', () => {
      const n1 = manager.createNode('user_prompt', 'Hello');
      const n2 = manager.createNode('response', 'World', n1);
      const result = handleGetContext({}, manager);
      expect(Object.keys(result.nodes)).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
      // Nodes should have content summaries
      expect(result.nodes[n1].type).toBe('user_prompt');
      expect(result.nodes[n1].content_preview).toBeDefined();
    });

    it('returns subgraph around node_id with given depth', () => {
      const n1 = manager.createNode('user_prompt', 'A');
      const n2 = manager.createNode('response', 'B', n1);
      const n3 = manager.createNode('response', 'C', n2);
      const result = handleGetContext({ node_id: n1, depth: 1 }, manager);
      // depth=1: n1 and n2 (direct neighbor), but not n3
      expect(Object.keys(result.nodes)).toHaveLength(2);
      expect(result.nodes[n1]).toBeDefined();
      expect(result.nodes[n2]).toBeDefined();
      expect(result.nodes[n3]).toBeUndefined();
    });

    it('defaults depth to 2', () => {
      const n1 = manager.createNode('user_prompt', 'A');
      const n2 = manager.createNode('response', 'B', n1);
      const n3 = manager.createNode('response', 'C', n2);
      const n4 = manager.createNode('response', 'D', n3);
      const result = handleGetContext({ node_id: n1 }, manager);
      // depth=2: n1, n2, n3 but not n4
      expect(Object.keys(result.nodes)).toHaveLength(3);
      expect(result.nodes[n4]).toBeUndefined();
    });

    it('truncates long content in preview', () => {
      const longContent = 'A'.repeat(300);
      const nodeId = manager.createNode('user_prompt', longContent);
      const result = handleGetContext({}, manager);
      expect(result.nodes[nodeId].content_preview.length).toBeLessThan(300);
    });
  });
});
