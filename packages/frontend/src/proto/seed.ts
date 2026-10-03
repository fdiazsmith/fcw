// PROTOTYPE — canned "LLM" responses. Keyword match → Mermaid, no network.
// Anything that parses as Mermaid is passed straight through, so you can throw
// real diagrams at it too.

import { generate, createBlank, placeExisting, setBody, emptyState } from './store';
import type { ProtoState } from './store';

interface Canned {
  match: RegExp;
  label: string;
  mermaid: string;
}

const CANNED: Canned[] = [
  {
    match: /sign\s*-?in|signin|login|auth/i,
    label: 'Sign-in flow',
    // Sketch 01, verbatim.
    mermaid: `graph TD
  A[Sign in] --> B[Auth]
  B --> C[Google]
  B --> D[E-mail]
  C --> E[Verify]
  D --> E
  E --> F[Database]
  F --> G[Welcome Page]`,
  },
  {
    match: /frontend|architecture|component/i,
    label: 'Frontend architecture',
    // Sketch 03.
    mermaid: `graph TD
  A[Atoms] --> B[components/UI]
  C[Molecules] --> D[Components]
  E[Cells] --> F[pages/protected]
  B --> G[Storybook]
  D --> G
  F --> H[API calls]`,
  },
  {
    match: /\bapi\b|endpoint|backend|route/i,
    label: 'API surface',
    mermaid: `graph TD
  A[API calls] --> B[POST /session]
  A --> C[GET /me]
  A --> D[POST /logout]
  B --> E[Rate limiting]
  C --> F[Token refresh]`,
  },
  {
    match: /checkout|payment|billing|cart/i,
    label: 'Checkout flow',
    mermaid: `graph TD
  A[Cart] --> B[Checkout]
  B --> C[Address]
  B --> D[Payment]
  D --> E[Stripe]
  E --> F[Order confirmed]
  F --> G[Receipt e-mail]`,
  },
  {
    match: /onboard|welcome|tour/i,
    label: 'Onboarding',
    mermaid: `graph TD
  A[Welcome Page] --> B[Pick a workspace]
  B --> C[Invite team]
  B --> D[Skip for now]
  C --> E[Dashboard]
  D --> E`,
  },
];

const looksLikeMermaid = (text: string) => /^\s*(graph|flowchart)\b/.test(text) || text.includes('-->');

/** Turn a prompt into Mermaid. Returns the text plus how we got there, for the UI. */
export function respond(prompt: string): { mermaid: string; via: string } {
  if (looksLikeMermaid(prompt)) return { mermaid: prompt, via: 'parsed your Mermaid' };

  const hit = CANNED.find((c) => c.match.test(prompt));
  if (hit) return { mermaid: hit.mermaid, via: `canned · ${hit.label}` };

  // Nothing matched — fabricate a small tree from the prompt itself, so the
  // prompt bar never feels dead.
  const subject = prompt.trim().replace(/[[\]]/g, '').slice(0, 28) || 'Untitled';
  return {
    mermaid: `graph TD
  A[${subject}] --> B[Inputs]
  A --> C[Constraints]
  A --> D[Open questions]
  B --> E[Decision]
  C --> E`,
    via: 'generic scaffold',
  };
}

export const CANNED_LABELS = CANNED.map((c) => c.label);

export function cannedByLabel(label: string): string {
  return CANNED.find((c) => c.label === label)?.mermaid ?? '';
}

/**
 * The three-level scenario from the sketches, wired so `API calls` is ONE doc
 * placed on TWO canvases. That single fact is the thing worth checking.
 */
export function seedSketchScenario(): ProtoState {
  let state = emptyState();

  // Frame 01 — prompt to diagram, on the root canvas.
  state = generate(state, state.rootId, cannedByLabel('Sign-in flow'));
  const signIn = Object.values(state.docs).find((d) => d.title === 'Sign in')!.id;

  // Frame 03 — Frontend Architecture gets its own canvas, built first so
  // frame 02 can reference it.
  const [afterFA, frontendArch] = createBlank(state, signIn, 'Frontend Architecture', { x: 0, y: 0 });
  state = afterFA;
  state = generate(state, frontendArch, cannedByLabel('Frontend architecture'));
  const apiCalls = Object.values(state.docs).find((d) => d.title === 'API calls')!.id;

  // Frame 02 — the scoped Sign in canvas: references, prose, siblings.
  state = placeExisting(state, signIn, apiCalls, { x: 340, y: 0 }); // ← same doc, second canvas
  const [afterDesign, design] = createBlank(state, signIn, 'Design.md', { x: 680, y: 0 });
  state = afterDesign;
  const [afterPage, pageStructure] = createBlank(state, signIn, 'Page Structure', { x: 170, y: 240 });
  state = afterPage;

  state = setBody(
    state,
    pageStructure,
    [
      '## Page Structure',
      '',
      'Reuse components:',
      '',
      '- `<Button>`',
      '- `<Card>`',
      '',
      '**New component:** `Avatar`',
      '',
      'Layout is a centred card at 420px, full-bleed below 640px.',
    ].join('\n'),
  );
  state = setBody(
    state,
    design,
    '## Design.md\n\nColour, type scale and spacing tokens live here.\n\nStill open: does sign-in use the marketing type scale or the product one?',
  );
  state = setBody(
    state,
    frontendArch,
    '## Frontend Architecture\n\nAtomic-design layering. Atoms and molecules are storybook-first;\ncells are route-level and may call the API directly.',
  );
  state = setBody(
    state,
    apiCalls,
    '## API calls\n\nOne doc, placed on **two** canvases — Sign in and Frontend Architecture.\nEdit it from either; both see the change. This is the placement model working.',
  );
  state = setBody(
    state,
    signIn,
    '## Sign in\n\nEntry point. Two providers, one verification step, one destination.\nOpen question: do we keep e-mail sign-in past the beta?',
  );

  return state;
}
