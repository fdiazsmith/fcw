import { test, expect, type Page } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// M7.8: projects (one chat graph each), per tab. Written first (RED) against
// the M7.7 testid contract. The page URL carries `?project=<id>`.
//
// BINDING UI CONTRACT (beyond PLAN.md M7.7):
//  - `project-menu`: the root breadcrumb button; its text contains the project
//    title (plus a ▾). Click toggles a popover with the `project-item` list
//    (`data-project-id`; text contains the title) and the actions
//    `project-new`, `project-rename`, `project-settings`, `project-trash`.
//    The popover closes after any action or item pick.
//  - New / Rename: clicking the action shows a text input `project-title-input`
//    (Rename: prefilled with the current title). Fill + Enter submits.
//  - Trash: clicking `project-trash` shows a confirm button
//    `project-trash-confirm`; clicking it moves the file to `<storage>/.trash/`.
//    Open tabs on that project switch to another project (URL updates).
//  - Storage dir: start-server.mjs writes it to test-results/e2e-storage-dir.txt.
//
// Not covered here: "restart -> last-opened project reopens" (server unit
// tests in M7.3; a Playwright server restart is out of scope).
// Other specs run on the default project; this spec only creates its own.

test.describe.configure({ mode: 'serial' });

const MERMAID = 'graph TD\n  A[Pa One] --> B[Pa Two]\n  B --> C[Pa Three]';
const docShapes = (page: Page) => page.getByTestId('doc-shape');
const chatNodes = (page: Page) => page.locator('.tl-shape[data-shape-type="chat-node"]');
const menu = (page: Page) => page.getByTestId('project-menu');

let alphaId = '';
let betaId = '';

const projectIdOf = (page: Page) => new URL(page.url()).searchParams.get('project') ?? '';

async function createProject(page: Page, title: string): Promise<string> {
  const before = projectIdOf(page);
  await menu(page).click();
  await page.getByTestId('project-new').click();
  const input = page.getByTestId('project-title-input');
  await input.fill(title);
  await input.press('Enter');
  await expect(menu(page)).toContainText(title);
  await expect.poll(() => projectIdOf(page)).not.toBe(before);
  await expect.poll(() => projectIdOf(page)).not.toBe('');
  return projectIdOf(page);
}

async function switchTo(page: Page, id: string) {
  await menu(page).click();
  await page.locator(`[data-testid="project-item"][data-project-id="${id}"]`).click();
  await expect.poll(() => projectIdOf(page)).toBe(id);
}

async function submitDiagram(page: Page, mermaid: string) {
  await page.getByTestId('prompt-mode-diagram').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill(mermaid);
  await bar.press('Enter');
}

async function submitChat(page: Page, text: string) {
  await page.getByTestId('prompt-mode-chat').click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill(text);
  await bar.press('Enter');
}

test('create Alpha: own URL, empty root, diagram lands in it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  alphaId = await createProject(page, 'Alpha');
  expect(page.url()).toContain('?project=');
  await expect(docShapes(page)).toHaveCount(0);

  await submitDiagram(page, MERMAID);
  await expect(docShapes(page)).toHaveCount(3);
});

test('Beta is isolated from Alpha; switching back and forth does not leak', async ({ page }) => {
  await page.goto(`/?project=${alphaId}`);
  await expect(docShapes(page)).toHaveCount(3);

  betaId = await createProject(page, 'Beta');
  expect(betaId).not.toBe(alphaId);
  await expect(docShapes(page)).toHaveCount(0);
  await expect(chatNodes(page)).toHaveCount(0);

  await submitChat(page, 'hello from beta');
  await expect(chatNodes(page)).toHaveCount(1);

  await switchTo(page, alphaId);
  await expect(docShapes(page)).toHaveCount(3);
  await expect(chatNodes(page)).toHaveCount(0);

  await switchTo(page, betaId);
  await expect(chatNodes(page)).toHaveCount(1);
  await expect(docShapes(page)).toHaveCount(0);
});

test('two tabs on different projects stay independent and reload into their own', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();
  await a.goto(`/?project=${alphaId}`);
  await b.goto(`/?project=${betaId}`);
  await expect(docShapes(a)).toHaveCount(3);
  await expect(chatNodes(b)).toHaveCount(1);

  await a.getByTestId('prompt-mode-doc').click();
  const bar = a.getByTestId('prompt-bar');
  await bar.fill('Only In Alpha');
  await bar.press('Enter');
  await expect(docShapes(a)).toHaveCount(4);

  await b.waitForTimeout(500);
  await expect(docShapes(b)).toHaveCount(0);
  await expect(chatNodes(b)).toHaveCount(1);

  await a.reload();
  await b.reload();
  expect(projectIdOf(a)).toBe(alphaId);
  expect(projectIdOf(b)).toBe(betaId);
  await expect(docShapes(a)).toHaveCount(4);
  await expect(docShapes(b)).toHaveCount(0);
  await expect(chatNodes(b)).toHaveCount(1);
  await ctx.close();
});

test('global graph in Alpha lists only Alpha docs plus root', async ({ page }) => {
  await page.goto(`/?project=${alphaId}`);
  await expect(docShapes(page)).toHaveCount(4);
  await page.getByTestId('global-graph-toggle').click();
  await expect(page.getByTestId('global-graph')).toBeVisible();
  await expect(page.getByTestId('global-graph-node')).toHaveCount(4 + 1);
});

test('rename Beta to "Beta 2" shows in the menu and persists over reload', async ({ page }) => {
  await page.goto(`/?project=${betaId}`);
  await menu(page).click();
  await page.getByTestId('project-rename').click();
  const input = page.getByTestId('project-title-input');
  await expect(input).toHaveValue('Beta');
  await input.fill('Beta 2');
  await input.press('Enter');
  await expect(menu(page)).toContainText('Beta 2');

  await page.reload();
  expect(projectIdOf(page)).toBe(betaId);
  await expect(menu(page)).toContainText('Beta 2');
});

test('trash Beta 2 removes it from the list, moves tabs off it, keeps the file in .trash', async ({ browser }) => {
  const storageDir = readFileSync(join(process.cwd(), 'test-results', 'e2e-storage-dir.txt'), 'utf8').trim();
  const ctx = await browser.newContext();
  const watcher = await ctx.newPage();
  const trasher = await ctx.newPage();
  await watcher.goto(`/?project=${betaId}`);
  await trasher.goto(`/?project=${betaId}`);
  await expect(menu(trasher)).toContainText('Beta 2');

  await menu(trasher).click();
  await trasher.getByTestId('project-trash').click();
  await trasher.getByTestId('project-trash-confirm').click();

  for (const tab of [trasher, watcher]) {
    await expect.poll(() => projectIdOf(tab)).not.toBe(betaId);
    await expect.poll(() => projectIdOf(tab)).not.toBe('');
    await expect(menu(tab)).not.toContainText('Beta 2');
  }

  await menu(trasher).click();
  await expect(trasher.getByTestId('project-item').first()).toBeVisible();
  await expect(trasher.locator(`[data-testid="project-item"][data-project-id="${betaId}"]`)).toHaveCount(0);
  await expect(trasher.locator(`[data-testid="project-item"][data-project-id="${alphaId}"]`)).toHaveCount(1);

  const trashDir = join(storageDir, '.trash');
  expect(existsSync(trashDir)).toBe(true);
  expect(readdirSync(trashDir).some((f) => f.includes(betaId))).toBe(true);
  await ctx.close();
});
