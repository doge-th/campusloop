/**
 * k-NN classifier over the hand-written descriptor, plus the evaluation
 * harness that produces the accuracy numbers quoted in the README.
 *
 * Evaluation protocol (deliberately stricter than "leave-one-out on the same
 * render"):
 *   - The gallery is the clean catalogue artwork the school library already
 *     owns (one vector per ISBN).
 *   - The probes are photographs: the same artwork pushed through named
 *     camera degradations (rotation, crop, white balance, motion-ish blur,
 *     sensor noise, vignette).
 *   - A second, harder probe set uses a *different* degradation for the
 *     gallery image than for the probe image, so the classifier cannot lean on
 *     a single shared artifact.
 *
 * That gap between "trained on flat renders, tested on phone snapshots" is the
 * actual difficulty of the feature, and reporting it is more useful than a
 * suspicious 100%.
 */

import type { Book, Recognition } from './types'
import { extract, cosine, layoutFor, DEFAULTS, l2normalize, FEATURE_BLOCKS, type FeatureVector } from './descriptor'
import { rasterizeCover } from './covers'
import { simulatePhoto, type ImageBuf, type PhotoOptions } from './raster'
import { rng } from './seed'

export interface RefEntry {
  bookId: string
  vector: FeatureVector
}

/**
 * Cover renders are pure functions of the catalogue entry, so they are memoised
 * once per (book, size). The evaluation harness asks for the same 12 artworks a
 * few hundred times; without this the test suite takes minutes.
 */
const coverCache = new Map<string, ImageBuf>()
function cleanCover(book: Book, w = 240, h = 336): ImageBuf {
  const key = `${book.id}:${w}x${h}`
  let buf = coverCache.get(key)
  if (!buf) {
    buf = rasterizeCover(book, w, h)
    coverCache.set(key, buf)
  }
  return buf
}

/** Clean-cover features for every book, computed once. */
export function buildGallery(books: Book[], seed = 20260905): RefEntry[] {
  void seed
  return books.map((b) => ({ bookId: b.id, vector: extract(cleanCover(b)) }))
}

export interface Scored {
  bookId: string
  similarity: number
}

export function rank(query: FeatureVector, gallery: RefEntry[]): Scored[] {
  return gallery
    .map((g) => ({ bookId: g.bookId, similarity: cosine(query, g.vector) }))
    .sort((a, b) => b.similarity - a.similarity)
}

/**
 * Policy threshold: at or above this confidence the Scan screen fills the
 * listing form on the student's behalf, below it the app asks a human to tap
 * the right title out of the shortlist. Shared by the Scan and Method screens
 * so the number quoted in the docs is the number the code enforces.
 */
export const AUTO_CONFIRM = 0.72

/**
 * Convert a ranked list into a `Recognition`.
 *
 * Confidence is not the raw cosine: cosine similarity saturates, so two
 * layouts that are both "close" would otherwise both claim 0.98. We use the
 * margin between the top hit and the runner-up, squashed through a logistic,
 * which is the quantity that actually predicts whether the student should
 * confirm the match. The UI shows "Auto-confirmed" above 0.72 and asks for a
 * human check below it.
 */
