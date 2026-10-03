import { test, expect, type Page, type Locator } from '@playwright/test';

// M5.3: proto parity. One test per row of `packages/frontend/src/proto/README.md`
// "What to click", driving the real app the way the row describes. The rows
// build on each other (the sketch scenario, three levels deep), so they share
// one page and run in order.
//
// The shared e2e server already holds docs from earlier specs (gate-m3 leaves
// "Sign in" / "API calls" on root). Boxes are therefore located by the ids this
// spec created, and the reference doc is titled "Parity API calls": "Link
// instead?" links the *first* doc with a matching title, which here would be
// gate-m3's.

// Proto `seed.ts` cannedByLabel('Sign-in flow') — sketch 01, verbatim.
const SIGN_IN_FLOW = `graph TD
  A[Sign in] --> B[Auth]
  B --> C[Google]
  B --> D[E-mail]
  C --> E[Verify]
  D --> E
  E --> F[Database]
  F --> G[Welcome Page]`;

// Proto cannedByLabel('Frontend architecture') — sketch 03, reference renamed (see above).
const REF = 'Parity API calls';
const FRONTEND_ARCHITECTURE = `graph TD
  A[Atoms] --> B[components/UI]
  C[Molecules] --> D[Components]
  E[Cells] --> F[pages/protected]
  B --> G[Storybook]
  D --> G
  F --> H[${REF}]`;

test.describe.configure({ mode: 'serial' });

let page: Page;
const ids: Record<string, string> = {}; // title -> doc id created by this spec
const rootPlaced: string[] = []; // doc ids this spec placed on root (cleanup)

const docShapes = () => page.getByTestId('doc-shape');
const byId = (id: string) => page.locator(`[data-testid="doc-shape"][data-doc-id="${id}"]`);
const crumbs = () => page.getByTestId('breadcrumb').getByTestId('breadcrumb-item');

async function currentIds(): Promise<string[]> {
  return docShapes().evaluateAll((els) => els.map((e) => e.getAttribute('data-doc-id')!));
}

/** Pan the camera so the next thing created lands on empty canvas. */
async function panAway() {
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(150);
}

async function submit(mode: 'diagram' | 'doc', text: string) {
  await page.getByTestId(`prompt-mode-${mode}`).click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill(text);
  await bar.press('Enter');
}

/** Submit, wait for `count` new boxes on this canvas, record their ids by title. */
async function create(mode: 'diagram' | 'doc', text: string, count: number): Promise<string[]> {
  const before = await currentIds();
  await submit(mode, text);
  await expect(docShapes()).toHaveCount(before.length + count);
  const fresh = (await currentIds()).filter((id) => !before.includes(id));
  for (const id of fresh) ids[(await byId(id).getAttribute('data-doc-title'))!] = id;
  return fresh;
}

async function dive(id: string) {
  await byId(id).getByTestId('doc-open-canvas').dispatchEvent('click');
}

async function closePanel() {
  await page.getByTestId('doc-panel').getByTitle('Close').click();
  await expect(page.getByTestId('doc-panel')).toHaveCount(0);
}

async function select(id: string): Promise<Locator> {
  await byId(id).getByTestId('doc-title').dispatchEvent('click');
  const panel = page.getByTestId('doc-panel');
  await expect(panel).toBeVisible();
  return panel;
}

/** Send client messages straight to the server (cleanup only). */
async function sendToServer(msgs: object[]) {
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

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/');
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await page.waitForTimeout(500); // let the snapshot arrive
});

test.afterAll(async () => {
  await page.getByTestId('breadcrumb-home').click();
  const before = await docShapes().count();
  await sendToServer(rootPlaced.map((id) => ({ type: 'doc_unplace_requested', canvasId: 'root', kind: 'doc', id })));
  await expect(docShapes()).toHaveCount(before - rootPlaced.length);
  await page.close();
});

test('Look at the root canvas: the sign-in flow is real shapes, one per Mermaid box, each a doc', async () => {
  const arrows = page.locator('.tl-shape[data-shape-type="arrow"]');
  const arrowsBefore = await arrows.count();
  await panAway();
  const fresh = await create('diagram', SIGN_IN_FLOW, 7);
  rootPlaced.push(...fresh);

  for (const title of ['Sign in', 'Auth', 'Google', 'E-mail', 'Verify', 'Database', 'Welcome Page']) {
    const box = byId(ids[title]);
    await expect(box.getByTestId('doc-title')).toHaveText(title);
    await expect(box.getByTestId('doc-open-canvas')).toBeAttached(); // every box is a doc with a canvas (tldraw culls off-screen ones)
  }
  await expect(arrows).toHaveCount(arrowsBefore + 7); // edges are real connectors
});

