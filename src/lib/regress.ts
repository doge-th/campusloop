/**
 * End-of-term surplus forecast: a from-scratch mini-batch SGD linear regressor.
 *
 * The question the library wants answered is "how many copies will we be
 * unable to re-home at the end of this term, per subject?", because that number
 * decides whether to run a second swap day or book the recycling collection.
 *
 * Why write gradient descent by hand instead of `import regression from '...'`?
 *   - it keeps the bundle dependency-free and the maths auditable,
 *   - the loss curve and the learned coefficients become UI material, which is
 *     the difference between a dashboard and a black box,
 *   - it forces an honest evaluation: standardisation from training folds only,
 *     a strictly time-ordered split (no shuffling the future into the past), and
 *     a mean-value baseline the model has to beat.
 *
 * Target: discarded copy count for a subject in month t+1.
 *
 * Feature discipline matters more here than model capacity. Two rules were
 * learned the hard way while fitting this:
 *   1. Anything derived from month t+1 activity is leakage and banned. The
 *      calendar is the one exception -- whether the *target* month closes a
 *      term is known today, and the disposal rule in the data generator keys on
 *      exactly that flag, so using the current month's flag (as an earlier
 *      revision did) trains the model on the wrong variable and it fails to beat
 *      a mean baseline.
 *   2. A pooled cross-subject model needs an explicit scale feature. Subjects
 *      differ by an order of magnitude in surplus volume, so the rolling
 *      3-month means of unsold and discarded copies carry the level, while the
 *      calendar terms carry the shape.
 *
 * Everything else is an interaction or a lag: `term end x rolling unsold`
 * mirrors the multiplicative structure of the disposal rule.
 */

import type { LoopEvent, Subject, ForecastPoint } from './types'
import { SUBJECTS } from './types'
import { BOOK_BY_ID } from './seed'

export const FEATURE_NAMES = [
  'rolling unsold (3m)',
  'rolling discards (3m)',
  'discards last month',
  'listed this month',
  'hand-overs this month',
  'fill rate',
  'unsold this month',
  'target month closes a term',
  'season (sin)',
  'season (cos)',
  'term end x rolling unsold',
] as const

/** Months that end a term, from the school calendar used by the generator. */
function isTermEnd(mm: number): boolean {
  return mm === 6 || mm === 12
}

export interface Row {
  subject: Subject
  month: string
  features: number[]
  target: number
}

export interface TrainOptions {
  epochs?: number
  lr?: number
  batch?: number
  l2?: number
  seed?: number
}

export interface RegModel {
  w: number[]
  b: number
  mu: number[]
  sigma: number[]
  loss: number[]
  /** coefficients in original units, so the UI can say "each extra unsold copy
   *  adds X discards". */
  scaled: number[]
  options: Required<TrainOptions>
}

export interface ModelMetrics {
  mae: number
  rmse: number
  r2: number
  n: number
}

const SPLIT = 0.75
export { SPLIT }

