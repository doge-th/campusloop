/**
 * Hand-written image descriptor for textbook-cover recognition.
 *
 * Why hand-written instead of "just call a model"? Two reasons that matter for
 * this project:
 *   1. Determinism and testability. The whole recognition pipeline is plain
 *      TypeScript over an RGBA buffer, so it runs identically in the browser,
 *      in Node, and inside `vitest` with no network and no binary assets.
 *   2. Transparency. Every number in the feature vector has a name, which lets
 *      the UI explain *why* a cover matched (`src/views/Method.tsx`).
 *
 * The features are classic content-based image retrieval building blocks:
 *   - a 4x4 grid of local HSV statistics (hue encoded as sin/cos so the hue
 *     circle does not wrap into a fake discontinuity),
 *   - a local edge-energy map (gradient magnitude) which is what separates a
 *     cloth-bound spine with foil rules from a photographic dust jacket,
 *   - a global hue histogram,
 *   - horizontal and vertical "ink profiles": the fraction of non-background
 *     pixels per row / column. Band layouts and grid layouts live or die by
 *     these, and they survive cropping and perspective sloppiness well.
 *
 * The vector is L2-normalised so cosine similarity == dot product.
 */

import type { ImageBuf } from './raster'
import { resize } from './raster'

export interface DescriptorOptions {
  /** image is resampled to this square before features are taken */
  size?: number
  /** spatial grid is grid x grid */
  grid?: number
  /** number of hue bins in the global histogram */
  hueBins?: number
}

export const DEFAULTS: Required<DescriptorOptions> = {
  size: 64,
  grid: 4,
  hueBins: 8,
}

export type FeatureVector = Float32Array

/** Named blocks so the UI can label the vector and tests can assert its size. */
export interface FeatureLayout {
  cellStride: number
  cells: number
  hueHist: number
  rowProfile: number
  colProfile: number
  totals: number
  length: number
}

export function layoutFor(opts: Required<DescriptorOptions>): FeatureLayout {
  const cellStride = 5 // sinH, cosH, S, V, edge
  const cells = opts.grid * opts.grid * cellStride
  const rowProfile = opts.grid
  const colProfile = opts.grid
  const totals = 4
  return {
    cellStride,
    cells,
    hueHist: opts.hueBins,
    rowProfile,
    colProfile,
    totals,
    length: cells + opts.hueBins + rowProfile + colProfile + totals,
  }
}

/** sRGB 0..255 -> HSV with h in [0,1), s/v in [0,1). */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
        break
      case gn:
        h = ((bn - rn) / d + 2) / 6
        break
      default:
        h = ((rn - gn) / d + 4) / 6
    }
  }
  return [h, max === 0 ? 0 : d / max, max]
}

/**
 * Perceptual-ish luminance, used only for edge energy and the ink mask.
 * Coefficients are the usual Rec.709 weights.
 */
