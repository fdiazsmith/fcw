import { describe, it, expect } from 'vitest';
import type { ChatNode, Doc, DocPlacement } from '@fcw/graph-core';
import { ROOT_CANVAS_ID, compactionDigest } from '@fcw/graph-core';
import { emptyChatState, applyChatMessage, ChatState } from './chat-store';
import { projectCanvas, linkCandidates } from './canvas-projection';

const at = (x: number, y: number) => ({ x, y });
const place = (kind: DocPlacement['kind'], id: string, x = 0, y = 0): DocPlacement => ({ kind, id, position: at(x, y) });
const doc = (id: string, title: string, placements: DocPlacement[] = [], over: Partial<Doc> = {}): Doc => ({
  id,
  title,
  body: '',
  canvas: { placements, edges: [] },
  ...over,
});
const chat = (id: string, x = 0, y = 0): ChatNode => ({ id, title: id, messages: [], position: at(x, y), createdAt: 't0' });

function withChats(state: ChatState, ...chats: ChatNode[]): ChatState {
  return chats.reduce((s, c) => applyChatMessage(s, { type: 'chat_created', chat: c }), state);
}

describe('projectCanvas — root', () => {
  it('projects root doc placements with their positions and card models', () => {
    const s: ChatState = {
      ...emptyChatState(),
      docs: { A: doc('A', 'Auth') },
      rootCanvas: { placements: [place('doc', 'A', 10, 20)], edges: [] },
    };
    const p = projectCanvas(s, ROOT_CANVAS_ID);
    expect(p.docs).toHaveLength(1);
    expect(p.docs[0]).toMatchObject({ docId: 'A', position: at(10, 20) });
    expect(p.docs[0].model).toMatchObject({ docId: 'A', title: 'Auth', isReference: false, refCount: 1 });
  });

  it('root chats are the unplaced ones, at their own position; doc-chats are excluded', () => {
    let s = withChats(emptyChatState(), chat('c1', 5, 6), chat('c2'), chat('dc'));
    s = { ...s, docs: { A: doc('A', 'A', [place('chat', 'c2')]) }, docChats: { A: 'dc' } };
    expect(projectCanvas(s, ROOT_CANVAS_ID).chats).toEqual([{ chatId: 'c1', position: at(5, 6) }]);
  });

  it('a doc placed on two canvases is a reference on both', () => {
    const s: ChatState = {
      ...emptyChatState(),
      docs: { A: doc('A', 'A', [place('doc', 'B')]), B: doc('B', 'B') },
      rootCanvas: { placements: [place('doc', 'A'), place('doc', 'B')], edges: [] },
    };
    const b = projectCanvas(s, ROOT_CANVAS_ID).docs.find((d) => d.docId === 'B')!;
    expect(b.model).toMatchObject({ isReference: true, refCount: 2 });
    expect(projectCanvas(s, 'A').docs[0].model.isReference).toBe(true);
  });

  it('skips placements of docs that are not in the table', () => {
    const s: ChatState = { ...emptyChatState(), rootCanvas: { placements: [place('doc', 'ghost')], edges: [] } };
    expect(projectCanvas(s, ROOT_CANVAS_ID).docs).toEqual([]);
  });
});

describe('projectCanvas — doc canvas', () => {
  it('chats come from chat placements, at the placement position', () => {
    let s = withChats(emptyChatState(), chat('c1', 999, 999));
    s = { ...s, docs: { A: doc('A', 'A', [place('chat', 'c1', 1, 2)]) } };
    const p = projectCanvas(s, 'A');
    expect(p.chats).toEqual([{ chatId: 'c1', position: at(1, 2) }]);
    expect(p.docs).toEqual([]);
  });

  it('unknown canvas projects to nothing', () => {
    expect(projectCanvas(emptyChatState(), 'nope')).toEqual({ docs: [], chats: [], docEdges: [], chatEdges: [] });
  });

  it('doc edges only between docs placed on this canvas', () => {
    const s: ChatState = {
      ...emptyChatState(),
      docs: {
        A: doc('A', 'A', [place('doc', 'X'), place('doc', 'Y')], {}),
        X: doc('X', 'X'),
        Y: doc('Y', 'Y'),
      },
    };
    s.docs.A.canvas.edges = [{ from: 'X', to: 'Y' }, { from: 'X', to: 'Z' }];
    expect(projectCanvas(s, 'A').docEdges).toEqual([{ from: 'X', to: 'Y' }]);
  });

  it('chat edges only between chats on this canvas', () => {
    let s = withChats(emptyChatState(), chat('c1'), chat('c2'), chat('c3'));
    s = {
      ...s,
      docs: { A: doc('A', 'A', [place('chat', 'c1'), place('chat', 'c2')]) },
      edges: [
        { from: 'c1', to: 'c2', enabled: true, priority: 0 },
        { from: 'c2', to: 'c3', enabled: true, priority: 0 },
      ],
    };
    expect(projectCanvas(s, 'A').chatEdges).toEqual([{ from: 'c1', to: 'c2' }]);
    expect(projectCanvas(s, ROOT_CANVAS_ID).chatEdges).toEqual([]);
  });

  it('a generated doc is stale once a chat on its canvas changes', () => {
    let s = withChats(emptyChatState(), chat('c1'));
    const digest = compactionDigest([{ id: 'c1', messages: [] }]);
    s = {
      ...s,
      docs: { G: doc('G', 'G', [place('chat', 'c1')], { generated: { sourceDigest: digest, status: 'idle' } }) },
      rootCanvas: { placements: [place('doc', 'G')], edges: [] },
    };
    expect(projectCanvas(s, ROOT_CANVAS_ID).docs[0].model.stale).toBe(false);
    s = applyChatMessage(s, {
      type: 'chat_user_message',
      chatId: 'c1',
      message: { role: 'user', content: 'more', createdAt: 't1' },
    });
    expect(projectCanvas(s, ROOT_CANVAS_ID).docs[0].model.stale).toBe(true);
  });
});

describe('linkCandidates (M3.5)', () => {
  const state = (): ChatState => ({
    ...emptyChatState(),
    docs: {
      old: doc('old', 'API calls'),
      fresh: doc('fresh', ' api  CALLS '),
      other: doc('other', 'Form'),
      C: doc('C', 'Child', [place('doc', 'fresh'), place('doc', 'other')]),
    },
    rootCanvas: { placements: [place('doc', 'old')], edges: [] },
  });

  it('existing docs with the same (normalised) title, never the doc itself', () => {
    expect(linkCandidates(state(), 'fresh').map((d) => d.id)).toEqual(['old']);
  });

  it('no match, or an unknown doc, gives none', () => {
    expect(linkCandidates(state(), 'other')).toEqual([]);
    expect(linkCandidates(state(), 'nope')).toEqual([]);
  });

  it('projection carries the first candidate as linkTo', () => {
    const p = projectCanvas(state(), 'C');
    expect(p.docs.find((d) => d.docId === 'fresh')!.linkTo).toBe('old');
    expect(p.docs.find((d) => d.docId === 'other')!.linkTo).toBeNull();
  });
});
