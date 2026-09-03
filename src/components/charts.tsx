/**
 * Hand-written SVG charts.
 *
 * Why not a charting library? Three reasons that mattered for this build:
 *   1. The app already ships a software rasteriser, a kNN classifier, an SGD
 *      regressor and a bipartite matcher. A 40 kB chart dependency would have
 *      been the largest thing in the bundle for no analytical gain.
 *   2. Every figure here has an unusual requirement (a confidence band around a
 *      forecast, a diverging axis for regression coefficients, an honest "actual"
 *      marker sitting outside the predicted interval). Each is ~15 lines of SVG
 *      and ~150 lines of library configuration.
 *   3. Rendering to plain SVG keeps the numbers inspectable in dev tools, which
 *      is the whole point of a results-first interface.
 *
 * Charts scale through their viewBox, so they stay legible from 320 px to 1440 px.
 */

import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ palette */

export const C = {
  pine: '#0f6b4f',
  pine2: '#0b533e',
  clay: '#c4622d',
  gold: '#b5872a',
  plum: '#6b3f6e',
  danger: '#a4373a',
  slate: '#3c6e8f',
  moss: '#7a8b3c',
  ink: '#1d2126',
  ink2: '#4b5560',
  ink3: '#7d8894',
  line: '#ddd5c4',
  grid: '#e6dfcf',
}

/** Deterministic categorical order — index by series position, never randomly. */
export const SERIES = [C.pine, C.clay, C.plum, C.gold, C.slate, C.moss]

export function defaultFmt(n: number): string {
  const a = Math.abs(n)
  if (a >= 100) return n.toFixed(0)
  if (a >= 10) return (Math.round(n * 10) / 10).toFixed(1)
  return (Math.round(n * 100) / 100).toFixed(2)
}

/* ------------------------------------------------------------------- scales */

function niceNum(range: number, round: boolean): number {
  const safe = range > 0 ? range : 1
  const exp = Math.floor(Math.log10(safe))
  const f = safe / Math.pow(10, exp)
  const nf = round
    ? f < 1.5
      ? 1
      : f < 3
        ? 2
        : f < 7
          ? 5
          : 10
    : f <= 1
      ? 1
      : f <= 2
        ? 2
        : f <= 5
          ? 5
          : 10
  return nf * Math.pow(10, exp)
}

/** Human-readable tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (min === max) {
    if (min === 0) return [-1, 0, 1]
    const d = Math.abs(min) * 0.25
    min -= d
    max += d
  }
  const step = niceNum((max - min) / (count - 1), true)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const n = Math.max(1, Math.round((hi - lo) / step))
  const out: number[] = []
  for (let i = 0; i <= n; i++) out.push(lo + i * step)
  return out
}

/**
 * Axis labels must all share one precision. Formatting each tick on its own
 * (100 / 50.0 / 0.00) reads like a bug; the decimals are derived from the
 * tick spacing instead.
 */
function tickFmt(ticks: number[], fallback: (n: number) => string): (n: number) => string {
  if (ticks.length < 2) return fallback
  const step = Math.abs(ticks[1] - ticks[0])
  if (!(step > 0) || !Number.isFinite(step)) return fallback
  const dec = Math.max(0, Math.min(3, Math.ceil(-Math.log10(step))))
  return (n: number) => (n === 0 ? 0 : n).toFixed(dec)
}

type Num = number | null

function extentOf(values: Num[][]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const arr of values) {
    for (const v of arr) {
      if (v === null || Number.isNaN(v)) continue
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1]
  return [lo, hi]
}

/** Polyline path with gaps where a value is null. */
function pathOf(xs: Num[], ys: Num[]): string {
  let d = ''
  let pen = false
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]
    const y = ys[i]
    if (x === null || y === null || Number.isNaN(x) || Number.isNaN(y)) {
      pen = false
      continue
    }
    d += (pen ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2) + ' '
    pen = true
  }
  return d.trim()
}