function lum(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * Extract a descriptor from an RGBA image buffer.
 *
 * The image is resampled to `size` x `size` with area averaging first, which
 * makes the features scale invariant and removes most high-frequency noise
 * before any statistics are taken.
 */
export function extract(img: ImageBuf, options: DescriptorOptions = {}): FeatureVector {
  const opts = { ...DEFAULTS, ...options }
  const { size, grid, hueBins } = opts
  const L = layoutFor(opts)

  const norm = resize(img, size, size)
  const { data, w, h } = norm

  const hsv = new Float32Array(w * h * 3)
  const gray = new Float32Array(w * h)
  for (let i = 0, p = 0; p < w * h; p++, i += 4) {
    const [hh, ss, vv] = rgbToHsv(data[i], data[i + 1], data[i + 2])
    hsv[p * 3] = hh
    hsv[p * 3 + 1] = ss
    hsv[p * 3 + 2] = vv
    gray[p] = lum(data[i], data[i + 1], data[i + 2])
  }

  // Gradient magnitude (Sobel-lite: forward differences) -> edge energy.
  const edge = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const gx = x + 1 < w ? Math.abs(gray[i + 1] - gray[i]) : 0
      const gy = y + 1 < h ? Math.abs(gray[i + w] - gray[i]) : 0
      edge[i] = gx + gy
    }
  }

  // Dominant background = the most common coarse colour bucket. Textbook
  // covers sit on paper or cloth; subtracting the background lets the ink
  // profiles measure layout instead of average colour.
  const bg = dominantBucket(hsv, w, h)
  const ink = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const dh = hueDist(hsv[p * 3], bg.h)
    const isGreyish = hsv[p * 3 + 1] < 0.16
    const far = isGreyish ? Math.abs(hsv[p * 3 + 2] - bg.v) > 0.22 : dh > 0.09 || Math.abs(hsv[p * 3 + 2] - bg.v) > 0.3
    ink[p] = far ? 1 : 0
  }

  const v = new Float32Array(L.length)
  const cellW = Math.floor(w / grid)
  const cellH = Math.floor(h / grid)

  // --- block 1: local HSV statistics + edge energy --------------------------
  let o = 0
  for (let cy = 0; cy < grid; cy++) {
    for (let cx = 0; cx < grid; cx++) {
      let hs = 0
      let hc = 0
      let s = 0
      let val = 0
      let e = 0
      let n = 0
      for (let y = cy * cellH; y < (cy + 1) * cellH; y++) {
        for (let x = cx * cellW; x < (cx + 1) * cellW; x++) {
          const i = y * w + x
          const ang = hsv[i * 3] * Math.PI * 2
          hs += Math.sin(ang)
          hc += Math.cos(ang)
          s += hsv[i * 3 + 1]
          val += hsv[i * 3 + 2]
          e += edge[i]
          n++
        }
      }
      v[o++] = hs / n
      v[o++] = hc / n
      v[o++] = s / n
      v[o++] = val / n
      v[o++] = Math.min(1, (e / n) * 6)
    }
  }

  // --- block 2: global hue histogram ---------------------------------------
  const hist = new Float32Array(hueBins)
  for (let p = 0; p < w * h; p++) {
    if (ink[p] !== 1) continue // histogram of *ink* hues, not the field colour
    const b = Math.min(hueBins - 1, Math.floor(hsv[p * 3] * hueBins))
    hist[b]++
  }
  const histTotal = Math.max(1, w * h * 0.02)
  for (let b = 0; b < hueBins; b++) v[o++] = Math.min(1, hist[b] / histTotal)

  // --- block 3 + 4: ink profiles (row, then column) ------------------------
  for (let cy = 0; cy < grid; cy++) {
    let acc = 0
    let n = 0
    for (let y = cy * cellH; y < (cy + 1) * cellH; y++) {
      for (let x = 0; x < w; x++) {
        acc += ink[y * w + x]
        n++
      }
    }
    v[o++] = acc / n
  }
  for (let cx = 0; cx < grid; cx++) {
    let acc = 0
    let n = 0
    for (let x = cx * cellW; x < (cx + 1) * cellW; x++) {
      for (let y = 0; y < h; y++) {
        acc += ink[y * w + x]
        n++
      }
    }
    v[o++] = acc / n
  }

  // --- block 5: global scalars ---------------------------------------------
  let inkTotal = 0
  let satTotal = 0
  let edgeTotal = 0
  for (let p = 0; p < w * h; p++) {
    inkTotal += ink[p]
    satTotal += hsv[p * 3 + 1]
    edgeTotal += edge[p]
  }
  const npix = w * h
  v[o++] = inkTotal / npix // layout density
  v[o++] = satTotal / npix // cloth vs photo feel
  v[o++] = Math.min(1, (edgeTotal / npix) * 6) // overall busyness
  v[o++] = img.w / img.h // aspect ratio, scaled to ~1

  return l2normalize(v)
}

/** Mean hue / value of the largest coarse colour bucket. */
function dominantBucket(hsv: Float32Array, w: number, h: number): { h: number; v: number } {
  const bins = 16
  const count = new Float32Array(bins)
  const hv = new Float32Array(bins * 2)
  for (let p = 0; p < w * h; p++) {
    const b = Math.min(bins - 1, Math.floor(hsv[p * 3] * bins))
    count[b]++
    hv[b * 2] += hsv[p * 3]
    hv[b * 2 + 1] += hsv[p * 3 + 2]
  }
  let best = 0
  for (let b = 1; b < bins; b++) if (count[b] > count[best]) best = b
  const n = Math.max(1, count[best])
  return { h: hv[best * 2] / n, v: hv[best * 2 + 1] / n }
}

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 1 - d)
}

export function l2normalize(v: FeatureVector): FeatureVector {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i] * v[i]
  const n = Math.sqrt(s) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n
  return out
}

/** Cosine similarity of two L2-normalised vectors == dot product. */
export function cosine(a: FeatureVector, b: FeatureVector): number {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

/** Human-readable block names, reused by the Method view and by tests. */
export const FEATURE_BLOCKS: { name: string; dim: (l: FeatureLayout) => number; note: string }[] = [
  { name: 'local HSV + edge grid', dim: (l) => l.cells, note: '4x4 cells x (hue sin, hue cos, saturation, value, edge energy)' },
  { name: 'ink hue histogram', dim: (l) => l.hueHist, note: 'hue distribution of non-background pixels' },
  { name: 'row ink profile', dim: (l) => l.rowProfile, note: 'band / rule positions down the cover' },
  { name: 'column ink profile', dim: (l) => l.colProfile, note: 'spine gutter and grid rhythm' },
  { name: 'global scalars', dim: (l) => l.totals, note: 'ink ratio, mean saturation, busyness, aspect' },
]

export const DIM = layoutFor(DEFAULTS).length
