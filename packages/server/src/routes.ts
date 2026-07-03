import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fromJSON, toJSON, createDocument } from '@fcw/graph-core';
import type { GraphDocument } from '@fcw/graph-core';
import { StateManager } from './state-manager.js';
import type { AttachmentStore } from './attachments.js';

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

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

export function createRouter(
  manager: StateManager,
  storageDir: string,
  attachments?: AttachmentStore,
): Handler {
  return async function router(req: IncomingMessage, res: ServerResponse) {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // POST /attachments — store a base64-encoded file, return its metadata
    if (attachments && method === 'POST' && url === '/attachments') {
      const body = await readBody(req);
      let parsed: { name?: string; mediaType?: string; data?: string };
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJSON(res, 400, { error: 'Invalid JSON' });
        return;
      }
      if (!parsed.name || !parsed.mediaType || typeof parsed.data !== 'string') {
        sendJSON(res, 400, { error: 'name, mediaType and data are required' });
        return;
      }
      const buf = Buffer.from(parsed.data, 'base64');
      if (buf.byteLength > attachments.maxBytes) {
        sendJSON(res, 413, { error: 'Attachment too large' });
        return;
      }
      const att = attachments.save(parsed.name, parsed.mediaType, buf);
      sendJSON(res, 201, att);
      return;
    }

    // GET /attachments/:id — serve stored bytes
    const attMatch = url.match(/^\/attachments\/([^/]+)$/);
    if (attachments && method === 'GET' && attMatch) {
      const att = attachments.get(attMatch[1]);
      const bytes = attachments.read(attMatch[1]);
      if (!att || !bytes) {
        sendJSON(res, 404, { error: 'Not found' });
        return;
      }
      const ext = (att.path.match(/\.[^.]+$/)?.[0] ?? '').toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_BY_EXT[ext] ?? att.mediaType });
      res.end(bytes);
      return;
    }

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

    // POST /summarize
    if (method === 'POST' && url === '/summarize') {
      const body = await readBody(req);
      let contents: { type: string; content: string }[] = [];
      try {
        const parsed = JSON.parse(body);
        contents = parsed.nodes ?? [];
      } catch {
        sendJSON(res, 400, { error: 'Invalid JSON' });
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        // Fallback: mechanical summary when no API key
        const lines = contents.map((n) => {
          const preview = n.content.length > 120 ? n.content.slice(0, 120) + '...' : n.content;
          return `- **${n.type.replace('_', ' ')}**: ${preview}`;
        });
        sendJSON(res, 200, { summary: `Summary of ${contents.length} nodes:\n\n${lines.join('\n')}` });
        return;
      }

      try {
        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic({ apiKey });

        const nodeText = contents.map((n, i) =>
          `[${i + 1}] (${n.type}) ${n.content}`
        ).join('\n\n');

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system: 'You are a concise summarizer. Given a set of conversation nodes from a graph-based chat interface, produce a sharp 2-4 sentence synthesis capturing the key decisions, findings, and outcomes. No preamble.',
          messages: [{ role: 'user', content: `Summarize these ${contents.length} conversation nodes:\n\n${nodeText}` }],
        });

        const text = response.content[0]?.type === 'text' ? response.content[0].text : 'Summary unavailable';
        sendJSON(res, 200, { summary: text });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendJSON(res, 500, { error: `Summarization failed: ${message}` });
      }
      return;
    }

    sendJSON(res, 404, { error: 'Not found' });
  };
}
