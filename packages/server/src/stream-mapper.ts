import { StateManager } from './state-manager.js';
import { formatErrorMessage } from './error-format.js';

// Anthropic stream event types (subset we care about)
export interface ContentBlockStartText {
  type: 'content_block_start';
  index: number;
  content_block: { type: 'text'; text: string };
}

export interface ContentBlockStartToolUse {
  type: 'content_block_start';
  index: number;
  content_block: { type: 'tool_use'; id: string; name: string; input: unknown };
}

export type ContentBlockStart = ContentBlockStartText | ContentBlockStartToolUse;

export interface ContentBlockDeltaText {
  type: 'content_block_delta';
  index: number;
  delta: { type: 'text_delta'; text: string };
}

export interface ContentBlockDeltaJson {
  type: 'content_block_delta';
  index: number;
  delta: { type: 'input_json_delta'; partial_json: string };
}

export type ContentBlockDelta = ContentBlockDeltaText | ContentBlockDeltaJson;

export interface ContentBlockStop {
  type: 'content_block_stop';
  index: number;
}

export type StreamEvent = ContentBlockStart | ContentBlockDelta | ContentBlockStop;

interface BlockState {
  nodeId: string;
  blockType: 'text' | 'tool_use';
  toolUseId?: string;
  toolName?: string;
  inputJson: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  nodeId: string;
}

export class StreamMapper {
  private manager: StateManager;
  private parentNodeId: string;
  private blocks = new Map<number, BlockState>();
  private lastResponseNodeId: string | null = null;
  private hadToolUse = false;
  private toolCalls: ToolCall[] = [];
  // Map tool_use_id -> tool_call nodeId
  private toolUseIdToNodeId = new Map<string, string>();

  constructor(manager: StateManager, parentNodeId: string) {
    this.manager = manager;
    this.parentNodeId = parentNodeId;
  }

  handleEvent(event: StreamEvent): void {
    switch (event.type) {
      case 'content_block_start':
        this.onBlockStart(event);
        break;
      case 'content_block_delta':
        this.onBlockDelta(event);
        break;
      case 'content_block_stop':
        this.onBlockStop(event);
        break;
    }
  }

  private onBlockStart(event: ContentBlockStart): void {
    const cb = event.content_block;

    if (cb.type === 'text') {
      // Determine parent: if we had tool_use before, connect to last tool_result or parent
      const connectTo = this.hadToolUse ? this.findLastToolResultOrParent() : this.parentNodeId;
      const nodeId = this.manager.createNode('response', '', connectTo, { status: 'streaming' });
      this.lastResponseNodeId = nodeId;
      this.blocks.set(event.index, { nodeId, blockType: 'text', inputJson: '' });
    } else if (cb.type === 'tool_use') {
      // Connect tool_call to the last response node if available, otherwise parent
      const connectTo = this.lastResponseNodeId ?? this.parentNodeId;
      const content = `tool: ${cb.name}`;
      const nodeId = this.manager.createNode('tool_call', content, undefined, { status: 'streaming' });
      this.manager.createEdge(connectTo, nodeId, 'tool_call');
      this.toolUseIdToNodeId.set(cb.id, nodeId);
      this.blocks.set(event.index, {
        nodeId,
        blockType: 'tool_use',
        toolUseId: cb.id,
        toolName: cb.name,
        inputJson: '',
      });
      this.hadToolUse = true;
    }
  }

  private onBlockDelta(event: ContentBlockDelta): void {
    const block = this.blocks.get(event.index);
    if (!block) return;

    if (event.delta.type === 'text_delta') {
      const node = this.manager.document.nodes[block.nodeId];
      if (node) {
        this.manager.updateNodeContent(block.nodeId, node.content + event.delta.text);
      }
    } else if (event.delta.type === 'input_json_delta') {
      block.inputJson += event.delta.partial_json;
      const node = this.manager.document.nodes[block.nodeId];
      if (node) {
        this.manager.updateNodeContent(block.nodeId, `tool: ${block.toolName}\n${block.inputJson}`);
      }
    }
  }

  private onBlockStop(event: ContentBlockStop): void {
    const block = this.blocks.get(event.index);
    if (!block) return;

    if (block.blockType === 'tool_use' && block.toolUseId && block.toolName) {
      this.toolCalls.push({
        id: block.toolUseId,
        name: block.toolName,
        input: block.inputJson,
        nodeId: block.nodeId,
      });
    }
  }

  addToolResult(toolUseId: string, result: string): void {
    const toolNodeId = this.toolUseIdToNodeId.get(toolUseId);
    if (!toolNodeId) return;

    const resultNodeId = this.manager.createNode('tool_result', result, undefined, { status: 'complete' });
    this.manager.createEdge(toolNodeId, resultNodeId, 'tool_result');
  }

  handleEnd(stopReason: string): void {
    for (const block of this.blocks.values()) {
      const node = this.manager.document.nodes[block.nodeId];
      if (node && node.status === 'streaming') {
        this.manager.setNodeStatus(block.nodeId, 'complete');
      }
    }
  }

  handleError(error: unknown): void {
    const message = formatErrorMessage(error);

    if (this.blocks.size === 0) {
      // Error before any content — create an error node
      this.manager.createNode('response', `Error: ${message}`, this.parentNodeId, { status: 'error' });
      return;
    }
    for (const block of this.blocks.values()) {
      const node = this.manager.document.nodes[block.nodeId];
      if (node && node.status === 'streaming') {
        const errorMsg = `\n\n[Error]\n${message}`;
        this.manager.updateNodeContent(block.nodeId, node.content + errorMsg);
        this.manager.setNodeStatus(block.nodeId, 'error');
      }
    }
  }

  getToolCalls(): ToolCall[] {
    return [...this.toolCalls];
  }

  private findLastToolResultOrParent(): string {
    // Find the most recently added tool_result node
    const resultNodes = Object.values(this.manager.document.nodes)
      .filter((n) => n.type === 'tool_result')
      .sort((a, b) => b.created.localeCompare(a.created));

    return resultNodes[0]?.id ?? this.parentNodeId;
  }
}
