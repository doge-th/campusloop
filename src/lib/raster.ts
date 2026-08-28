/**
 * A tiny software rasteriser.
 *
 * CampusLoop generates its own catalogue cover images in pure TypeScript
 * instead of shipping binary assets. That buys three things:
 *
 *  1. the recognition pipeline is reproducible - the same seed gives the same
 *     pixels on any machine, so the accuracy numbers in the README can be
 *     re-computed by anyone;
 *  2. the ML code is testable in plain Node (no `canvas`, no DOM);
 *  3. the app has zero image downloads, which keeps the whole thing fast on a
 *     school chromebook.
 *
 * Everything below works on `ImageBuf`: width x height RGBA, row-major.
 */

export interface ImageBuf {
  w: number
  h: number
  data: Uint8ClampedArray
}

export type RGB = [number, number, number]

export function hex(h: string): RGB {
  const s = h.replace('#', '')
  const n = parseInt(
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s,
    16,
  )
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function create(w: number, h: number, color: RGB = [255, 255, 255]): ImageBuf {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = color[0]
    data[i * 4 + 1] = color[1]
    data[i * 4 + 2] = color[2]
    data[i * 4 + 3] = 255
  }
  return { w, h, data }
}

export function clone(src: ImageBuf): ImageBuf {
  return { w: src.w, h: src.h, data: new Uint8ClampedArray(src.data) }
}

export function setPixel(buf: ImageBuf, x: number, y: number, c: RGB, alpha = 1): void {
  if (x < 0 || y < 0 || x >= buf.w || y >= buf.h) return
  const i = (y * buf.w + x) * 4
  if (alpha >= 1) {
    buf.data[i] = c[0]
    buf.data[i + 1] = c[1]
    buf.data[i + 2] = c[2]
    buf.data[i + 3] = 255
    return
  }
  buf.data[i] = buf.data[i] * (1 - alpha) + c[0] * alpha
  buf.data[i + 1] = buf.data[i + 1] * (1 - alpha) + c[1] * alpha
  buf.data[i + 2] = buf.data[i + 2] * (1 - alpha) + c[2] * alpha
}

export function getPixel(buf: ImageBuf, x: number, y: number): RGB {
  const cx = Math.max(0, Math.min(buf.w - 1, x | 0))
  const cy = Math.max(0, Math.min(buf.h - 1, y | 0))
  const i = (cy * buf.w + cx) * 4
  return [buf.data[i], buf.data[i + 1], buf.data[i + 2]]
}

export function rect(buf: ImageBuf, x: number, y: number, w: number, h: number, c: RGB, alpha = 1): void {
  const x0 = Math.round(Math.max(0, x))
  const y0 = Math.round(Math.max(0, y))
  const x1 = Math.round(Math.min(buf.w, x + w))
  const y1 = Math.round(Math.min(buf.h, y + h))
  for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) setPixel(buf, px, py, c, alpha)
}

export function circle(buf: ImageBuf, cx: number, cy: number, r: number, c: RGB, alpha = 1): void {
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(buf.w - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(buf.h - 1, Math.ceil(cy + r))
  const r2 = r * r
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx
      const dy = py - cy
      if (dx * dx + dy * dy <= r2) setPixel(buf, px, py, c, alpha)
    }
  }
}

export function ring(buf: ImageBuf, cx: number, cy: number, r: number, thick: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(cx - r - thick))
  const x1 = Math.min(buf.w - 1, Math.ceil(cx + r + thick))
  const y0 = Math.max(0, Math.floor(cy - r - thick))
  const y1 = Math.min(buf.h - 1, Math.ceil(cy + r + thick))
  const outer = (r + thick / 2) ** 2
  const inner = Math.max(0, (r - thick / 2) ** 2)
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const d = (px - cx) ** 2 + (py - cy) ** 2
      if (d <= outer && d >= inner) setPixel(buf, px, py, c)
    }
  }
}

export function line(buf: ImageBuf, x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const px = x0 + (x1 - x0) * t
    const py = y0 + (y1 - y0) * t
    for (let o = 0; o < thick; o++) setPixel(buf, Math.round(px), Math.round(py + o - (thick - 1) / 2), c)
  }
}

