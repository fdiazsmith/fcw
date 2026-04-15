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
});
