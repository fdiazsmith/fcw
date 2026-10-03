import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWsClient } from './ws-client';

class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onopen: (() => void) | null = null;
  sent: string[] = [];
  closed = false;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; }

  static instances: MockWebSocket[] = [];
  static reset() { MockWebSocket.instances = []; }
}

beforeEach(() => {
  MockWebSocket.reset();
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createWsClient', () => {
  it('connects to given url', () => {
    createWsClient('ws://localhost:8080');
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8080');
  });

  it('onMessage receives parsed ServerMessage', () => {
    const client = createWsClient('ws://localhost:8080');
    const received: unknown[] = [];
    client.onMessage((msg) => received.push(msg));
    const ws = MockWebSocket.instances[0];
    ws.onmessage?.({ data: JSON.stringify({ type: 'error', message: 'oops' }) });
    expect(received).toEqual([{ type: 'error', message: 'oops' }]);
  });

  it('sendMessage sends JSON', () => {
    const client = createWsClient('ws://localhost:8080');
    client.sendMessage({ type: 'user_prompt_submitted', content: 'hello' });
    const ws = MockWebSocket.instances[0];
    expect(ws.sent).toEqual([JSON.stringify({ type: 'user_prompt_submitted', content: 'hello' })]);
  });

  it('close() cancels a pending reconnect: no orphan socket after a drop', () => {
    vi.useFakeTimers();
    try {
      const client = createWsClient('ws://localhost:8080');
      MockWebSocket.instances[0].onclose?.(); // server restarted: reconnect scheduled
      client.close(); // effect cleanup (HMR / unmount) before the timer fires
      vi.advanceTimersByTime(60_000);
      expect(MockWebSocket.instances).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('close stops the websocket', () => {
    const client = createWsClient('ws://localhost:8080');
    client.close();
    expect(MockWebSocket.instances[0].closed).toBe(true);
  });

  it('auto-reconnects on disconnect', async () => {
    vi.useFakeTimers();
    createWsClient('ws://localhost:8080');
    const ws1 = MockWebSocket.instances[0];
    ws1.onclose?.();
    vi.advanceTimersByTime(1500);
    expect(MockWebSocket.instances.length).toBe(2);
    vi.useRealTimers();
  });

  it('a url getter is re-read on reconnect (M7.6: rebind to the current project)', () => {
    vi.useFakeTimers();
    let url = 'ws://x?project=a';
    createWsClient(() => url);
    expect(MockWebSocket.instances[0].url).toBe('ws://x?project=a');
    url = 'ws://x?project=b';
    MockWebSocket.instances[0].onclose?.();
    vi.advanceTimersByTime(1500);
    expect(MockWebSocket.instances[1].url).toBe('ws://x?project=b');
    vi.useRealTimers();
  });
});
