# Development Log

How CampusLoop was actually built — including the parts that were wrong at
first. Written as a learning record, not a highlight reel.

## Phase 0 — Framing the problem before writing code

The first draft of the idea was "an app that lets students swap textbooks".
That version had no reason to exist next to a WhatsApp group. The reframe that
made it worth building: **reuse fails for informational reasons** — nobody
types ISBNs, nobody sees the coming pile-up, and first-come-first-served
starves the students who arrive last. Every feature in the final app traces
back to one of those three sentences.

A second early decision shaped everything: **browser-only, zero network**.
That ruled out bundling a neural network and forced hand-crafted features —
which turned out to be the interesting part of the project rather than a
constraint to apologise for.

## Phase 1 — Algorithms first, UI second

The four engines (`classify / regress / matching / impact`) were built and
tested before any component existed, with the **tests as the source of
numbers**: the README and the Method view both quote `vitest` output, so there
is no separate "marketing number" to drift.

Mistakes found while doing this:

- **Leakage, twice.** The first forecast feature set included quantities
  derived from month t+1 activity — obviously future information, written
  plausibly enough that it took reading the feature list line by line to catch.
  The second was subtler: a `term end` flag that referred to the *current*
  month; the signal lives in whether the *target* month closes a term. The
  fixed version is the single largest coefficient in the model (+1.018).
- **A validation protocol that flattered itself.** Leave-one-out comparing a
  degraded photo against the *clean* gallery image is easier than anything the
  app will meet in a hallway. Protocol B (gallery and probe degraded
  *differently*) exists because the Protocol A number stopped being credible
  once I thought about what it actually measures. 96.7% → 94.2%, and the
  second number is the honest one.
- **Fairness found by being sneaky.** The original matcher just maximised
  utility. Instrumenting it to report which requests went unserved showed the
  *unweighted optimiser dropping five supported-needy students* (29/34 served)
  while scoring *higher* on raw utility than a fairness-blind baseline. The
  `fairnessWeight = 0.45` term exists because of that table, and the baseline
  comparison in `docs/ML.md` §3.3 is kept in the docs as the evidence.
- **Pooled regression scale bug.** Standardising features per-subject silently
  destroyed the level information the pooled model needed; 3-month rolling
  means fixed it. Lesson: a pooled model needs features that *say* what the
  pool is pooling over.

## Phase 2 — The UI hand-written on purpose

Vite 7 + React 19 + TypeScript strict, and exactly two runtime dependencies.
Charts are hand-drawn SVG (`components/charts.tsx`). This is a hackathon, so
the temptation was Recharts; the reason I resisted is the same reason the ML
is hand-written — *a judge can read every line, and there is nothing to
misconfigure*. Hand-drawing the axes also taught me more about tick placement
than any library ever did (see `niceTicks`, below).

## Phase 3 — Browser QA, where most of the real bugs were

Every view was regression-tested in a real browser via scripted sweeps
(navigate → measure every axis label's bounding box → screenshot → read the
screenshot myself). Five genuine defects were caught this way, all invisible in
the code:

1. **Axis labels overflowing the viewBox** on small-magnitude ranges — the
   first `niceTicks` implementation produced fractional ticks that the fixed
   label padding could not absorb. Fixed the tick step chooser; re-swept all
   seven views; zero overflows.
2. **Decimal-place inconsistency** — one chart labelled `0.5` while its
   neighbour said `1.50`. Tick labels now share precision per axis.
3. **`textAnchor` vs reality** — React maps `textAnchor` to `text-anchor`, so
   a DOM assertion on the camelCase attribute proves nothing. Anchor checks
   moved to measured bounding boxes.
4. **A subtitle crushed into vertical text** — in `Card`, the title is
   `flex: 0 0 auto`, so a long title squeezed its sibling `.sub` span into a
   16-px column that wrapped letter-by-letter. The fix was two lines of CSS
   (`flex-wrap: wrap` on the row, `white-space: nowrap` on the sub), and the
   verification was measuring each subtitle's computed height (19.4 px = one
   line).
