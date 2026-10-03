// Dedicated e2e ports so `npm run e2e` never collides with `npm run dev` (8008/8009).
export const E2E_APP_PORT = 8108;
export const E2E_SERVER_PORT = 8109;
export const E2E_WS_URL = `ws://localhost:${E2E_SERVER_PORT}`;
