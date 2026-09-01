import { expect, test } from 'vitest'
import { BOOKS, BOOK_BY_ID, DATA } from './seed'
import { DEFAULTS, DIM, FEATURE_BLOCKS, cosine, extract, l2normalize, layoutFor } from './descriptor'
import { rasterizeCover } from './covers'
import { ablation, buildGallery, evaluate } from './classify'
import { FEATURE_NAMES, SPLIT, buildRows, fit, forecastSubjects } from './regress'
import { matchDemand, type MatchDiagnostics } from './matching'
import type { MatchResult } from './types'
import {
  CAR_GPerKM,
  DISPLACEMENT,
  LOOP_OVERHEAD,
  PAPER_EF,
  carKmEquivalent,
  handoverImpact,
  summarise,
  toCsv,
  treesEquivalent,
} from './impact'

/**
 * This file is the source of truth for every number quoted in README.md,
 * docs/ML.md and the Method view. Run `npm run test` and the whole report is
 * printed; the assertions only guard against regressions.
 */

function pct(x: number): string {
  return (100 * x).toFixed(1) + '%'
}

/** Node's `util.format` has no width specifiers, so padding is manual. */
function pad(s: string, n: number): string {
  return s.padEnd(n, ' ')
}

test('recognition report', { timeout: 180_000 }, () => {
  const gallery = buildGallery(BOOKS)
  const rep = evaluate(BOOKS, gallery)
  console.log('\n=== RECOGNITION (12 covers, %d-dim descriptor) ===', DIM)
  console.log('protocol A top-1 : %s', pct(rep.accuracy1))
  console.log('protocol A top-3 : %s', pct(rep.accuracy3))
  console.log('protocol B top-1 : %s', pct(rep.splitAccuracy1))
  console.log('chance level     : %s', pct(rep.chanceLevel))
  console.log('mean confidence  : %s', pct(rep.meanConfidence))
  console.log('probes           : %d', rep.total)
  console.log('by transform:')
  for (const t of rep.byTransform) console.log('  ' + pad(t.transform, 20) + ' ' + pct(t.accuracy) + ' (n=' + t.n + ')')
  console.log('confusions:', rep.confusions.slice(0, 4))

  expect(rep.accuracy1).toBeGreaterThan(3 * rep.chanceLevel)
  expect(rep.accuracy3).toBeGreaterThanOrEqual(rep.accuracy1)
  expect(rep.splitAccuracy1).toBeGreaterThan(3 * rep.chanceLevel)
  // Per-transform guard. A NaN bug in the blur used to silently drop three
  // transforms to chance level while the aggregate still looked respectable, so
  // the aggregate alone is not an acceptable regression gate.
  for (const t of rep.byTransform) {
    expect(t.accuracy).toBeGreaterThan(3 * rep.chanceLevel)
  }

  const abl = ablation(BOOKS)
  console.log('ablation (protocol A top-1 when a block is zeroed):')
  for (const a of abl) console.log('  ' + pad(a.block, 24) + ' ' + pct(a.accuracy) + '  drop ' + pct(a.drop))
  // The dominant block has to actually carry signal, otherwise the descriptor is decoration.
  expect(Math.max(...abl.map((a) => a.drop))).toBeGreaterThan(0.1)
  // Ordering. The blocks are reported in descriptor order, and the spatial
  // grid must be what carries the covers apart -- if a scalar block ever beats
  // it, the pipeline is matching on page size rather than on artwork.
  expect(abl.map((a) => a.block)).toEqual(FEATURE_BLOCKS.map((b) => b.name))
  const ranked = [...abl].sort((a, b) => b.drop - a.drop)
  expect(ranked[0].block).toBe('local HSV + edge grid')
  expect(ranked[0].drop).toBeGreaterThan(ranked[1].drop)
})