5. **Trusting a screenshot too much** — a compressed JPEG seemed to show
   "handed over + (handed over…" where the source says `÷`. Grepping the
   source proved the code was right. Screenshot QA catches layout bugs; it is
   not proof of *text*, which is what code review and tests are for.

## Phase 4 — Honesty pass on the numbers

With everything working, I re-read every rendered statistic against its
formula. Outcomes:

- The impact ledger's headline assumes full displacement of a new purchase
  while the per-handover calculator discounts by condition. Rather than quietly
  unify them, the asymmetry is now documented (`docs/IMPACT.md` §4) and shown
  in the Method view.
- The Method page promised a test asserts "descriptor round-trips"; the test
  actually asserts *layout* round-trips (DIM = 100 and block offsets). The
  sentence was fixed to match the assertion — documentation follows code, never
  the reverse.

## What I would do with more time

1. Demand-pressure the matcher (more requests than ceiling) so the 2-swap path
   actually moves in a scored scenario, and make that a test.
2. A held-out *campus* (different seed) for the recogniser, to see whether the
   94% survives new cover styles rather than new photos of the same 12 books.
3. Real-photo pilot: 20 phone pictures of the school library's actual covers —
   the descriptor would meet lighting conditions the ten named degradations
   never imagined.
4. Guardian-consent flow design for an actual deployment (`docs/PRIVACY.md` is
   intent today, not code).

## What this taught me

The most valuable skill was **refusing to trust my own interesting numbers**.
Every figure in this repo either comes from `npm run test`, or is labelled as
an estimate with its range visible. Two of my proudest features (the
unweighted optimiser, the clean-gallery accuracy) were demoted by my own
measurement setups — and the project is better for having written that down.

## Phase 5 — Post-submission polish (Sep 6, 2026)

After the three Devpost submissions went SUBMITTED, the work was about
making sure a *fresh-clone* reviewer can confirm the README is honest in
under a minute, without having to believe any single sentence on its own.
This phase added the visible scaffolding that makes the trust claim testable,
not just claimed:

- **Preview gallery**: 7 hand-captured screenshots of the seven views,
  committed to `public/`, embedded at the top of the README so the judge
  sees what the product looks like before cloning. Generated via
  `playwright` over the live GitHub Pages deployment, so the screenshots
  *are* the running app at the time of commit.
- **30-second pitch**: a six-sentence elevator at the top of the README
  that the README used to skip past. Most judges spend 30 seconds on a
  README; the pitch is what that 30 seconds lands on.
- **`npm run verify` and `npm run verify:json`**: the same test suite
  that emits the four report blocks also drives a one-line verifier. The
  JSON variant is for CI / judge scripts. Both exit non-zero if any
  README-quoted number is missing from the live test output — i.e. if a
  future commit breaks a reported number without updating the README,
  `verify` fails, and the commit is rejected.
- **`docs/ROADMAP.md`**: ships / next / out-of-scope / open questions. The
  out-of-scope section is the most honest part — it says what the demo
  is *not* trying to be, so a judge does not have to ask.
- **`SECURITY.md`**: makes the zero-backend threat model explicit. There
  is no service to authenticate against, so the threat model is short,
  and the file says so.
- **Judge's 1-minute verification**: three commands a sceptical reviewer
  can run, in any order, to convince themselves the README matches the
  repository.
- **FAQ for judges**: the six questions the README used to invite in
  the comments — answered in advance, with file pointers, so a judge
  does not have to ask.
- **`CODEOWNERS`, `.editorconfig`**: small signals of "this project is
  ready for a second contributor", not just for one builder's portfolio.

The pattern across all of these is the same: **the README used to
*describe* the trust claim; now the trust claim is *executable*.**
