// Stores prompt attachments on disk and resolves them by id. Shared between the
// HTTP upload route and the chat session manager (which references them by id).
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import type { Attachment } from '@fcw/graph-core';

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

export class AttachmentStore {
  readonly maxBytes: number;
  private readonly dir: string;
  private readonly indexPath: string;
  private readonly byId = new Map<string, Attachment>();

  constructor(baseDir: string, options?: { maxBytes?: number }) {
    this.dir = join(baseDir, 'attachments');
    this.maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    mkdirSync(this.dir, { recursive: true });
    // Metadata survives restarts via an index sidecar; persisted graphs
    // reference attachments by id long after the process that saved them.
    this.indexPath = join(this.dir, 'index.json');
    try {
      const list = JSON.parse(readFileSync(this.indexPath, 'utf-8')) as Attachment[];
      for (const att of list) this.byId.set(att.id, att);
    } catch {
      // fresh dir or unreadable index — start empty
    }
  }

  /** Persist a buffer and return its metadata. */
  save(name: string, mediaType: string, data: Buffer): Attachment {
    const id = randomUUID();
    const ext = extname(name) || EXT_BY_TYPE[mediaType] || '';
    const path = join(this.dir, `${id}${ext}`);
    writeFileSync(path, data);
    const att: Attachment = { id, name, mediaType, path };
    this.byId.set(id, att);
    writeFileSync(this.indexPath, JSON.stringify([...this.byId.values()]));
    return att;
  }

  get(id: string): Attachment | undefined {
    return this.byId.get(id);
  }

  /** Read the stored bytes for an attachment, or undefined if unknown. */
  read(id: string): Buffer | undefined {
    const att = this.byId.get(id);
    if (!att) return undefined;
    try {
      return readFileSync(att.path);
    } catch {
      return undefined;
    }
  }
}
