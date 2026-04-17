import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './state-manager.js';
import { StreamMapper } from './stream-mapper.js';

describe('StreamMapper', () => {
  let manager: StateManager;
  let mapper: StreamMapper;
  const parentNodeId = 'test-parent';

  beforeEach(() => {
    manager = new StateManager();
    // Create a parent user_prompt node to attach responses to
    const id = manager.createNode('user_prompt', 'Hello');
    // We'll use the actual generated id
    mapper = new StreamMapper(manager, id);
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('executionStatus alignment', () => {
    it('streaming text node gets executionStatus in_progress', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      expect(responseNode!.executionStatus).toBe('in_progress');
    });

    it('streaming tool_use node gets executionStatus in_progress', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'test_tool', input: {} },
      });

      const nodes = Object.values(manager.document.nodes);
      const toolNode = nodes.find((n) => n.type === 'tool_call');
      expect(toolNode!.executionStatus).toBe('in_progress');
    });

    it('handleEnd sets executionStatus to completed on all nodes', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'test_tool', input: {} },
      });

      mapper.handleEnd('end_turn');

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      const toolNode = nodes.find((n) => n.type === 'tool_call');
      expect(responseNode!.executionStatus).toBe('completed');
      expect(toolNode!.executionStatus).toBe('completed');
    });

    it('addToolResult creates tool_result node with executionStatus completed', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'test_tool', input: {} },
      });
      mapper.handleEvent({ type: 'content_block_stop', index: 0 });

      mapper.addToolResult('toolu_1', 'result content');

      const nodes = Object.values(manager.document.nodes);
      const resultNode = nodes.find((n) => n.type === 'tool_result');
      expect(resultNode!.executionStatus).toBe('completed');
    });
  });

  describe('text streaming', () => {
    it('creates response node on first text content_block_start', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      expect(responseNode).toBeDefined();
      expect(responseNode!.status).toBe('streaming');
    });

    it('accumulates text_delta into response node content', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' world' },
      });

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      expect(responseNode!.content).toBe('Hello world');
    });

    it('creates edge from parent to response node', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response')!;
      const edge = manager.document.edges.find(
        (e) => e.to === responseNode.id && e.type === 'reply_to',
      );
      expect(edge).toBeDefined();
    });
  });

  describe('tool_use handling', () => {
    it('creates tool_call node on tool_use content_block_start', () => {
      // First a text block
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Let me help' },
      });
      mapper.handleEvent({ type: 'content_block_stop', index: 0 });

      // Then a tool_use block
      mapper.handleEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'create_node', input: {} },
      });

      const nodes = Object.values(manager.document.nodes);
      const toolNode = nodes.find((n) => n.type === 'tool_call');
      expect(toolNode).toBeDefined();
      expect(toolNode!.status).toBe('streaming');
      expect(toolNode!.content).toContain('create_node');
    });

    it('connects tool_call node to response node with tool_call edge', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({ type: 'content_block_stop', index: 0 });

      mapper.handleEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'create_node', input: {} },
      });

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response')!;
      const toolNode = nodes.find((n) => n.type === 'tool_call')!;
      const edge = manager.document.edges.find(
        (e) => e.from === responseNode.id && e.to === toolNode.id && e.type === 'tool_call',
      );
      expect(edge).toBeDefined();
    });

    it('accumulates tool input_json_delta into tool_call node', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'create_node', input: {} },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"type":' },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '"text"}' },
      });

      const nodes = Object.values(manager.document.nodes);
      const toolNode = nodes.find((n) => n.type === 'tool_call')!;
      expect(toolNode.content).toContain('create_node');
      expect(toolNode.content).toContain('{"type":"text"}');
    });
  });

  describe('tool results', () => {
    it('addToolResult creates tool_result node connected to tool_call', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'create_node', input: {} },
      });
      mapper.handleEvent({ type: 'content_block_stop', index: 0 });

      const nodes = Object.values(manager.document.nodes);
      const toolNode = nodes.find((n) => n.type === 'tool_call')!;

      mapper.addToolResult('toolu_1', 'Node created successfully');

      const updatedNodes = Object.values(manager.document.nodes);
      const resultNode = updatedNodes.find((n) => n.type === 'tool_result');
      expect(resultNode).toBeDefined();
      expect(resultNode!.content).toBe('Node created successfully');
      expect(resultNode!.status).toBe('completed');

      const edge = manager.document.edges.find(
        (e) => e.from === toolNode.id && e.to === resultNode!.id && e.type === 'tool_result',
      );
      expect(edge).toBeDefined();
    });
  });

  describe('new text block after tool', () => {
    it('creates new response node for text after tool_use', () => {
      // First text block
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({ type: 'content_block_stop', index: 0 });

      // Tool use block
      mapper.handleEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'test_tool', input: {} },
      });
      mapper.handleEvent({ type: 'content_block_stop', index: 1 });

      // Add tool result
      mapper.addToolResult('toolu_1', 'done');

      // New text block after tool
      mapper.handleEvent({
        type: 'content_block_start',
        index: 2,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 2,
        delta: { type: 'text_delta', text: 'Based on the result' },
      });

      const responseNodes = Object.values(manager.document.nodes).filter(
        (n) => n.type === 'response',
      );
      expect(responseNodes).toHaveLength(2);
      expect(responseNodes[1].content).toBe('Based on the result');
    });
  });

  describe('stream end', () => {
    it('handleEnd sets all streaming nodes to complete', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      });

      mapper.handleEnd('end_turn');

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      expect(responseNode!.status).toBe('completed');
    });

    it('handleEnd with max_tokens sets status to complete', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      mapper.handleEnd('max_tokens');

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      expect(responseNode!.status).toBe('completed');
    });

    it('handleEnd with tool_use sets streaming tool nodes to complete', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'test', input: {} },
      });

      mapper.handleEnd('tool_use');

      const nodes = Object.values(manager.document.nodes);
      const toolNode = nodes.find((n) => n.type === 'tool_call');
      expect(toolNode!.status).toBe('completed');
    });
  });

  describe('error handling', () => {
    it('handleError sets active nodes to error status', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      mapper.handleError(new Error('Stream failed'));

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      expect(responseNode!.status).toBe('error');
    });

    it('handleError appends error message to node content', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Partial' },
      });

      mapper.handleError(new Error('Connection lost'));

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      expect(responseNode!.content).toContain('Connection lost');
    });

    it('handleError sets executionStatus to completed on errored nodes', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });

      mapper.handleError(new Error('Stream failed'));

      const nodes = Object.values(manager.document.nodes);
      const responseNode = nodes.find((n) => n.type === 'response');
      expect(responseNode!.executionStatus).toBe('completed');
    });
  });

  describe('concurrent/parallel tool calls', () => {
    it('parallel tool_use blocks create separate tool_call nodes', () => {
      // Text block first
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      });
      mapper.handleEvent({ type: 'content_block_stop', index: 0 });

      // Two parallel tool calls
      mapper.handleEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'tool_a', input: {} },
      });
      mapper.handleEvent({
        type: 'content_block_start',
        index: 2,
        content_block: { type: 'tool_use', id: 'toolu_2', name: 'tool_b', input: {} },
      });

      const toolNodes = Object.values(manager.document.nodes).filter(
        (n) => n.type === 'tool_call',
      );
      expect(toolNodes).toHaveLength(2);
    });

    it('parallel tool deltas update correct nodes', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'tool_a', input: {} },
      });
      mapper.handleEvent({
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'toolu_2', name: 'tool_b', input: {} },
      });

      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"x":1}' },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"y":2}' },
      });

      const toolNodes = Object.values(manager.document.nodes).filter(
        (n) => n.type === 'tool_call',
      );
      const nodeA = toolNodes.find((n) => n.content.includes('tool_a'))!;
      const nodeB = toolNodes.find((n) => n.content.includes('tool_b'))!;
      expect(nodeA.content).toContain('{"x":1}');
      expect(nodeB.content).toContain('{"y":2}');
    });

    it('getToolCalls returns pending tool calls with parsed input', () => {
      mapper.handleEvent({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'create_node', input: {} },
      });
      mapper.handleEvent({
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"type":"text"}' },
      });
      mapper.handleEvent({ type: 'content_block_stop', index: 0 });

      mapper.handleEnd('tool_use');

      const toolCalls = mapper.getToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].id).toBe('toolu_1');
      expect(toolCalls[0].name).toBe('create_node');
      expect(toolCalls[0].input).toBe('{"type":"text"}');
    });
  });
});
