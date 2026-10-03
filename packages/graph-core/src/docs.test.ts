import { expect, it } from 'vitest';
import { createWorkspace, createDoc, placeDoc, updateDocBody } from './docs.js';
import type { Doc } from './docs.js';

it('creates a uniform doc: title, empty body, empty child canvas', () => {
  const [, doc] = createDoc(createWorkspace(), 'Sign in');
  expect(doc.title).toBe('Sign in');
  expect(doc.body).toBe('');
  expect(doc.canvas).toEqual({ placements: [], edges: [] });
});

it('one doc placed on two canvases stays one entity', () => {
  let ws = createWorkspace();
  let signin, checkout, arch;
  [ws, signin] = createDoc(ws, 'Sign-in Page');
  [ws, checkout] = createDoc(ws, 'Checkout Flow');
  [ws, arch] = createDoc(ws, 'Frontend Architecture');

  ws = placeDoc(ws, signin.id, arch.id, { x: 0, y: 100 });
  ws = placeDoc(ws, checkout.id, arch.id, { x: 40, y: 60 });

  // both canvases reference the same id — placements route, they don't copy
  expect(ws.docs[signin.id].canvas.placements[0].id).toBe(arch.id);
  expect(ws.docs[checkout.id].canvas.placements[0].id).toBe(arch.id);

  // edit once, visible from every canvas that references it
  ws = updateDocBody(ws, arch.id, '# Atoms, Molecules, Cells');
  expect(ws.docs[arch.id].body).toBe('# Atoms, Molecules, Cells');
});

it('placeDoc produces a doc-kind placement', () => {
  let ws = createWorkspace();
  let host, child;
  [ws, host] = createDoc(ws, 'Host');
  [ws, child] = createDoc(ws, 'Child');
  ws = placeDoc(ws, host.id, child.id, { x: 5, y: 7 });
  expect(ws.docs[host.id].canvas.placements).toEqual([
    { kind: 'doc', id: child.id, position: { x: 5, y: 7 } },
  ]);
});

it('a doc with `generated` is a compaction-style doc; plain docs have none', () => {
  const [, plain] = createDoc(createWorkspace(), 'Plain');
  expect(plain.generated).toBeUndefined();

  const generated: Doc = {
    ...plain,
    generated: { sourceDigest: 'abc-1', status: 'generating' },
  };
  expect(generated.generated).toEqual({ sourceDigest: 'abc-1', status: 'generating' });
});