function Legend(props: { items: { name: string; color: string; dashed?: boolean }[] }) {
  if (props.items.length === 0) return null
  return (
    <div className="legend">
      {props.items.map((it) => (
        <span key={it.name}>
          <i style={{ background: it.color, opacity: it.dashed ? 0.45 : 1 }} />
          {it.name}
        </span>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- line chart */

export interface LineSeries {
  name: string
  values: Num[]
  color?: string
  dashed?: boolean
  /** Paired with this series: draws a filled confidence ribbon underneath. */
  band?: { lower: Num[]; upper: Num[] }
}

export function LineChart(props: {
  categories: string[]
  series: LineSeries[]
  height?: number
  format?: (n: number) => string
  min?: number
  max?: number
  zeroFloor?: boolean
  yTitle?: string
  xTickEvery?: number
  markers?: boolean
}) {
  const W = 760
  const H = props.height ?? 260
  const m = { l: 46, r: 14, t: 12, b: 26 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const n = props.categories.length

  const all: Num[][] = []
  for (const s of props.series) {
    all.push(s.values)
    if (s.band) {
      all.push(s.band.lower)
      all.push(s.band.upper)
    }
  }
  let [lo, hi] = extentOf(all)
  if (props.min !== undefined) lo = Math.min(lo, props.min)
  if (props.max !== undefined) hi = Math.max(hi, props.max)
  if (props.zeroFloor) lo = Math.min(lo, 0)
  const ticks = niceTicks(lo, hi, 4)
  const fmt = props.format ?? tickFmt(ticks, defaultFmt)
  const yLo = ticks[0]
  const yHi = ticks[ticks.length - 1]

  const X = (i: number) => (n <= 1 ? m.l + iw / 2 : m.l + (i * iw) / (n - 1))
  const Y = (v: number) => m.t + ih - ((v - yLo) / (yHi - yLo || 1)) * ih

  /* Labeled category indices. The final category always earns a label (it is
     the most recent month in every time series here); if it would collide with
     the previous tick, that one steps aside instead. */
  const every = Math.max(1, props.xTickEvery ?? Math.ceil(n / 8))
  const labelIdx: number[] = []
  for (let i = 0; i < n; i += every) labelIdx.push(i)
  if (n > 0 && labelIdx[labelIdx.length - 1] !== n - 1) {
    if (X(n - 1) - X(labelIdx[labelIdx.length - 1]) < 50) labelIdx.pop()
    labelIdx.push(n - 1)
  }

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? C.ink3 : C.grid} strokeWidth={t === 0 ? 1 : 1} strokeDasharray={t === 0 ? '4 3' : undefined} />
            <text className="axis-label" x={m.l - 7} y={Y(t) + 3} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text
            key={i}
            className="axis-label"
            x={X(i)}
            y={H - 8}
            textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
          >
            {props.categories[i]}
          </text>
        ))}
        {props.series.map((s, si) => {
          const color = s.color ?? SERIES[si % SERIES.length]
          const ys = s.values.map((v) => (v === null ? null : Y(v)))
          const d = pathOf(s.values.map((_, i) => X(i)), ys)
          let bandEl = null
          if (s.band) {
            const fwdX = s.band.upper.map((_, i) => X(i))
            const fwdY = s.band.upper.map((v) => (v === null ? null : Y(v)))
            const revX = s.band.lower.map((_, i) => X(i)).reverse()
            const revY = s.band.lower.map((v) => (v === null ? null : Y(v))).reverse()
            bandEl = <path d={pathOf([...fwdX, ...revX], [...fwdY, ...revY]) + ' Z'} fill={color} opacity={0.14} stroke="none" />
          }
          const dots =
            props.markers
              ? s.values.map((v, i) =>
                  v === null ? null : <circle key={i} cx={X(i)} cy={Y(v)} r={2.6} fill={color} />,
                )
              : null
          return (
            <g key={s.name}>
              {bandEl}
              <path d={d} fill="none" stroke={color} strokeWidth={s.dashed ? 1.6 : 2.2} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
              {dots}
            </g>
          )
        })}
        {props.yTitle && (
          <text className="axis-label" x={W - m.r} y={m.t - 2} textAnchor="end">
            {props.yTitle}
          </text>
        )}
      </svg>
      <Legend items={props.series.map((s, i) => ({ name: s.name, color: s.color ?? SERIES[i % SERIES.length], dashed: s.dashed }))} />
    </div>
  )
}

/* ------------------------------------------------------------ column chart */

export interface Column {
  label: string
  value: number
  color?: string
  sub?: string
}

export function ColumnChart(props: {
  data: Column[]
  height?: number
  format?: (n: number) => string
  showValues?: boolean
  rotate?: boolean
}) {
  const fmt = props.format ?? defaultFmt
  const W = 760
  const H = props.height ?? 250
  const m = { l: 46, r: 10, t: 14, b: props.rotate ? 52 : 30 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const ticks = niceTicks(Math.min(0, ...props.data.map((d) => d.value)), Math.max(0, ...props.data.map((d) => d.value)), 4)
  const tfmt = props.format ?? tickFmt(ticks, defaultFmt)
  const yLo = ticks[0]
  const yHi = ticks[ticks.length - 1]
  const Y = (v: number) => m.t + ih - ((v - yLo) / (yHi - yLo || 1)) * ih
  const slot = iw / props.data.length
  const bw = Math.max(4, Math.min(46, slot * 0.62))

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? C.ink3 : C.grid} />
            <text className="axis-label" x={m.l - 7} y={Y(t) + 3} textAnchor="end">
              {tfmt(t)}
            </text>
          </g>
        ))}
        {props.data.map((d, i) => {
          const cx = m.l + slot * i + slot / 2
          const y = Y(Math.max(0, d.value))
          const h = Math.abs(Y(d.value) - Y(0))
          const color = d.color ?? C.pine
          return (
            <g key={d.label + i}>
              <rect x={cx - bw / 2} y={y} width={bw} height={Math.max(1, h)} rx={3} fill={color} opacity={0.92} />
              {props.showValues && (
                <text x={cx} y={(d.value >= 0 ? y : y + h) - 4} textAnchor="middle" fontSize={10} fill={C.ink2}>
                  {fmt(d.value)}
                </text>
              )}
              <text
                className="axis-label"
                x={cx}
                y={H - m.b + 14}
                textAnchor={props.rotate ? 'end' : 'middle'}
                transform={props.rotate ? `rotate(-38 ${cx} ${H - m.b + 14})` : undefined}
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Categories x series — used for the strategy comparison table in picture form. */
export function GroupedColumns(props: {
  categories: string[]
  series: { name: string; values: number[]; color?: string }[]
  height?: number
  format?: (n: number) => string
}) {
  const fmt = props.format ?? defaultFmt
  const W = 760
  const H = props.height ?? 250
  const m = { l: 46, r: 10, t: 14, b: 30 }
  const iw = W - m.l - m.r
  const ih = H - m.t - m.b
  const flat = props.series.flatMap((s) => s.values)
  const ticks = niceTicks(Math.min(0, ...flat), Math.max(0, ...flat), 4)
  const tfmt = props.format ?? tickFmt(ticks, defaultFmt)
  const yLo = ticks[0]
  const yHi = ticks[ticks.length - 1]
  const Y = (v: number) => m.t + ih - ((v - yLo) / (yHi - yLo || 1)) * ih
  const slot = iw / props.categories.length
  const bw = Math.max(3, Math.min(28, (slot * 0.7) / props.series.length))

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} role="img">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? C.ink3 : C.grid} />
            <text className="axis-label" x={m.l - 7} y={Y(t) + 3} textAnchor="end">
              {tfmt(t)}
            </text>
          </g>
        ))}
        {props.categories.map((c, ci) => {
          const cx = m.l + slot * ci + slot / 2
          const x0 = cx - (bw * props.series.length) / 2
          return (
            <g key={c}>
              {props.series.map((s, si) => {
                const v = s.values[ci] ?? 0
                const color = s.color ?? SERIES[si % SERIES.length]
                return (
                  <g key={s.name}>
                    <rect x={x0 + si * bw} y={Y(Math.max(0, v))} width={bw - 2} height={Math.max(1, Math.abs(Y(v) - Y(0)))} rx={2.5} fill={color} />
                    <text x={x0 + si * bw + (bw - 2) / 2} y={Y(v) - 4} textAnchor="middle" fontSize={9.5} fill={C.ink2}>
                      {fmt(v)}
                    </text>
                  </g>
                )
              })}
              <text className="axis-label" x={cx} y={H - 9} textAnchor="middle">
                {c}
              </text>
            </g>
          )
        })}
      </svg>
      <Legend items={props.series.map((s, i) => ({ name: s.name, color: s.color ?? SERIES[i % SERIES.length] }))} />
    </div>
  )
}

