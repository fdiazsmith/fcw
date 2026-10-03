import { describe, it, expect, vi, afterEach } from 'vitest';
import { DocShapeUtil, docActions, registerDocActions } from './DocShape';

afterEach(() => registerDocActions(null));

describe('docActions registry', () => {
  it('is null until registered, then returns the registered actions', () => {
    expect(docActions()).toBeNull();
    const actions = { openCanvas: vi.fn(), regenerate: vi.fn(), select: vi.fn() };
    registerDocActions(actions);
    expect(docActions()).toBe(actions);
  });
});

describe('DocShapeUtil', () => {
  it('is the doc-node shape type with sensible defaults', () => {
    expect(DocShapeUtil.type).toBe('doc-node');
    const props = new DocShapeUtil({} as never).getDefaultProps();
    expect(props).toMatchObject({ docId: '', modelJson: '' });
  });
});
