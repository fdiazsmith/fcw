import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateManager } from './state-manager.js';
import { handleClientMessage } from './ws-handler.js';
import type { ClaudeClient } from './claude-client.js';
import type { ClientMessage } from '@fcw/graph-core';

function createMockStream(events: any[], stopReason = 'end_turn') {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event;
      }
    },
    finalMessage: () =>
      Promise.resolve({
        stop_reason: stopReason,
        usage: { input_tokens: 10, output_tokens: 5 },
        content: [],
      }),
  };
}

describe('handleClientMessage', () => {
  let manager: StateManager;
  let client: ClaudeClient;

  beforeEach(() => {
    manager = new StateManager();
    const stream = createMockStream([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Reply' } },
      { type: 'content_block_stop', index: 0 },
    ]);
    client = {
      stream: vi.fn().mockReturnValue(stream),
      buildSystemPrompt: vi.fn().mockReturnValue('System'),
    };
  });

  afterEach(() => {
    manager.destroy();
  });

  it('user_prompt_submitted creates node and triggers Claude stream', async () => {
    const msg: ClientMessage = { type: 'user_prompt_submitted', content: 'Hello' };
    await handleClientMessage(msg, manager, client);

    const nodes = Object.values(manager.document.nodes);
    expect(nodes.find((n) => n.type === 'user_prompt')).toBeDefined();
    expect(nodes.find((n) => n.type === 'response')).toBeDefined();
  });

  it('branch_requested creates node with parent and triggers stream', async () => {
    const parentId = manager.createNode('response', 'Previous');
    const msg: ClientMessage = { type: 'branch_requested', fromNodeId: parentId, content: 'Branch' };
    await handleClientMessage(msg, manager, client);

    const nodes = Object.values(manager.document.nodes);
    const branchNode = nodes.find((n) => n.content === 'Branch');
    expect(branchNode).toBeDefined();
    const edge = manager.document.edges.find(
      (e) => e.from === parentId && e.to === branchNode!.id,
    );
    expect(edge).toBeDefined();
  });

  it('works without claude client (just creates user node)', async () => {
    const msg: ClientMessage = { type: 'user_prompt_submitted', content: 'No AI' };
    await handleClientMessage(msg, manager, undefined);

    const nodes = Object.values(manager.document.nodes);
    expect(nodes.find((n) => n.type === 'user_prompt')).toBeDefined();
    // No response since no client
    expect(nodes.find((n) => n.type === 'response')).toBeUndefined();
  });
});
