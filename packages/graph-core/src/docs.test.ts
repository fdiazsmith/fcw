import { expect, it } from 'vitest';
import { createWorkspace, createDoc, placeDoc, updateDocBody, applyToDoc, findDocsByTitle } from './docs.js';
import type { Doc } from './docs.js';

it('creates a uniform doc: title, empty body, empty child canvas', () => {
  const [, doc] = createDoc(createWorkspace(), 'Sign in');
  expect(doc.title).toBe('Sign in');
  expect(doc.body).toBe('');
  expect(doc.canvas).toEqual({ placements: [], edges: [] });
});

it('mints ids that are unique within a ms and not restart-prone counters', () => {
  const [ws, a] = createDoc(createWorkspace(), 'A');
  const [, b] = createDoc(ws, 'B');
  expect(a.id).not.toBe(b.id);
  expect(a.id).toMatch(/^doc_\d+_\d+$/);
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

it('applyToDoc replaces only the target body, preserving everything else', () => {
  let ws = createWorkspace();
  let a, b;
  [ws, a] = createDoc(ws, 'A');
  [ws, b] = createDoc(ws, 'B');
  ws = updateDocBody(ws, a.id, 'old');
  ws = { docs: { ...ws.docs, [a.id]: { ...ws.docs[a.id], generated: { sourceDigest: 'd1', status: 'idle' } } } };
  const bigger = { ...ws, extra: 42 };
  const before = bigger.docs[a.id];

  const next = applyToDoc(bigger, a.id, 'proposed');

  expect(next.docs[a.id].body).toBe('proposed');
  expect(next.docs[a.id].title).toBe('A');
  expect(next.docs[a.id].canvas).toBe(before.canvas);
  expect(next.docs[a.id].generated).toEqual({ sourceDigest: 'd1', status: 'idle' });
  expect(next.docs[b.id]).toBe(bigger.docs[b.id]);
  expect(next.extra).toBe(42);
  expect(bigger.docs[a.id]).toBe(before);
  expect(before.body).toBe('old');
});

it('applyToDoc throws on unknown docId', () => {
  expect(() => applyToDoc(createWorkspace(), 'nope', 'x')).toThrow();
});

it('findDocsByTitle matches case- and whitespace-insensitively, in insertion order', () => {
  let ws = createWorkspace();
  let a, b, c;
  [ws, a] = createDoc(ws, 'Sign  In');
  [ws, b] = createDoc(ws, 'Checkout');
  [ws, c] = createDoc(ws, '  sign in\t');
  expect(findDocsByTitle(ws, ' SIGN\n in ').map((d) => d.id)).toEqual([a.id, c.id]);
  expect(findDocsByTitle(ws, 'nope')).toEqual([]);
});

it('findDocsByTitle returns [] for empty or whitespace-only query', () => {
  const [ws] = createDoc(createWorkspace(), '');
  expect(findDocsByTitle(ws, '')).toEqual([]);
  expect(findDocsByTitle(ws, '  \t ')).toEqual([]);
});

it('findDocsByTitle excludes opts.excludeId and accepts a larger workspace object', () => {
  let ws = createWorkspace();
  let a, b;
  [ws, a] = createDoc(ws, 'Login');
  [ws, b] = createDoc(ws, 'login');
  const bigger = { ...ws, extra: 1 };
  expect(findDocsByTitle(bigger, 'Login', { excludeId: a.id }).map((d) => d.id)).toEqual([b.id]);
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
