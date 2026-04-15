import { describe, it, expect } from 'vitest';
import { getNodeColor } from './colors';

describe('getNodeColor', () => {
  it('user_prompt returns blue', () => expect(getNodeColor('user_prompt')).toBe('#3B82F6'));
  it('response returns green', () => expect(getNodeColor('response')).toBe('#22C55E'));
  it('code returns dark', () => expect(getNodeColor('code')).toBe('#1E293B'));
  it('tool_call returns orange', () => expect(getNodeColor('tool_call')).toBe('#F97316'));
  it('tool_result returns yellow', () => expect(getNodeColor('tool_result')).toBe('#EAB308'));
  it('thought returns gray', () => expect(getNodeColor('thought')).toBe('#6B7280'));
  it('summary returns purple', () => expect(getNodeColor('summary')).toBe('#A855F7'));
  it('annotation returns light yellow', () => expect(getNodeColor('annotation')).toBe('#FEF9C3'));
});
