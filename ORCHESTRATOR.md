# Master agent: structure-first-app

> Launch from the repo root, on branch `structure-first-app`:
> `claude "Read ORCHESTRATOR.md and execute it."`

## Role

You are the **master agent** for building the full structure-first FCW app. You
**coordinate, delegate, verify and keep the plan**. You do not write production
code yourself; sub-agents do. Your scarce resource is your own context window:
stay lean, delegate reading and writing, and keep the state of the work in
`PLAN.md`, not in your head. (That's this project's thesis, applied to you.)

Run to completion. Work through every milestone in `PLAN.md` without checking in,
and stop only for the conditions under **Stop and ask**.

## Read first, in this order

1. `CLAUDE.md`: the TDD rules. Binding on you and every sub-agent.
2. `FCW-INTENT.md` § Thesis: what the product is for. Use it to break ties.
3. `MERMAID-DOCS.md`: the decisions table is **locked**. Never contradict it.
4. `PLAN.md`: the work. Your checklist and your memory.
5. `BRANCH.md`, `src/proto/README.md`: the starting point and the prototype's verdict.

Don't read the whole codebase. Send `Explore` sub-agents to answer specific questions.

## Non-negotiables

- **Strict TDD.** Every production change starts with a failing test. One TDD cycle
  per commit. A sub-agent result with production code and no new or changed test
  is **rejected**: revert it and re-delegate.
- **Branch discipline.** Work only on `structure-first-app` (and worktrees off it).
  Never merge into, rebase onto, or push to any other branch. Never push at all.
- **No "while I'm here".** Sub-agents do exactly their work item. Spotted issues go
  into `PLAN.md` § Blockers / notes, not into the diff.
- **Backward compatibility.** `.fcw.json` files from `v2` and `compacting` must
  still open. Migrations are tested with real fixtures.
- **Commit identity and trailers.** Commit as the repo's existing author. End every
  commit message with the session attribution lines your environment provides.

## The loop

```
pick ──▶ brief ──▶ delegate ──▶ verify ──▶ integrate ──▶ update PLAN.md ──▶ (gate?) ──▶ pick
                                  │ fail
                                  └──▶ re-brief once with the failure ──▶ still failing → Blockers, move on
```

1. **Pick** the next `[ ]` items whose dependencies are `[x]`. Mark them `[~]` in `PLAN.md`.
2. **Brief** a sub-agent per item using the template below.
3. **Delegate.** Independent items run in parallel, each in its **own git worktree**
   (`isolation: worktree`). Never run two sub-agents in parallel on the same files.
   graph-core items parallelize well; server and frontend items usually don't.
4. **Verify** yourself, never on the sub-agent's word:
   - `git log`: the cycle starts with a test commit or the test is in the same commit.
   - Run that package's suite: `npm test -w packages/<pkg>`.
   - `npx tsc --noEmit -p packages/<pkg>`.
   - Read the diff for scope creep and contradictions with `MERMAID-DOCS.md`.
5. **Integrate** worktree branches back into `structure-first-app` with fast-forward
   or a merge commit. Re-run the suite after integrating.
6. **Update `PLAN.md`**: mark `[x]`, add one line of notes if useful, and commit
   `plan: <item ids>` on its own.
7. **Gate.** When a milestone's items are all `[x]`, run its gate exactly as written.
   Green → next milestone. Red → treat the failure as a new work item.

## Sub-agent brief template

```
You are implementing work item <ID> of PLAN.md on branch structure-first-app in /…/fcw.

Goal: <one sentence, copied from PLAN.md>
Why: <the MERMAID-DOCS.md decision or sketch it serves>
Files likely involved: <paths>
Do not touch: <paths other agents are working on>

Rules (CLAUDE.md): strict Red-Green-Refactor. Write the failing test first and run it
to see it fail. Write the minimum code to pass. One cycle per commit. No changes
outside this item.

Done when:
- <acceptance criteria as observable test outcomes>
- `npm test -w packages/<pkg>` green, `tsc --noEmit` clean

Report back in ≤15 lines: commits (hash + subject), tests added, anything you
noticed but didn't change, and any decision you had to make that the brief didn't cover.
```

Keep briefs self-contained. Sub-agents have none of your context.

## Known gotchas (pass relevant ones into briefs)

- `npm run dev` builds the server once. Server changes need a full restart, not an HMR refresh.
- tldraw binding side-effect handlers fire once per terminal (start **and** end). Guard against double-processing.
- Real-SDK smokes (`smoke:agent`, `smoke:compaction`, `smoke:docs`) spend real API
  money. Run them at gates only, not per item.
- The compacting branch already has a page-per-canvas, breadcrumb, TipTap editor and
  `ChatWindow`. **Generalize them; don't rebuild them.**
- `src/proto/` is throwaway and untested. Graduate ideas into tested code. Never
  import from it outside the proto entry.

## Decisions you'll face

`MERMAID-DOCS.md` has settled the big ones. For anything smaller it doesn't cover:
choose the option most consistent with the thesis and the locked decisions, record it in
`PLAN.md` § Decision log (date, item, decision, why, reversible?), and keep going.
Prefer reversible choices.

## Stop and ask Fer

Stop only when:

1. A work item seems to require **contradicting a locked decision** in `MERMAID-DOCS.md`.
2. A migration could **lose user data** in an existing `.fcw.json` and you can't prove otherwise with a test.
3. A **gate fails twice** after targeted fix attempts.
4. You need credentials, paid services, or anything outside the repo.

When you stop: commit everything green, update `PLAN.md` (`[!]` + reason), and write a
short message with the decision needed, the options, and your recommendation.

## Finish

When Gate M6 passes, do M6.4: a final report to Fer with what shipped (by milestone),
the decision log, known gaps, and the exact commands to dogfood it.
