import type Anthropic from '@anthropic-ai/sdk';
import { StateManager } from './state-manager.js';
import type { NodeType, EdgeType } from '@fcw/graph-core';

/**
 * Canvas tools exposed to Claude API as tool definitions.
 * When Claude calls these tools, the server executes them against the StateManager.
 */
export const CANVAS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'canvas_create_node',
    description:
      'Create a new node on the canvas. Use this to break your response into structured pieces — each concept, section, code block, or step should be its own node. Always prefer multiple small nodes over one large response. Connect nodes to their parent to build a diagram.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: ['response', 'code', 'thought', 'summary', 'annotation'],
          description:
            'Node type. Use "response" for explanations, "code" for code blocks, "thought" for reasoning steps, "summary" for overviews.',
        },
        content: {
          type: 'string',
          description: 'The content of the node. Keep it focused — one idea per node.',
        },
        parent_id: {
          type: 'string',
          description:
            'ID of the parent node to connect to. Use the user_prompt node ID or a previously created node ID.',
        },
      },
      required: ['type', 'content'],
    },
  },
  {
    name: 'canvas_connect',
    description:
      'Create an edge between two existing nodes. Use "reply_to" for sequential flow, "branches_from" for alternatives, "references" for cross-links.',
    input_schema: {
      type: 'object' as const,
      properties: {
        from_id: { type: 'string', description: 'Source node ID' },
        to_id: { type: 'string', description: 'Target node ID' },
        edge_type: {
          type: 'string',
          enum: ['reply_to', 'branches_from', 'references'],
          description: 'Type of connection between nodes.',
        },
      },
      required: ['from_id', 'to_id', 'edge_type'],
    },
  },
];

export interface CanvasToolResult {
  node_id?: string;
  success?: boolean;
  error?: string;
}

export function executeCanvasTool(
  name: string,
  input: Record<string, unknown>,
  manager: StateManager,
): CanvasToolResult {
  try {
    if (name === 'canvas_create_node') {
      const type = input.type as NodeType;
      const content = input.content as string;
      const parentId = input.parent_id as string | undefined;
      const nodeId = manager.createNode(type, content, parentId);
      return { node_id: nodeId, success: true };
    }

    if (name === 'canvas_connect') {
      const fromId = input.from_id as string;
      const toId = input.to_id as string;
      const edgeType = input.edge_type as EdgeType;
      manager.createEdge(fromId, toId, edgeType);
      return { success: true };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
