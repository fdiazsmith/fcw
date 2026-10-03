import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Doc } from '@fcw/graph-core';
import { DocContextInspector } from './DocContextInspector';

const doc = (id: string, body: string, refs: string[] = []): Doc => ({
  id,
  title: id.toUpperCase(),
  body,
  canvas: {
    placements: refs.map((r, i) => ({ kind: 'doc' as const, id: r, position: { x: i, y: 0 } })),
    edges: [],
  },
});
const state = {
  docs: {
    t: doc('t', 'x'.repeat(4000), ['a']),
    a: doc('a', 'y'.repeat(6000), ['b']),
    b: doc('b', 'z'.repeat(8000)),
  },
};

describe('DocContextInspector', () => {
  it('lists references with char counts and a readout against the default budget', () => {
    render(<DocContextInspector state={state} docId="t" />);
    const root = screen.getByTestId('doc-context-inspector');
    expect(within(root).getByText('B')).toBeTruthy();
    expect(within(root).getByText('8000 chars')).toBeTruthy();
    expect(within(root).queryByText('title only')).toBeNull();
    expect(root.textContent).toContain('18k / 24k chars · 0 degraded');
  });

  it('badges degraded refs and re-computes when the budget slider moves', () => {
    render(<DocContextInspector state={state} docId="t" />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '12000' } });
    const root = screen.getByTestId('doc-context-inspector');
    expect(within(root).getAllByText('title only')).toHaveLength(1);
    expect(root.textContent).toContain('10k / 12k chars · 1 degraded');
  });
});
