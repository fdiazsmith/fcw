import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './state-manager.js';
import type { GraphDocument } from '@fcw/graph-core';

/** Inline auto-collapse check — avoids cross-package import that breaks rootDir */
function getAutoCollapsedNodes(doc: GraphDocument): Set<string> {
  const result = new Set<string>();
  for (const [id, node] of Object.entries(doc.nodes)) {
    if (node.executionStatus === 'completed' && node.pathStatus === 'archived') {
      result.add(id);
    }
  }
  return result;
}

describe('Full branching + auto-collapse integration', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('archives C and auto-collapses it after branch from B, keeps B tool children active', () => {
    // Build graph: A -reply_to-> B -reply_to-> C
    const a = manager.createNode('user_prompt', 'A');
    const b = manager.createNode('response', 'B', a);
    const c = manager.createNode('response', 'C', b);

    // B also has: B -tool_call-> T1 -tool_result-> T2
    const t1 = manager.createNode('tool_call', 'T1');
    manager.createEdge(b, t1, 'tool_call');
    const t2 = manager.createNode('tool_result', 'T2');
    manager.createEdge(t1, t2, 'tool_result');

    // Set all nodes to executionStatus: completed
    for (const nodeId of [a, b, c, t1, t2]) {
      manager.setExecutionStatus(nodeId, 'completed');
    }

    // Collect auto_collapsed events
    const autoCollapsedIds: string[] = [];
    manager.on('node_auto_collapsed', (evt) => {
      autoCollapsedIds.push(evt.nodeId);
    });

    // Branch from B: create a new branch node connected to B, then apply path update
    const branchNode = manager.createNode('annotation', '[branch]');
    manager.createEdge(b, branchNode, 'branches_from');
    manager.applyBranchPathUpdate(branchNode);

    // C is NOT on the active path from branchNode (path: branchNode -> B -> A)
    // C should be archived
    expect(manager.document.nodes[c].pathStatus).toBe('archived');

    // T1 and T2 are children of B which IS on the active path — they stay active
    expect(manager.document.nodes[t1].pathStatus).toBe('active');
    expect(manager.document.nodes[t2].pathStatus).toBe('active');

    // auto-collapse event should have fired for C (completed + archived)
    expect(autoCollapsedIds).toContain(c);

    // T1 and T2 should NOT have auto-collapse events (they remain active)
    expect(autoCollapsedIds).not.toContain(t1);
    expect(autoCollapsedIds).not.toContain(t2);

    // Frontend getAutoCollapsedNodes should include C but not T1/T2
    const autoCollapsed = getAutoCollapsedNodes(manager.document);
    expect(autoCollapsed.has(c)).toBe(true);
    expect(autoCollapsed.has(t1)).toBe(false);
    expect(autoCollapsed.has(t2)).toBe(false);
  });

  it('does not auto-collapse a node that is archived but not completed', () => {
    const nodeId = manager.createNode('response', 'Node');
    // Only set pathStatus, leave executionStatus as 'completed' (default)
    // Actually override to 'in_progress' to test incomplete path
    manager.document.nodes[nodeId].executionStatus = 'in_progress';

    const autoCollapsedIds: string[] = [];
    manager.on('node_auto_collapsed', (evt) => {
      autoCollapsedIds.push(evt.nodeId);
    });

    manager.setPathStatus(nodeId, 'archived');

    // executionStatus is in_progress so it should NOT auto-collapse
    expect(autoCollapsedIds).not.toContain(nodeId);

    const autoCollapsed = getAutoCollapsedNodes(manager.document);
    expect(autoCollapsed.has(nodeId)).toBe(false);
  });

  it('does not auto-collapse a node that is completed but still active', () => {
    const nodeId = manager.createNode('response', 'Node');
    manager.setExecutionStatus(nodeId, 'completed');

    const autoCollapsedIds: string[] = [];
    manager.on('node_auto_collapsed', (evt) => {
      autoCollapsedIds.push(evt.nodeId);
    });

    // pathStatus remains 'active' (default)
    expect(manager.document.nodes[nodeId].pathStatus).toBe('active');
    expect(autoCollapsedIds).not.toContain(nodeId);

    const autoCollapsed = getAutoCollapsedNodes(manager.document);
    expect(autoCollapsed.has(nodeId)).toBe(false);
  });
});
