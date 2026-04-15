import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRouter } from './routes.js';
import { StateManager } from './state-manager.js';

async function makeRequest(
  server: ReturnType<typeof createServer>,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const port = (server.address() as { port: number }).port;
  const url = `http://localhost:${port}${path}`;
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function startServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.listen(0, resolve));
}

function stopServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

describe('HTTP Document API', () => {
  let storageDir: string;
  let manager: StateManager;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'fcw-test-'));
    manager = new StateManager();
    const router = createRouter(manager, storageDir);
    server = createServer(router);
    await startServer(server);
  });

  afterEach(async () => {
    manager.destroy();
    await stopServer(server);
    rmSync(storageDir, { recursive: true, force: true });
  });

  it('GET /documents returns empty list initially', async () => {
    const { status, data } = await makeRequest(server, 'GET', '/documents');
    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('POST /documents creates new document and returns it', async () => {
    const { status, data } = await makeRequest(server, 'POST', '/documents', {
      title: 'Test Doc',
    });
    expect(status).toBe(201);
    expect((data as { id: string }).id).toBeTruthy();
    expect((data as { meta: { title: string } }).meta.title).toBe('Test Doc');
  });

  it('GET /documents/:id returns saved document', async () => {
    const { data: created } = await makeRequest(server, 'POST', '/documents', {
      title: 'My Doc',
    });
    const id = (created as { id: string }).id;
    const { status, data } = await makeRequest(server, 'GET', `/documents/${id}`);
    expect(status).toBe(200);
    expect((data as { id: string }).id).toBe(id);
  });

  it('GET /documents returns list with saved documents', async () => {
    await makeRequest(server, 'POST', '/documents', { title: 'Doc 1' });
    await makeRequest(server, 'POST', '/documents', { title: 'Doc 2' });
    const { data } = await makeRequest(server, 'GET', '/documents');
    expect((data as unknown[]).length).toBe(2);
  });

  it('PUT /documents/:id saves current graph state', async () => {
    const { data: created } = await makeRequest(server, 'POST', '/documents', {
      title: 'Save Test',
    });
    const id = (created as { id: string }).id;
    const { status } = await makeRequest(server, 'PUT', `/documents/${id}`);
    expect(status).toBe(200);
  });

  it('DELETE /documents/:id deletes the document', async () => {
    const { data: created } = await makeRequest(server, 'POST', '/documents', {
      title: 'Delete Me',
    });
    const id = (created as { id: string }).id;
    const { status } = await makeRequest(server, 'DELETE', `/documents/${id}`);
    expect(status).toBe(204);
    const { status: getStatus } = await makeRequest(server, 'GET', `/documents/${id}`);
    expect(getStatus).toBe(404);
  });

  it('GET /documents/:id returns 404 for unknown id', async () => {
    const { status } = await makeRequest(server, 'GET', '/documents/nonexistent');
    expect(status).toBe(404);
  });
});
