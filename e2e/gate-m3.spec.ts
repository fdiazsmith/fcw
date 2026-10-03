import { test, expect, type Page } from '@playwright/test';

// Gate M3 scenario. Written first (RED) against the data-testid contract in
// PLAN.md's Decision log; the M3 UI work makes it green.
//
// Prompt bar keys: Enter = submit, Shift+Enter = newline. `fill()` sets the
// multi-line value directly; Enter then submits.

const MERMAID_ROOT = 'graph TD\n  A[Sign in] --> B[API calls]\n  B --> C[Dashboard]';
const MERMAID_CHILD = 'graph TD\n  X[Form] --> Y[API calls]';

const box = (page: Page, title: string) =>
  page.locator(`[data-testid="doc-shape"][data-doc-title="${title}"]`);

async function submitDiagram(page: Page, mermaid: string) {
  await page.getByTestId('prompt-mode-diagram').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill(mermaid);
  await bar.press('Enter');
}

async function expectRootBoxes(page: Page) {
  await expect(page.getByTestId('doc-shape')).toHaveCount(3);
  for (const title of ['Sign in', 'API calls', 'Dashboard']) {
    await expect(box(page, title)).toHaveCount(1);
    await expect(box(page, title).getByTestId('doc-title')).toHaveText(title);
  }
}

test('diagram -> dive -> link -> breadcrumb home shows the shared box on both canvases', async ({ page }) => {
  await page.goto('/');

  // 1. Paste Mermaid in Diagram mode on root -> 3 doc boxes.
  await submitDiagram(page, MERMAID_ROOT);
  await expectRootBoxes(page);
  await expect(page.getByTestId('doc-ref-marker')).toHaveCount(0);

  // Reload keeps the state (server owns docs).
  await page.reload();
  await expectRootBoxes(page);

  // 2. Dive into "Sign in": breadcrumb = root + Sign in, canvas empty of the 3 boxes.
  await box(page, 'Sign in').getByTestId('doc-open-canvas').click();
  await expect(page.getByTestId('breadcrumb').getByTestId('breadcrumb-item')).toHaveCount(2);
  await expect(page.getByTestId('doc-shape')).toHaveCount(0);

  // 3. A new diagram on the child canvas whose "API calls" matches an existing doc
  //    offers "Link instead?".
  await submitDiagram(page, MERMAID_CHILD);
  await expect(box(page, 'Form')).toHaveCount(1);
  await expect(box(page, 'API calls')).toHaveCount(1);
  const chip = box(page, 'API calls').getByTestId('doc-link-chip');
  await expect(chip).toBeVisible();

  // 4. Accept the link: the box is now shown as a reference (placed on >1 canvas).
  await chip.click();
  await expect(box(page, 'API calls').getByTestId('doc-ref-marker')).toBeVisible();
  await expect(box(page, 'API calls').getByTestId('doc-link-chip')).toHaveCount(0);

  // 5. Home: the 3 original boxes, and root "API calls" carries the marker too.
  await page.getByTestId('breadcrumb-home').click();
  await expect(page.getByTestId('breadcrumb').getByTestId('breadcrumb-item')).toHaveCount(1);
  await expectRootBoxes(page);
  await expect(box(page, 'API calls').getByTestId('doc-ref-marker')).toBeVisible();

  // Reload keeps all of it.
  await page.reload();
  await expectRootBoxes(page);
  await expect(box(page, 'API calls').getByTestId('doc-ref-marker')).toBeVisible();
});
