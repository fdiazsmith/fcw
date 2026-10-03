import { test, expect, type Page } from '@playwright/test';

// Gate M4: open doc -> ask chat -> Apply -> body updated -> reload -> persisted.
// Written first (RED) against the data-testid contract in PLAN.md's Decision
// log. The e2e server runs a scripted engine: reply = `Drafted: <prompt>`.

const box = (page: Page, title: string) =>
  page.locator(`[data-testid="doc-shape"][data-doc-title="${title}"]`);

async function submitDiagram(page: Page, mermaid: string) {
  await page.getByTestId('prompt-mode-diagram').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill(mermaid);
  await bar.press('Enter');
}

/** Select the doc box (click its title) so the doc panel opens. */
async function selectDoc(page: Page, title: string) {
  await box(page, title).getByTestId('doc-title').click();
  const panel = page.getByTestId('doc-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(title);
  return panel;
}

test('doc panel: ask chat -> Apply -> body persisted; hand edits persist', async ({ page }) => {
  await page.goto('/');
  await submitDiagram(page, 'graph TD\n  A[Auth] --> B[Tokens]');
  await expect(box(page, 'Auth')).toHaveCount(1);

  // Select Auth: panel with an empty body editor.
  let panel = await selectDoc(page, 'Auth');
  await expect(panel.getByTestId('doc-body-editor')).toHaveText('');

  // Ask the panel's chat (the real ChatWindow: textarea placeholder "Message…").
  const composer = panel.getByPlaceholder('Message…');
  await composer.fill('write the auth doc');
  await composer.press('Enter');
  const reply = panel.locator('.fcw-message[data-role="assistant"]', {
    hasText: 'Drafted: write the auth doc',
  });
  await expect(reply).toBeVisible();

  // No silent write: the body is untouched until Apply.
  await expect(panel.getByTestId('doc-body-editor')).toHaveText('');

  await reply.getByTestId('doc-apply').click();
  await expect(panel.getByTestId('doc-body-editor')).toContainText('Drafted: write the auth doc');
  await expect(box(page, 'Auth')).toContainText('Drafted: write the auth doc');

  // Reload: server owns docs; select Auth again -> body persisted.
  await page.reload();
  panel = await selectDoc(page, 'Auth');
  await expect(panel.getByTestId('doc-body-editor')).toContainText('Drafted: write the auth doc');

  // Hand edit persists after the autosave debounce.
  const editor = panel.getByTestId('doc-body-editor');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Hand edit');
  await page.waitForTimeout(1500);
  await page.reload();
  panel = await selectDoc(page, 'Auth');
  await expect(panel.getByTestId('doc-body-editor')).toContainText('Hand edit');
});
