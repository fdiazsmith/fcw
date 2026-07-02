import { describe, it, expect } from 'vitest';
import { collapseToggle } from './collapse-pill';

describe('collapseToggle', () => {
  it('collapsing stores current height in expandedH and shrinks h', () => {
    const next = collapseToggle({ collapsed: false, h: 420, expandedH: 420 });
    expect(next.collapsed).toBe(true);
    expect(next.expandedH).toBe(420);
    expect(next.h).toBe(44);
  });

  it('collapsing remembers a non-default height', () => {
    const next = collapseToggle({ collapsed: false, h: 600, expandedH: 420 });
    expect(next.collapsed).toBe(true);
    expect(next.expandedH).toBe(600);
    expect(next.h).toBe(44);
  });

  it('expanding restores expandedH and clears collapsed', () => {
    const next = collapseToggle({ collapsed: true, h: 44, expandedH: 600 });
    expect(next.collapsed).toBe(false);
    expect(next.h).toBe(600);
  });

  it('is an involution: collapse then expand restores original height', () => {
    const start = { collapsed: false, h: 512, expandedH: 420 };
    const round = collapseToggle(collapseToggle(start));
    expect(round.collapsed).toBe(false);
    expect(round.h).toBe(512);
  });
});
