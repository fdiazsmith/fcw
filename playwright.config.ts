import { defineConfig, devices } from '@playwright/test';
import { E2E_APP_PORT, E2E_SERVER_PORT, E2E_WS_URL } from './e2e/ports';

// Dedicated e2e ports (see e2e/ports.ts) so e2e runs beside `npm run dev` (8008/8009).
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // one shared server + document; specs must not race
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${E2E_APP_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'npm run build -w packages/graph-core && npm run build -w packages/server && node e2e/start-server.mjs',
      port: E2E_SERVER_PORT,
      env: { E2E_SERVER_PORT: String(E2E_SERVER_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: `npm run dev -w packages/frontend -- --port ${E2E_APP_PORT} --strictPort`,
      url: `http://localhost:${E2E_APP_PORT}`,
      env: { VITE_WS_URL: E2E_WS_URL },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
