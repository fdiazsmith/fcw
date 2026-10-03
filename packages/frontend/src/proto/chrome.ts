// PROTOTYPE — tldraw UI trim, shared by both canvases.
//
// The Toolbar stays: freehand sketching on the same surface as doc boxes is
// part of what's being tested (sketch 02's wireframe). The style panel, page
// menu and main menu are noise here — pages are our canvases, not the user's.

import type { TLComponents } from 'tldraw';

/**
 * Bump whenever DocShapeProps changes shape. tldraw validates persisted shapes
 * against the current props schema, so an added field makes every shape already
 * in IndexedDB invalid. A real feature would write a migration; a prototype
 * throws the old canvas away.
 */
export const SCHEMA = 'v2';

export const persistenceKey = (mode: 'swap' | 'spatial') => `fcw-proto-${mode}-${SCHEMA}`;

export const chrome: TLComponents = {
  StylePanel: null,
  PageMenu: null,
  MainMenu: null,
  ActionsMenu: null,
  DebugPanel: null,
  DebugMenu: null,
  HelpMenu: null,
};
