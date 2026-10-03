import { test, expect, type Page } from '@playwright/test';

// M3.8: Compact folds the selected chats into a generated DocShape on the
// canvas they were selected on (root, or a doc's child canvas).

const docShapes = (page: Page) => page.getByTestId('doc-shape');
const chatCards = (page: Page) => page.locator('.tl-shape[data-shape-type="chat-node"]');

/** Send client messages straight to the server (cleanup only). */
async function sendToServer(page: Page, msgs: object[]) {
  await page.evaluate(async (payload) => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket('ws://localhost:8009');
      ws.onopen = () => {
        for (const m of payload) ws.send(JSON.stringify(m));
        setTimeout(() => {
          ws.close();
          resolve();
        }, 200);
      };
      ws.onerror = () => reject(new Error('ws error'));
    });
  }, msgs);
}

async function addChats(page: Page, n: number) {
  await page.getByTestId('prompt-mode-chat').click();
  const bar = page.getByTestId('prompt-bar');
  const before = await chatCards(page).count();
  for (let i = 1; i <= n; i++) {
    await bar.fill(`question ${i}`);
    await bar.press('Enter');
    await expect(chatCards(page)).toHaveCount(before + i);
  }
}

async function compactAll(page: Page) {
  await page.mouse.click(30, 200); // focus the canvas
  await page.keyboard.press('ControlOrMeta+a');
  await page.getByRole('button', { name: 'Compact', exact: true }).click();
}

test('Compact folds chats into a doc on root, and again on a doc canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await expect(docShapes(page)).toHaveCount(0);

  // Root: two chats -> one generated doc, chats gone.
  await addChats(page, 2);
  await compactAll(page);
  await expect(docShapes(page)).toHaveCount(1);
  await expect(chatCards(page)).toHaveCount(0);
  const rootDocId = (await docShapes(page).getAttribute('data-doc-id'))!;

  // Dive into the generated doc: the two chats are there.
  await docShapes(page).getByTestId('doc-open-canvas').click();
  await expect(page.getByTestId('breadcrumb').getByTestId('breadcrumb-item')).toHaveCount(2);
  await expect(chatCards(page)).toHaveCount(2);
  await page.getByTestId('breadcrumb-home').click();

  // A doc canvas: make a box, dive in, add two chats, Compact there.
  await page.getByTestId('prompt-mode-diagram').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill('graph TD\n  A[Compact host]');
  await bar.press('Enter');
  const host = page.locator('[data-testid="doc-shape"][data-doc-title="Compact host"]');
  await expect(host).toHaveCount(1);
  const hostId = (await host.getAttribute('data-doc-id'))!;
  await host.getByTestId('doc-open-canvas').click();
  await expect(page.getByTestId('breadcrumb').getByTestId('breadcrumb-item')).toHaveCount(2);

  await addChats(page, 2);
  await compactAll(page);
  await expect(docShapes(page)).toHaveCount(1); // on THIS canvas
  await expect(chatCards(page)).toHaveCount(0);

  // Home: root shows only its own two docs, not the nested one.
  await page.getByTestId('breadcrumb-home').click();
  await expect(docShapes(page)).toHaveCount(2);

  // Leave root as we found it for the next spec (one shared server).
  await sendToServer(page, [
    { type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id: rootDocId },
    { type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id: hostId },
  ]);
  await expect(docShapes(page)).toHaveCount(0);
});
