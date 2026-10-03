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

  it('strips light markdown from the preview', () => {
    const body = '# Heading\n\nSome **bold** and _it_ and `code` and [link](http://x.y).\n- item';
    expect(docCardModel(doc({ body }), ctx).preview).toBe('Heading Some bold and it and code and link. item');
  });

  it('truncates the preview to ~200 chars with an ellipsis', () => {
    const p = docCardModel(doc({ body: 'a'.repeat(500) }), ctx).preview;
    expect(p.length).toBe(201);
    expect(p.endsWith('…')).toBe(true);
  });

  it('does not truncate short bodies', () => {
    expect(docCardModel(doc({ body: 'a'.repeat(200) }), ctx).preview).toBe('a'.repeat(200));
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