test('⤢ Canvas · 4 on Sign in: a scoped canvas holding references, prose and room to sketch', async () => {
  // Build sketch 02 with the real UI: Frontend Architecture (with its own
  // diagram), a reference to its "API calls", Design.md and Page Structure.
  await dive(ids['Sign in']);
  await expect(crumbs()).toHaveCount(2);
  await expect(docShapes()).toHaveCount(0);

  await create('doc', 'Frontend Architecture', 1);
  await dive(ids['Frontend Architecture']);
  await expect(crumbs()).toHaveCount(3);
  await create('diagram', FRONTEND_ARCHITECTURE, 8);
  const faRef = ids[REF];

  await crumbs().nth(1).click(); // back to Sign in
  await expect(crumbs()).toHaveCount(2);
  await panAway();
  const [placed] = await create('diagram', `graph TD\n  A[${REF}]`, 1);
  await byId(placed).getByTestId('doc-link-chip').dispatchEvent('click');
  await expect(byId(faRef)).toHaveCount(1); // the same doc, now placed here too
  await expect(byId(faRef).getByTestId('doc-ref-marker')).toBeVisible();
  ids[REF] = faRef;

  await panAway();
  await create('doc', 'Design.md', 1);
  await panAway();
  await create('doc', 'Page Structure', 1);

  // Prose on Page Structure.
  const panel = await select(ids['Page Structure']);
  await panel.getByTestId('doc-body-editor').locator('[contenteditable="true"]').click();
  await page.keyboard.type('Reuse components: Button, Card. New component: Avatar.');
  await page.waitForTimeout(1200); // autosave debounce
  await closePanel();

  // The row itself: home → "⤢ Canvas · 4" on Sign in → the scoped canvas.
  await page.getByTestId('breadcrumb-home').click();
  await expect(byId(ids['Sign in']).getByTestId('doc-open-canvas')).toHaveText('⤢ Canvas · 4');
  await dive(ids['Sign in']);
  await expect(crumbs()).toHaveCount(2);
  await expect(crumbs().last()).toHaveText('Sign in');
  await expect(docShapes()).toHaveCount(4);
  await expect(byId(ids[REF]).getByTestId('doc-ref-marker')).toContainText('2 canvases');
  await expect(byId(ids['Page Structure'])).toContainText('New component: Avatar');
});

test('Write on API calls: one doc on two canvases; edit the body, both canvases show it', async () => {
  // On Sign in.
  const panel = await select(ids[REF]);
  const editor = panel.getByTestId('doc-body-editor').locator('[contenteditable="true"]');
  await editor.click();
  await page.keyboard.type('Edited on the Sign in canvas.');
  await page.waitForTimeout(1200); // autosave debounce
  await closePanel();
  await expect(byId(ids[REF])).toContainText('Edited on the Sign in canvas.');

  // On Frontend Architecture: same doc, same body.
  await dive(ids['Frontend Architecture']);
  await expect(crumbs()).toHaveCount(3);
  await expect(byId(ids[REF]).getByTestId('doc-ref-marker')).toContainText('2 canvases');
  await expect(byId(ids[REF])).toContainText('Edited on the Sign in canvas.');

  // Survives a reload (server owns docs).
  await page.reload();
  await expect(page.locator('.tl-canvas')).toBeVisible();
  await page.waitForTimeout(500);
  await dive(ids['Sign in']);
  await dive(ids['Frontend Architecture']);
  await expect(byId(ids[REF])).toContainText('Edited on the Sign in canvas.');
});

test('Drag the budget slider down: references degrade to title-only, the target never does', async () => {
  // Give the target a body too, so "never degrades" is observable.
  await crumbs().nth(1).click(); // Sign in canvas
  await page.getByTestId('breadcrumb-home').click();
  const panel = await select(ids['Sign in']);
  await panel.getByTestId('doc-body-editor').locator('[contenteditable="true"]').click();
  await page.keyboard.type('Entry point. Two providers, one verification step.');
  await page.waitForTimeout(1200);

  await panel.getByText('Context', { exact: true }).click();
  const inspector = panel.getByTestId('doc-context-inspector');
  await expect(inspector).toBeVisible();
  const row = (title: string) => inspector.locator('li', { has: page.getByText(title, { exact: true }) });
  await expect(row(REF)).toBeVisible(); // a reference two canvases away is in context
  await expect(inspector.getByText('title only')).toHaveCount(0);

  await inspector.getByLabel('Context budget').fill('0');
  await expect(row(REF).getByText('title only')).toBeVisible();
  await expect(row('Page Structure').getByText('title only')).toBeVisible();
  await expect(row('Sign in').getByText('title only')).toHaveCount(0); // the target
  await expect(row('Sign in')).toContainText(/[1-9]\d* chars/);
  await closePanel();
});

