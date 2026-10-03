import { test, expect, type Page } from '@playwright/test';
import { E2E_WS_URL } from './ports';

// M5.2: the global graph (sketch 04) — every doc a node, plus a root node.
// Picking a node navigates to that doc's canvas.

const docShapes = (page: Page) => page.getByTestId('doc-shape');

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

test('global graph lists docs plus root; picking a node opens its canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  // Earlier specs (gate-m3/m4) leave their boxes on root: count relative to that.
  await page.waitForTimeout(500); // let the snapshot arrive
  const before = await docShapes(page).count();

  await page.getByTestId('prompt-mode-diagram').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill('graph TD\n  A[GG Alpha] --> B[GG Beta]\n  B --> C[GG Gamma]');
  await bar.press('Enter');
  await expect(docShapes(page)).toHaveCount(before + 3);
  const mine = page.locator('[data-testid="doc-shape"][data-doc-title^="GG "]');
  await expect(mine).toHaveCount(3);
  const ids = await mine.evaluateAll((els) => els.map((e) => e.getAttribute('data-doc-id')!));
  const betaId = (await page.locator('[data-testid="doc-shape"][data-doc-title="GG Beta"]').getAttribute('data-doc-id'))!;

  await page.getByTestId('global-graph-toggle').click();
  await expect(page.getByTestId('global-graph')).toBeVisible();
  expect(await page.getByTestId('global-graph-node').count()).toBeGreaterThanOrEqual(4);

  await page.locator(`[data-testid="global-graph-node"][data-doc-id="${betaId}"]`).dispatchEvent('click');
  await expect(page.getByTestId('global-graph')).toHaveCount(0);
  const items = page.getByTestId('breadcrumb').getByTestId('breadcrumb-item');
  await expect(items).toHaveCount(2);
  await expect(items.last()).toHaveText('GG Beta');

  // Leave root as we found it for the next spec (one shared server).
  await page.getByTestId('breadcrumb-home').click();
  await sendToServer(
    page,
    ids.map((id) => ({ type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id })),
  );
  await expect(docShapes(page)).toHaveCount(before);
});
