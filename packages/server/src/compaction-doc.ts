// Synthesizes the editable document a compaction starts from: LLM synthesis
// of the member transcripts, or a mechanical markdown digest without a key.
import type { ChatNode } from '@fcw/graph-core';

interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
}

type CreateMessageFn = (params: CreateMessageParams) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

export interface CompactionDocOptions {
  apiKey?: string;
  createMessage?: CreateMessageFn;
}

/** Produces the compaction document for a set of member chats. */
export type GenerateCompactionDoc = (members: ChatNode[]) => Promise<string>;

const MESSAGE_PREVIEW_MAX = 600;
const ROLE_LABEL: Record<string, string> = { user: 'User', assistant: 'Assistant', tool: 'Tool' };

function preview(content: string): string {
  return content.length > MESSAGE_PREVIEW_MAX ? content.slice(0, MESSAGE_PREVIEW_MAX) + '…' : content;
}

function transcript(chat: ChatNode): string {
  return chat.messages
    .map((m) => `**${ROLE_LABEL[m.role] ?? m.role}:** ${preview(m.content)}`)
    .join('\n\n');
}

/** Mechanical fallback document: one section per member chat. */
export function structuralCompactionDocument(members: ChatNode[]): string {
  return members
    .map((chat) => `## ${chat.title || chat.id}\n\n${transcript(chat)}`)
    .join('\n\n');
}

export function buildCompactionPrompt(members: ChatNode[]): CreateMessageParams {
  const body = members
    .map((chat) => `### Conversation: ${chat.title || chat.id}\n\n${transcript(chat)}`)
    .join('\n\n---\n\n');
  return {
    model: 'claude-sonnet-5',
    max_tokens: 4096,
    system:
      'Synthesize these conversations into a single well-structured markdown document. ' +
      'Capture the decisions, findings, code, and open questions — a reader should not ' +
      'need the original transcripts. Use headings and lists. No preamble, markdown only.',
    messages: [{ role: 'user', content: body }],
  };
}

export function createCompactionDocGenerator(options: CompactionDocOptions): GenerateCompactionDoc {
  let createMessage: CreateMessageFn | null = options.createMessage ?? null;

  if (!createMessage) {
    // Lazy import so tests and keyless setups never load the SDK.
    let anthropic: { messages: { create: CreateMessageFn } } | undefined;
    createMessage = async (params) => {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('no API key');
      if (!anthropic) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        anthropic = new Anthropic({ apiKey }) as unknown as { messages: { create: CreateMessageFn } };
      }
      return anthropic.messages.create(params);
    };
  }

  return async (members) => {
    try {
      const response = await createMessage!(buildCompactionPrompt(members));
      const text = response.content.find((b) => b.type === 'text')?.text;
      return text ?? structuralCompactionDocument(members);
    } catch {
      return structuralCompactionDocument(members);
    }
  };
}
