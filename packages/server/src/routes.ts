import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fromJSON, toJSON, createDocument } from '@fcw/graph-core';
import type { GraphDocument } from '@fcw/graph-core';
import { StateManager } from './state-manager.js';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

function sendJSON(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function docPath(storageDir: string, id: string): string {
  return join(storageDir, `${id}.fcw.json`);
}

async function listDocuments(storageDir: string): Promise<GraphDocument[]> {
  const files = await readdir(storageDir).catch(() => [] as string[]);
  const docs: GraphDocument[] = [];
  for (const f of files.filter((f) => f.endsWith('.fcw.json'))) {
    try {
      const raw = await readFile(join(storageDir, f), 'utf-8');
      docs.push(fromJSON(raw));
    } catch {
      // skip corrupt files
    }
  }
  return docs;
}

async function saveDocument(storageDir: string, doc: GraphDocument): Promise<void> {
  await writeFile(docPath(storageDir, doc.id), toJSON(doc), 'utf-8');
}

async function loadDocument(storageDir: string, id: string): Promise<GraphDocument | null> {
  try {
    const raw = await readFile(docPath(storageDir, id), 'utf-8');
    return fromJSON(raw);
  } catch {
    return null;
  }
}

export function createRouter(
  manager: StateManager,
  storageDir: string,
): Handler {
  return async function router(req: IncomingMessage, res: ServerResponse) {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // GET /documents
    if (method === 'GET' && url === '/documents') {
      const docs = await listDocuments(storageDir);
      sendJSON(res, 200, docs);
      return;
    }

    // POST /documents
    if (method === 'POST' && url === '/documents') {
      const body = await readBody(req);
      let title = 'Untitled';
      try {
        const parsed = JSON.parse(body);
        if (parsed.title) title = parsed.title;
      } catch { /* ignore */ }
      const doc = createDocument(title);
      manager.document = doc;
      await saveDocument(storageDir, doc);
      sendJSON(res, 201, doc);
      return;
    }

    // GET /documents/:id
    const getMatch = url.match(/^\/documents\/([^/]+)$/);
    if (getMatch) {
      const id = getMatch[1];

      if (method === 'GET') {
        const doc = await loadDocument(storageDir, id);
        if (!doc) {
          sendJSON(res, 404, { error: 'Not found' });
          return;
        }
        sendJSON(res, 200, doc);
        return;
      }

      if (method === 'PUT') {
        await saveDocument(storageDir, manager.document);
        sendJSON(res, 200, manager.document);
        return;
      }

      if (method === 'DELETE') {
        try {
          await unlink(docPath(storageDir, id));
          res.writeHead(204);
          res.end();
        } catch {
          sendJSON(res, 404, { error: 'Not found' });
        }
        return;
      }
    }

    sendJSON(res, 404, { error: 'Not found' });
  };
}