test('forecast report', { timeout: 60_000 }, () => {
  const rows = buildRows(DATA.history)
  const f = fit(rows)
  console.log('\n=== FORECAST (pooled linear model, chronological 75/25 split) ===')
  console.log('rows: %d | train %d / holdout %d', rows.length, f.train.n, f.test.n)
  console.log('holdout MAE   model %s | baseline %s', f.test.mae.toFixed(3), f.baseline.mae.toFixed(3))
  console.log('holdout RMSE  model %s | baseline %s', f.test.rmse.toFixed(3), f.baseline.rmse.toFixed(3))
  console.log('holdout R2    model %s | baseline %s', f.test.r2.toFixed(3), f.baseline.r2.toFixed(3))
  console.log('in-sample MAE %s | R2 %s', f.train.mae.toFixed(3), f.train.r2.toFixed(3))
  console.log('standardised coefficients:')
  for (const c of f.coefficients) {
    console.log('  ' + pad(c.name, 28) + (c.value >= 0 ? ' +' : ' ') + c.value.toFixed(3))
  }
  const fc = forecastSubjects(rows, DATA.history)
  console.log('next-month surplus forecast: %s', fc.map((p) => `${p.subject} ${p.predictedSurplus} [${p.lower}-${p.upper}] vs ${p.actualLastTerm}`).join(' | '))

  expect(f.test.mae).toBeLessThan(f.baseline.mae)
  expect(f.test.r2).toBeGreaterThan(f.baseline.r2)
  // The split is chronological, so no row can be in both halves and the
  // holdout must start after the last training month. Without this the model
  // could score well by memorising the future.
  expect(f.train.n + f.test.n).toBe(rows.length)
  expect(f.train.n).toBe(Math.max(4, Math.floor(rows.length * SPLIT)))
  const byMonth = [...rows].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
  expect(byMonth[f.train.n - 1].month <= byMonth[f.train.n].month).toBe(true)
  expect(f.coefficients.length).toBe(FEATURE_NAMES.length)
  // Training is seeded SGD: identical input must give identical coefficients.
  expect(fit(rows).coefficients).toEqual(f.coefficients)
})

test('matching report', () => {
  const listings = DATA.listings.filter((l) => l.status === 'open')
  const requests = DATA.requests.filter((r) => r.status === 'open')
  const res = matchDemand(listings, requests, BOOK_BY_ID) as MatchResult & MatchDiagnostics
  console.log('\n=== MATCHING (%d listings x %d requests) ===', listings.length, requests.length)
  console.log('feasible edges    : %d', res.feasibleEdges)
  console.log('cardinality       : first-fit %d -> ours %d -> theoretical ceiling %d', res.naiveSize, res.finalSize, res.ceiling)
  console.log('objective         : first-fit %s -> no-fairness %s -> ours %s', res.naiveUtility.toFixed(2), res.zeroFairnessUtility.toFixed(2), res.utilityAfter.toFixed(2))
  console.log('utility           : before improve %s -> after %s (iterations %d)', res.utilityBefore.toFixed(2), res.utilityAfter.toFixed(2), res.iterations)
  console.log('supported served  : first-fit %d | no-fairness %d | ours %d / %d', res.naiveSupportedServed, res.zeroFairnessSupportedServed, res.supportedServed, res.supportedTotal)
  console.log('pairs             : %d | unmatched %d', res.pairs.length, res.unmatched.length)
  console.log('sample pair       : %s', JSON.stringify(res.pairs[0], null, 0))

  // The optimiser must never be worse than the naive policy on either axis.
  expect(res.finalSize).toBe(res.ceiling)
  expect(res.finalSize).toBeGreaterThanOrEqual(res.naiveSize)
  expect(res.utilityAfter).toBeGreaterThanOrEqual(res.naiveUtility)
  expect(res.utilityAfter).toBeGreaterThanOrEqual(res.zeroFairnessUtility)
  expect(res.supportedServed).toBeGreaterThanOrEqual(res.naiveSupportedServed)
})

