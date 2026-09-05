# Machine Learning, By Hand

Three models live in this app: a cover **recogniser**, a stranding
**forecaster**, and a matching **optimizer** (an optimizer, strictly speaking —
but it is scored like a model here). All three are implemented from scratch in
TypeScript with zero ML dependencies, for two reasons: a reviewer can read
every line, and the app can run offline on a school Chromebook.

All numbers in this document are copied from the committed test output
(`npm run test`), which recomputes them from code at seed `20260905`.

---

## 1. Cover recognition

### 1.1 Pipeline

```
book spec ──raster.ts──> 64px cover render ──descriptor.ts──> 100-dim vector
photo     ──classify.ts (simulatePhoto, 10 named degradations)──> same path
match     = cosine kNN over the gallery; top-1 label, margin ──sigmoid──> confidence
```

Covers are **software-rasterised** (`src/lib/covers.ts` draws grid/cloth/photo
motifs from a per-book spec into an RGBA buffer via `raster.ts`). The photo
probe pipeline (`simulatePhoto` in `classify.ts`) then pushes that render
through one of ten named camera degradations:

`straight snapshot`, `tilted 7deg`, `tilted -9deg`, `tight crop`,
`dark classroom`, `window glare`, `out of focus`, `handheld motion`,
`warm lamp + noise`, `crop + tilt + blur`.

### 1.2 The descriptor (100 dimensions, 5 feature blocks)

Defaults: 64-px image, 4×4 grid, 8 hue bins (`descriptor.ts DEFAULTS`).

| Block | Dims | Content |
|---|---|---|
| Local HSV + edge grid | 4×4×5 = 80 | per cell: `sin(hue)`, `cos(hue)`, saturation, value, edge energy |
| Ink hue histogram | 8 | chromatic pixels binned into 8 hue sectors |
| Row ink profile | 4 | vertical placement of ink |
| Column ink profile | 4 | horizontal placement of ink |
| Global scalars | 4 | ink ratio, mean saturation, busyness, aspect |

Vectors are L2-normalised `Float32Array`s, so cosine similarity is a dot
product. Using `sin/cos` of hue (rather than hue itself) removes the 0/2π seam;
the row/column profiles survive mild crops; the edge grid survives global
colour shifts.

### 1.3 Evaluation protocols — and why there are two

Naive leave-one-out would compare a degraded photo against a *clean* gallery
image, which is easier than anything the app will meet in a hallway. Both
protocols therefore use **240 probes total = 12 covers × 10 degradations × 2
protocols**, chance level = 1/12 = 8.3%.

- **Protocol A** — gallery is the clean catalogue artwork (what a library
  system actually holds); probes are degraded photos. **Top-1 96.7%.**
- **Protocol B** — harder and the one to trust: one *random* degradation
  becomes the gallery image and a *different* one becomes the probe, so
  nothing clean is ever compared to anything, and the classifier cannot lean
  on "both images are clean" shortcuts. **Top-1 94.2%.**

Mean reported confidence is 90.5%, tracking accuracy honestly (the margin
sigmoid is not tuned to flatter). The scan view auto-confirms only above
`AUTO_CONFIRM = 0.72` and otherwise asks the student to pick from the top
candidates.

### 1.4 Where it fails (the useful part)

Per-degradation accuracy, n = 12 each: 8 conditions at **100%**;
`dark classroom` and `warm lamp + noise` at **83.3%** — both are global
colour/luminance shifts, exactly what an HSV+edge descriptor is weakest
against. The two recorded confusions (`bk-03↔bk-08` ×2, `bk-08↔bk-10` ×2) are
between books with similar cream-on-green cloth covers. The UI responds by
routing low-confidence results to manual confirm instead of guessing.

### 1.5 Ablation

Each block is removed **from both sides** (gallery and probe), so the drop is
attributable to information, not vector length:

| Block removed | Protocol A top-1 | Δ vs full (96.7%) |
|---|---|---|
| Local HSV + edge grid | 66.7% | **−30.0 pts** |
| Ink hue histogram | 96.7% | 0.0 |
| Row ink profile | 96.7% | 0.0 |
| Column ink profile | 96.7% | 0.0 |
| Global scalars | 96.7% | 0.0 |

The 80-dim local block carries essentially all the signal; the 20 global dims
are cheap insurance under the crop/rotation degradations where the local grid
gets re-seated. That insurance never *hurts*, which is why it stays.

---

## 2. Stranding forecast

### 2.1 Target and model

