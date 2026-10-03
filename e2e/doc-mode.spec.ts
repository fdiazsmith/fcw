import { test, expect, type Page } from '@playwright/test';
import { E2E_WS_URL } from './ports';

// M5.4: Doc mode in the prompt bar creates a blank doc box on the current canvas.

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

async function submitDoc(page: Page, title: string) {
  await page.getByTestId('prompt-mode-doc').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill(title);
  await bar.press('Enter');
}

test('Doc mode creates a blank doc on root and on a doc canvas, and survives reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);

  // Root.
  await submitDoc(page, 'Design.md');
  await expect(box(page, 'Design.md')).toHaveCount(1);
  await expect(box(page, 'Design.md').getByTestId('doc-title')).toHaveText('Design.md');
  const designId = (await box(page, 'Design.md').getAttribute('data-doc-id'))!;

  // Reload keeps it (server owns docs).
  await page.reload();
  await expect(box(page, 'Design.md')).toHaveCount(1);

  // Inside a doc canvas: the new doc lands there, not on root.
  await box(page, 'Design.md').getByTestId('doc-open-canvas').click();
  await expect(page.getByTestId('breadcrumb').getByTestId('breadcrumb-item')).toHaveCount(2);
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);
  await submitDoc(page, 'Page Structure');
  await expect(box(page, 'Page Structure')).toHaveCount(1);
  const childId = (await box(page, 'Page Structure').getAttribute('data-doc-id'))!;

  await page.getByTestId('breadcrumb-home').click();
  await expect(page.getByTestId('doc-shape')).toHaveCount(1);
  await expect(box(page, 'Page Structure')).toHaveCount(0);

  // Leave root as we found it for the next spec (one shared server).
  await sendToServer(page, [
    { type: 'doc_unplace_requested', canvasId: designId, kind: 'doc', id: childId },
    { type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id: designId },
  ]);
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);
});
