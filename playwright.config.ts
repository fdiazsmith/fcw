import { defineConfig, devices } from '@playwright/test';

// Server: 8009 (hard-coded default in the frontend's WS_URL). Vite: 8008.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1, // one shared server + document; specs must not race
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:8008',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'npm run build -w packages/graph-core && npm run build -w packages/server && node e2e/start-server.mjs',
      port: 8009,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
    },
    {
      command: 'npm run dev -w packages/frontend',
      url: 'http://localhost:8008',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
