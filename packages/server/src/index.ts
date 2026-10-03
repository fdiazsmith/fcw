import { config } from 'dotenv';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

// Load .env.local from project root
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '../../.env.local') });
import { writeFile } from 'node:fs/promises';
import { toJSON } from '@fcw/graph-core';
import type { GraphDocument } from '@fcw/graph-core';
import { StateManager } from './state-manager.js';
import { createRouter } from './routes.js';
import { createWsServer } from './ws-server.js';
import { createClaudeClient } from './claude-client.js';
import { createLlmSummary } from './llm-summary.js';
import { ChatSessionManager } from './chat-session.js';
import { createChatStreamText } from './chat-claude-adapter.js';
import { createAgentTurnStream } from './chat-agent-adapter.js';
import { createCapabilitiesProvider } from './capabilities.js';
import { createCompactionDocGenerator } from './compaction-doc.js';
import { createDiagramGenerator } from './diagram-gen.js';
import { AttachmentStore } from './attachments.js';
import { loadLatestChatGraph, saveChatGraph } from './chat-graph-store.js';

export { StateManager } from './state-manager.js';
export { createRouter } from './routes.js';
export { createWsServer } from './ws-server.js';
export { ClientMessageSchema } from './schemas.js';
export { createClaudeClient } from './claude-client.js';
export type { ClaudeClient } from './claude-client.js';
export { StreamMapper } from './stream-mapper.js';
export { PromptHandler } from './prompt-handler.js';
export type { ToolExecutor } from './prompt-handler.js';
export { handleClientMessage } from './ws-handler.js';
export { createMcpServer } from './mcp-server.js';
export { MCP_CANVAS_PROMPT } from './mcp-system-prompt.js';
export { buildSystemPrompt } from './context-builder.js';
export { createLlmSummary } from './llm-summary.js';
export type { LlmSummaryOptions } from './llm-summary.js';
// v2 chat-graph
export { ChatSessionManager } from './chat-session.js';
export type { ManagerStreams, AttachmentResolver } from './chat-session.js';
export type { StreamTurnFn, TurnEvent, TurnContext, PermissionDecision } from './turn-events.js';
export { createChatStreamText } from './chat-claude-adapter.js';
export { isChatClientMessage, handleChatClientMessage, ChatClientMessageSchema } from './chat-ws-handler.js';
export {
  handleCreateNode,
  handleUpdateNode,
  handleConnect,
  handleBranchFromNode,
  handleCollapseSubtree,
  handleAnnotateNode,
  handleMarkArchived,
  handleMarkActive,
  handleSetStatus,
  handleGetContext,
} from './mcp-tools.js';

export interface ServerOptions {
  port?: number;
  storageDir?: string;
  title?: string;
  anthropicApiKey?: string;
}

export function createApp(options: ServerOptions = {}) {
  const {
    port = 8009,
    storageDir = join(process.cwd(), 'data'),
    title = 'Untitled',
    anthropicApiKey,
  } = options;

  mkdirSync(storageDir, { recursive: true });

  const manager = new StateManager(title);
  const attachmentStore = new AttachmentStore(storageDir);
  const router = createRouter(manager, storageDir, attachmentStore);
  const httpServer = createServer(router);

  // Create Claude client if API key available
  const apiKey = anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  console.log('[init] API key:', apiKey ? 'set' : 'NOT SET');
  const claudeClient = apiKey ? createClaudeClient(apiKey) : undefined;
  console.log('[init] Claude client:', claudeClient ? 'created' : 'MISSING — prompts will only create nodes, no AI response');

  // Wire auto-save with async LLM summary
  const summarize = apiKey ? createLlmSummary({ apiKey }) : null;
  manager.setSaveHandler(async (doc: GraphDocument) => {
    const filePath = join(storageDir, `${doc.id}.fcw.json`);
    await writeFile(filePath, toJSON(doc), 'utf-8');
    // Async summary — don't block save
    if (summarize) {
      summarize(doc).then((summary) => {
        doc.meta.summary = summary;
        writeFile(filePath, toJSON(doc), 'utf-8').catch(() => {});
      }).catch(() => {});
    }
  });

  // v2 chat-graph sessions: chats as nodes, edges as context inheritance.
  // Load the most recent .fcw2.json so restarts keep the canvas.
  let initialGraph;
  try {
    initialGraph = loadLatestChatGraph(storageDir);
    if (initialGraph) console.log('[init] loaded chat-graph:', initialGraph.id);
  } catch (err) {
    console.error('[init] failed to load chat-graph, starting fresh:', err);
  }

  const chatSessions = new ChatSessionManager(
    title,
    {
      api: claudeClient ? createChatStreamText(claudeClient) : undefined,
      agent: createAgentTurnStream(),
    },
    initialGraph,
    (id) => attachmentStore.get(id),
    createCompactionDocGenerator({ apiKey }),
    createDiagramGenerator({ apiKey }).generate,
  );
  chatSessions.setSaveHandler((graph) => saveChatGraph(storageDir, graph));

  const capabilities = createCapabilitiesProvider();
  const wss = createWsServer(httpServer, manager, { claudeClient, chatSessions, capabilities });

  function start(): Promise<void> {
    return new Promise((resolve) => httpServer.listen(port, resolve));
  }

  function stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      wss.close();
      manager.destroy();
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }

  return { manager, httpServer, wss, start, stop };
}

// Run if called directly
if (process.argv[1]?.endsWith('index.js')) {
  const app = createApp();
  app.start().then(() => {
    console.log('FCW server running on port 8009');
  });
}
