import { describe, it, expect } from 'vitest';
import { projectUrl, projectWsUrl, createdProjectId } from './projects';

const p = (id: string, title: string) => ({ id, title, updatedAt: 't', chatCount: 0, docCount: 0 });

describe('projectUrl', () => {
  it('adds ?project= to an empty search', () => {
    expect(projectUrl('', 'p1')).toBe('?project=p1');
  });

  it('replaces an existing project and keeps other params', () => {
    expect(projectUrl('?debug=1&project=old', 'p2')).toBe('?debug=1&project=p2');
  });
});

describe('projectWsUrl', () => {
  it('appends the project id to the WS URL', () => {
    expect(projectWsUrl('ws://localhost:8009', 'p 1')).toBe('ws://localhost:8009?project=p+1');
  });

  it('leaves the URL alone without a project', () => {
    expect(projectWsUrl('ws://localhost:8009', null)).toBe('ws://localhost:8009');
  });
});

describe('createdProjectId', () => {
  it('finds the new project with the requested title', () => {
    expect(createdProjectId([p('a', 'A')], [p('a', 'A'), p('b', 'B')], 'B')).toBe('b');
  });

  it('ignores a new project with another title', () => {
    expect(createdProjectId([p('a', 'A')], [p('a', 'A'), p('c', 'C')], 'B')).toBeUndefined();
  });
});
