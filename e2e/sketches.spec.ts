import { test, expect, type Page, type Locator } from '@playwright/test';

// M6.1: the four origin sketches (docs/sketches/) played end to end against the
// real server, one test per sketch, narrated with the sketch's own words. The
// frames build on each other, so they share one page and run in order.
//
// The shared e2e server already holds docs from earlier specs (they leave
// "Sign in" / "API calls" on root). Boxes are located by the ids this spec
// created. The reference doc is titled "Sketch API calls": the link chip links
// the *first* doc with a matching title, which would be another spec's.

const SIGN_IN_FLOW = `graph TD
  A[Sign in] --> B[Auth]
  B --> C[Google]
  B --> D[E-mail]
  C --> E[Verify]
  D --> E
  E --> F[Database]
  F --> G[Welcome Page]`;

const REF = 'Sketch API calls';
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
const drawings = () => page.locator('.tl-shape[data-shape-type="draw"]');

async function currentIds(): Promise<string[]> {
  return docShapes().evaluateAll((els) => els.map((e) => e.getAttribute('data-doc-id')!));
}

/** Pan the camera so the next thing created lands on empty canvas. */
async function panAway() {
  await page.mouse.move(400, 400);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(150);
}

async function create(mode: 'diagram' | 'doc', text: string, count: number): Promise<string[]> {
  const before = await currentIds();
  await page.getByTestId(`prompt-mode-${mode}`).click();
  const bar = page.getByTestId('prompt-bar');
  await bar.fill(text);
  await bar.press('Enter');
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

test('01 Prompt to diagram: "Create a signin diagram" answers with real shapes, one doc per box', async () => {
  // "An empty canvas with a prompt bar at the bottom" (empty-ish: pan to clear space).
  const arrows = page.locator('.tl-shape[data-shape-type="arrow"]');
  const arrowsBefore = await arrows.count();
  await panAway();
  await expect(page.getByTestId('prompt-bar')).toBeVisible();

  // "The model answers with a flowchart": Sign in -> Auth -> Google / E-mail -> ... -> Welcome Page.
  rootPlaced.push(...(await create('diagram', SIGN_IN_FLOW, 7)));

  // "The boxes are real shapes, not a rendered picture": 7 doc shapes, and each is a doc with a canvas.
  for (const title of ['Sign in', 'Auth', 'Google', 'E-mail', 'Verify', 'Database', 'Welcome Page']) {
    await expect(byId(ids[title]).getByTestId('doc-title')).toHaveText(title);
    await expect(byId(ids[title]).getByTestId('doc-open-canvas')).toBeAttached();
  }
  // Arrows are real connectors: 7 edges in the Mermaid.
  await expect(arrows).toHaveCount(arrowsBefore + 7);
});

test('02 Scoped canvas with references: Sign in holds Frontend Architecture, API calls, Design.md, a sketch and Page Structure', async () => {
  // "Dive into the Sign in box and you get its own canvas."
  await dive(ids['Sign in']);
  await expect(crumbs()).toHaveCount(2);
  await expect(crumbs().last()).toHaveText('Sign in');
  await expect(docShapes()).toHaveCount(0);

  // "Frontend Architecture": made here, and (frame 03) given its own diagram, whose
  // last box is "API calls". Done now so the reference exists to be linked back.
  await create('doc', 'Frontend Architecture', 1);
  await dive(ids['Frontend Architecture']);
  await expect(crumbs()).toHaveCount(3);
  await create('diagram', FRONTEND_ARCHITECTURE, 8);
  const refId = ids[REF]; // `create` re-records ids by title; keep the original

  // "API calls" on this canvas is the SAME doc: the link chip links the typed title to the existing doc.
  await crumbs().nth(1).click();
  await expect(crumbs()).toHaveCount(2);
  await panAway();
  const [placed] = await create('diagram', `graph TD\n  A[${REF}]`, 1);
  await byId(placed).getByTestId('doc-link-chip').dispatchEvent('click');
  ids[REF] = refId;
  await expect(byId(refId)).toHaveCount(1);
  // "References carry a visual marker": the link glyph shows on the shared doc.
  await expect(byId(refId).getByTestId('doc-ref-marker')).toBeVisible();

  // "Design.md" and "Page Structure".
  await panAway();
  await create('doc', 'Design.md', 1);
  await panAway();
  await create('doc', 'Page Structure', 1);

  // "A Page Structure document holding real prose": "Reuse Components <Button> <Card>, New Component: Avatar."
  const panel = await select(ids['Page Structure']);
  await panel.getByTestId('doc-body-editor').locator('[contenteditable="true"]').click();
  await page.keyboard.type('Reuse Components <Button> <Card>, New Component: Avatar');
  await page.waitForTimeout(1200); // autosave debounce
  await closePanel();
  await expect(byId(ids['Page Structure'])).toContainText('New Component: Avatar');

  // "A freehand wireframe sketch".
  await panAway();
  await expect(drawings()).toHaveCount(0);
  await page.keyboard.press('d');
  await page.mouse.move(450, 350);
  await page.mouse.down();
  await page.mouse.move(560, 350, { steps: 5 });
  await page.mouse.move(560, 500, { steps: 5 });
  await page.mouse.move(450, 500, { steps: 5 });
  await page.mouse.move(450, 350, { steps: 5 });
  await page.mouse.up();
  await expect(drawings()).toHaveCount(1);
  await page.keyboard.press('v');

  // The canvas holds all four boxes (off-screen ones are culled, so only the marker's presence is checked);
  // boxes that hold only their own content carry no marker.
  await expect(docShapes()).toHaveCount(4);
  await expect(byId(ids[REF]).getByTestId('doc-ref-marker')).toBeAttached();
  await expect(byId(ids['Page Structure']).getByTestId('doc-ref-marker')).toHaveCount(0);
});

test('03 Nested doc canvas: Frontend Architecture recurses, and API calls is one document in two placements', async () => {
  // "Dive into Frontend Architecture from the previous frame."
  await dive(ids['Frontend Architecture']);
  await expect(crumbs()).toHaveCount(3);
  // The home glyph (breadcrumb-home) is the way out; the trail reads Canvas > Sign in > Frontend Architecture.
  await expect(page.getByTestId('breadcrumb-home')).toBeVisible();
  await expect(crumbs().nth(1)).toHaveText('Sign in');
  await expect(crumbs().last()).toHaveText('Frontend Architecture');

  // "Atoms -> components/UI, Molecules -> Components, Cells -> pages/[protected]", into Storybook and API calls.
  await expect(docShapes()).toHaveCount(8);
  for (const title of ['Atoms', 'components/UI', 'Molecules', 'Components', 'Cells', 'pages/protected', 'Storybook', REF]) {
    await expect(byId(ids[title])).toHaveCount(1);
  }
  await expect(page.locator('.tl-shape[data-shape-type="arrow"]')).toHaveCount(6);

  // "API calls appears here and on frame 02": marked on both.
  await expect(byId(ids[REF]).getByTestId('doc-ref-marker')).toBeVisible();

  // One document, two placements: write it here, read it on Sign in.
  const panel = await select(ids[REF]);
  await panel.getByTestId('doc-body-editor').locator('[contenteditable="true"]').click();
  await page.keyboard.type('Edited once, seen twice.');
  await page.waitForTimeout(1200);
  await closePanel();
  await crumbs().nth(1).click();
  await expect(crumbs()).toHaveCount(2);
  await expect(byId(ids[REF]).getByTestId('doc-ref-marker')).toContainText('2 canvases'); // (camera is elsewhere: culled, not visible)
  await expect(byId(ids[REF])).toContainText('Edited once, seen twice.');

  // Home glyph returns to the root canvas.
  await page.getByTestId('breadcrumb-home').click();
  await expect(crumbs()).toHaveCount(1);
  await expect(byId(ids['Sign in'])).toHaveCount(1);
});

test('04 Global graph: "how all our thinking meshed together"; picking Frontend Architecture opens it', async () => {
  await page.getByTestId('global-graph-toggle').click();
  await expect(page.getByTestId('global-graph')).toBeVisible();

  // Every doc created above is a node, plus the root.
  const created = Object.values(ids);
  expect(created.length).toBe(18) // 7 + Frontend Architecture + 8 (REF among them) + Design.md + Page Structure;
  for (const id of created) {
    await expect(page.locator(`[data-testid="global-graph-node"][data-doc-id="${id}"]`)).toHaveCount(1);
  }
  await expect(page.locator('[data-testid="global-graph-node"][data-doc-id="root"]')).toHaveCount(1);

  // Picking a node navigates there.
  await page
    .locator(`[data-testid="global-graph-node"][data-doc-id="${ids['Frontend Architecture']}"]`)
    .dispatchEvent('click');
  await expect(page.getByTestId('global-graph')).toHaveCount(0);
  await expect(crumbs()).toHaveCount(3);
  await expect(crumbs().last()).toHaveText('Frontend Architecture');
  await expect(byId(ids['Atoms'])).toHaveCount(1);
});
