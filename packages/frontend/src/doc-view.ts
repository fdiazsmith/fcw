// Pure view model for a doc box on the canvas (the structure-first replacement
// for compactCardModel). No tldraw, no React.
import { docIsStale } from '@fcw/graph-core';
import type { CompactionMember, Doc } from '@fcw/graph-core';

export interface DocCardContext {
  /** How many canvases this doc is placed on. */
  placedOnCount: number;
  /** Chats on the doc's own canvas, for staleness of a generated body. */
  members: CompactionMember[];
}

export interface DocCardModel {
  docId: string;
  title: string;
  /** The body as markdown for the card to render, minus the editor's blank paragraphs. */
  preview: string;
  childCount: number;
  isReference: boolean;
  refCount: number;
  generated: 'none' | 'generating' | 'idle';
  stale: boolean;
}

/** TipTap saves an empty paragraph as a lone `&nbsp;`; drop those and collapse the gaps. */
function previewMarkdown(md: string): string {
  return md
    .split(/\n{2,}/)
    .filter((para) => para.replace(/&nbsp;|\u00a0/g, '').trim() !== '')
    .join('\n\n')
    .trim();
}

export function docCardModel(doc: Doc, ctx: DocCardContext): DocCardModel {
  return {
    docId: doc.id,
    title: doc.title,
    preview: previewMarkdown(doc.body),
    childCount: doc.canvas.placements.length,
    isReference: ctx.placedOnCount > 1,
    refCount: ctx.placedOnCount,
    generated: doc.generated ? doc.generated.status : 'none',
    stale: docIsStale(doc, ctx.members),
  };
}