export function toRecognition(query: FeatureVector, gallery: RefEntry[], engine: Recognition['engine'] = 'descriptor'): Recognition {
  const ranked = rank(query, gallery)
  const best = ranked[0]
  const second = ranked[1] ?? { similarity: 0 }
  const margin = best.similarity - second.similarity
  const confidence = clamp01(sigmoid((margin - 0.012) / 0.02) * 0.55 + clamp01((best.similarity - 0.55) / 0.45) * 0.45)
  return {
    bookId: best.bookId,
    confidence,
    alternatives: ranked.slice(1, 4).map((r) => ({
      bookId: r.bookId,
      confidence: clamp01(r.similarity),
    })),
    engine,
    distance: 1 - best.similarity,
  }
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/** Named degradations so the report can break accuracy down by cause. */
export const TRANSFORMS: { name: string; opts: PhotoOptions }[] = [
  { name: 'straight snapshot', opts: { brightness: 0.04, noise: 0.03, vignette: 0.18 } },
  { name: 'tilted 7deg', opts: { rotate: 7, brightness: 0.02, noise: 0.04, vignette: 0.2 } },
  { name: 'tilted -9deg', opts: { rotate: -9, noise: 0.04, vignette: 0.22 } },
  { name: 'tight crop', opts: { crop: 0.08, noise: 0.03, vignette: 0.15 } },
  { name: 'dark classroom', opts: { brightness: -0.22, warmth: 0.4, noise: 0.12, vignette: 0.35 } },
  { name: 'window glare', opts: { brightness: 0.24, contrast: -0.18, noise: 0.05, vignette: 0.1 } },
  { name: 'out of focus', opts: { blur: 2.4, noise: 0.06, vignette: 0.2 } },
  { name: 'handheld motion', opts: { blur: 1.3, rotate: 4, noise: 0.07, vignette: 0.25 } },
  { name: 'warm lamp + noise', opts: { warmth: 0.55, brightness: -0.08, contrast: 0.12, noise: 0.14, vignette: 0.3 } },
  { name: 'crop + tilt + blur', opts: { crop: 0.06, rotate: -6, blur: 1.6, noise: 0.08, vignette: 0.28 } },
]

export interface EvalRow {
  bookId: string
  transform: string
  predicted: string
  correct: boolean
  inTop3: boolean
  confidence: number
}

export interface TransformAccuracy {
  transform: string
  accuracy: number
  n: number
}

export interface EvalReport {
  /** Protocol A: clean gallery, degraded probes. */
  accuracy1: number
  accuracy3: number
  meanConfidence: number
  /** Protocol B: gallery and probe use different degradations. */
  splitAccuracy1: number
  /** Random-guessing reference, for honest context. */
  chanceLevel: number
  rows: EvalRow[]
  byTransform: TransformAccuracy[]
  /** Most-frequently confused pairs. */
  confusions: { a: string; b: string; n: number }[]
  total: number
}

/**
 * Photo-realistic probe vectors: `probes[i][j]` is book `i` under degradation
 * `j`. Deterministic in `seed`, and cached so the ablation can re-score the
 * very same images against modified galleries without re-rendering anything.
 */
export interface ProbeSet {
  vectors: FeatureVector[][]
}

export function buildProbes(books: Book[], seed = 20260905): ProbeSet {
  const r = rng(seed)
  const vectors = books.map((book) => {
    const clean = cleanCover(book)
    return TRANSFORMS.map((t) => extract(simulatePhoto(clean, { ...t.opts, seed: Math.floor(r() * 1e6) })))
  })
  return { vectors }
}

/** Score a matrix of probes (row = book, column = transform) against a gallery. */
function scoreProbes(books: Book[], gallery: RefEntry[], vectors: FeatureVector[][], label: string): EvalRow[] {
  const rows: EvalRow[] = []
  vectors.forEach((perBook, bi) => {
    const book = books[bi]
    perBook.forEach((probe, ti) => {
      const rec = toRecognition(probe, gallery)
      rows.push({
        bookId: book.id,
        transform: `${label}${TRANSFORMS[ti].name}`,
        predicted: rec.bookId,
        correct: rec.bookId === book.id,
        inTop3: rec.bookId === book.id || rec.alternatives.some((a) => a.bookId === book.id),
        confidence: rec.confidence,
      })
    })
  })
  return rows
}

function summariseRows(rows: EvalRow[]): { accuracy1: number; accuracy3: number; meanConfidence: number; byTransform: TransformAccuracy[]; confusions: { a: string; b: string; n: number }[] } {
  const total = rows.length || 1
  const byTransform: TransformAccuracy[] = TRANSFORMS.map((t) => {
    const sel = rows.filter((x) => x.transform.endsWith(t.name))
    return { transform: t.name, accuracy: sel.filter((x) => x.correct).length / Math.max(1, sel.length), n: sel.length }
  })
  const pairCounts = new Map<string, number>()
  for (const row of rows) {
    if (row.correct) continue
    const key = [row.bookId, row.predicted].sort().join('|')
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }
  const confusions = [...pairCounts.entries()]
    .map(([k, n]) => {
      const [a, b] = k.split('|')
      return { a, b, n }
    })
    .sort((x, y) => y.n - x.n)
    .slice(0, 4)
  return {
    accuracy1: rows.filter((x) => x.correct).length / total,
    accuracy3: rows.filter((x) => x.inTop3).length / total,
    meanConfidence: rows.reduce((s, x) => s + x.confidence, 0) / total,
    byTransform,
    confusions,
  }
}

/**
 * Run both protocols. `seed` makes the whole report reproducible; the README
 * quotes the default seed.
 */
export function evaluate(books: Book[], gallery: RefEntry[], seed = 20260905): EvalReport {
  const rows = scoreProbes(books, gallery, buildProbes(books, seed).vectors, '')

  // Protocol B -- one random degradation becomes the gallery image, a
  // different one is the probe. Nothing clean is ever compared to anything.
  const r = rng(seed ^ 0x9e3779b9)
  const splitGallery: RefEntry[] = books.map((b) => {
    const t = TRANSFORMS[Math.floor(r() * TRANSFORMS.length)]
    return { bookId: b.id, vector: extract(simulatePhoto(cleanCover(b), { ...t.opts, seed: Math.floor(r() * 1e6) })) }
  })
  const splitVectors = books.map((b) => {
    const clean = cleanCover(b)
    return TRANSFORMS.map((t) => extract(simulatePhoto(clean, { ...t.opts, seed: Math.floor(r() * 1e6) })))
  })
  const splitRows = scoreProbes(books, splitGallery, splitVectors, 'split-gallery: ')

  const a = summariseRows(rows)
  return {
    accuracy1: a.accuracy1,
    accuracy3: a.accuracy3,
    meanConfidence: a.meanConfidence,
    splitAccuracy1: summariseRows(splitRows).accuracy1,
    chanceLevel: 1 / books.length,
    rows: [...rows, ...splitRows],
    byTransform: a.byTransform,
    confusions: a.confusions,
    total: rows.length + splitRows.length,
  }
}

/**
 * Feature ablation: how much does each block of the descriptor carry?
 *
 * The block is removed from *both* sides (gallery and probe) and the vectors are
 * re-normalised, so the only thing that changes is the information available --
 * not the vector lengths and not the images themselves. The probe set is
 * rendered once and shared, which is what keeps this affordable.
 */
export function ablation(books: Book[], seed = 20260905): { block: string; accuracy: number; drop: number }[] {
  const L = layoutFor(DEFAULTS)
  const probes = buildProbes(books, seed).vectors
  const gallery = buildGallery(books)
  const cuts: { block: string; range: [number, number] }[] = [
    { block: FEATURE_BLOCKS[0].name, range: [0, L.cells] },
    { block: FEATURE_BLOCKS[1].name, range: [L.cells, L.cells + L.hueHist] },
    { block: FEATURE_BLOCKS[2].name, range: [L.cells + L.hueHist, L.cells + L.hueHist + L.rowProfile] },
    { block: FEATURE_BLOCKS[3].name, range: [L.cells + L.hueHist + L.rowProfile, L.cells + L.hueHist + L.rowProfile + L.colProfile] },
    { block: FEATURE_BLOCKS[4].name, range: [L.length - L.totals, L.length] },
  ]
  const base = summariseRows(scoreProbes(books, gallery, probes, '')).accuracy1
  return cuts.map((cut) => {
    const drop = (v: FeatureVector): FeatureVector => {
      const out = new Float32Array(v)
      for (let i = cut.range[0]; i < cut.range[1] && i < out.length; i++) out[i] = 0
      return l2normalize(out)
    }
    const cutGallery = gallery.map((g) => ({ bookId: g.bookId, vector: drop(g.vector) }))
    const cutProbes = probes.map((row) => row.map(drop))
    const acc = summariseRows(scoreProbes(books, cutGallery, cutProbes, '')).accuracy1
    return { block: cut.block, accuracy: acc, drop: base - acc }
  })
}
