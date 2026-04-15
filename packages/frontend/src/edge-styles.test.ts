import { describe, it, expect } from 'vitest';
import { getEdgeStyle } from './edge-styles';

describe('getEdgeStyle', () => {
  it('reply_to returns solid', () => expect(getEdgeStyle('reply_to')).toEqual({ dash: 'solid' }));
  it('branches_from returns dashed', () => expect(getEdgeStyle('branches_from')).toEqual({ dash: 'dashed' }));
  it('references returns dotted', () => expect(getEdgeStyle('references')).toEqual({ dash: 'dotted' }));
});
