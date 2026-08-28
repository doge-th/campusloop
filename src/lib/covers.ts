import type { Book } from './types'
import { create, circle, hex, line, rect, ring, triangle, type ImageBuf, type RGB } from './raster'
import { rng } from './seed'

/**
 * Procedural catalogue covers.
 *
 * A cover is a deterministic function of the book's `CoverSpec`, so the
 * reference images the recogniser is built from are always identical. The
 * design language is deliberately flat/geometric: it gives the classifier
 * stable colour and structure statistics, which is exactly what a school
 * catalogue image search needs, and it means the repository carries no binary
 * assets at all.
 */

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Faux "typeset title": rows of bars, which is what text looks like to a colour/edge descriptor. */
function titleBars(
  buf: ImageBuf,
  x: number,
  y: number,
  width: number,
  rows: number,
  color: RGB,
  seed: number,
): void {
  const r = rng(seed)
  const rowH = Math.max(3, Math.round(buf.h * 0.014))
  const gap = rowH + 3
  let cy = y
  for (let i = 0; i < rows; i++) {
    let cx = x
    const words = 2 + Math.floor(r() * 3)
    for (let w = 0; w < words; w++) {
      const ww = Math.round(width * (0.14 + r() * 0.22))
      if (i === rows - 1 && w > 1) break
      rect(buf, cx, cy, Math.min(ww, x + width - cx), rowH, color)
      cx += ww + rowH * 0.7
      if (cx > x + width - rowH) break
    }
    cy += gap
  }
}

function barcode(buf: ImageBuf, seed: number): void {
  const r = rng(seed + 31)
  const x0 = Math.round(buf.w * 0.6)
  const y0 = Math.round(buf.h * 0.9)
  const w = Math.round(buf.w * 0.32)
  const h = Math.round(buf.h * 0.06)
  rect(buf, x0, y0, w, h + 6, [248, 246, 242])
  let x = x0 + 3
  while (x < x0 + w - 3) {
    const bar = 1 + Math.floor(r() * 2)
    rect(buf, x, y0 + 2, bar, h - 2, [16, 16, 18])
    x += bar + 1 + Math.floor(r() * 3)
  }
}

/** Draw the catalogue cover for a book at the given size. */
export function rasterizeCover(book: Book, w = 240, h = 336): ImageBuf {
  const spec = book.cover
  const seed = hashString(book.id + book.title)
  const r = rng(seed)
  const base = hex(spec.base)
  const accent = hex(spec.accent)
  const buf = create(w, h, base)

  // Cloth texture: very slight vertical shading so flat covers still have edges.
  for (let x = 0; x < w; x++) {
    const shade = 1 - 0.05 * Math.sin((x / w) * Math.PI)
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4
      buf.data[i] *= shade
      buf.data[i + 1] *= shade
      buf.data[i + 2] *= shade
    }
  }
  // Spine
  rect(buf, 0, 0, Math.max(3, Math.round(w * 0.035)), h, mix(base, [0, 0, 0], 0.35))

  if (spec.style === 'cloth') {
    const bandH = Math.round(h * 0.055)
    for (let i = 0; i < spec.bands; i++) {
      const y = Math.round(h * (0.1 + (i * 0.78) / Math.max(1, spec.bands)))
      rect(buf, Math.round(w * 0.05), y, Math.round(w * 0.92), bandH, accent, i % 2 === 0 ? 1 : 0.55)
    }
    rect(buf, Math.round(w * 0.62), Math.round(h * 0.72), Math.round(w * 0.24), Math.round(h * 0.16), mix(accent, base, 0.45))
  } else if (spec.style === 'grid') {
    const step = Math.max(8, Math.round(w / (10 + spec.bands * 2)))
    for (let x = step; x < w; x += step) line(buf, x, 0, x, h, mix(accent, base, 0.72), 1)
    for (let y = step; y < h; y += step) line(buf, 0, y, w, y, mix(accent, base, 0.72), 1)
    // plotted curve
    let px = w * 0.08
    let py = h * (0.3 + r() * 0.2)
    for (let s = 0; s < 60; s++) {
      const nx = px + w * 0.014
      const ny = h * 0.5 + Math.sin((s / 60) * Math.PI * (1.6 + spec.bands * 0.4)) * h * 0.2 * (1 - s / 90)
      line(buf, px, py, nx, ny, accent, 3)
      px = nx
      py = ny
      if (px > w * 0.94) break
    }
    rect(buf, 0, Math.round(h * 0.06), w, Math.round(h * 0.02), accent)
  } else {
    // 'photo': abstract composition
    circle(buf, w * (0.28 + r() * 0.15), h * (0.3 + r() * 0.12), w * 0.22, accent, 0.92)
    ring(buf, w * 0.68, h * 0.24, w * 0.14, Math.max(3, w * 0.035), mix(accent, base, 0.35))
    triangle(
      buf,
      [
        [w * 0.55, h * (0.52 + r() * 0.1)],
        [w * 0.95, h * 0.86],
        [w * 0.2, h * 0.9],
      ],
      mix(accent, [0, 0, 0], 0.18),
      0.85,
    )
    for (let i = 0; i < spec.bands; i++) {
      rect(buf, w * 0.06, h * (0.12 + i * 0.2), w * 0.9, Math.max(2, h * 0.012), accent, 0.5)
    }
  }

  const titleRows = Math.max(2, Math.round(spec.titleWeight * 9))
  const titleX = Math.round(w * 0.12)
  const titleY = Math.round(spec.style === 'cloth' ? h * 0.14 : h * 0.08)
  const titleColor =
    spec.style === 'photo' ? mix(accent, [255, 255, 255], 0.15) : contrastText(base)
  titleBars(buf, titleX, titleY, Math.round(w * spec.titleWeight * 1.9 + w * 0.3), titleRows, titleColor, seed + 5)
  barcode(buf, seed)
  // publisher mark
  rect(buf, Math.round(w * 0.08), Math.round(h * 0.86), Math.round(w * 0.07), Math.round(w * 0.07), titleColor)
  return buf
}

/** Pick black or off-white for legible "text" on a coloured ground. */
function contrastText(bg: RGB): RGB {
  const l = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]
  return l > 140 ? [28, 26, 24] : [246, 244, 238]
}
