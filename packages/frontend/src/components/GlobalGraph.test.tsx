import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import { GlobalGraph } from './GlobalGraph';
import type { GlobalGraphData } from '../global-graph';

const small: GlobalGraphData = {
  nodes: [
    { id: ROOT_CANVAS_ID, title: 'Canvas', hasBody: false, degree: 1 },
    { id: 'a', title: 'Auth', hasBody: true, degree: 1 },
  ],
  edges: [{ from: ROOT_CANVAS_ID, to: 'a', kind: 'placement' }],
};

const big: GlobalGraphData = {
  nodes: Array.from({ length: 13 }, (_, i) => ({ id: `n${i}`, title: `Node ${i}`, hasBody: false, degree: 0 })),
  edges: [],
};

describe('GlobalGraph', () => {
  it('renders a circle per node and a line per edge', () => {
    render(<GlobalGraph graph={small} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByTestId('global-graph')).toBeDefined();
    const nodes = screen.getAllByTestId('global-graph-node');
    expect(nodes.map((n) => n.getAttribute('data-doc-id'))).toEqual([ROOT_CANVAS_ID, 'a']);
    expect(screen.getAllByTestId('global-graph-edge')).toHaveLength(1);
  });

  it('titles are always visible for small graphs, hover-only for larger ones', () => {
    const { unmount } = render(<GlobalGraph graph={small} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('Auth')).toBeDefined();
    unmount();
    render(<GlobalGraph graph={big} onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('Node 3')).toBeNull();
    fireEvent.mouseEnter(screen.getAllByTestId('global-graph-node')[3]);
    expect(screen.getByText('Node 3')).toBeDefined();
  });

  it('click picks a doc; close button and Escape close', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<GlobalGraph graph={small} onPick={onPick} onClose={onClose} />);
    fireEvent.click(screen.getAllByTestId('global-graph-node')[1]);
    expect(onPick).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByTestId('global-graph-close'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
