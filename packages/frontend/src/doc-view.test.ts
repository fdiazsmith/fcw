import { describe, it, expect } from 'vitest';
import { compactionDigest } from '@fcw/graph-core';
import type { Doc } from '@fcw/graph-core';
import { docCardModel } from './doc-view';

const doc = (over: Partial<Doc> = {}): Doc => ({
  id: 'd1',
  title: 'Auth',
  body: '',
  canvas: { placements: [], edges: [] },
  ...over,
});
const ctx = { placedOnCount: 1, members: [] };

describe('docCardModel', () => {
  it('carries id and title', () => {
    const m = docCardModel(doc(), ctx);
    expect(m.docId).toBe('d1');
    expect(m.title).toBe('Auth');
  });

  it('empty body gives empty preview', () => {
    expect(docCardModel(doc(), ctx).preview).toBe('');
  });

  it('keeps the markdown so the card can render it', () => {
    const body = '# Heading\n\nSome **bold** text.\n\n- item';
    expect(docCardModel(doc({ body }), ctx).preview).toBe(body);
  });

  it('drops the editor\'s &nbsp; blank paragraphs', () => {
    const body = 'one\n\n\n\n&nbsp;\n\n&nbsp;\n\ntwo';
    expect(docCardModel(doc({ body }), ctx).preview).toBe('one\n\ntwo');
  });

  it('a body of only blank paragraphs is empty', () => {
    expect(docCardModel(doc({ body: '&nbsp;\n\n&nbsp;\n' }), ctx).preview).toBe('');
  });

  it('childCount counts placements on its canvas', () => {
    const canvas = {
      placements: [
        { kind: 'chat' as const, id: 'c', position: { x: 0, y: 0 } },
        { kind: 'doc' as const, id: 'e', position: { x: 0, y: 0 } },
      ],
      edges: [],
    };
    expect(docCardModel(doc({ canvas }), ctx).childCount).toBe(2);
  });

  it('is a reference only when placed on more than one canvas', () => {
    expect(docCardModel(doc(), { ...ctx, placedOnCount: 1 })).toMatchObject({ isReference: false, refCount: 1 });
    expect(docCardModel(doc(), { ...ctx, placedOnCount: 3 })).toMatchObject({ isReference: true, refCount: 3 });
  });

  it('generated state: none / generating / idle', () => {
    expect(docCardModel(doc(), ctx).generated).toBe('none');
    expect(docCardModel(doc({ generated: { sourceDigest: 'x', status: 'generating' } }), ctx).generated).toBe('generating');
    expect(docCardModel(doc({ generated: { sourceDigest: 'x', status: 'idle' } }), ctx).generated).toBe('idle');
  });

  it('stale follows docIsStale against members', () => {
    const members = [{ id: 'a', messages: [{ role: 'user', content: 'hi' }] }];
    const generated = { sourceDigest: compactionDigest(members), status: 'idle' as const };
    expect(docCardModel(doc({ generated }), { ...ctx, members }).stale).toBe(false);
    const changed = [{ id: 'a', messages: [{ role: 'user', content: 'changed' }] }];
    expect(docCardModel(doc({ generated }), { ...ctx, members: changed }).stale).toBe(true);
    expect(docCardModel(doc(), { ...ctx, members: changed }).stale).toBe(false);
  });
});
