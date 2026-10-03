import { test, expect } from '@playwright/test';

// M5.1: "Export Mermaid" copies the CURRENT canvas as Mermaid text.

test('export-mermaid copies the current canvas as Mermaid', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);

  await page.getByTestId('prompt-mode-diagram').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill('graph TD\n  A[Export one] --> B[Export two]');
  await bar.press('Enter');
  await expect(page.getByTestId('doc-shape')).toHaveCount(2);
  const ids = await page.getByTestId('doc-shape').evaluateAll((els) => els.map((e) => e.getAttribute('data-doc-id')!));

  await page.getByTestId('export-mermaid').click();
  await expect(page.getByTestId('export-mermaid')).toContainText('Copied');

  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(/^graph TD/);
  expect(text).toContain('Export one');
  expect(text).toContain('Export two');
  expect(text).toContain('-->');

  // Leave root as we found it for the next spec (one shared server).
  await page.evaluate(async (payload) => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:8009');
      ws.onopen = () => {
        for (const id of payload) ws.send(JSON.stringify({ type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id }));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 200);
      };
      ws.onerror = () => reject(new Error('ws error'));
    });
  }, ids);
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);
});
