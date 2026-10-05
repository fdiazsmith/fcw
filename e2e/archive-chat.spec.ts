import { test, expect, type Page } from '@playwright/test';

// Deleting a root chat card archives it (it used to come back on the next
// sync). Archived chats are restored or deleted for good from "Archived (n)";
// the chat card's context menu archives or permanently deletes too.

const chatCards = (page: Page) => page.locator('.tl-shape[data-shape-type="chat-node"]');
const card = (page: Page, chatId: string) => page.locator(`.tl-shape[data-shape-id="shape:chat-${chatId}"]`);

/** "+ New chat" on root; returns the new chat's id. */
async function newChat(page: Page): Promise<string> {
  const ids = async () => chatCards(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-shape-id')));
  const before = await ids();
  await page.getByRole('button', { name: '+ New chat' }).click();
  await expect(chatCards(page)).toHaveCount(before.length + 1);
  const id = (await ids()).find((x) => !before.includes(x))!;
  return id.replace('shape:chat-', '');
}

/** Click the card's header (cards ignore pointer events until edited). */
async function clickCard(page: Page, chatId: string, button: 'left' | 'right' = 'left') {
  await page.mouse.click(30, 200); // leave editing, clear the selection
  const b = (await card(page, chatId).boundingBox())!;
  await page.mouse.click(b.x + b.width / 2, b.y + 12, { button });
}

test('Delete archives a root chat; Restore brings it back; delete it for good from the drawer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await expect(page.getByTestId('archived-toggle')).toHaveCount(0);

  const chatId = await newChat(page);
  await clickCard(page, chatId);
  await page.keyboard.press('Delete');
  await expect(card(page, chatId)).toHaveCount(0);

  // Stays gone after the server round-trip, and is listed as archived.
  await page.reload();
  await expect(page.getByTestId('archived-toggle')).toHaveText('Archived (1)');
  await expect(card(page, chatId)).toHaveCount(0);

  await page.getByTestId('archived-toggle').click();
  const item = page.locator(`[data-testid="archived-item"][data-chat-id="${chatId}"]`);
  await item.getByTestId('archived-restore').click();
  await expect(card(page, chatId)).toHaveCount(1);
  await expect(page.getByTestId('archived-toggle')).toHaveCount(0);

  // Context menu: Archive chat.
  await clickCard(page, chatId, 'right');
  await page.getByTestId('context-menu.fcw-archive-chat').click();
  await expect(card(page, chatId)).toHaveCount(0);
  await expect(page.getByTestId('archived-toggle')).toHaveText('Archived (1)');

  // Permanent delete from the drawer, with an inline confirm.
  await page.getByTestId('archived-toggle').click();
  await item.getByTestId('archived-delete').click();
  await item.getByTestId('archived-delete-confirm').click();
  await expect(page.getByTestId('archived-toggle')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await expect(card(page, chatId)).toHaveCount(0);
  await expect(page.getByTestId('archived-toggle')).toHaveCount(0);
});

test('context menu: Delete chat permanently, after confirming', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();

  const chatId = await newChat(page);
  await clickCard(page, chatId, 'right');
  await page.getByTestId('context-menu.fcw-delete-chat').click();
  // Cancel keeps it.
  await page.getByTestId('chat-delete-cancel').click();
  await expect(card(page, chatId)).toHaveCount(1);

  await clickCard(page, chatId, 'right');
  await page.getByTestId('context-menu.fcw-delete-chat').click();
  await page.getByTestId('chat-delete-confirm').click();
  await expect(card(page, chatId)).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await expect(card(page, chatId)).toHaveCount(0);
  await expect(page.getByTestId('archived-toggle')).toHaveCount(0);
});

test('undo does not remove (archive) a card the server created', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();

  const chatId = await newChat(page);
  await page.mouse.click(30, 200); // focus the canvas
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  await page.waitForTimeout(300);
  await expect(card(page, chatId)).toHaveCount(1);
  await expect(page.getByTestId('archived-toggle')).toHaveCount(0);

  // Leave root as we found it (one shared server).
  await clickCard(page, chatId, 'right');
  await page.getByTestId('context-menu.fcw-delete-chat').click();
  await page.getByTestId('chat-delete-confirm').click();
  await expect(card(page, chatId)).toHaveCount(0);
});
