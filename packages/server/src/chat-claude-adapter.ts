// Adapts the v1 ClaudeClient streaming API to the v2 StreamTextFn shape.
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from '@fcw/graph-core';
import type { ClaudeClient } from './claude-client.js';
import type { StreamTextFn } from './chat-session.js';

const SYSTEM_PROMPT = [
  'You are an AI assistant inside Flow Canvas, a canvas-based chat interface.',
  'Each chat window is a node in a graph; its history may include inherited context',
  'from connected parent chats. Answer the latest user message.',
].join('\n');

export function createChatStreamText(client: ClaudeClient): StreamTextFn {
  return async function* streamText(context: ChatMessage[]): AsyncIterable<string> {
    const messages: Anthropic.MessageParam[] = context
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const stream = client.stream(messages, SYSTEM_PROMPT);
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  };
}