/* --------------------------------------------------------- diverging bars */

/** Signed values against a zero baseline: regression coefficients, deltas. */
export function DivergingBars(props: {
  rows: { label: string; value: number; note?: string }[]
  format?: (n: number) => string
  labelWidth?: number
  cell?: number
}) {
  const fmt = props.format ?? defaultFmt
  const LW = props.labelWidth ?? 220
  const W = 760
  const cell = props.cell ?? 22
  const H = props.rows.length * cell + 26
  const right = 62
  const plot = W - LW - right
  const maxAbs = Math.max(...props.rows.map((r) => Math.abs(r.value)), 1e-9)
  const ticks = niceTicks(-maxAbs, maxAbs, 4)
  const tfmt = props.format ?? tickFmt(ticks, defaultFmt)
  const lim = Math.max(Math.abs(ticks[0]), Math.abs(ticks[ticks.length - 1]))
  const mid = LW + plot / 2
  const sx = (v: number) => (v / lim) * (plot / 2)

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={mid + sx(t)} x2={mid + sx(t)} y1={10} y2={H - 18} stroke={t === 0 ? C.ink3 : C.grid} strokeDasharray={t === 0 ? undefined : '3 4'} />
          <text className="axis-label" x={mid + sx(t)} y={H - 5} textAnchor="middle">
            {tfmt(t)}
          </text>
        </g>
      ))}
      {props.rows.map((r, i) => {
        const y = 12 + i * cell
        const w = sx(r.value)
        const color = r.value >= 0 ? C.pine : C.clay
        return (
          <g key={r.label}>
            {r.note && <title>{r.note}</title>}
            <text x={LW - 10} y={y + cell / 2 + 1} textAnchor="end" fontSize={11.5} fill={C.ink2}>
              {r.label}
            </text>
            <rect x={Math.min(mid, mid + w)} y={y + 4} width={Math.max(1.5, Math.abs(w))} height={cell - 10} rx={2.5} fill={color} opacity={0.9} />
            <text x={mid + w + (r.value >= 0 ? 5 : -5)} y={y + cell / 2 + 1} textAnchor={r.value >= 0 ? 'start' : 'end'} fontSize={11} fill={C.ink}>
              {fmt(r.value)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Predicted value + interval + the actual it was meant to predict. */
export function IntervalChart(props: {
  rows: { label: string; predicted: number; lower: number; upper: number; actual: number | null }[]
  format?: (n: number) => string
  cell?: number
}) {
  const LW = 150
  const W = 760
  const cell = props.cell ?? 24
  const H = props.rows.length * cell + 30
  const m = { l: LW, r: 16, t: 8, b: 22 }
  const plot = W - m.l - m.r
  const all = props.rows.flatMap((r) => [r.lower, r.upper, r.predicted, r.actual === null ? r.predicted : r.actual])
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all), 5)
  const tfmt = props.format ?? tickFmt(ticks, defaultFmt)
  const lo = ticks[0]
  const hi = ticks[ticks.length - 1]
  const X = (v: number) => m.l + ((v - lo) / (hi - lo || 1)) * plot

  return (
    <div>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={m.t} y2={H - m.b} stroke={t === 0 ? C.ink3 : C.grid} />
          <text className="axis-label" x={X(t)} y={H - 7} textAnchor="middle">
            {tfmt(t)}
          </text>
        </g>
      ))}
      {props.rows.map((r, i) => {
        const y = m.t + i * cell + cell / 2
        return (
          <g key={r.label}>
            <text x={LW - 10} y={y + 4} textAnchor="end" fontSize={11.5} fill={C.ink2}>
              {r.label}
            </text>
            <line x1={X(r.lower)} x2={X(r.upper)} y1={y} y2={y} stroke={C.ink3} strokeWidth={1.2} />
            <line x1={X(r.lower)} x2={X(r.lower)} y1={y - 4} y2={y + 4} stroke={C.ink3} strokeWidth={1.2} />
            <line x1={X(r.upper)} x2={X(r.upper)} y1={y - 4} y2={y + 4} stroke={C.ink3} strokeWidth={1.2} />
            <rect x={X(Math.min(0, r.predicted))} y={y - 5} width={Math.max(2, Math.abs(X(r.predicted) - X(0)))} height={10} rx={2} fill={C.pine} opacity={0.85} />
            {r.actual !== null && (
              <rect x={X(r.actual) - 3.5} y={y - 3.5} width={7} height={7} rx={1.5} fill={C.clay} stroke="#fff" strokeWidth={1} transform={`rotate(45 ${X(r.actual)} ${y})`} />
            )}
          </g>
        )
      })}
    </svg>
      <Legend
        items={[
          { name: 'predicted surplus', color: C.pine },
          { name: '80% interval', color: C.ink3 },
          { name: 'actual last term', color: C.clay },
        ]}
      />
    </div>
  )
}

