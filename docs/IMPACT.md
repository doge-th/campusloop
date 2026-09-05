# The Impact Model

The Impact view's headline ("56.7 kg CO2e avoided") is deliberately the
*boring* kind of number: one line of arithmetic on masses the app already
knows, with every constant visible in `src/lib/impact.ts` and the ranges shown
on screen next to the point estimate. No hidden multipliers.

A test (`impact ledger is one line of arithmetic`) re-derives the whole ledger
from raw event counts, so the UI can never drift from the formula.

---

## 1. Book mass (`seed.ts bookMass`)

```
paper  = pages × 0.0008 m²/page × 80 g/m²            (80 gsm stock)
massKg = paper + (hardcover ? 0.12 : 0.04)           (binding allowance)
```

rounded to grams. Example: *Calculus, 640 pp, hardcover* →
0.041 kg paper + 0.12 kg binder ≈ **0.161 kg**.

*Simplification, stated plainly:* the per-page footprint treats a leaf as a
single sheet face, which **understates** paper mass relative to real A4
textbooks. Every mass-derived figure in this app is therefore conservative.

## 2. Emission factor

`PAPER_EF` — published cradle-to-gate factors for printing-and-writing paper
vary with grid mix and fibre source. We use the mid-range of that literature
and treat the factor as a **user-visible input**, not a buried constant:

| low | default | high |
|---|---|---|
| 0.7 | 1.2 | 2.5 | kg CO2e per kg paper |

## 3. The ledger (`summarise`)

For the 20-month demo campus (814 listed / 516 handed over / 156 discarded):

```
divertedMassKg = Σ mass of handed-over copies        = 51.4 kg
landfillMassKg = Σ mass of discarded copies          = 15.2 kg
circularity    = handed ÷ (handed + discarded)       = 516/672 = 76.8%
co2eAvoidedKg  = divertedMassKg × PAPER_EF × (1 − 0.08)
               = 51.4 × 1.2 × 0.92                  = 56.7 kg
               range over the EF grid:               [33.1 – 118.1] kg
```

The `0.08` is `LOOP_OVERHEAD`: an allowance for the loop's own footprint
(transport within campus, re-labelling, cleaning). It is applied unconditionally
— the loop is not claimed to be zero-cost.

Top contributing subjects: Mathematics 11.9 kg, Physics 7.8 kg, History
7.2 kg — heavy books, high supply bias, matching follows the mass.

## 4. What the ledger deliberately **omits**

`summarise()` assumes every reused book **fully displaces** a new purchase.
That is the single most generous assumption in the model, and it is disclosed
here and in the Method view rather than smuggled in:

- The **per-handover** calculator `handoverImpact()` *does* discount for
  condition via a displacement factor:

  ```
  DISPLACEMENT = { like-new: 0.96, good: 0.90, fair: 0.75, worn: 0.55 }
  gross      = massKg × EF × DISPLACEMENT[condition]
  transport  = tripsByCarKm × 171 g/km      (average petrol hatchback)
  net        = gross × (1 − LOOP_OVERHEAD) − transport
  ```

- So the aggregate headline (56.7 kg) and an individual book's net figure use
  different rigour on purpose: the ledger optimises for auditability ("one
  line of arithmetic"), the per-handover view optimises for honesty about a
  specific transaction. A worn book that someone drove 3 km to collect can
  have a genuinely small net benefit, and `handoverImpact` will show that.

If you want the conservative campus total, run every handover through
`handoverImpact` instead — the Method view quotes both formulas side by side.

## 5. Equivalences (rendered as footnotes, never as the headline)

- **Tree-years**: `kg CO2e ÷ 21` — a mature tree absorbs roughly 21 kg
  CO2e/year (USDA Forest Service single-tree growth estimates). We say
  "tree-years", *not* "trees saved".
- **Kilometres not driven**: `kg CO2e × 1000 ÷ 400` — EPA average mid-size
  petrol passenger car, ~400 g CO2e/km. This is a *display* conversion only;
  the transport **penalty** inside `handoverImpact` uses the 171 g/km hatchback
  figure, which is the more relevant "who actually collected the book" trip.

## 6. Honest limitations

1. Synthetic campus: masses come from the seeded generator, so totals scale
   with `bookMass`'s conservatism (see §1).
2. Landfill side: we count diverted *mass*, not modelled methane avoided —
   the CO2e figure is displaced-manufacture credit only.
3. Displacement is a modelling choice (§4), and the EF grid spread of
   [33.1 – 118.1] is wide because the underlying literature is genuinely wide.
   The point estimate is not the most defensible number; the range is the
   defensible number.
