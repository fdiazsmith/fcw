import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateManager } from './state-manager.js';

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('createNode', () => {
    it('adds node to active document', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      expect(manager.document.nodes[nodeId]).toBeDefined();
      expect(manager.document.nodes[nodeId].content).toBe('Hello');
      expect(manager.document.nodes[nodeId].type).toBe('user_prompt');
    });

    it('emits node_created event with node data', () => {
      const handler = vi.fn();
      manager.on('node_created', handler);
      const nodeId = manager.createNode('user_prompt', 'Hello');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].node.id).toBe(nodeId);
      expect(handler.mock.calls[0][0].node.content).toBe('Hello');
    });

    it('supports optional parentId', () => {
      const parentId = manager.createNode('user_prompt', 'Parent');
      const childId = manager.createNode('response', 'Child', parentId);
      const edge = manager.document.edges.find(
        (e) => e.from === parentId && e.to === childId,
      );
      expect(edge).toBeDefined();
    });

    it('emits edge_created when creating a node with parentId', () => {
      const parentId = manager.createNode('user_prompt', 'Parent');
      const edgeHandler = vi.fn();
      manager.on('edge_created', edgeHandler);

      const childId = manager.createNode('response', 'Child', parentId);

      expect(edgeHandler).toHaveBeenCalledOnce();
      expect(edgeHandler.mock.calls[0][0].edge).toEqual({
        from: parentId,
        to: childId,
        type: 'reply_to',
      });
    });
  });

  describe('updateNodeContent', () => {
    it('emits node_updated event', () => {
      const nodeId = manager.createNode('user_prompt', 'Original');
      const handler = vi.fn();
      manager.on('node_updated', handler);
      manager.updateNodeContent(nodeId, 'Updated');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({ type: 'node_updated', nodeId, content: 'Updated' });
    });
  });

  describe('deleteNode', () => {
    it('emits node_deleted event', () => {
      const nodeId = manager.createNode('user_prompt', 'To delete');
      const handler = vi.fn();
      manager.on('node_deleted', handler);
      manager.deleteNode(nodeId);
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({ type: 'node_deleted', nodeId });
    });
  });

  describe('createEdge', () => {
    it('emits edge_created event', () => {
      const fromId = manager.createNode('user_prompt', 'From');
      const toId = manager.createNode('response', 'To');
      const handler = vi.fn();
      manager.on('edge_created', handler);
      manager.createEdge(fromId, toId, 'reply_to');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].edge.from).toBe(fromId);
      expect(handler.mock.calls[0][0].edge.to).toBe(toId);
    });
  });

  describe('setNodeStatus', () => {
    it('emits node_status_changed event', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      const handler = vi.fn();
      manager.on('node_status_changed', handler);
      manager.setNodeStatus(nodeId, 'streaming');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({
        type: 'node_status_changed',
        nodeId,
        status: 'streaming',
      });
    });
  });

  describe('auto-save', () => {
    it('schedules debounced save after mutations', async () => {
      const saveFn = vi.fn().mockResolvedValue(undefined);
      manager.setSaveHandler(saveFn);
      manager.createNode('user_prompt', 'Hello');
      manager.createNode('response', 'World');
      // Save should not have been called yet (debounced)
      expect(saveFn).not.toHaveBeenCalled();
      // Wait for debounce
      await vi.waitFor(() => expect(saveFn).toHaveBeenCalledOnce(), { timeout: 1000 });
    });
  });
});
