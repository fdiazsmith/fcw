import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocCard, DocCardProps } from './DocCard';

const props = (over: Partial<DocCardProps> = {}): DocCardProps => ({
  docId: 'd1',
  title: 'Auth research',
  preview: 'Use OAuth.',
  childCount: 3,
  isReference: false,
  refCount: 1,
  generated: 'none',
  stale: false,
  onOpenCanvas: vi.fn(),
  onRegenerate: vi.fn(),
  onSelect: vi.fn(),
  ...over,
});

describe('DocCard', () => {
  it('root carries doc id and title; shows title and preview', () => {
    render(<DocCard {...props()} />);
    const root = screen.getByTestId('doc-shape');
    expect(root.getAttribute('data-doc-id')).toBe('d1');
    expect(root.getAttribute('data-doc-title')).toBe('Auth research');
    expect(screen.getByTestId('doc-title').textContent).toBe('Auth research');
    expect(screen.getByText('Use OAuth.')).toBeDefined();
  });

  it('open-canvas button shows the child count and calls back', () => {
    const onOpenCanvas = vi.fn();
    render(<DocCard {...props({ onOpenCanvas })} />);
    const btn = screen.getByTestId('doc-open-canvas');
    expect(btn.textContent).toBe('⤢ Canvas · 3');
    fireEvent.click(btn);
    expect(onOpenCanvas).toHaveBeenCalledOnce();
  });

  it('omits the count when the child canvas is empty', () => {
    render(<DocCard {...props({ childCount: 0 })} />);
    expect(screen.getByTestId('doc-open-canvas').textContent).toBe('⤢ Canvas');
  });

  it('shows the reference marker only for references', () => {
    const { rerender } = render(<DocCard {...props()} />);
    expect(screen.queryByTestId('doc-ref-marker')).toBeNull();
    rerender(<DocCard {...props({ isReference: true, refCount: 2 })} />);
    const marker = screen.getByTestId('doc-ref-marker');
    expect(marker.textContent).toContain('🔗');
    expect(marker.textContent).toContain('2 canvases');
  });

  it('shows stale + regenerate only when stale, and regenerate calls back', () => {
    const onRegenerate = vi.fn();
    const { rerender } = render(<DocCard {...props({ generated: 'idle' })} />);
    expect(screen.queryByTestId('doc-stale')).toBeNull();
    expect(screen.queryByTestId('doc-regenerate')).toBeNull();
    rerender(<DocCard {...props({ generated: 'idle', stale: true, onRegenerate })} />);
    expect(screen.getByTestId('doc-stale').textContent).toMatch(/generated · stale/);
    fireEvent.click(screen.getByTestId('doc-regenerate'));
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('shows generating… instead of regenerate while generating', () => {
    render(<DocCard {...props({ generated: 'generating', stale: true })} />);
    expect(screen.getByText(/generating…/)).toBeDefined();
    expect(screen.queryByTestId('doc-regenerate')).toBeNull();
  });

  it('clicking the card selects it', () => {
    const onSelect = vi.fn();
    render(<DocCard {...props({ onSelect })} />);
    fireEvent.click(screen.getByTestId('doc-shape'));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('renders the linkChip slot when given', () => {
    render(<DocCard {...props({ linkChip: <span data-testid="chip">chip</span> })} />);
    expect(screen.getByTestId('chip')).toBeDefined();
  });
});