export function triangle(buf: ImageBuf, pts: [number, number][], c: RGB, alpha = 1): void {
  const [a, b, cc] = pts
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], cc[0])))
  const maxX = Math.min(buf.w - 1, Math.ceil(Math.max(a[0], b[0], cc[0])))
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], cc[1])))
  const maxY = Math.min(buf.h - 1, Math.ceil(Math.max(a[1], b[1], cc[1])))
  const sign = (p1: number[], p2: number[], p3: number[]) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
  const area = Math.abs(sign(a, b, cc)) || 1
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const p = [x + 0.5, y + 0.5]
      const w1 = sign(p, a, b)
      const w2 = sign(p, b, cc)
      const w3 = sign(p, cc, a)
      if ((w1 <= 0 && w2 <= 0 && w3 <= 0) || (w1 >= 0 && w2 >= 0 && w3 >= 0)) {
        void area
        setPixel(buf, x, y, c, alpha)
      }
    }
  }
}

/**
 * Separable box blur, applied `passes` times to approximate a gaussian.
 *
 * The radius is rounded to an integer number of pixels. Fractional tap offsets
 * are not just wasteful, they are silently wrong: a non-integer index into the
 * pixel array returns `undefined`, which poisons the accumulator to `NaN` and
 * writes back as 0, i.e. the whole image turns black. That bug cost three of the
 * ten probe transforms their entire accuracy before it was caught by the report.
 */
export function blur(buf: ImageBuf, radius: number, passes = 2): ImageBuf {
  const rad = Math.max(1, Math.round(radius))
  if (radius <= 0) return clone(buf)
  let cur = clone(buf)
  for (let p = 0; p < passes; p++) {
    const next = create(cur.w, cur.h)
    // The channel sums are deliberately NOT called `r`: an accumulator that
    // shadows the radius turns the tap loop into a zero-iteration loop, and the
    // resulting 0/0 is another way to paint the whole image black.
    // horizontal
    for (let y = 0; y < cur.h; y++) {
      for (let x = 0; x < cur.w; x++) {
        let sr = 0
        let sg = 0
        let sb = 0
        let n = 0
        for (let k = -rad; k <= rad; k++) {
          const xx = Math.min(cur.w - 1, Math.max(0, x + k))
          const i = (y * cur.w + xx) * 4
          sr += cur.data[i]
          sg += cur.data[i + 1]
          sb += cur.data[i + 2]
          n++
        }
        const i = (y * next.w + x) * 4
        next.data[i] = sr / n
        next.data[i + 1] = sg / n
        next.data[i + 2] = sb / n
        next.data[i + 3] = 255
      }
    }
    // vertical
    const out = create(next.w, next.h)
    for (let y = 0; y < next.h; y++) {
      for (let x = 0; x < next.w; x++) {
        let sr = 0
        let sg = 0
        let sb = 0
        let n = 0
        for (let k = -rad; k <= rad; k++) {
          const yy = Math.min(next.h - 1, Math.max(0, y + k))
          const i = (yy * next.w + x) * 4
          sr += next.data[i]
          sg += next.data[i + 1]
          sb += next.data[i + 2]
          n++
        }
        const i = (y * out.w + x) * 4
        out.data[i] = sr / n
        out.data[i + 1] = sg / n
        out.data[i + 2] = sb / n
        out.data[i + 3] = 255
      }
    }
    cur = out
  }
  return cur
}

/**
 * Resize with box averaging (area sampling). Used before feature extraction so
 * that a 12 MP phone photo and a 320 px render land in the same feature space.
 */
export function resize(src: ImageBuf, w: number, h: number): ImageBuf {
  const out = create(w, h)
  const sx = src.w / w
  const sy = src.h / h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx))
      const y0 = Math.floor(y * sy)
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy))
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let yy = y0; yy < Math.min(src.h, y1); yy++) {
        for (let xx = x0; xx < Math.min(src.w, x1); xx++) {
          const i = (yy * src.w + xx) * 4
          r += src.data[i]
          g += src.data[i + 1]
          b += src.data[i + 2]
          n++
        }
      }
      const i = (y * w + x) * 4
      out.data[i] = r / n
      out.data[i + 1] = g / n
      out.data[i + 2] = b / n
      out.data[i + 3] = 255
    }
  }
  return out
}

export interface PhotoOptions {
  /** degrees of in-plane rotation */
  rotate?: number
  /** 0..1 fraction of the frame cropped away on each side */
  crop?: number
  /** -1..1 */
  brightness?: number
  /** -1..1 */
  contrast?: number
  /** blur radius in px */
  blur?: number
  /** 0..1 gaussian-ish sensor noise */
  noise?: number
  /** 0..1 corner darkening */
  vignette?: number
  /** white-balance shift, e.g. warm indoor light */
  warmth?: number
  seed?: number
}

