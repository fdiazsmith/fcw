// Pure view model for a doc box on the canvas (the structure-first replacement
// for compactCardModel). No tldraw, no React.
import { docIsStale } from '@fcw/graph-core';
import type { CompactionMember, Doc } from '@fcw/graph-core';

const PREVIEW_CHARS = 200;

export interface DocCardContext {
  /** How many canvases this doc is placed on. */
  placedOnCount: number;
  /** Chats on the doc's own canvas, for staleness of a generated body. */
  members: CompactionMember[];
}

export interface DocCardModel {
  docId: string;
  title: string;
  preview: string;
  childCount: number;
  isReference: boolean;
  refCount: number;
  generated: 'none' | 'generating' | 'idle';
  stale: boolean;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|[-*+]|>|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function docCardModel(doc: Doc, ctx: DocCardContext): DocCardModel {
  const text = stripMarkdown(doc.body);
  return {
    docId: doc.id,
    title: doc.title,
    preview: text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS)}…` : text,
    childCount: doc.canvas.placements.length,
    isReference: ctx.placedOnCount > 1,
    refCount: ctx.placedOnCount,
    generated: doc.generated ? doc.generated.status : 'none',
    stale: docIsStale(doc, ctx.members),
  };
}
