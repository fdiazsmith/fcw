// M7.6: pure helpers for per-tab projects (page URL, WS URL, picking the
// project a create request produced out of the next project_list).
import type { ProjectSummary } from '@fcw/graph-core';

/** The page's search string with `project=<id>`, other params kept. */
export function projectUrl(search: string, id: string): string {
  const params = new URLSearchParams(search);
  params.set('project', id);
  return `?${params.toString()}`;
}

/** The WS URL that binds the socket to a project (server reads `?project=`). */
export function projectWsUrl(base: string, id: string | null): string {
  if (!id) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${new URLSearchParams({ project: id })}`;
}

/** The project that appeared between two lists with the requested title. */
export function createdProjectId(
  before: ProjectSummary[],
  after: ProjectSummary[],
  title: string,
): string | undefined {
  const known = new Set(before.map((p) => p.id));
  return after.find((p) => !known.has(p.id) && p.title === title)?.id;
}