/** Cheap LCG used so noise is reproducible without pulling in a PRNG lib. */
function noiseRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * Degrade a clean catalogue render into something that looks like a phone
 * snapshot. The recognition model is trained on clean covers and tested on
 * these, which is the honest difficulty of the task.
 */
export function simulatePhoto(src: ImageBuf, opts: PhotoOptions = {}): ImageBuf {
  const {
    rotate = 0,
    crop = 0,
    brightness = 0,
    contrast = 0,
    blur: blurR = 0,
    noise = 0,
    vignette: vig = 0,
    warmth = 0,
    seed = 7,
  } = opts

  let img = src
  if (crop > 0) {
    const cx = Math.round(img.w * crop)
    const cy = Math.round(img.h * crop)
    const cropped = create(img.w - 2 * cx, img.h - 2 * cy)
    for (let y = 0; y < cropped.h; y++) {
      for (let x = 0; x < cropped.w; x++) {
        const i = ((y + cy) * img.w + (x + cx)) * 4
        const o = (y * cropped.w + x) * 4
        cropped.data[o] = img.data[i]
        cropped.data[o + 1] = img.data[i + 1]
        cropped.data[o + 2] = img.data[i + 2]
        cropped.data[o + 3] = 255
      }
    }
    img = cropped
  }

  if (rotate !== 0) {
    const rad = (rotate * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const out = create(img.w, img.h, [250, 248, 244])
    const cx = img.w / 2
    const cy = img.h / 2
    for (let y = 0; y < out.h; y++) {
      for (let x = 0; x < out.w; x++) {
        const dx = x - cx
        const dy = y - cy
        const sxp = cx + dx * cos + dy * sin
        const syp = cy - dx * sin + dy * cos
        const i = (Math.round(syp) * img.w + Math.round(sxp)) * 4
        const o = (y * out.w + x) * 4
        if (sxp >= 0 && syp >= 0 && sxp < img.w && syp < img.h) {
          out.data[o] = img.data[i]
          out.data[o + 1] = img.data[i + 1]
          out.data[o + 2] = img.data[i + 2]
        }
        out.data[o + 3] = 255
      }
    }
    img = out
  }

  if (blurR > 0) img = blur(img, blurR)

  if (brightness !== 0 || contrast !== 0 || warmth !== 0) {
    const out = clone(img)
    for (let i = 0; i < out.data.length; i += 4) {
      let r = out.data[i]
      let g = out.data[i + 1]
      let b = out.data[i + 2]
      r += brightness * 90
      g += brightness * 86
      b += brightness * 80
      if (contrast !== 0) {
        const k = 1 + contrast
        r = (r - 128) * k + 128
        g = (g - 128) * k + 128
        b = (b - 128) * k + 128
      }
      if (warmth !== 0) {
        r += warmth * 22
        b -= warmth * 26
      }
      out.data[i] = r
      out.data[i + 1] = g
      out.data[i + 2] = b
    }
    img = out
  }

  if (vig > 0) {
    const out = clone(img)
    const cx = img.w / 2
    const cy = img.h / 2
    const maxD = Math.hypot(cx, cy)
    for (let y = 0; y < img.h; y++) {
      for (let x = 0; x < img.w; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxD
        const k = 1 - vig * d * d
        const i = (y * img.w + x) * 4
        out.data[i] *= k
        out.data[i + 1] *= k
        out.data[i + 2] *= k
      }
    }
    img = out
  }

  if (noise > 0) {
    const rnd = noiseRng(seed)
    const out = clone(img)
    for (let i = 0; i < out.data.length; i += 4) {
      const n = (rnd() - 0.5) * 2 * noise * 60
      out.data[i] += n
      out.data[i + 1] += (rnd() - 0.5) * 2 * noise * 60
      out.data[i + 2] += (rnd() - 0.5) * 2 * noise * 60
    }
    img = out
  }

  return img
}

/** Paint an ImageBuf onto a DOM canvas (kept out of the pure modules above). */
export function blitToCanvas(
  canvas: HTMLCanvasElement,
  img: ImageBuf,
  scale = 1,
): void {
  canvas.width = img.w * scale
  canvas.height = img.h * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const off = new OffscreenCanvas(img.w, img.h)
  const octx = off.getContext('2d')
  if (!octx) return
  octx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.w, img.h), 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height)
}