/* ------------------------------------------------------------------- donut */

export function Donut(props: {
  value: number
  size?: number
  thickness?: number
  color?: string
  center?: ReactNode
  caption?: ReactNode
}) {
  const s = props.size ?? 150
  const th = props.thickness ?? 15
  const r = (s - th) / 2
  const circ = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, props.value))
  return (
    <div className="col items-center" style={{ gap: 6 }}>
      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} role="img" aria-label={String(props.center ?? '')}>
        <circle cx={s / 2} cy={s / 2} r={r} fill="none" stroke={C.grid} strokeWidth={th} />
        <circle
          cx={s / 2}
          cy={s / 2}
          r={r}
          fill="none"
          stroke={props.color ?? C.pine}
          strokeWidth={th}
          strokeLinecap="round"
          strokeDasharray={`${(circ * v).toFixed(2)} ${circ.toFixed(2)}`}
          transform={`rotate(-90 ${s / 2} ${s / 2})`}
        />
        <text x={s / 2} y={s / 2 + 6} textAnchor="middle" fontSize={22} fontWeight={600} fill={C.ink}>
          {props.center}
        </text>
      </svg>
      {props.caption && <span className="tiny muted">{props.caption}</span>}
    </div>
  )
}

/* -------------------------------------------------------------- sparkline */

