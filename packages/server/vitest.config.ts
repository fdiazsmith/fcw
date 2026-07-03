import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve @fcw/graph-core to its SOURCE so server tests never run
      // against a stale dist. (WI-1: cross-package build hygiene.)
      '@fcw/graph-core': resolve(__dirname, '..', 'graph-core', 'src', 'index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