test('impact report', () => {
  const s = summarise(DATA.history, BOOK_BY_ID)
  console.log('\n=== IMPACT (20 simulated months) ===')
  console.log('listed %d | handed over %d | discarded %d', s.listed, s.handedOver, s.discarded)
  console.log('diverted %s kg | landfill %s kg | circularity %s', s.divertedKg, s.landfillKg, pct(s.circularity))
  console.log('CO2e avoided %s kg [%s - %s]', s.co2eKg, s.co2eLowKg, s.co2eHighKg)
  console.log('top subjects: %s', s.bySubject.slice(0, 3).map((b) => `${b.subject} ${b.co2eKg}kg`).join(', '))
  expect(s.co2eKg).toBeGreaterThan(0)
  expect(s.co2eLowKg).toBeLessThan(s.co2eHighKg)
})

/**
 * Everything below asserts *behaviour*, not appearance. These are the guards
 * that let the Method view claim the numbers are reproducible: the descriptor
 * layout matches its own labels, the matcher is deterministic and produces a
 * legal matching, and the impact ledger really is one line of arithmetic.
 */

test('descriptor layout round-trips', () => {
  expect(DIM).toBe(100)
  const L = layoutFor(DEFAULTS)
  // The five named blocks the Method view prints have to add up to the vector.
  expect(FEATURE_BLOCKS.reduce((n, b) => n + b.dim(L), 0)).toBe(DIM)

  const img = rasterizeCover(BOOKS[0])
  const v = extract(img)
  expect(v.length).toBe(DIM)
  const alt = { ...DEFAULTS, size: 48, grid: 3, hueBins: 6 }
  expect(extract(img, alt).length).toBe(layoutFor(alt).length)

  // Determinism and normalisation: the gallery is stored normalised, so the
  // cosine score has to equal the dot product, and re-normalising must be a
  // no-op rather than a slow drift.
  expect(Array.from(extract(img))).toEqual(Array.from(v))
  const nv = l2normalize(v)
  expect(Array.from(l2normalize(nv))).toEqual(Array.from(nv))
  expect(cosine(nv, nv)).toBeCloseTo(1, 5)
  // A different cover must not be a clone of this one.
  expect(cosine(nv, l2normalize(extract(rasterizeCover(BOOKS[1]))))).toBeLessThan(0.999)
})

test('matcher is deterministic and returns a legal matching', () => {
  const listings = DATA.listings.filter((l) => l.status === 'open')
  const requests = DATA.requests.filter((r) => r.status === 'open')
  const first = matchDemand(listings, requests, BOOK_BY_ID) as MatchResult & MatchDiagnostics
  const second = matchDemand(listings, requests, BOOK_BY_ID) as MatchResult & MatchDiagnostics
  expect(second.pairs).toEqual(first.pairs)
  expect(second.unmatched).toEqual(first.unmatched)
  expect(second.utilityAfter).toBe(first.utilityAfter)

  // Legality: no copy and no request is used twice, both sides really were
  // open, and a pair always agrees on which book it is about.
  const lById = new Map(listings.map((l) => [l.id, l]))
  const rById = new Map(requests.map((r) => [r.id, r]))
  const usedL = new Set<string>()
  const usedR = new Set<string>()
  for (const p of first.pairs) {
    expect(usedL.has(p.listingId)).toBe(false)
    expect(usedR.has(p.requestId)).toBe(false)
    usedL.add(p.listingId)
    usedR.add(p.requestId)
    expect(p.bookId).toBe(lById.get(p.listingId)?.bookId)
    expect(p.bookId).toBe(rById.get(p.requestId)?.bookId)
    expect(p.utility).toBeGreaterThan(0)
    expect(p.why.length).toBeGreaterThan(0)
  }
  expect(first.pairs.length).toBe(first.finalSize)
  expect(first.pairs.length + first.unmatched.length).toBe(requests.length)
  expect(first.finalSize).toBeLessThanOrEqual(first.ceiling)
  expect(first.supportedServed).toBeLessThanOrEqual(first.supportedTotal)
  // Every unserved request owes the student an explanation, not silence.
  for (const u of first.unmatched) expect(u.reason.length).toBeGreaterThan(0)
})

