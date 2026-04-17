import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StateManager } from './state-manager.js';
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

export function createMcpServer(stateManager: StateManager): McpServer {
  const mcp = new McpServer(
    { name: 'fcw-canvas', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  mcp.registerTool('canvas_create_node', {
    description:
      'Create a new node on the canvas. Use when you want to add a thought, response, code block, or annotation. ' +
      'If parent_id is provided, the node is connected via a reply_to edge. ' +
      'Example: create a "thought" node to capture reasoning before responding.',
    inputSchema: {
      type: z.enum(['user_prompt', 'response', 'code', 'tool_call', 'tool_result', 'thought', 'summary', 'annotation']),
      content: z.string(),
      parent_id: z.string().optional(),
      metadata: z.object({ status: z.enum(['streaming', 'completed', 'error']) }).optional(),
    },
  }, async (args) => {
    const result = handleCreateNode(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('canvas_update_node', {
    description:
      'Update the content of an existing node. Use to refine or replace text in a node you previously created.',
    inputSchema: {
      node_id: z.string(),
      content: z.string(),
    },
  }, async (args) => {
    const result = handleUpdateNode(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('canvas_connect', {
    description:
      'Create an edge between two existing nodes. Use to link related ideas, reference earlier context, or mark tool relationships. ' +
      'Edge types: reply_to, branches_from, references, tool_call, tool_result.',
    inputSchema: {
      from_id: z.string(),
      to_id: z.string(),
      edge_type: z.enum(['reply_to', 'branches_from', 'references', 'tool_call', 'tool_result']),
    },
  }, async (args) => {
    const result = handleConnect(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('branch_from_node', {
    description:
      'Create a branch point from an existing node. Use when the user asks to explore an alternative approach. ' +
      'Returns branch_id and position — use branch_id as parent_id for the first node of the new branch. ' +
      'Automatically updates path statuses so the new branch becomes active.',
    inputSchema: {
      node_id: z.string(),
    },
  }, async (args) => {
    const result = handleBranchFromNode(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('collapse_subtree', {
    description:
      'Archive a node and all its descendants by setting their pathStatus to "archived". ' +
      'Use to collapse a branch of the conversation that is no longer relevant.',
    inputSchema: {
      node_id: z.string(),
    },
  }, async (args) => {
    const result = handleCollapseSubtree(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('annotate_node', {
    description:
      'Create an annotation node attached to an existing node via a references edge. ' +
      'Use to add notes, observations, or commentary to a specific node without altering its content.',
    inputSchema: {
      node_id: z.string(),
      text: z.string(),
    },
  }, async (args) => {
    const result = handleAnnotateNode(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('mark_archived', {
    description:
      'Set pathStatus to "archived" on a node and its tool-call/tool-result children. ' +
      'Use to mark a node and its associated tool nodes as no longer on the active path.',
    inputSchema: {
      node_id: z.string(),
    },
  }, async (args) => {
    const result = handleMarkArchived(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('mark_active', {
    description:
      'Set pathStatus to "active" on a node and its tool-call/tool-result children. ' +
      'Use to restore a node and its associated tool nodes to the active path.',
    inputSchema: {
      node_id: z.string(),
    },
  }, async (args) => {
    const result = handleMarkActive(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('canvas_set_status', {
    description:
      'Set the status of a node: "streaming" (in progress), "completed" (done), or "error" (failed). ' +
      'Use to signal node lifecycle to the canvas UI.',
    inputSchema: {
      node_id: z.string(),
      status: z.enum(['streaming', 'completed', 'error']),
    },
  }, async (args) => {
    const result = handleSetStatus(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  mcp.registerTool('canvas_get_context', {
    description:
      'Read the canvas state. Returns nodes (with type and content preview) and edges around a given node. ' +
      'Use to understand the current conversation graph before making structural decisions. ' +
      'Omit node_id to get the full graph. Default depth is 2.',
    inputSchema: {
      node_id: z.string().optional(),
      depth: z.number().optional(),
    },
  }, async (args) => {
    const result = handleGetContext(args as any, stateManager);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });

  return mcp;
}