Target: **unsold copies of a subject at the end of month t+1** (what will be
stranded next month). One **pooled** linear model across all subjects — a
per-subject fit would be a 16-point lookup table pretending to be a model.

11 features (standardised), `regress.ts FEATURE_NAMES`:

| Feature | Std. coef. |
|---|---|
| rolling unsold (3m) | +0.382 |
| rolling discards (3m) | +0.201 |
| discards last month | −0.197 |
| listed this month | −0.002 |
| hand-overs this month | −0.054 |
| fill rate | +0.367 |
| unsold this month | +0.120 |
| **target month closes a term** | **+1.018** |
| season (sin) | −0.030 |
| season (cos) | −0.138 |
| term end × rolling unsold | −0.173 |

Feature discipline, learned the hard way while fitting this:

1. Anything derived from month t+1 activity is **leakage** and banned. The
   calendar is the one exception — whether the *target* month closes a term is
   knowable today.
2. `term end` refers to the **target** month, not the current one.
3. A pooled model needs explicit scale features (the 3-month means carry the
   level); raw month counts would make subjects incomparable.

### 2.2 Training and evaluation

Hand-written **mini-batch SGD** with learning-rate decay and L2 shrinkage
(`fit()` logs per-epoch MSE, which the Method view renders as the loss curve).
Chosen over a closed-form normal equation because the loss curve is honest UI
material and because it keeps the whole stack readable.

Evaluation is **chronological**: rows are ordered by month, the first 75%
(142 rows) train, the last 25% (48 rows) hold out. **No shuffling, ever** —
random folds would let the model see the future.

| | holdout | mean baseline |
|---|---|---|
| MAE | **0.755** | 0.844 |
| RMSE | **0.964** | 1.046 |
| R² | **+0.140** | −0.011 |

In-sample MAE 0.773 / R² 0.142 — the model does not overfit; it barely fits,
which is the honest shape of a 48-point holdout on count data. The fit test
asserts it beats the baseline *and* is deterministic (same data → identical
coefficients).

Uncertainty bands on the forecast view are **80% intervals** from the holdout
residual RMS: `±1.2816 × residualSigma`, floored at 0. For example the last
roll-out predicted Mathematics 4.3 [2.1–6.5] and Art & Design 0.3 [0–3.1] —
the latter's band correctly swallowed the actual 5, a reminder that low-count
subjects are noise-dominated.

---

## 3. Fair matching

Not learning — optimisation with a value judgement baked into the objective.

### 3.1 Utility

`pairUtility(listing, request)` (`matching.ts`) is the product of five
interpretable factors (infeasible pairs score −1 and never enter):

- base value by condition, 0.40 … 0.95;
- request **tier boost**: tier 2 ×1.45, tier 3 ×1.315 (tier 3 = supported
  place, e.g. a student with an assigned-access need);
- **idle bonus** 1.0 … 1.2 (one step per week listing has sat, capped at 6);
- condition verified by a scan: ×1.04;
- urgency (deadline within 4 days): ×1.15.

The objective adds a **fairness term** (`fairnessWeight = 0.45`): serving
tier-2/3 requests is weighted above raw utility, and `idleWeight = 0.05` keeps
long-idle listings in play.

### 3.2 Algorithm

1. **Hopcroft-Karp** (unweighted bipartite max cardinality) computes the
   *ceiling*: the most pairs anyone could ever make. Report: **78**.
2. **Utility-greedy with fairness**: repeatedly take the feasible pair with the
   best fairness-weighted utility. Result: **78 pairs — provably at the
   cardinality ceiling** — objective **73.67**.
3. **2-swap local search** tries to raise the objective at fixed cardinality
   (max 500 iterations, deterministic): on this campus the greedy was already
   a local optimum (73.67 → 73.67, 0 iterations), and the test suite asserts
   the machinery is correct and terminating.

### 3.3 Baselines (same data, same feasibility)

| Strategy | Pairs | Objective | Tier-2/3 requests served |
|---|---|---|---|
| First-fit scan order | 78 | 66.80 | 34 |
| Utility greedy, **no** fairness weight | 78 | 70.99 | **29** |
| Ours (fairness-weighted) + 2-swap | **78** | **73.67** | **34/34** |

That middle row is the entire argument for the fairness term: maximising raw
utility *silently drops five supported students* while scoring higher on the
unweighted objective. The tests assert the matcher never exceeds the ceiling
and is deterministic; each rendered pair carries a `why` string (e.g.
"Voices · like-new condition · supported place (+45%) · needed by 2026-09-09 ·
condition verified by scan") so allocation is audit-friendly, not vibes.
