import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DocShapeUtil, docActions, registerDocActions } from './DocShape';

afterEach(() => {
  registerDocActions(null);
  cleanup();
});

describe('docActions registry', () => {
  it('is null until registered, then returns the registered actions', () => {
    expect(docActions()).toBeNull();
    const actions = { openCanvas: vi.fn(), regenerate: vi.fn(), select: vi.fn(), link: vi.fn() };
    registerDocActions(actions);
    expect(docActions()).toBe(actions);
  });
});

describe('DocShape link chip (M3.5)', () => {
  const model = { docId: 'd1', title: 'API calls', preview: '', childCount: 0, isReference: false, refCount: 1, generated: 'none', stale: false };
  const shape = (extra: object) =>
    ({ id: 'shape:x', props: { w: 260, h: 150, docId: 'd1', modelJson: JSON.stringify({ ...model, ...extra }) } }) as never;
  const renderShape = (extra: object) => render(<>{new DocShapeUtil({} as never).component(shape(extra))}</>);

  it('shows the chip when the model names a doc to link to; click links', () => {
    const link = vi.fn();
    registerDocActions({ openCanvas: vi.fn(), regenerate: vi.fn(), select: vi.fn(), link });
    renderShape({ linkTo: 'old' });
    fireEvent.click(screen.getByTestId('doc-link-chip'));
    expect(link).toHaveBeenCalledWith('d1', 'old');
  });

  it('no chip without a candidate', () => {
    renderShape({ linkTo: null });
    expect(screen.queryByTestId('doc-link-chip')).toBeNull();
  });
});

describe('DocShapeUtil', () => {
  it('is the doc-node shape type with sensible defaults', () => {
    expect(DocShapeUtil.type).toBe('doc-node');
    const props = new DocShapeUtil({} as never).getDefaultProps();
    expect(props).toMatchObject({ docId: '', modelJson: '' });
  });
});