test('Type in the chat → Apply to doc: the draft waits for the button, chats never silently write', async () => {
  const panel = await select(ids['Auth']);
  const editor = panel.getByTestId('doc-body-editor');
  await expect(editor).toHaveText('');

  const composer = panel.getByPlaceholder('Message…');
  await composer.fill('draft the auth section');
  await composer.press('Enter');
  const reply = panel.locator('.fcw-message[data-role="assistant"]', { hasText: 'Drafted: draft the auth section' });
  await expect(reply).toBeVisible();
  await page.waitForTimeout(500);
  await expect(editor).toHaveText(''); // nothing written yet

  await reply.getByTestId('doc-apply').click();
  await expect(editor).toContainText('Drafted: draft the auth section');
  await closePanel();
  await expect(byId(ids['Auth'])).toContainText('Drafted: draft the auth section');
});

test('Global graph: every doc a node, every placement an edge; picking one navigates', async () => {
  await page.getByTestId('global-graph-toggle').click();
  await expect(page.getByTestId('global-graph')).toBeVisible();
  for (const title of ['Sign in', 'Frontend Architecture', REF, 'Design.md', 'Page Structure', 'Atoms']) {
    await expect(page.locator(`[data-testid="global-graph-node"][data-doc-id="${ids[title]}"]`)).toHaveCount(1);
  }
  // Placements this spec made: 7 on root + 4 on Sign in + 8 on Frontend Architecture.
  expect(await page.getByTestId('global-graph-edge').count()).toBeGreaterThanOrEqual(19);

  await page
    .locator(`[data-testid="global-graph-node"][data-doc-id="${ids['Frontend Architecture']}"]`)
    .dispatchEvent('click');
  await expect(page.getByTestId('global-graph')).toHaveCount(0);
  await expect(crumbs()).toHaveCount(3); // root › Sign in › Frontend Architecture
  await expect(crumbs().nth(1)).toHaveText('Sign in');
  await expect(crumbs().last()).toHaveText('Frontend Architecture');
  await expect(byId(ids['Atoms'])).toHaveCount(1);
});

test('Draw with the pencil, then navigate away and back: freehand survives', async () => {
  await crumbs().nth(1).click(); // Sign in canvas
  await expect(docShapes()).toHaveCount(4);
  await panAway();
  const drawings = page.locator('.tl-shape[data-shape-type="draw"]');
  await expect(drawings).toHaveCount(0);
  await page.keyboard.press('d');
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(560, 430, { steps: 5 });
  await page.mouse.move(620, 390, { steps: 5 });
  await page.mouse.up();
  await expect(drawings).toHaveCount(1);
  await page.keyboard.press('v');

  await dive(ids['Frontend Architecture']);
  await expect(crumbs()).toHaveCount(3);
  await expect(drawings).toHaveCount(0);
  await page.getByTestId('breadcrumb-home').click();
  await dive(ids['Sign in']);
  await expect(docShapes()).toHaveCount(4);
  await expect(drawings).toHaveCount(1);
});

test('Prompt bar → paste any Mermaid (graph TD / flowchart, chains); anything else → one raw fallback box', async () => {
  // A scratch canvas under Design.md.
  await dive(ids['Design.md']);
  await expect(crumbs()).toHaveCount(3);
  await expect(docShapes()).toHaveCount(0);

  // flowchart + a chain → one box per node, arrows between them.
  const arrows = page.locator('.tl-shape[data-shape-type="arrow"]');
  await create('diagram', 'flowchart LR\n  P[Cart] --> Q[Checkout] --> R[Receipt]', 3);
  await expect(arrows).toHaveCount(2);

  // Not Mermaid, keyless: the real app keeps the prompt as ONE raw doc box
  // (the proto fabricated a 5-box "generic scaffold" instead).
  await panAway();
  await create('diagram', 'a checkout flow with saved cards', 1);
});
