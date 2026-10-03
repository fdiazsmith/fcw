import type { ServerMessage, ClientMessage } from '@fcw/graph-core';

export interface WsClient {
  sendMessage(msg: ClientMessage): void;
  onMessage(cb: (msg: ServerMessage) => void): void;
  close(): void;
}

/** `url` may be a getter, re-read on every (re)connect. */
export function createWsClient(url: string | (() => string)): WsClient {
  let ws: WebSocket;
  let messageHandler: ((msg: ServerMessage) => void) | null = null;
  let reconnectDelay = 1000;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function connect() {
    ws = new WebSocket(typeof url === 'function' ? url() : url);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        console.log('[ws] received:', msg.type, msg);
        messageHandler?.(msg);
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = (err) => {
      console.error('[ws] error:', err);
    };

    ws.onclose = () => {
      if (!closed) {
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30000);
          connect();
        }, reconnectDelay);
      }
    };

    ws.onopen = () => {
      reconnectDelay = 1000;
    };
  }

  connect();

  return {
    sendMessage(msg: ClientMessage) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    onMessage(cb: (msg: ServerMessage) => void) {
      messageHandler = cb;
    },
    close() {
      closed = true;
      clearTimeout(reconnectTimer);
      ws.close();
    },
  };
}
