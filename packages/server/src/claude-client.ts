import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeClient {
  stream(
    messages: Anthropic.MessageParam[],
    systemPrompt: string,
    tools?: Anthropic.Tool[],
  ): ReturnType<Anthropic['messages']['stream']>;
  buildSystemPrompt(graphSummary: string): string;
}

export function createClaudeClient(apiKey?: string): ClaudeClient {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const anthropic = new Anthropic({ apiKey: key });

  return {
    stream(messages, systemPrompt, tools) {
      return anthropic.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        ...(tools?.length ? { tools } : {}),
      });
    },

    buildSystemPrompt(graphSummary: string): string {
      return [
        'You are an AI assistant in a canvas-based chat interface called Flow Canvas.',
        'Your responses appear as nodes in a visual graph. Each text block becomes a separate node.',
        'You can use tools to manipulate the canvas structure.',
        '',
        'Current canvas state:',
        graphSummary,
      ].join('\n');
    },
  };
}
