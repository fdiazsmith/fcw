// Pure canvas navigation (view-swap, MERMAID-DOCS.md § Decisions): one tldraw
// page per canvas, and a stack of canvas ids for the breadcrumb. A doc can sit
// on many canvases, so the stack records how you got here; pathToRoot is the
// fallback when there is no history (e.g. the user picked a page directly).
import { ROOT_CANVAS_ID } from '@fcw/graph-core';
import type { ChatState } from './chat-store';
import { canvasesPlacing } from './chat-store';

const PAGE_PREFIX = 'canvas-';

/** tldraw page-id fragment for a doc's canvas (root uses the editor's first page). */
export function canvasPageSlug(canvasId: string): string {
  return `${PAGE_PREFIX}${canvasId}`;
}

/** The canvas a page slug belongs to, or null for a page that isn't a doc canvas. */
export function canvasIdForPageSlug(slug: string): string | null {
  return slug.startsWith(PAGE_PREFIX) ? slug.slice(PAGE_PREFIX.length) : null;
}

export type NavStack = string[];

export function currentCanvas(stack: NavStack): string {
  return stack[stack.length - 1] ?? ROOT_CANVAS_ID;
}

/** Dive into a canvas; one already on the stack truncates back to it. */
export function pushCanvas(stack: NavStack, canvasId: string): NavStack {
  const at = stack.indexOf(canvasId);
  return at >= 0 ? stack.slice(0, at + 1) : [...stack, canvasId];
}

export function popTo(stack: NavStack, index: number): NavStack {
  return stack.slice(0, index + 1);
}

/** A path from root to the canvas via each doc's first placing canvas; cycle-safe. */
export function pathToRoot(state: ChatState, canvasId: string): NavStack {
  const path = [canvasId];
  const seen = new Set(path);
  let current = canvasId;
  while (current !== ROOT_CANVAS_ID) {
    const parent = canvasesPlacing(state, current)[0];
    if (!parent || seen.has(parent)) break;
    seen.add(parent);
    path.unshift(parent);
    current = parent;
  }
  if (path[0] !== ROOT_CANVAS_ID) path.unshift(ROOT_CANVAS_ID);
  return path;
}

export interface BreadcrumbItem {
  canvasId: string;
  label: string;
}

export function breadcrumbItems(state: ChatState, stack: NavStack): BreadcrumbItem[] {
  return stack.map((canvasId) => ({
    canvasId,
    label: canvasId === ROOT_CANVAS_ID ? 'Canvas' : (state.docs[canvasId]?.title ?? canvasId),
  }));
}
