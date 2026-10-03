import { expect, it } from 'vitest';
import { createWorkspace, createDoc, placeDoc, updateDocBody } from './docs.js';
import { assembleDocContext, DEFAULT_DOC_CONTEXT_BUDGET } from './doc-context.js';
import type { DocWorkspace, Doc } from './docs.js';

function docWith(ws: DocWorkspace, title: string, body: string): [DocWorkspace, Doc] {
  let doc: Doc;
  [ws, doc] = createDoc(ws, title);
  ws = updateDocBody(ws, doc.id, body);
  return [ws, doc];
}

it('includes referenced docs before the target doc', () => {
  let ws = createWorkspace();
  let signin: Doc, arch: Doc, design: Doc;
  [ws, signin] = docWith(ws, 'Sign in', 'auth flow notes');
  [ws, arch] = docWith(ws, 'Frontend Architecture', 'atoms molecules cells');
  [ws, design] = docWith(ws, 'Design.md', 'reuse Button and Card');

  ws = placeDoc(ws, signin.id, arch.id, { x: 0, y: 0 });
  ws = placeDoc(ws, signin.id, design.id, { x: 0, y: 80 });

  const blocks = assembleDocContext(ws, signin.id);
  expect(blocks.map((b) => b.title)).toEqual([
    'Frontend Architecture',
    'Design.md',
    'Sign in',
  ]);
  expect(blocks[0].body).toBe('atoms molecules cells');
  expect(blocks.at(-1)?.body).toBe('auth flow notes');
});

it('follows references recursively, deepest first, each doc once', () => {
  let ws = createWorkspace();
  let signin: Doc, arch: Doc, tokens: Doc;
  [ws, signin] = docWith(ws, 'Sign in', 's');
  [ws, arch] = docWith(ws, 'Frontend Architecture', 'a');
  [ws, tokens] = docWith(ws, 'Design Tokens', 't');

  ws = placeDoc(ws, signin.id, arch.id, { x: 0, y: 0 });
  ws = placeDoc(ws, arch.id, tokens.id, { x: 0, y: 0 }); // reference of a reference

  expect(assembleDocContext(ws, signin.id).map((b) => b.title)).toEqual([
    'Design Tokens',
    'Frontend Architecture',
    'Sign in',
  ]);
});

it('tolerates reference cycles without looping or duplicating', () => {
  let ws = createWorkspace();
  let a: Doc, b: Doc;
  [ws, a] = docWith(ws, 'A', 'a');
  [ws, b] = docWith(ws, 'B', 'b');

  ws = placeDoc(ws, a.id, b.id, { x: 0, y: 0 });
  ws = placeDoc(ws, b.id, a.id, { x: 0, y: 0 }); // A ↔ B

  expect(assembleDocContext(ws, a.id).map((x) => x.title)).toEqual(['B', 'A']);
});

it('over budget, degrades deepest docs to title-only before anything nearer', () => {
  let ws = createWorkspace();
  let signin: Doc, arch: Doc, tokens: Doc;
  [ws, signin] = docWith(ws, 'Sign in', '0123456789'); // 10 chars
  [ws, arch] = docWith(ws, 'Frontend Architecture', '0123456789');
  [ws, tokens] = docWith(ws, 'Design Tokens', '0123456789');

  ws = placeDoc(ws, signin.id, arch.id, { x: 0, y: 0 });
  ws = placeDoc(ws, arch.id, tokens.id, { x: 0, y: 0 });

  // room for two full bodies, not three: the deepest (Design Tokens) degrades
  const blocks = assembleDocContext(ws, signin.id, { budget: 20 });
  expect(blocks.map((b) => [b.title, b.degraded])).toEqual([
    ['Design Tokens', true],
    ['Frontend Architecture', false],
    ['Sign in', false],
  ]);
  expect(blocks[0].body).toBe('');
});

it('skips chat placements: they contribute nothing to doc context yet', () => {
  let ws = createWorkspace();
  let host: Doc, ref: Doc;
  [ws, host] = docWith(ws, 'Host', 'h');
  [ws, ref] = docWith(ws, 'Ref', 'r');
  ws = placeDoc(ws, host.id, ref.id, { x: 0, y: 0 });
  ws.docs[host.id].canvas.placements.push({
    kind: 'chat',
    id: 'chat_not_a_doc',
    position: { x: 10, y: 10 },
  });

  const blocks = assembleDocContext(ws, host.id);
  expect(blocks.map((b) => b.docId)).toEqual([ref.id, host.id]);
});

it('exports the default context budget shared by server and frontend', () => {
  expect(DEFAULT_DOC_CONTEXT_BUDGET).toBe(24_000);
});