export function Sparkline(props: { values: number[]; width?: number; height?: number; color?: string }) {
  const w = props.width ?? 96
  const h = props.height ?? 26
  const [lo, hi] = extentOf([props.values])
  const span = hi - lo || 1
  const xs = props.values.map((_, i) => (i / Math.max(1, props.values.length - 1)) * (w - 2) + 1)
  const ys = props.values.map((v) => h - 2 - ((v - lo) / span) * (h - 4))
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="chart" style={{ display: 'inline-block' }}>
      <path d={pathOf(xs, ys)} fill="none" stroke={props.color ?? C.pine} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.2} fill={props.color ?? C.pine} />
    </svg>
  )
}

/**
 * A 100-dimensional feature vector drawn as one strip.
 *
 * This is not decoration: the block boundaries are the descriptor layout, so
 * the strip shows where hue information stops and local edge information starts,
 * and the two misclassified pairs become visible as near-identical patterns.
 */
export function FeatureStrip(props: { v: ArrayLike<number>; blocks?: { name: string; dim: number }[]; height?: number }) {
  const W = 760
  const H = props.height ?? 34
  const n = props.v.length
  const cw = W / n
  let cursor = 0
  const bounds = (props.blocks ?? []).map((b) => {
    const start = cursor
    cursor += b.dim
    return { ...b, start }
  })
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label="feature vector">
        {Array.from({ length: n }, (_, i) => {
          const x = Math.max(-1, Math.min(1, props.v[i]))
          const color = x >= 0 ? C.pine : C.clay
          return <rect key={i} x={i * cw} y={0} width={cw + 0.5} height={H} fill={color} opacity={0.12 + Math.abs(x) * 0.85} />
        })}
        {bounds.map((b) => (
          <line key={b.name} x1={b.start * cw} x2={b.start * cw} y1={0} y2={H} stroke="#fff" strokeWidth={b.start === 0 ? 0 : 1.4} />
        ))}
      </svg>
      {bounds.length > 0 && (
        <div className="legend">
          {bounds.map((b) => (
            <span key={b.name}>
              <i style={{ background: C.pine }} />
              {b.name}
              <span className="dim"> · {b.dim}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
