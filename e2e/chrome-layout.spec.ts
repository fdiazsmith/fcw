import { test, expect, Page } from '@playwright/test';
import { E2E_WS_URL } from './ports';

// The app chrome must not overlap itself or tldraw's own panels, and the
// breadcrumb is the only canvas navigation (tldraw's page menu is hidden).

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function box(page: Page, name: string, selector: string): Promise<[string, Box]> {
  const loc = page.locator(selector).first();
  await expect(loc, name).toBeVisible();
  return [name, (await loc.boundingBox())!];
}

test('canvas chrome does not overlap and has a single navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();

  await expect(page.locator('.tlui-page-menu__trigger')).toHaveCount(0);
  // Canvas-level actions live in the breadcrumb, not as loose buttons.
  await expect(page.getByTestId('breadcrumb').getByTestId('global-graph-toggle')).toBeVisible();
  await expect(page.getByTestId('prompt-dock').getByTestId('canvas-hint')).toBeVisible();

  const boxes = await Promise.all([
    box(page, 'main menu', '.tlui-menu-zone'),
    box(page, 'style panel', '.tlui-style-panel'),
    box(page, 'toolbar', '.tlui-toolbar__inner'),
    box(page, 'navigation', '.tlui-navigation-panel'),
    box(page, 'search', '[data-testid="chat-search-bar"]'),
    box(page, 'breadcrumb', '[data-testid="breadcrumb"]'),
    box(page, 'canvas actions', '[data-testid="canvas-actions"]'),
    box(page, 'prompt + hint', '[data-testid="prompt-dock"]'),
  ]);

  const clashes: string[] = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (overlaps(boxes[i][1], boxes[j][1])) clashes.push(`${boxes[i][0]} × ${boxes[j][0]}`);
  expect(clashes).toEqual([]);
});

test('the doc panel sits beside the canvas chrome, not over it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByTestId('prompt-mode-diagram').click();
  await page.getByTestId('prompt-bar').fill('graph TD\n  A[Layout panel]');
  await page.getByTestId('prompt-bar').press('Enter');
  const shape = page.locator('[data-testid="doc-shape"][data-doc-title="Layout panel"]');
  await shape.getByTestId('doc-title').click();

  const boxes = await Promise.all([
    box(page, 'doc panel', '[data-testid="doc-panel"]'),
    box(page, 'style panel', '.tlui-style-panel'),
    box(page, 'canvas actions', '[data-testid="canvas-actions"]'),
    box(page, 'breadcrumb', '[data-testid="breadcrumb"]'),
    box(page, 'prompt + hint', '[data-testid="prompt-dock"]'),
    box(page, 'toolbar', '.tlui-toolbar__inner'),
  ]);
  const [panel, ...rest] = boxes;
  expect(rest.filter(([, b]) => overlaps(panel[1], b)).map(([n]) => n)).toEqual([]);

  // Leave root as we found it for the next spec (one shared server).
  const id = (await shape.getAttribute('data-doc-id'))!;
  await page.evaluate(
    ({ id, wsUrl }) =>
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id }));
          setTimeout(() => (ws.close(), resolve()), 200);
        };
        ws.onerror = () => reject(new Error('ws error'));
      }),
    { id, wsUrl: E2E_WS_URL },
  );
  await expect(shape).toHaveCount(0);
});
