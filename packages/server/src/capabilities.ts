// Discovers the models and slash commands the local Claude Code install supports.
// A live query() is needed for this, so it's lazy and cached for the process.
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk';
import type { Options, Query, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CapabilityModel, CapabilityCommand } from '@fcw/graph-core';

export interface Capabilities {
  models: CapabilityModel[];
  commands: CapabilityCommand[];
}

type CapQueryFn = (params: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options }) => Query;

/** An input stream that yields nothing so the query initializes and then ends. */
async function* emptyPrompt(): AsyncIterable<SDKUserMessage> {
  // no messages
}

async function load(queryFn: CapQueryFn): Promise<Capabilities> {
  const q = queryFn({ prompt: emptyPrompt(), options: {} });
  try {
    const [models, commands] = await Promise.all([q.supportedModels(), q.supportedCommands()]);
    return {
      models: models.map((m) => ({ id: m.value, displayName: m.displayName })),
      commands: commands.map((c) => ({ name: c.name, description: c.description })),
    };
  } finally {
    await q.interrupt?.().catch(() => {});
  }
}

/** Returns a provider that loads capabilities once and caches the promise. */
export function createCapabilitiesProvider(queryFn: CapQueryFn = realQuery): () => Promise<Capabilities> {
  let cache: Promise<Capabilities> | null = null;
  return () => {
    if (!cache) {
      cache = load(queryFn).catch((err) => {
        cache = null; // allow a later retry if the first load failed
        throw err;
      });
    }
    return cache;
  };
}
