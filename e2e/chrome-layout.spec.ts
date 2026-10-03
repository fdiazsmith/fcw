import { test, expect, Page } from '@playwright/test';

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
