import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8008,
  },
  build: {
    rollupOptions: {
      input: {
        // The app.
        main: resolve(__dirname, 'index.html'),
        // Throwaway structure-first prototype — see src/proto/README.md.
        proto: resolve(__dirname, 'proto.html'),
      },
    },
  },
});