function mulberry(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Aggregate the event log into per-(subject, month) training rows. */
export function buildRows(events: LoopEvent[]): Row[] {
  const bySubject = new Map<Subject, Map<string, { listed: number; over: number; discarded: number }>>()
  for (const e of events) {
    const book = BOOK_BY_ID.get(e.bookId)
    if (!book) continue
    let months = bySubject.get(book.subject)
    if (!months) {
      months = new Map()
      bySubject.set(book.subject, months)
    }
    const cell = months.get(e.month) ?? { listed: 0, over: 0, discarded: 0 }
    if (e.kind === 'listed') cell.listed++
    else if (e.kind === 'handed-over') cell.over++
    else if (e.kind === 'discarded') cell.discarded++
    months.set(e.month, cell)
  }

  const rows: Row[] = []
  for (const subject of SUBJECTS) {
    const months = bySubject.get(subject)
    if (!months) continue
    const keys = [...months.keys()].sort()
    // Rolling means over the three months ending at (and including) index i.
    // Computed from index <= i only, so a row for target month i+1 never sees i+1.
    const rolling = keys.map((_, i) => {
      const from = Math.max(0, i - 2)
      let unsold = 0
      let disc = 0
      for (let j = from; j <= i; j++) {
        const c = months.get(keys[j])!
        unsold += Math.max(0, c.listed - c.over)
        disc += c.discarded
      }
      const n = i - from + 1
      return { unsold: unsold / n, discarded: disc / n }
    })

    for (let i = 0; i < keys.length - 1; i++) {
      const cur = months.get(keys[i])!
      const next = months.get(keys[i + 1])!
      const targetMonth = Number(keys[i + 1].split('-')[1])
      const fill = cur.listed === 0 ? 0 : cur.over / cur.listed
      const unsold = Math.max(0, cur.listed - cur.over)
      const roll = rolling[i]
      const termEnd = isTermEnd(targetMonth) ? 1 : 0
      const ang = ((targetMonth - 1) / 12) * Math.PI * 2
      rows.push({
        subject,
        month: keys[i + 1],
        features: [
          roll.unsold,
          roll.discarded,
          cur.discarded,
          cur.listed,
          cur.over,
          fill,
          unsold,
          termEnd,
          Math.sin(ang),
          Math.cos(ang),
          termEnd * roll.unsold,
        ],
        target: next.discarded,
      })
    }
  }
  return rows
}

function standardizeFit(rows: Row[]): { mu: number[]; sigma: number[] } {
  const d = rows[0].features.length
  const mu = new Array(d).fill(0)
  const sigma = new Array(d).fill(0)
  for (const r of rows) for (let i = 0; i < d; i++) mu[i] += r.features[i]
  for (let i = 0; i < d; i++) mu[i] /= rows.length
  for (const r of rows) for (let i = 0; i < d; i++) sigma[i] += (r.features[i] - mu[i]) ** 2
  for (let i = 0; i < d; i++) sigma[i] = Math.sqrt(sigma[i] / rows.length) || 1
  return { mu, sigma }
}

function z(v: number[], mu: number[], sigma: number[]): number[] {
  return v.map((x, i) => (x - mu[i]) / sigma[i])
}

/** Mini-batch SGD with lr decay and L2 shrinkage. Logs epoch loss for the UI. */
export function trainSGD(rows: Row[], opts: TrainOptions = {}): RegModel {
  const o: Required<TrainOptions> = { epochs: 400, lr: 0.08, batch: 16, l2: 1e-3, seed: 99, ...opts }
  const { mu, sigma } = standardizeFit(rows)
  const d = rows[0].features.length
  const X = rows.map((r) => z(r.features, mu, sigma))
  const Y = rows.map((r) => r.target)
  const w = new Array(d).fill(0)
  let b = mean(Y)
  const r = mulberry(o.seed)
  const loss: number[] = []

  for (let epoch = 0; epoch < o.epochs; epoch++) {
    // Fisher-Yates shuffle, deterministic given the seed.
    const order = [...X.keys()]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    for (let start = 0; start < order.length; start += o.batch) {
      const idx = order.slice(start, start + o.batch)
      const gw = new Array(d).fill(0)
      let gb = 0
      for (const i of idx) {
        let pred = b
        for (let k = 0; k < d; k++) pred += w[k] * X[i][k]
        const err = pred - Y[i]
        for (let k = 0; k < d; k++) gw[k] += err * X[i][k]
        gb += err
      }
      const lr = o.lr / (1 + 0.004 * epoch)
      const n = idx.length
      for (let k = 0; k < d; k++) w[k] -= lr * (gw[k] / n + o.l2 * w[k])
      b -= lr * (gb / n)
    }
    if (epoch % 4 === 0 || epoch === o.epochs - 1) loss.push(round4(mse(w, b, X, Y)))
  }

  return { w, b, mu, sigma, loss, scaled: w.map((wk, i) => wk / sigma[i]), options: o }
}

function mse(w: number[], b: number, X: number[][], Y: number[]): number {
  let s = 0
  for (let i = 0; i < X.length; i++) {
    let p = b
    for (let k = 0; k < w.length; k++) p += w[k] * X[i][k]
    s += (p - Y[i]) ** 2
  }
  return s / X.length
}

export function predict(m: RegModel, features: number[]): number {
  const xz = z(features, m.mu, m.sigma)
  let p = m.b
  for (let i = 0; i < xz.length; i++) p += m.w[i] * xz[i]
  return p
}

function evaluateOn(m: RegModel, rows: Row[]): ModelMetrics {
  const preds = rows.map((r) => predict(m, r.features))
  const actual = rows.map((r) => r.target)
  const ybar = mean(actual)
  const mae = mean(preds.map((p, i) => Math.abs(p - actual[i])))
  const rmse = Math.sqrt(mean(preds.map((p, i) => (p - actual[i]) ** 2)))
  const ssTot = actual.reduce((s, y) => s + (y - ybar) ** 2, 0) || 1
  const ssRes = actual.reduce((s, y, i) => s + (y - preds[i]) ** 2, 0)
  return { mae, rmse, r2: 1 - ssRes / ssTot, n: rows.length }
}

/** Mean-of-train-targets baseline, the thing any model must beat. */
function baselineEval(train: Row[], test: Row[]): ModelMetrics {
  const ybar = mean(train.map((r) => r.target))
  const actual = test.map((r) => r.target)
  const yTrue = mean(actual)
  const mae = mean(actual.map((y) => Math.abs(y - ybar)))
  const rmse = Math.sqrt(mean(actual.map((y) => (y - ybar) ** 2)))
  const ssTot = actual.reduce((s, y) => s + (y - yTrue) ** 2, 0) || 1
  return { mae, rmse, r2: 1 - actual.reduce((s, y) => s + (y - ybar) ** 2, 0) / ssTot, n: test.length }
}

export interface FittedForecast {
  model: RegModel
  train: ModelMetrics
  test: ModelMetrics
  baseline: ModelMetrics
  coefficients: { name: string; value: number }[]
  residualSigma: number
}

/**
 * Fit a model with a strictly time-ordered split. `subject` may also be omitted
 * to pool every subject into a single campus-wide model, which is what the UI
 * does for the headline numbers (more rows, stabler estimate).
 *
 * The split is by calendar month, not by row index. Pooling subjects appends
 * their rows block by block, so slicing the array in place would put "the first
 * 75% of Mathematics, Physics, ..." in training and "the rest" in test -- an
 * easy score that quietly mixes future months into the past. Sorting by month
 * first makes the holdout genuinely out-of-time.
 */
export function fit(rows: Row[], subject?: Subject, opts?: TrainOptions): FittedForecast {
  const sel = (subject ? rows.filter((r) => r.subject === subject) : rows)
    .slice()
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
  const cut = Math.floor(sel.length * SPLIT)
  const trainRows = sel.slice(0, Math.max(4, cut))
  const testRows = sel.slice(Math.max(4, cut))
  const model = trainSGD(trainRows, opts)
  const test = evaluateOn(model, testRows)
  const resid = testRows.map((r) => r.target - predict(model, r.features))
  return {
    model,
    train: evaluateOn(model, trainRows),
    test,
    baseline: baselineEval(trainRows, testRows),
    coefficients: FEATURE_NAMES.map((name, i) => ({ name, value: round3(model.scaled[i]) })),
    residualSigma: Math.sqrt(mean(resid.map((x) => x * x)) || 0.01),
  }
}

/**
 * The board the Forecast view renders: per-subject expected unclaimed copies
 * next month with an 80% band, alongside what actually happened last term.
 */
export function forecastSubjects(rows: Row[], events: LoopEvent[]): ForecastPoint[] {
  const out: ForecastPoint[] = []
  for (const subject of SUBJECTS) {
    const sel = rows.filter((r) => r.subject === subject)
    if (sel.length < 6) continue
    const f = fit(rows, subject, { epochs: 300 })
    const last = sel[sel.length - 1]
    const predicted = Math.max(0, predict(f.model, last.features))
    const band = 1.2816 * f.residualSigma
    out.push({
      subject,
      predictedSurplus: round1(predicted),
      actualLastTerm: last.target,
      lower: Math.max(0, round1(predicted - band)),
      upper: round1(predicted + band),
    })
  }
  void events
  return out.sort((a, b) => b.predictedSurplus - a.predictedSurplus)
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / (xs.length || 1)
}
function round1(x: number): number {
  return Math.round(x * 10) / 10
}
function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000
}
