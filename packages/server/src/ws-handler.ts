import type { ClientMessage } from '@fcw/graph-core';
import { StateManager } from './state-manager.js';
import { PromptHandler } from './prompt-handler.js';
import type { ClaudeClient } from './claude-client.js';
import type { ToolExecutor } from './prompt-handler.js';

export async function handleClientMessage(
  msg: ClientMessage,
  manager: StateManager,
  client?: ClaudeClient,
  toolExecutor?: ToolExecutor,
): Promise<void> {
  if (msg.type === 'user_prompt_submitted') {
    if (!client) {
      console.log('[handler] no claude client, creating node only');
      manager.createNode('user_prompt', msg.content, msg.parentId);
      return;
    }
    console.log('[handler] starting prompt with Claude client');
    const handler = new PromptHandler(manager, client, toolExecutor);
    try {
      await handler.handlePrompt(msg.content, msg.parentId);
      console.log('[handler] prompt completed');
    } catch (err) {
      console.error('[handler] prompt error:', err);
      throw err;
    }
  } else if (msg.type === 'branch_requested') {
    if (!client) {
      manager.createNode('user_prompt', msg.content, msg.fromNodeId);
      return;
    }
    const handler = new PromptHandler(manager, client, toolExecutor);
    try {
      await handler.handlePrompt(msg.content, msg.fromNodeId);
    } catch (err) {
      console.error('[handler] branch prompt error:', err);
      throw err;
    }
  }
}
