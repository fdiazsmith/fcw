import { test, expect, type Page } from '@playwright/test';
import { E2E_WS_URL } from './ports';

// M3.9: deleting a box on a canvas unplaces it (it used to reappear on the
// next sync). The doc itself is never destroyed.

const box = (page: Page, title: string) =>
  page.locator(`[data-testid="doc-shape"][data-doc-title="${title}"]`);

/** Send client messages straight to the server (cleanup only). */
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

test('deleting a box unplaces it: it stays gone after a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);

  await page.getByTestId('prompt-mode-diagram').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill('graph TD\n  A[Keep me] --> B[Delete me]');
  await bar.press('Enter');
  await expect(page.getByTestId('doc-shape')).toHaveCount(2);
  const keepId = (await box(page, 'Keep me').getAttribute('data-doc-id'))!;

  // Select the box by its title bar and delete it.
  await box(page, 'Delete me').getByTestId('doc-title').click();
  await page.keyboard.press('Delete');
  await expect(box(page, 'Delete me')).toHaveCount(0);

  // Still gone after the server round-trip.
  await page.reload();
  await expect(box(page, 'Keep me')).toHaveCount(1);
  await expect(box(page, 'Delete me')).toHaveCount(0);

  // Leave root as we found it for the next spec (one shared server).
  await sendToServer(page, [{ type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id: keepId }]);
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);
});
