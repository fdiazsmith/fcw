import { test, expect } from '@playwright/test';

test('app boots, renders the tldraw canvas, logs no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await page.waitForTimeout(500); // let the WS connect and first messages land

  // Known benign: React StrictMode (dev) mounts ChatCanvas twice and closes the
  // first WebSocket before it opens, which ws-client logs as `[ws] error`.
  // Tolerate at most that one; a server that is really down logs it repeatedly.
  const wsErrors = errors.filter((e) => e.startsWith('[ws] error'));
  const others = errors.filter((e) => !e.startsWith('[ws] error'));
  expect(others).toEqual([]);
  expect(wsErrors.length).toBeLessThanOrEqual(1);
});
