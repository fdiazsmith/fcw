import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { createRouter } from './routes.js';
import { StateManager } from './state-manager.js';
import { AttachmentStore } from './attachments.js';

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

describe('HTTP Attachments API', () => {
  let storageDir: string;
  let manager: StateManager;
  let store: AttachmentStore;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'fcw-att-'));
    manager = new StateManager();
    store = new AttachmentStore(storageDir, { maxBytes: 10 });
    server = createServer(createRouter(manager, storageDir, store));
    await startServer(server);
  });

  afterEach(async () => {
    manager.destroy();
    await stopServer(server);
    rmSync(storageDir, { recursive: true, force: true });
  });

  it('POST /attachments stores a file and GET serves it back', async () => {
    const { status, data } = await makeRequest(server, 'POST', '/attachments', {
      name: 'hi.txt',
      mediaType: 'text/plain',
      data: Buffer.from('hello').toString('base64'),
    });
    expect(status).toBe(201);
    const att = data as { id: string; name: string; mediaType: string; path: string };
    expect(att.id).toBeTruthy();
    expect(att.name).toBe('hi.txt');
    expect(store.get(att.id)).toBeDefined();

    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://localhost:${port}/attachments/${att.id}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
  });

  it('rejects oversized uploads with 413', async () => {
    const { status } = await makeRequest(server, 'POST', '/attachments', {
      name: 'big.bin',
      mediaType: 'application/octet-stream',
      data: Buffer.from('this is more than ten bytes').toString('base64'),
    });
    expect(status).toBe(413);
  });

  it('GET /attachments/:id returns 404 for unknown id', async () => {
    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://localhost:${port}/attachments/nope`);
    expect(res.status).toBe(404);
  });

  it('a new store over the same dir still resolves previously saved attachments', () => {
    const att = store.save('note.txt', 'text/plain', Buffer.from('persisted'));
    const reopened = new AttachmentStore(storageDir, { maxBytes: 10 });
    expect(reopened.get(att.id)).toEqual(att);
    expect(reopened.read(att.id)?.toString()).toBe('persisted');
  });

  // The frontend (vite, :8008) is a different origin than the server (:8009),
  // so the browser preflights POST /attachments and blocks it without CORS.
  it('answers OPTIONS preflight with 204 and CORS headers', async () => {
    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://localhost:${port}/attachments`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8008',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-allow-methods')).toContain('POST');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type');
  });

  it('sends access-control-allow-origin on regular responses', async () => {
    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://localhost:${port}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'hi.txt', mediaType: 'text/plain', data: Buffer.from('hi').toString('base64') }),
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('GET /fs/dirs', () => {
  let storageDir: string;
  let browseRoot: string;
  let manager: StateManager;
  let server: ReturnType<typeof createServer>;

  beforeEach(async () => {
    storageDir = mkdtempSync(join(tmpdir(), 'fcw-test-'));
    browseRoot = mkdtempSync(join(tmpdir(), 'fcw-browse-'));
    mkdirSync(join(browseRoot, 'projects'));
    mkdirSync(join(browseRoot, 'zeta'));
    mkdirSync(join(browseRoot, '.hidden'));
    writeFileSync(join(browseRoot, 'file.txt'), 'x');
    manager = new StateManager();
    const router = createRouter(manager, storageDir);
    server = createServer(router);
    await startServer(server);
  });

  afterEach(async () => {
    manager.destroy();
    await stopServer(server);
    rmSync(storageDir, { recursive: true, force: true });
    rmSync(browseRoot, { recursive: true, force: true });
  });

  it('lists subdirectories sorted, skipping hidden dirs and files', async () => {
    const { status, data } = await makeRequest(
      server,
      'GET',
      `/fs/dirs?path=${encodeURIComponent(browseRoot)}`,
    );
    expect(status).toBe(200);
    const body = data as { path: string; parent: string; dirs: { name: string; path: string }[] };
    expect(body.path).toBe(browseRoot);
    expect(body.parent).toBe(join(browseRoot, '..'));
    expect(body.dirs.map((d) => d.name)).toEqual(['projects', 'zeta']);
    expect(body.dirs[0].path).toBe(join(browseRoot, 'projects'));
  });

  it('defaults to the home directory without a path param', async () => {
    const { status, data } = await makeRequest(server, 'GET', '/fs/dirs');
    expect(status).toBe(200);
    expect((data as { path: string }).path).toBe(homedir());
  });

  it('404s for a missing or non-directory path', async () => {
    const missing = await makeRequest(
      server,
      'GET',
      `/fs/dirs?path=${encodeURIComponent(join(browseRoot, 'nope'))}`,
    );
    expect(missing.status).toBe(404);
    const file = await makeRequest(
      server,
      'GET',
      `/fs/dirs?path=${encodeURIComponent(join(browseRoot, 'file.txt'))}`,
    );
    expect(file.status).toBe(404);
  });

  it('rejects relative paths', async () => {
    const { status } = await makeRequest(server, 'GET', '/fs/dirs?path=..%2Fetc');
    expect(status).toBe(400);
  });
});
