import { generateStructuralSummary } from '@fcw/graph-core';
import type { GraphDocument, GenerateSummary } from '@fcw/graph-core';

interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
}

type CreateMessageFn = (params: CreateMessageParams) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

export interface LlmSummaryOptions {
  apiKey?: string;
  createMessage?: CreateMessageFn;
}

function buildSummaryRequest(doc: GraphDocument): CreateMessageParams {
  const nodes = Object.values(doc.nodes);
  const content = nodes
    .map((n) => `[${n.type}] ${n.content.slice(0, 200)}`)
    .join('\n');

  return {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 300,
    system:
      'Summarize this canvas conversation in 2-3 sentences. Focus on topics discussed, decisions made, and key outcomes. Be concise.',
    messages: [{ role: 'user', content }],
  };
}

export function createLlmSummary(options: LlmSummaryOptions): GenerateSummary {
  let createMessage: CreateMessageFn;

  if (options.createMessage) {
    createMessage = options.createMessage;
  } else {
    // Lazy import to avoid requiring SDK when using mock
    let anthropic: any;
    createMessage = async (params) => {
      if (!anthropic) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        anthropic = new Anthropic({
          apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY,
        });
      }
      return anthropic.messages.create(params);
    };
  }

  return async (doc: GraphDocument): Promise<string> => {
    try {
      const params = buildSummaryRequest(doc);
      const response = await createMessage(params);
      const text = response.content.find((b) => b.type === 'text')?.text;
      return text ?? generateStructuralSummary(doc);
    } catch {
      return generateStructuralSummary(doc);
    }
  };
}
