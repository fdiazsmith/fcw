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

  describe('setExecutionStatus', () => {
    it('updates node executionStatus field', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      manager.setExecutionStatus(nodeId, 'in_progress');
      expect(manager.document.nodes[nodeId].executionStatus).toBe('in_progress');
    });

    it('emits execution_status_changed event with correct payload', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      const handler = vi.fn();
      manager.on('execution_status_changed', handler);
      manager.setExecutionStatus(nodeId, 'in_progress');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({
        type: 'execution_status_changed',
        nodeId,
        executionStatus: 'in_progress',
      });
    });

    it('throws when node not found', () => {
      expect(() => manager.setExecutionStatus('nonexistent', 'in_progress')).toThrow('not found');
    });

    it('emits node_auto_collapsed when executionStatus=completed AND pathStatus=archived', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      // First set pathStatus to archived
      manager.setPathStatus(nodeId, 'archived');
      const handler = vi.fn();
      manager.on('node_auto_collapsed', handler);
      // Now set executionStatus to completed — both conditions met
      manager.setExecutionStatus(nodeId, 'completed');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({ type: 'node_auto_collapsed', nodeId });
    });

    it('does NOT emit node_auto_collapsed when only executionStatus=completed but pathStatus=active', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      // pathStatus defaults to 'active'
      const handler = vi.fn();
      manager.on('node_auto_collapsed', handler);
      manager.setExecutionStatus(nodeId, 'completed');
      expect(handler).not.toHaveBeenCalled();
    });

    it('does NOT emit node_auto_collapsed when executionStatus=in_progress even if pathStatus=archived', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      manager.setPathStatus(nodeId, 'archived');
      const handler = vi.fn();
      manager.on('node_auto_collapsed', handler);
      manager.setExecutionStatus(nodeId, 'in_progress');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('setPathStatus', () => {
    it('updates node pathStatus field', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      manager.setPathStatus(nodeId, 'archived');
      expect(manager.document.nodes[nodeId].pathStatus).toBe('archived');
    });

    it('emits path_status_changed event with correct payload', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      const handler = vi.fn();
      manager.on('path_status_changed', handler);
      manager.setPathStatus(nodeId, 'archived');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({
        type: 'path_status_changed',
        nodeId,
        pathStatus: 'archived',
      });
    });

    it('throws when node not found', () => {
      expect(() => manager.setPathStatus('nonexistent', 'archived')).toThrow('not found');
    });

    it('emits node_auto_collapsed when pathStatus=archived AND executionStatus=completed', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      // executionStatus defaults to 'completed'
      const handler = vi.fn();
      manager.on('node_auto_collapsed', handler);
      manager.setPathStatus(nodeId, 'archived');
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({ type: 'node_auto_collapsed', nodeId });
    });

    it('does NOT emit node_auto_collapsed when pathStatus=active', () => {
      const nodeId = manager.createNode('user_prompt', 'Hello');
      manager.setPathStatus(nodeId, 'archived'); // archived first
      const handler = vi.fn();
      manager.on('node_auto_collapsed', handler);
      manager.setPathStatus(nodeId, 'active'); // back to active — should NOT fire
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('computeActivePath', () => {
    it('returns single-node set for a root node', () => {
      const a = manager.createNode('user_prompt', 'A');
      const result = manager.computeActivePath(a);
      expect(result).toEqual(new Set([a]));
    });

    it('returns full path for linear chain A->B->C via reply_to edges', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a); // creates reply_to edge a->b
      const c = manager.createNode('user_prompt', 'C', b); // creates reply_to edge b->c
      const result = manager.computeActivePath(c);
      expect(result).toEqual(new Set([a, b, c]));
    });

    it('follows branches_from edges in addition to reply_to', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B');
      manager.createEdge(a, b, 'branches_from');
      const c = manager.createNode('user_prompt', 'C', b);
      const result = manager.computeActivePath(c);
      expect(result).toEqual(new Set([a, b, c]));
    });

    it('does NOT follow tool_call edges', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const c = manager.createNode('user_prompt', 'C', b);
      const t1 = manager.createNode('tool_call', 'T1');
      manager.createEdge(b, t1, 'tool_call');
      // computeActivePath(C) should NOT include T1
      const result = manager.computeActivePath(c);
      expect(result).toEqual(new Set([a, b, c]));
      expect(result.has(t1)).toBe(false);
    });

    it('does NOT follow references edges', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const c = manager.createNode('user_prompt', 'C', b);
      const d = manager.createNode('annotation', 'D');
      manager.createEdge(d, b, 'references');
      // D references B, but D should not appear in the active path from C
      const result = manager.computeActivePath(c);
      expect(result).toEqual(new Set([a, b, c]));
      expect(result.has(d)).toBe(false);
    });

    it('edge-type filtering: A-reply_to->B-reply_to->C with B-tool_call->T1 and D-references->B', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const c = manager.createNode('user_prompt', 'C', b);
      const t1 = manager.createNode('tool_call', 'T1');
      const d = manager.createNode('annotation', 'D');
      manager.createEdge(b, t1, 'tool_call');
      manager.createEdge(d, b, 'references');
      const result = manager.computeActivePath(c);
      expect(result).toEqual(new Set([a, b, c]));
      expect(result.has(t1)).toBe(false);
      expect(result.has(d)).toBe(false);
    });
  });

  describe('getToolNodeChildren', () => {
    it('returns empty array when node has no tool_call edges', () => {
      const a = manager.createNode('user_prompt', 'A');
      expect(manager.getToolNodeChildren(a)).toEqual([]);
    });

    it('returns direct tool_call children', () => {
      const a = manager.createNode('response', 'A');
      const t1 = manager.createNode('tool_call', 'T1');
      manager.createEdge(a, t1, 'tool_call');
      expect(manager.getToolNodeChildren(a)).toContain(t1);
    });

    it('returns tool_result children of tool_call nodes (transitive)', () => {
      const a = manager.createNode('response', 'A');
      const t1 = manager.createNode('tool_call', 'T1');
      const r1 = manager.createNode('tool_result', 'R1');
      manager.createEdge(a, t1, 'tool_call');
      manager.createEdge(t1, r1, 'tool_result');
      const children = manager.getToolNodeChildren(a);
      expect(children).toContain(t1);
      expect(children).toContain(r1);
    });
  });

  describe('applyBranchPathUpdate', () => {
    it('archives nodes not on the active path', () => {
      // Build: A -> B -> C (active path), with B -> D as a branch that went nowhere
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const c = manager.createNode('user_prompt', 'C', b);
      const d = manager.createNode('response', 'D');
      manager.createEdge(b, d, 'reply_to'); // B has two children: C and D

      // C is the new tip — active path is A,B,C; D should be archived
      manager.applyBranchPathUpdate(c);

      expect(manager.document.nodes[a].pathStatus).toBe('active');
      expect(manager.document.nodes[b].pathStatus).toBe('active');
      expect(manager.document.nodes[c].pathStatus).toBe('active');
      expect(manager.document.nodes[d].pathStatus).toBe('archived');
    });

    it('reactivates previously archived nodes when they join the active path', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const c = manager.createNode('user_prompt', 'C', b);
      // Manually archive all nodes first
      manager.setPathStatus(a, 'archived');
      manager.setPathStatus(b, 'archived');
      manager.setPathStatus(c, 'archived');

      // Now apply branch update with c as tip — should reactivate A, B, C
      manager.applyBranchPathUpdate(c);

      expect(manager.document.nodes[a].pathStatus).toBe('active');
      expect(manager.document.nodes[b].pathStatus).toBe('active');
      expect(manager.document.nodes[c].pathStatus).toBe('active');
    });

    it('archives tool_call children of archived spine nodes', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const c = manager.createNode('user_prompt', 'C', b);
      const d = manager.createNode('response', 'D');
      manager.createEdge(b, d, 'reply_to'); // off-path branch from B
      const t1 = manager.createNode('tool_call', 'T1');
      const r1 = manager.createNode('tool_result', 'R1');
      manager.createEdge(d, t1, 'tool_call');
      manager.createEdge(t1, r1, 'tool_result');

      manager.applyBranchPathUpdate(c);

      expect(manager.document.nodes[d].pathStatus).toBe('archived');
      expect(manager.document.nodes[t1].pathStatus).toBe('archived');
      expect(manager.document.nodes[r1].pathStatus).toBe('archived');
    });

    it('activates tool_call children of reactivated spine nodes', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const t1 = manager.createNode('tool_call', 'T1');
      const r1 = manager.createNode('tool_result', 'R1');
      manager.createEdge(b, t1, 'tool_call');
      manager.createEdge(t1, r1, 'tool_result');

      // Archive everything first
      manager.setPathStatus(a, 'archived');
      manager.setPathStatus(b, 'archived');
      manager.setPathStatus(t1, 'archived');
      manager.setPathStatus(r1, 'archived');

      // Branch from b — should reactivate A, B and their tool children
      manager.applyBranchPathUpdate(b);

      expect(manager.document.nodes[a].pathStatus).toBe('active');
      expect(manager.document.nodes[b].pathStatus).toBe('active');
      expect(manager.document.nodes[t1].pathStatus).toBe('active');
      expect(manager.document.nodes[r1].pathStatus).toBe('active');
    });

    it('emits path_status_changed events for all changed nodes', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const c = manager.createNode('user_prompt', 'C', b);
      const d = manager.createNode('response', 'D');
      manager.createEdge(b, d, 'reply_to');

      const handler = vi.fn();
      manager.on('path_status_changed', handler);
      manager.applyBranchPathUpdate(c);

      // D should have been archived — at minimum one event for D
      const calls = handler.mock.calls.map((c) => c[0]);
      const dEvent = calls.find((ev) => ev.nodeId === d);
      expect(dEvent).toBeDefined();
      expect(dEvent.pathStatus).toBe('archived');
    });

    it('branch from archived node: reactivates entire path from root to new tip', () => {
      const a = manager.createNode('user_prompt', 'A');
      const b = manager.createNode('response', 'B', a);
      const c = manager.createNode('user_prompt', 'C', b);
      // Branch off b to create d — c will be archived
      const d = manager.createNode('response', 'D');
      manager.createEdge(b, d, 'reply_to');

      // Archive c as if it was on a previous active branch that got superseded
      manager.setPathStatus(a, 'archived');
      manager.setPathStatus(b, 'archived');
      manager.setPathStatus(c, 'archived');

      // Now branch from c (archived) — should reactivate A->B->C and archive D
      manager.applyBranchPathUpdate(c);

      expect(manager.document.nodes[a].pathStatus).toBe('active');
      expect(manager.document.nodes[b].pathStatus).toBe('active');
      expect(manager.document.nodes[c].pathStatus).toBe('active');
      expect(manager.document.nodes[d].pathStatus).toBe('archived');
    });
  });
});
