# Roadmap

What CampusLoop does today, what is next, and what is deliberately out of
scope. The point is not a wish list — it is to show that the team has thought
about which constraints of the demo are demo-only and which are load-bearing.

## Done (live in the demo)

| Area | What is shipped | Where |
|---|---|---|
| Recognition | 100-d hand-crafted cover descriptor, software-rasterised catalogue, cosine kNN with sigmoid confidence, two-protocol evaluation | `src/lib/{raster,covers,descriptor,classify}.ts` |
| Forecast | Pooled linear regression (11 features), mini-batch SGD, chronological 75/25 split, 80% bands | `src/lib/regress.ts` |
| Matching | Feasibility → 5-factor utility → Hopcroft-Karp ceiling → fairness-weighted greedy → 2-swap local search | `src/lib/matching.ts` |
| Impact ledger | One-line arithmetic, disclosed EF range, CSV export | `src/lib/impact.ts` |
| UI | Seven views (Overview, Scan, Loop, Match, Forecast, Impact, Method), hand-drawn SVG charts, hand-written CSS, no UI library | `src/views/`, `src/components/charts.tsx` |
| Behaviour tests | 8 tests that generate every number quoted in the README | `src/lib/metrics.test.ts` |
| Privacy | No backend, no telemetry, localStorage only (`campusloop.v1`) | `docs/PRIVACY.md` |
| Documentation | README + ML/IMPACT/PRIVACY/DEVELOPMENT_LOG deep-dives | `docs/` |
| Distribution | Public repo + GitHub Pages live demo + 4:47 walkthrough video | `public/campusloop_demo.mp4` |

## Next (six to twelve weeks)

- **More subjects, more degradations.** Extend the catalogue from 12 to 50
  titles and add four more photo degradations (low-light classroom, hand
  shadow, oblique angle, motion blur). The descriptor and the matching code
  do not need to change — only the seed data and the unit test matrix.
- **Subjective condition in the matching utility.** Right now `condition` is
  binary (like-new vs acceptable); a 3-level model (good / fair / poor)
  would let the librarian mark wear that does not affect legibility.
- **What-if** slider on the Forecast view: change the term-end flag or the
  feature-weight coefficients and watch the band widen / tighten. Useful
  teaching tool for librarians deciding whether to run a second swap day.
- **Offline-first PWA.** Service worker, web manifest, installable on a
  phone's home screen — the librarian's laptop is sometimes the school's
  only network-attached device.
- **Per-school seed import.** A CSV drop on the Overview view that
  overrides the synthetic campus with the actual roster, catalogue, and
  previous term's history.

## Deliberately out of scope

- **Backend service.** No central catalog, no global listings, no cross-
  school matching. Privacy is the product; a server breaks that.
- **Native mobile app.** Same features, different shell, more build
  complexity, no new value to the user. The web app installs as a PWA.
- **General-purpose textbook recognition.** The descriptor is tuned for the
  specific grid / cloth / photo motifs this renderer emits. A general
  textbook recogniser would need a neural network and a backend, which is
  not this product.
- **Author / publisher / ISBN database integration.** It would lock the demo
  to a third-party API and break the zero-network promise.

## Open questions for future reviewers

- Would a **peer school** swap (school A's surplus for school B's shortage)
  be a useful next step? It breaks the "no backend" rule unless mediated
  via quarterly static file drops.
- Could the **fairness weight** in matching be exposed to the librarian,
  with a clear default (0.25 today) and an explanation of what moving it
  does? This would be the most-user-visible knob to ship.
- Is there a **donor / NGO** use case (a public library, a community
  centre) where the demo numbers scale meaningfully? The next batch of
  tests should include at least one non-school catalogue.
