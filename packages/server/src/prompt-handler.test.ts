import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateManager } from './state-manager.js';
import { PromptHandler } from './prompt-handler.js';
import type { ClaudeClient } from './claude-client.js';

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

function createMockClient(streams: any[]): ClaudeClient {
  let callCount = 0;
  return {
    stream: vi.fn().mockImplementation(() => streams[callCount++] ?? streams[0]),
    buildSystemPrompt: vi.fn().mockReturnValue('System prompt'),
  };
}

describe('PromptHandler', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  it('creates user_prompt node and response from simple text stream', async () => {
    const stream = createMockStream([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi there!' } },
      { type: 'content_block_stop', index: 0 },
    ]);
    const client = createMockClient([stream]);
    const handler = new PromptHandler(manager, client);

    await handler.handlePrompt('Hello', undefined);

    const nodes = Object.values(manager.document.nodes);
    const userNode = nodes.find((n) => n.type === 'user_prompt');
    const responseNode = nodes.find((n) => n.type === 'response');

    expect(userNode).toBeDefined();
    expect(userNode!.content).toBe('Hello');
    expect(responseNode).toBeDefined();
    expect(responseNode!.content).toBe('Hi there!');
    expect(responseNode!.status).toBe('completed');
  });

  it('passes graph summary in system prompt', async () => {
    const stream = createMockStream([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_stop', index: 0 },
    ]);
    const client = createMockClient([stream]);
    const handler = new PromptHandler(manager, client);

    await handler.handlePrompt('Test', undefined);

    expect(client.stream).toHaveBeenCalled();
    // System prompt now comes from context-builder, passed as 2nd arg to stream
    const systemPromptArg = (client.stream as any).mock.calls[0][1];
    expect(systemPromptArg).toContain('Flow Canvas');
  });

  it('handles tool_use with multi-turn continuation', async () => {
    // First stream: text + tool_use
    const stream1 = createMockStream(
      [
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me check' } },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_info', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"query":"test"}' },
        },
        { type: 'content_block_stop', index: 1 },
      ],
      'tool_use',
    );

    // Second stream: continued text after tool result
    const stream2 = createMockStream([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Based on the result' } },
      { type: 'content_block_stop', index: 0 },
    ]);

    const client = createMockClient([stream1, stream2]);
    const toolExecutor = vi.fn().mockResolvedValue('tool result data');
    const handler = new PromptHandler(manager, client, toolExecutor);

    await handler.handlePrompt('Hello', undefined);

    // Should have: user_prompt, response(1), tool_call, tool_result, response(2)
    const nodes = Object.values(manager.document.nodes);
    expect(nodes.filter((n) => n.type === 'user_prompt')).toHaveLength(1);
    expect(nodes.filter((n) => n.type === 'response')).toHaveLength(2);
    expect(nodes.filter((n) => n.type === 'tool_call')).toHaveLength(1);
    expect(nodes.filter((n) => n.type === 'tool_result')).toHaveLength(1);

    expect(toolExecutor).toHaveBeenCalledWith('get_info', '{"query":"test"}');
  });

  it('supports parentId for branching', async () => {
    const existingNode = manager.createNode('response', 'Previous response');
    const stream = createMockStream([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Branch reply' } },
      { type: 'content_block_stop', index: 0 },
    ]);
    const client = createMockClient([stream]);
    const handler = new PromptHandler(manager, client);

    await handler.handlePrompt('Branch question', existingNode);

    const userNode = Object.values(manager.document.nodes).find(
      (n) => n.type === 'user_prompt' && n.content === 'Branch question',
    )!;
    const edge = manager.document.edges.find(
      (e) => e.from === existingNode && e.to === userNode.id,
    );
    expect(edge).toBeDefined();
  });

  it('handles stream error gracefully', async () => {
    const errorStream = {
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
        yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Partial' } };
        throw new Error('API connection lost');
      },
      finalMessage: () => Promise.reject(new Error('API connection lost')),
    };
    const client = createMockClient([errorStream]);
    const handler = new PromptHandler(manager, client);

    // Should throw but still create error node
    await expect(handler.handlePrompt('Hello', undefined)).rejects.toThrow('API connection lost');

    const nodes = Object.values(manager.document.nodes);
    const responseNode = nodes.find((n) => n.type === 'response');
    expect(responseNode!.status).toBe('error');
    expect(responseNode!.content).toContain('Partial');
  });

  it('creates one formatted error node when stream fails before first content block', async () => {
    const apiError = new Error(
      '500 {"type":"error","error":{"type":"api_error","message":"Internal server error"},"request_id":"req_123"}',
    );
    const errorStream = {
      async *[Symbol.asyncIterator]() {
        throw apiError;
      },
      finalMessage: () => Promise.reject(apiError),
    };
    const client = createMockClient([errorStream]);
    const handler = new PromptHandler(manager, client);

    await expect(handler.handlePrompt('Hello', undefined)).rejects.toThrow(apiError.message);

    const responseNodes = Object.values(manager.document.nodes).filter(
      (n) => n.type === 'response',
    );
    expect(responseNodes).toHaveLength(1);
    expect(responseNodes[0].status).toBe('error');
    expect(responseNodes[0].content).toContain('Internal server error');
    expect(responseNodes[0].content).toContain('Status: 500');
    expect(responseNodes[0].content).toContain('Request ID: req_123');
  });

  it('limits multi-turn loop to prevent infinite tool use', async () => {
    // Every stream returns tool_use
    const makeToolStream = () =>
      createMockStream(
        [
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'tool_use', id: `toolu_${Math.random()}`, name: 'loopy', input: {} },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{}' },
          },
          { type: 'content_block_stop', index: 0 },
        ],
        'tool_use',
      );

    const client = {
      stream: vi.fn().mockImplementation(() => makeToolStream()),
      buildSystemPrompt: vi.fn().mockReturnValue('System'),
    };
    const toolExecutor = vi.fn().mockResolvedValue('result');
    const handler = new PromptHandler(manager, client, toolExecutor, { maxTurns: 3 });

    await handler.handlePrompt('Loop me', undefined);

    // Should have stopped after maxTurns
    expect(client.stream).toHaveBeenCalledTimes(3);
  });
});
