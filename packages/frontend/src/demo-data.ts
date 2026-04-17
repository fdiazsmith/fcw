import type { GraphDocument } from '@fcw/graph-core';

export function createDemoGraph(): GraphDocument {
  return {
    id: 'demo_001',
    meta: { created: new Date().toISOString(), title: 'Demo — Auto-Hide Test' },
    nodes: {
      // --- Main conversation spine (always visible) ---
      n1: {
        id: 'n1',
        type: 'user_prompt',
        content: 'How do I build a WebSocket server in Node.js?',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',
        pathStatus: 'active',
      },
      n2: {
        id: 'n2',
        type: 'response',
        content: "Here's how to set up a WebSocket server using the `ws` package:\n\n1. Install the package\n2. Create an HTTP server\n3. Attach the WebSocket server\n\nLet me show you the code.",
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',
        pathStatus: 'active',
      },
      n3: {
        id: 'n3',
        type: 'code',
        content: "import { WebSocketServer } from 'ws';\nimport { createServer } from 'http';\n\nconst server = createServer();\nconst wss = new WebSocketServer({ server });\n\nwss.on('connection', (ws) => {\n  ws.on('message', (data) => {\n    console.log('received:', data);\n  });\n  ws.send('Hello from server!');\n});\n\nserver.listen(8080);",
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',
        pathStatus: 'active',
      },

      // --- COMPLETED tool call + result (should AUTO-HIDE) ---
      n4: {
        id: 'n4',
        type: 'tool_call',
        content: 'file_search("ws package documentation")',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',  // <-- completed = auto-hidden
        pathStatus: 'active',
      },
      n5: {
        id: 'n5',
        type: 'tool_result',
        content: 'Found: ws@8.16.0 — Simple to use, blazing fast, and thoroughly tested WebSocket client and server for Node.js',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',  // <-- completed = auto-hidden
        pathStatus: 'active',
      },

      // --- COMPLETED thought (should AUTO-HIDE) ---
      n6: {
        id: 'n6',
        type: 'thought',
        content: 'The user might also want to know about error handling and reconnection strategies. I should mention those as follow-up topics.',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',  // <-- completed = auto-hidden
        pathStatus: 'active',
      },

      // --- Branch: error handling question ---
      n7: {
        id: 'n7',
        type: 'user_prompt',
        content: 'What about error handling?',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',
        pathStatus: 'active',
      },
      n8: {
        id: 'n8',
        type: 'response',
        content: "Great question! You should handle these key scenarios:\n\n- **Connection errors** — listen for the `'error'` event\n- **Unexpected disconnects** — implement heartbeat with `ping/pong`\n- **Message validation** — always validate incoming data\n\nLet me look up the best practices...",
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'streaming',
        executionStatus: 'in_progress',  // still streaming
        pathStatus: 'active',
      },

      // --- IN-PROGRESS tool call (should STAY VISIBLE — still running) ---
      n11: {
        id: 'n11',
        type: 'tool_call',
        content: 'web_search("node.js websocket error handling best practices 2024")',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'streaming',
        executionStatus: 'in_progress',  // <-- in_progress = stays visible!
        pathStatus: 'active',
      },

      // --- COMPLETED tool pair on the branch (should AUTO-HIDE) ---
      n12: {
        id: 'n12',
        type: 'tool_call',
        content: 'read_file("examples/ws-error-handler.ts")',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',  // <-- completed = auto-hidden
        pathStatus: 'active',
      },
      n13: {
        id: 'n13',
        type: 'tool_result',
        content: '// Error handling example\nws.on("error", (err) => {\n  console.error("WebSocket error:", err);\n});\n\nws.on("close", (code, reason) => {\n  console.log(`Closed: ${code} ${reason}`);\n  setTimeout(reconnect, 1000);\n});',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',  // <-- completed = auto-hidden
        pathStatus: 'active',
      },

      // --- Summary + annotation (always visible) ---
      n9: {
        id: 'n9',
        type: 'summary',
        content: 'Conversation about building WebSocket servers in Node.js with ws package, covering setup, code examples, and error handling.',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',
        pathStatus: 'active',
      },
      n10: {
        id: 'n10',
        type: 'annotation',
        content: 'TODO: Add reconnection example with exponential backoff',
        position: { x: 0, y: 0 },
        created: new Date().toISOString(),
        status: 'completed',
        executionStatus: 'completed',
        pathStatus: 'active',
      },
    },
    edges: [
      { from: 'n1', to: 'n2', type: 'reply_to' },
      { from: 'n2', to: 'n3', type: 'reply_to' },
      { from: 'n2', to: 'n4', type: 'tool_call' },        // completed tool pair — hidden
      { from: 'n4', to: 'n5', type: 'tool_result' },       // completed tool pair — hidden
      { from: 'n2', to: 'n6', type: 'reply_to' },          // completed thought — hidden
      { from: 'n1', to: 'n7', type: 'branches_from' },
      { from: 'n7', to: 'n8', type: 'reply_to' },
      { from: 'n8', to: 'n11', type: 'tool_call' },        // in-progress tool — VISIBLE
      { from: 'n8', to: 'n12', type: 'tool_call' },        // completed tool pair — hidden
      { from: 'n12', to: 'n13', type: 'tool_result' },     // completed tool pair — hidden
      { from: 'n1', to: 'n9', type: 'references' },
      { from: 'n8', to: 'n10', type: 'references' },
    ],
  };
}