test('impact ledger is one line of arithmetic', () => {
  const s = summarise(DATA.history, BOOK_BY_ID)
  const known = DATA.history.filter((e) => BOOK_BY_ID.has(e.bookId))
  const mass = (kind: string) => known.filter((e) => e.kind === kind).reduce((n, e) => n + e.massKg, 0)
  const count = (kind: string) => known.filter((e) => e.kind === kind).length
  const r1 = (x: number) => Math.round(x * 10) / 10

  expect(s.listed).toBe(count('listed'))
  expect(s.handedOver).toBe(count('handed-over'))
  expect(s.discarded).toBe(count('discarded'))
  expect(s.divertedKg).toBe(r1(mass('handed-over')))
  expect(s.landfillKg).toBe(r1(mass('discarded')))

  // The headline number is diverted mass times the default factor times the
  // share that survives loop overhead. Nothing else is in there.
  expect(s.co2eKg).toBe(r1(mass('handed-over') * PAPER_EF.default * (1 - LOOP_OVERHEAD)))
  expect(s.co2eLowKg).toBe(r1(mass('handed-over') * PAPER_EF.low * (1 - LOOP_OVERHEAD)))
  expect(s.co2eHighKg).toBe(r1(mass('handed-over') * PAPER_EF.high * (1 - LOOP_OVERHEAD)))
  expect(s.co2eLowKg).toBeLessThan(s.co2eKg)
  expect(s.co2eKg).toBeLessThan(s.co2eHighKg)
  expect(s.circularity).toBeCloseTo(s.handedOver / (s.handedOver + s.discarded), 6)

  // Both breakdowns are the same sum cut two ways (each row is rounded on its
  // own, hence the tolerance instead of equality).
  expect(s.bySubject.reduce((n, b) => n + b.handedOver, 0)).toBe(s.handedOver)
  expect(s.byMonth.reduce((n, m) => n + m.handedOver, 0)).toBe(s.handedOver)
  expect(Math.abs(s.bySubject.reduce((n, b) => n + b.co2eKg, 0) - s.co2eKg)).toBeLessThan(0.6)
  expect(Math.abs(s.byMonth.reduce((n, m) => n + m.co2eKg, 0) - s.co2eKg)).toBeLessThan(1.1)
  expect(s.bySubject[0].co2eKg).toBeGreaterThanOrEqual(s.bySubject[s.bySubject.length - 1].co2eKg)
  expect(s.byMonth[s.byMonth.length - 1].month >= s.byMonth[0].month).toBe(true)

  // A single hand-over obeys the same identity plus the transport term, which
  // is what the slider in the Impact view moves.
  const book = BOOKS[0]
  const foot = handoverImpact(book, 'good', 0)
  expect(foot.newCopiesAvoided).toBe(DISPLACEMENT.good)
  expect(foot.co2eKg).toBe(r1(book.massKg * PAPER_EF.default * DISPLACEMENT.good * (1 - LOOP_OVERHEAD)))
  expect(Math.abs(foot.co2eKg - handoverImpact(book, 'good', 10).co2eKg)).toBeCloseTo((10 * CAR_GPerKM) / 1000, 0)

  // The two "equivalent to" figures are unit conversions, not extra modelling.
  expect(treesEquivalent(s.co2eKg)).toBe(r1(s.co2eKg / 21))
  expect(carKmEquivalent(s.co2eKg)).toBe(Math.round((s.co2eKg * 1000) / 400))
})

test('csv export escapes what it must', () => {
  expect(toCsv([])).toBe('')
  const csv = toCsv([
    { month: '2026-09', note: 'plain', n: 3 },
    { month: '2026-10', note: 'has, comma', n: 4 },
    { month: '2026-11', note: 'says "hi"', n: 5 },
    { month: '2026-12', note: '', n: 6 },
  ])
  expect(csv).toBe(
    ['month,note,n', '2026-09,plain,3', '2026-10,"has, comma",4', '2026-11,"says ""hi""",5', '2026-12,,6'].join('\n'),
  )
})
