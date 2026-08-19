import { expect, it } from 'vitest';
import { parseWikilinks } from './wikilinks.js';

it('extracts a single wikilink target', () => {
  expect(parseWikilinks('See [[Project Spec]] for details')).toEqual([
    'Project Spec',
  ]);
});
