// Agent engine: drives one Claude Code SDK query() per turn and maps its
// SDKMessage stream onto TurnEvents. resume-per-turn — a live session id resumes,
// otherwise the assembled context is injected as a text preamble.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, Attachment } from '@fcw/graph-core';
import type { StreamTurnFn, TurnContext, TurnEvent } from './turn-events.js';

/** Injectable for tests; defaults to the real SDK query(). */
export type QueryFn = (params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => Query;

/** Serialize inherited context (everything but the final user prompt) as a preamble. */
function preambleFrom(context: ChatMessage[]): string {
  const prior = context.slice(0, -1); // drop the latest user prompt
  if (prior.length === 0) return '';
  const lines = prior.map((m) => {
    const who = m.role === 'assistant' ? 'Assistant' : m.role === 'tool' ? 'Tool' : 'User';
    return `${who}: ${m.content}`;
  });
  return [
    'Context inherited from connected chats — use it to answer the new request:',
    '',
    ...lines,
    '',
    '--- end of inherited context ---',
    '',
  ].join('\n');
}

/** Build the user message content blocks for a turn, folding in attachments. */
function buildContent(ctx: TurnContext, fresh: boolean): Anthropic.ContentBlockParam[] {
  const parts: string[] = [];
  if (fresh) {
    const preamble = preambleFrom(ctx.context);
    if (preamble) parts.push(preamble);
  }
  parts.push(ctx.latest);

  const blocks: Anthropic.ContentBlockParam[] = [];
  const textAttachments: Attachment[] = [];
  const mediaBlocks: Anthropic.ContentBlockParam[] = [];
  for (const att of ctx.attachments) {
    if (att.mediaType.startsWith('image/')) {
      try {
        mediaBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mediaType as Anthropic.Base64ImageSource['media_type'],
            data: readFileSync(att.path).toString('base64'),
          },
        });
      } catch {
        textAttachments.push(att);
      }
    } else if (att.mediaType === 'application/pdf') {
      try {
        mediaBlocks.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: readFileSync(att.path).toString('base64') },
        });
      } catch {
        textAttachments.push(att);
      }
    } else {
      // Text/other files: point the agent at the path so it can Read them itself.
      textAttachments.push(att);
    }
  }
  if (textAttachments.length > 0) {
    parts.push(
      'Attached files (read them from disk):\n' +
        textAttachments.map((a) => `- ${a.name}: ${a.path}`).join('\n'),
    );
  }
  blocks.push({ type: 'text', text: parts.join('\n\n') });
  blocks.push(...mediaBlocks);
  return blocks;
}

/** A single-message async prompt for the SDK. */
async function* promptStream(ctx: TurnContext, fresh: boolean): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    parent_tool_use_id: null,
    message: { role: 'user', content: buildContent(ctx, fresh) },
  } as SDKUserMessage;
}

/** Minimal push/close async queue bridging canUseTool + the message loop. */
function createQueue<T>() {
  const items: T[] = [];
  let resolveNext: (() => void) | null = null;
  let closed = false;
  return {
    push(item: T) {
      items.push(item);
      resolveNext?.();
      resolveNext = null;
    },
    close() {
      closed = true;
      resolveNext?.();
      resolveNext = null;
    },
    async *drain(): AsyncIterable<T> {
      while (true) {
        if (items.length > 0) {
          yield items.shift()!;
          continue;
        }
        if (closed) return;
        await new Promise<void>((r) => (resolveNext = r));
      }
    },
  };
}

export function createAgentTurnStream(queryFn: QueryFn = realQuery): StreamTurnFn {
  return function stream(ctx: TurnContext): AsyncIterable<TurnEvent> {
    const queue = createQueue<TurnEvent>();
    const fresh = !ctx.sessionId;

    const options: Options = {
      includePartialMessages: true,
      canUseTool: async (toolName, input) => {
        const requestId = randomUUID();
        queue.push({ type: 'permission_request', requestId, toolName, input });
        const decision = await ctx.waitForPermission(requestId);
        return decision.behavior === 'allow'
          ? { behavior: 'allow' }
          : { behavior: 'deny', message: decision.message ?? 'denied by user' };
      },
    };
    if (ctx.settings.model) options.model = ctx.settings.model;
    if (ctx.settings.effort) options.effort = ctx.settings.effort;
    if (ctx.settings.cwd) options.cwd = ctx.settings.cwd;
    if (ctx.settings.permissionMode) options.permissionMode = ctx.settings.permissionMode;
    if (!fresh) options.resume = ctx.sessionId;

    const q = queryFn({ prompt: promptStream(ctx, fresh), options });
    const onAbort = () => {
      void q.interrupt?.().catch(() => {});
      q.close?.();
    };
    ctx.signal.addEventListener('abort', onAbort);

    const run = (async () => {
      try {
        let sessionEmitted = false;
        for await (const msg of q as AsyncIterable<SDKMessage>) {
          if (ctx.signal.aborted) break;
          const sid = (msg as { session_id?: string }).session_id;
          if (!sessionEmitted && sid) {
            queue.push({ type: 'session', sessionId: sid });
            sessionEmitted = true;
          }
          mapMessage(msg, queue);
        }
      } finally {
        queue.close();
      }
    })();

    return (async function* () {
      try {
        yield* queue.drain();
        await run;
      } finally {
        ctx.signal.removeEventListener('abort', onAbort);
      }
    })();
  };
}

function mapMessage(msg: SDKMessage, queue: ReturnType<typeof createQueue<TurnEvent>>): void {
  if (msg.type === 'stream_event') {
    const ev = msg.event;
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
      queue.push({ type: 'text_delta', text: ev.delta.text });
    }
    return;
  }
  if (msg.type === 'assistant') {
    for (const block of msg.message.content) {
      if (block.type === 'tool_use') {
        queue.push({
          type: 'tool_use',
          toolUseId: block.id,
          name: block.name,
          input: block.input,
        });
      }
    }
    return;
  }
  if (msg.type === 'user') {
    const content = msg.message.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (typeof block === 'object' && block !== null && block.type === 'tool_result') {
        queue.push({
          type: 'tool_result',
          toolUseId: block.tool_use_id,
          content: stringifyToolResult(block.content),
        });
      }
    }
  }
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) =>
        typeof b === 'object' && b !== null && 'text' in b ? String((b as { text: unknown }).text) : '',
      )
      .join('');
  }
  return '';
}
