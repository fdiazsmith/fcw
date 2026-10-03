import { test, expect, type Page } from '@playwright/test';
import { E2E_WS_URL } from './ports';

// M3.7: the store owns doc boxes; tldraw owns everything else. A freehand
// drawing on root must survive diving into a box and coming back.

const HOST = 'Freehand host';

/** Send client messages straight to the server (setup/cleanup only). */
async function sendToServer(page: Page, msgs: object[]) {
  await page.evaluate(async ({ payload, wsUrl }) => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        for (const m of payload) ws.send(JSON.stringify(m));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 200);
      };
      ws.onerror = () => reject(new Error('ws error'));
    });
  }, { payload: msgs, wsUrl: E2E_WS_URL });
}

test('a freehand drawing on root survives diving into a box and coming back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();

  await sendToServer(page, [
    { type: 'doc_create_requested', canvasId: 'root', title: HOST, position: { x: 80, y: 120 } },
  ]);
  const host = page.locator(`[data-testid="doc-shape"][data-doc-title="${HOST}"]`);
  await expect(host).toHaveCount(1);
  const hostId = await host.getAttribute('data-doc-id');

  // Draw a stroke on empty canvas with the draw tool.
  const drawings = page.locator('.tl-shape[data-shape-type="draw"]');
  await page.keyboard.press('d');
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(760, 480, { steps: 5 });
  await page.mouse.move(820, 440, { steps: 5 });
  await page.mouse.up();
  await expect(drawings).toHaveCount(1);
  await page.keyboard.press('v');

  // Dive in: the child canvas has neither the box nor the drawing.
  await host.getByTestId('doc-open-canvas').click();
  await expect(page.getByTestId('breadcrumb').getByTestId('breadcrumb-item')).toHaveCount(2);
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);
  await expect(drawings).toHaveCount(0);

  // Home: box and drawing are both back.
  await page.getByTestId('breadcrumb-home').click();
  await expect(host).toHaveCount(1);
  await expect(drawings).toHaveCount(1);

  // Leave root as we found it for the next spec (one shared server).
  await sendToServer(page, [{ type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id: hostId }]);
  await expect(host).toHaveCount(0);
});
