// Adapts the v1 ClaudeClient streaming API to the v2 StreamTurnFn shape (api engine).
import { readFileSync } from 'node:fs';
import type Anthropic from '@anthropic-ai/sdk';
import type { Attachment } from '@fcw/graph-core';
import type { ClaudeClient } from './claude-client.js';
import type { StreamTurnFn, TurnContext, TurnEvent } from './turn-events.js';

const SYSTEM_PROMPT = [
  'You are an AI assistant inside Flow Canvas, a canvas-based chat interface.',
  'Each chat window is a node in a graph; its history may include inherited context',
  'from connected parent chats. Answer the latest user message.',
].join('\n');

/** Build the content for the latest user turn, folding in any attachments. */
function userContent(text: string, attachments: Attachment[]): string | Anthropic.ContentBlockParam[] {
  if (attachments.length === 0) return text;
  const blocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text }];
  for (const att of attachments) {
    try {
      if (att.mediaType.startsWith('image/')) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mediaType as Anthropic.Base64ImageSource['media_type'],
            data: readFileSync(att.path).toString('base64'),
          },
        });
      } else if (att.mediaType === 'application/pdf') {
        blocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: readFileSync(att.path).toString('base64') },
        });
      } else {
        blocks.push({ type: 'text', text: `\n[Attached ${att.name}]:\n${readFileSync(att.path, 'utf-8')}` });
      }
    } catch {
      blocks.push({ type: 'text', text: `\n[Attached ${att.name} — could not be read]` });
    }
  }
  return blocks;
}

export function createChatStreamText(client: ClaudeClient): StreamTurnFn {
  return async function* streamTurn(ctx: TurnContext): AsyncIterable<TurnEvent> {
    const turns = ctx.context.filter((m) => m.role === 'user' || m.role === 'assistant');
    const messages: Anthropic.MessageParam[] = turns.map((m, i) => ({
      role: m.role as 'user' | 'assistant',
      content:
        i === turns.length - 1 && m.role === 'user'
          ? userContent(m.content, ctx.attachments)
          : m.content,
    }));

    const stream = client.stream(messages, SYSTEM_PROMPT);
    for await (const event of stream) {
      if (ctx.signal.aborted) break;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { type: 'text_delta', text: event.delta.text };
      }
    }
  };
}
