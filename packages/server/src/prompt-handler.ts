import { StateManager } from './state-manager.js';
import { StreamMapper } from './stream-mapper.js';
import { buildSystemPrompt } from './context-builder.js';
import { CANVAS_TOOLS, executeCanvasTool } from './canvas-tools.js';
import type { ClaudeClient } from './claude-client.js';
import type Anthropic from '@anthropic-ai/sdk';

export type ToolExecutor = (name: string, input: string) => Promise<string>;

export interface PromptHandlerOptions {
  maxTurns?: number;
}

export class PromptHandler {
  private manager: StateManager;
  private client: ClaudeClient;
  private toolExecutor: ToolExecutor;
  private maxTurns: number;

  constructor(
    manager: StateManager,
    client: ClaudeClient,
    toolExecutor?: ToolExecutor,
    options?: PromptHandlerOptions,
  ) {
    this.manager = manager;
    this.client = client;
    this.toolExecutor = toolExecutor ?? (async () => 'Tool not implemented');
    this.maxTurns = options?.maxTurns ?? 10;
  }

  async handlePrompt(content: string, parentId: string | undefined): Promise<void> {
    // 1. Create user_prompt node
    const userNodeId = this.manager.createNode('user_prompt', content, parentId);

    // 2. Build conversation context (uses saved summary or falls back to structural)
    const systemPrompt = buildSystemPrompt(this.manager.document);

    // 3. Build initial messages
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content }];

    // 4. Multi-turn loop
    let currentParentId = userNodeId;
    for (let turn = 0; turn < this.maxTurns; turn++) {
      const mapper = new StreamMapper(this.manager, currentParentId);

      const stopReason = await this.processStream(mapper, messages, systemPrompt);

      if (stopReason !== 'tool_use') {
        return;
      }

      // Execute tool calls and continue
      const toolCalls = mapper.getToolCalls();
      if (toolCalls.length === 0) return;

      // Add assistant message with tool_use blocks to conversation
      const assistantContent: Anthropic.ContentBlockParam[] = [];
      // Reconstruct text + tool_use content blocks
      const nodes = Object.values(this.manager.document.nodes);
      const responseNodes = nodes.filter((n) => n.type === 'response' && n.status === 'complete');
      if (responseNodes.length > 0) {
        const lastResponse = responseNodes[responseNodes.length - 1];
        if (lastResponse.content) {
          assistantContent.push({ type: 'text', text: lastResponse.content });
        }
      }

      for (const tc of toolCalls) {
        let parsedInput: Record<string, unknown> = {};
        try {
          parsedInput = tc.input ? JSON.parse(tc.input) : {};
        } catch {
          // leave empty
        }
        assistantContent.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: parsedInput,
        });
      }

      messages.push({ role: 'assistant', content: assistantContent });

      // Execute tools and add results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tc of toolCalls) {
        let result: string;

        // Check if it's a canvas tool — execute directly against StateManager
        if (tc.name === 'canvas_create_node' || tc.name === 'canvas_connect') {
          let parsedInput: Record<string, unknown> = {};
          try {
            parsedInput = tc.input ? JSON.parse(tc.input) : {};
          } catch {
            parsedInput = {};
          }
          const canvasResult = executeCanvasTool(tc.name, parsedInput, this.manager);
          result = JSON.stringify(canvasResult);
          console.log('[tools] canvas tool:', tc.name, '→', canvasResult);
        } else {
          result = await this.toolExecutor(tc.name, tc.input);
        }

        mapper.addToolResult(tc.id, result);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tc.id,
          content: result,
        });
      }

      messages.push({ role: 'user', content: toolResults });

      // Update parent for next turn — use last created node
      const allNodes = Object.values(this.manager.document.nodes);
      const lastNode = allNodes.sort((a, b) => b.created.localeCompare(a.created))[0];
      currentParentId = lastNode?.id ?? currentParentId;
    }
  }

  private async processStream(
    mapper: StreamMapper,
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
  ): Promise<string> {
    console.log('[stream] calling Claude API with', CANVAS_TOOLS.length, 'canvas tools');
    let stream: ReturnType<ClaudeClient['stream']>;
    try {
      stream = this.client.stream(messages, systemPrompt, CANVAS_TOOLS);
    } catch (error) {
      mapper.handleError(error);
      throw error;
    }

    let eventCount = 0;
    try {
      for await (const event of stream) {
        eventCount++;
        console.log('[stream] event:', event.type);
        if (
          event.type === 'content_block_start' ||
          event.type === 'content_block_delta' ||
          event.type === 'content_block_stop'
        ) {
          mapper.handleEvent(event as any);
        }
      }
    } catch (error) {
      console.error('[stream] error during iteration:', error);
      mapper.handleError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    console.log('[stream] total events:', eventCount);

    let stopReason = 'end_turn';
    try {
      const final = await stream.finalMessage();
      stopReason = final.stop_reason ?? 'end_turn';
      console.log('[stream] stop_reason:', stopReason);
    } catch (err) {
      console.error('[stream] finalMessage error:', err);
    }

    mapper.handleEnd(stopReason);
    return stopReason;
  }
}
