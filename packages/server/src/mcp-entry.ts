#!/usr/bin/env node

/**
 * MCP entry point for Claude Code / claude_desktop_config.json.
 * Starts the FCW MCP server on stdio transport.
 *
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "fcw-canvas": {
 *       "command": "node",
 *       "args": ["packages/server/dist/mcp-entry.js"]
 *     }
 *   }
 * }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StateManager } from './state-manager.js';
import { createMcpServer } from './mcp-server.js';

const stateManager = new StateManager('MCP Session');
const mcpServer = createMcpServer(stateManager);
const transport = new StdioServerTransport();

await mcpServer.connect(transport);
