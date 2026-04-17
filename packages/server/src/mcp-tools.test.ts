import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './state-manager.js';
import {
  handleCreateNode,
  handleUpdateNode,
  handleConnect,
  handleBranchFromNode,
  handleCollapseSubtree,
  handleAnnotateNode,
  handleMarkArchived,
  handleMarkActive,
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

  describe('handleBranchFromNode', () => {
    it('creates annotation branch node and returns branch_id + position', () => {
      const fromId = manager.createNode('user_prompt', 'Origin');
      const result = handleBranchFromNode({ node_id: fromId }, manager);
      expect(result.branch_id).toBeDefined();
      expect(result.position).toBeDefined();
      const branchNode = manager.document.nodes[result.branch_id];
      expect(branchNode).toBeDefined();
      expect(branchNode.type).toBe('annotation');
    });

    it('connects branch via branches_from edge', () => {
      const fromId = manager.createNode('user_prompt', 'Origin');
      const result = handleBranchFromNode({ node_id: fromId }, manager);
      const edge = manager.document.edges.find(
        (e) => e.from === fromId && e.to === result.branch_id && e.type === 'branches_from',
      );
      expect(edge).toBeDefined();
    });

    it('calls applyBranchPathUpdate with branchId', () => {
      const fromId = manager.createNode('user_prompt', 'Origin');
      let capturedId: string | undefined;
      const origApply = manager.applyBranchPathUpdate.bind(manager);
      manager.applyBranchPathUpdate = (id: string) => {
        capturedId = id;
        origApply(id);
      };
      const result = handleBranchFromNode({ node_id: fromId }, manager);
      expect(capturedId).toBe(result.branch_id);
    });

    it('throws on non-existent node_id', () => {
      expect(() => handleBranchFromNode({ node_id: 'nonexistent' }, manager)).toThrow();
    });
  });

  describe('handleCollapseSubtree', () => {
    it('sets pathStatus archived on node and all descendants', () => {
      const n1 = manager.createNode('user_prompt', 'Root');
      const n2 = manager.createNode('response', 'Child', n1);
      const n3 = manager.createNode('response', 'Grandchild', n2);
      const result = handleCollapseSubtree({ node_id: n1 }, manager);
      expect(result.success).toBe(true);
      expect(manager.document.nodes[n1].pathStatus).toBe('archived');
      expect(manager.document.nodes[n2].pathStatus).toBe('archived');
      expect(manager.document.nodes[n3].pathStatus).toBe('archived');
    });

    it('only archives the subtree, not unrelated nodes', () => {
      const n1 = manager.createNode('user_prompt', 'Root');
      const n2 = manager.createNode('response', 'Child', n1);
      const unrelated = manager.createNode('thought', 'Unrelated');
      handleCollapseSubtree({ node_id: n1 }, manager);
      // unrelated node defaults to 'active' and must stay 'active' — not touched by collapse
      expect(manager.document.nodes[unrelated].pathStatus).toBe('active');
    });

    it('throws on non-existent node_id', () => {
      expect(() => handleCollapseSubtree({ node_id: 'nonexistent' }, manager)).toThrow();
    });
  });

  describe('handleAnnotateNode', () => {
    it('creates annotation node connected via references edge', () => {
      const targetId = manager.createNode('response', 'Target');
      const result = handleAnnotateNode({ node_id: targetId, text: 'My note' }, manager);
      expect(result.annotation_id).toBeDefined();
      expect(result.position).toBeDefined();
      const annNode = manager.document.nodes[result.annotation_id];
      expect(annNode).toBeDefined();
      expect(annNode.type).toBe('annotation');
      expect(annNode.content).toBe('My note');
    });

    it('connects annotation via references edge from target', () => {
      const targetId = manager.createNode('response', 'Target');
      const result = handleAnnotateNode({ node_id: targetId, text: 'My note' }, manager);
      const edge = manager.document.edges.find(
        (e) => e.from === targetId && e.to === result.annotation_id && e.type === 'references',
      );
      expect(edge).toBeDefined();
    });

    it('throws on non-existent node_id', () => {
      expect(() => handleAnnotateNode({ node_id: 'nonexistent', text: 'note' }, manager)).toThrow();
    });
  });

  describe('handleMarkArchived', () => {
    it('sets pathStatus archived on node and its tool-node children', () => {
      const nodeId = manager.createNode('response', 'Main');
      const toolCallId = manager.createNode('tool_call', 'tc');
      const toolResultId = manager.createNode('tool_result', 'tr');
      manager.createEdge(nodeId, toolCallId, 'tool_call');
      manager.createEdge(toolCallId, toolResultId, 'tool_result');
      // Set them active first
      manager.setPathStatus(nodeId, 'active');
      manager.setPathStatus(toolCallId, 'active');
      manager.setPathStatus(toolResultId, 'active');

      const result = handleMarkArchived({ node_id: nodeId }, manager);
      expect(result.success).toBe(true);
      expect(manager.document.nodes[nodeId].pathStatus).toBe('archived');
      expect(manager.document.nodes[toolCallId].pathStatus).toBe('archived');
      expect(manager.document.nodes[toolResultId].pathStatus).toBe('archived');
    });

    it('throws on non-existent node_id', () => {
      expect(() => handleMarkArchived({ node_id: 'nonexistent' }, manager)).toThrow();
    });
  });

  describe('handleMarkActive', () => {
    it('sets pathStatus active on node and its tool-node children', () => {
      const nodeId = manager.createNode('response', 'Main');
      const toolCallId = manager.createNode('tool_call', 'tc');
      const toolResultId = manager.createNode('tool_result', 'tr');
      manager.createEdge(nodeId, toolCallId, 'tool_call');
      manager.createEdge(toolCallId, toolResultId, 'tool_result');
      // Set them archived first
      manager.setPathStatus(nodeId, 'archived');
      manager.setPathStatus(toolCallId, 'archived');
      manager.setPathStatus(toolResultId, 'archived');

      const result = handleMarkActive({ node_id: nodeId }, manager);
      expect(result.success).toBe(true);
      expect(manager.document.nodes[nodeId].pathStatus).toBe('active');
      expect(manager.document.nodes[toolCallId].pathStatus).toBe('active');
      expect(manager.document.nodes[toolResultId].pathStatus).toBe('active');
    });

    it('throws on non-existent node_id', () => {
      expect(() => handleMarkActive({ node_id: 'nonexistent' }, manager)).toThrow();
    });
  });

  describe('handleSetStatus', () => {
    it('sets node status and returns success', () => {
      const nodeId = manager.createNode('response', 'Hello');
      const result = handleSetStatus({ node_id: nodeId, status: 'completed' }, manager);
      expect(result.success).toBe(true);
      expect(manager.document.nodes[nodeId].status).toBe('completed');
    });

    it('throws on non-existent node', () => {
      expect(() =>
        handleSetStatus({ node_id: 'bad', status: 'completed' }, manager),
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

    it('includes executionStatus in result nodes', () => {
      const nodeId = manager.createNode('response', 'Hello');
      manager.setExecutionStatus(nodeId, 'completed');
      const result = handleGetContext({}, manager);
      expect(result.nodes[nodeId].executionStatus).toBe('completed');
    });

    it('includes pathStatus in result nodes', () => {
      const nodeId = manager.createNode('response', 'Hello');
      manager.setPathStatus(nodeId, 'archived');
      const result = handleGetContext({}, manager);
      expect(result.nodes[nodeId].pathStatus).toBe('archived');
    });

    it('includes executionStatus and pathStatus with defaults for new nodes', () => {
      const nodeId = manager.createNode('user_prompt', 'Test');
      const result = handleGetContext({}, manager);
      expect(result.nodes[nodeId].executionStatus).toBe('completed');
      expect(result.nodes[nodeId].pathStatus).toBe('active');
    });
  });
});
