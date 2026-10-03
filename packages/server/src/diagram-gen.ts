// Mermaid generation: constrain the model to the supported subset, validate
// with graph-core's parseMermaid, retry once with the parse error.
import { parseMermaid } from '@fcw/graph-core';
import type { MermaidGraph } from '@fcw/graph-core';

export type DiagramResult =
  | { ok: true; mermaid: string; graph: MermaidGraph }
  | { ok: false; raw: string; error: string };

// Mirrors the segment grammar in graph-core mermaid.ts, which silently skips
// segments it can't read — so we check every line ourselves.
const SEGMENT_RE = /^[A-Za-z0-9_]+(?:\[[^\]]+\])?$/;
const DIRECTIVE_RE = /^(graph|flowchart)\b/;
const FENCE_RE = /```(?:mermaid)?[ \t]*\n([\s\S]*?)```/;

function extractMermaid(text: string): string {
  const fenced = FENCE_RE.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/** Extracts Mermaid from a model reply and checks it fits the supported subset. */
export function validateMermaid(text: string): DiagramResult {
  const mermaid = extractMermaid(text);
  const fail = (error: string): DiagramResult => ({ ok: false, raw: text, error });

  const lines = mermaid.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || DIRECTIVE_RE.test(line)) continue;
    // "end" is a reserved word in Mermaid (closes subgraphs), unusable as an id.
    const bad = line
      .split('-->')
      .find((seg) => !SEGMENT_RE.test(seg.trim()) || /^end\b/i.test(seg.trim()));
    if (bad !== undefined) {
      return fail(
        `Line ${i + 1} "${line}" is not supported: only "A[Label] --> B[Label]" edges, ` +
          `plain node ids, and the graph/flowchart directive are allowed.`,
      );
    }
  }

  let graph: MermaidGraph;
  try {
    graph = parseMermaid(mermaid);
  } catch (err) {
    return fail(`Parse error: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (graph.nodes.length === 0) return fail('The diagram contains no nodes.');
  return { ok: true, mermaid, graph };
}

interface CreateMessageParams {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: string; content: string }>;
}

type CreateMessageFn = (params: CreateMessageParams) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

export interface DiagramGeneratorOptions {
  apiKey?: string;
  createMessage?: CreateMessageFn;
}

export type GenerateDiagram = (prompt: string, opts?: { context?: string }) => Promise<DiagramResult>;

// Same model as compaction-doc.ts.
const MODEL = 'claude-sonnet-5';

export const DIAGRAM_SYSTEM_PROMPT = [
  'You turn a request into a Mermaid flowchart. Reply with ONLY the Mermaid code, no prose, no explanation.',
  'Use exactly this subset:',
  '  graph TD',
  '  A[Label one] --> B[Label two]',
  '  B --> C[Label three] --> D[Label four]',
  '  A --> E',
  'Rules: the first line is "graph TD". Node ids are letters, digits or underscores. ' +
    'Labels go in square brackets with no nested brackets. The only edge is "-->" (chains allowed; re-referencing an id by itself is fine).',
  'Forbidden: subgraph, end, edge labels (|text|), other arrows (---, -.->, ==>), other node shapes ( ) { } > /, ' +
    'styles, classes, click, comments, semicolons, any other diagram type.',
].join('\n');

export function createDiagramGenerator(options: DiagramGeneratorOptions): { generate: GenerateDiagram } {
  let createMessage: CreateMessageFn | null = options.createMessage ?? null;

  if (!createMessage) {
    // Lazy import so tests and keyless setups never load the SDK.
    let anthropic: { messages: { create: CreateMessageFn } } | undefined;
    createMessage = async (params) => {
      if (!anthropic) {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        anthropic = new Anthropic({ apiKey: options.apiKey }) as unknown as {
          messages: { create: CreateMessageFn };
        };
      }
      return anthropic.messages.create(params);
    };
  }

  const ask = async (messages: CreateMessageParams['messages']): Promise<string> => {
    const response = await createMessage!({
      model: MODEL,
      max_tokens: 2048,
      system: DIAGRAM_SYSTEM_PROMPT,
      messages,
    });
    return response.content.find((b) => b.type === 'text')?.text ?? '';
  };

  const generate: GenerateDiagram = async (prompt, opts) => {
    const pasted = validateMermaid(prompt);
    if (pasted.ok) return pasted;
    if (!options.apiKey) return { ok: false, raw: '', error: 'no api key' };

    const request = opts?.context ? `${prompt}\n\nContext:\n${opts.context}` : prompt;
    let raw = '';
    try {
      raw = await ask([{ role: 'user', content: request }]);
      const first = validateMermaid(raw);
      if (first.ok) return first;

      raw = await ask([
        { role: 'user', content: request },
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: `That output was invalid. ${first.error}\nReply again with ONLY corrected Mermaid in the allowed subset.`,
        },
      ]);
      const second = validateMermaid(raw);
      return second.ok ? second : { ok: false, raw, error: second.error };
    } catch (err) {
      return { ok: false, raw, error: err instanceof Error ? err.message : String(err) };
    }
  };

  return { generate };
}
